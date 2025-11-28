/**
 * Serve - High performance HTTP/HTTPS server
 * Uses Node.js net/tls + WASM HTTP parser
 * Runtime-agnostic: works with Bun, Node.js, Deno
 *
 * Performance optimizations:
 * - Single socket.write() for buffered responses
 * - Lazy timer creation (only when timeout > 0)
 * - Buffer reuse to minimize allocations
 * - Pre-cached status lines
 */

import { createServer, type Server as NetServer, type Socket } from 'node:net'
import { createServer as createTlsServer, type TLSSocket, type Server as TlsServer } from 'node:tls'
import type { Handler, ServerResponse, WasmCore } from '@sylphx/gust-core'
import { getWasm, initWasm, isStreamingBody, serverError } from '@sylphx/gust-core'
import type { Context } from './context'
import { createContext, parseHeaders } from './context'

// Default keep-alive timeout (5 seconds)
const DEFAULT_KEEP_ALIVE_TIMEOUT = 5000
// Default max requests per connection
const DEFAULT_MAX_REQUESTS = 100
// Default request timeout (30 seconds)
const DEFAULT_REQUEST_TIMEOUT = 30000
// Default header size limit (8KB)
const DEFAULT_MAX_HEADER_SIZE = 8192

// Pre-cached status lines for common status codes (hot path optimization)
const STATUS_LINES: Record<number, string> = {
	200: 'HTTP/1.1 200 OK\r\n',
	201: 'HTTP/1.1 201 Created\r\n',
	204: 'HTTP/1.1 204 No Content\r\n',
	301: 'HTTP/1.1 301 Moved Permanently\r\n',
	302: 'HTTP/1.1 302 Found\r\n',
	304: 'HTTP/1.1 304 Not Modified\r\n',
	400: 'HTTP/1.1 400 Bad Request\r\n',
	401: 'HTTP/1.1 401 Unauthorized\r\n',
	403: 'HTTP/1.1 403 Forbidden\r\n',
	404: 'HTTP/1.1 404 Not Found\r\n',
	500: 'HTTP/1.1 500 Internal Server Error\r\n',
}

// Connection header values (avoid string allocation)
const CONN_KEEP_ALIVE = 'connection: keep-alive\r\n'
const CONN_CLOSE = 'connection: close\r\n'

// Empty buffer for reuse
const EMPTY_BUFFER = Buffer.allocUnsafe(0)

export type TlsOptions = {
	/** TLS certificate (PEM format) */
	readonly cert: string | Buffer
	/** TLS private key (PEM format) */
	readonly key: string | Buffer
	/** CA certificate chain (optional) */
	readonly ca?: string | Buffer | Array<string | Buffer>
	/** Passphrase for encrypted key (optional) */
	readonly passphrase?: string
}

export type ServeOptions = {
	readonly port?: number
	readonly hostname?: string
	readonly fetch: Handler<Context>
	readonly onListen?: (info: { port: number; hostname: string; tls: boolean }) => void
	readonly onError?: (error: Error) => void
	readonly keepAliveTimeout?: number
	readonly maxRequestsPerConnection?: number
	readonly requestTimeout?: number
	readonly maxHeaderSize?: number
	/** TLS configuration for HTTPS */
	readonly tls?: TlsOptions
}

export type Server = {
	readonly port: number
	readonly hostname: string
	readonly tls: boolean
	/** Stop server immediately */
	readonly stop: () => Promise<void>
	/** Graceful shutdown - wait for active requests to complete */
	readonly shutdown: (timeout?: number) => Promise<void>
	/** Get active connection count */
	readonly connections: () => number
}

/**
 * Start the HTTP/HTTPS server
 */
export const serve = async (options: ServeOptions): Promise<Server> => {
	// Initialize WASM
	await initWasm()
	const wasm = getWasm()

	const port = options.port ?? (options.tls ? 443 : 3000)
	const hostname = options.hostname ?? '0.0.0.0'
	const handler = options.fetch
	const keepAliveTimeout = options.keepAliveTimeout ?? DEFAULT_KEEP_ALIVE_TIMEOUT
	const maxRequests = options.maxRequestsPerConnection ?? DEFAULT_MAX_REQUESTS
	const requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT
	const maxHeaderSize = options.maxHeaderSize ?? DEFAULT_MAX_HEADER_SIZE
	const useTls = !!options.tls

	// Track active connections for graceful shutdown
	const activeConnections = new Set<Socket | TLSSocket>()
	let isShuttingDown = false

	const connectionConfig: ConnectionConfig = {
		keepAliveTimeout,
		maxRequests,
		requestTimeout,
		maxHeaderSize,
		onError: options.onError,
	}

	return new Promise((resolve, reject) => {
		// Create server (HTTP or HTTPS)
		const server: NetServer | TlsServer = useTls
			? createTlsServer(
					{
						cert: options.tls?.cert,
						key: options.tls?.key,
						ca: options.tls?.ca,
						passphrase: options.tls?.passphrase,
					},
					(socket: TLSSocket) => {
						if (isShuttingDown) {
							socket.end()
							return
						}
						activeConnections.add(socket)
						socket.on('close', () => activeConnections.delete(socket))
						handleConnection(socket, handler, wasm, connectionConfig)
					}
				)
			: createServer((socket: Socket) => {
					if (isShuttingDown) {
						socket.end()
						return
					}
					activeConnections.add(socket)
					socket.on('close', () => activeConnections.delete(socket))
					handleConnection(socket, handler, wasm, connectionConfig)
				})

		server.on('error', reject)

		server.listen(port, hostname, () => {
			const serverInfo: Server = {
				port,
				hostname,
				tls: useTls,
				connections: () => activeConnections.size,
				stop: () =>
					new Promise((res) => {
						// Force close all connections
						for (const socket of activeConnections) {
							socket.destroy()
						}
						activeConnections.clear()
						server.close(() => res())
					}),
				shutdown: (timeout = 30000) =>
					new Promise((res) => {
						isShuttingDown = true

						// Stop accepting new connections
						server.close(() => {
							res()
						})

						// Wait for existing connections to finish
						const checkInterval = setInterval(() => {
							if (activeConnections.size === 0) {
								clearInterval(checkInterval)
								res()
							}
						}, 100)

						// Force close after timeout
						setTimeout(() => {
							clearInterval(checkInterval)
							for (const socket of activeConnections) {
								socket.destroy()
							}
							activeConnections.clear()
							res()
						}, timeout)
					}),
			}

			options.onListen?.({ port, hostname, tls: useTls })
			resolve(serverInfo)
		})
	})
}

/**
 * Connection config
 */
type ConnectionConfig = {
	keepAliveTimeout: number
	maxRequests: number
	requestTimeout: number
	maxHeaderSize: number
	onError?: (error: Error) => void
}

/**
 * Connection state for keep-alive
 */
type ConnectionState = {
	buffer: Buffer
	requestCount: number
	idleTimer: ReturnType<typeof setTimeout> | null
	requestTimer: ReturnType<typeof setTimeout> | null
	isProcessing: boolean
}

/**
 * Handle incoming TCP/TLS connection with keep-alive support
 */
const handleConnection = (
	socket: Socket | TLSSocket,
	handler: Handler<Context>,
	wasm: WasmCore,
	config: ConnectionConfig
): void => {
	const state: ConnectionState = {
		buffer: EMPTY_BUFFER,
		requestCount: 0,
		idleTimer: null,
		requestTimer: null,
		isProcessing: false,
	}

	// Lazy idle timer - only create if timeout > 0
	const resetIdleTimer =
		config.keepAliveTimeout > 0
			? () => {
					if (state.idleTimer) clearTimeout(state.idleTimer)
					state.idleTimer = setTimeout(() => socket.end(), config.keepAliveTimeout)
				}
			: () => {} // no-op if timeout disabled

	// Clear all timers
	const clearTimers = () => {
		if (state.idleTimer) {
			clearTimeout(state.idleTimer)
			state.idleTimer = null
		}
		if (state.requestTimer) {
			clearTimeout(state.requestTimer)
			state.requestTimer = null
		}
	}

	// Lazy request timeout - only create if timeout > 0
	const startRequestTimeout =
		config.requestTimeout > 0
			? () => {
					if (state.requestTimer) clearTimeout(state.requestTimer)
					state.requestTimer = setTimeout(() => {
						if (state.isProcessing) {
							clearTimers()
							socket.write('HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n')
							socket.end()
						}
					}, config.requestTimeout)
				}
			: () => {} // no-op if timeout disabled

	const clearRequestTimeout = () => {
		if (state.requestTimer) {
			clearTimeout(state.requestTimer)
			state.requestTimer = null
		}
	}

	// Start idle timer
	resetIdleTimer()

	socket.on('data', async (chunk: Buffer) => {
		// Reset idle timer on data
		resetIdleTimer()

		// Optimization: avoid Buffer.concat when buffer is empty
		state.buffer = state.buffer.length === 0 ? chunk : Buffer.concat([state.buffer, chunk])

		// Check header size limit (before complete parse)
		const headerEnd = state.buffer.indexOf('\r\n\r\n')
		if (headerEnd === -1 && state.buffer.length > config.maxHeaderSize) {
			clearTimers()
			socket.write('HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n')
			socket.end()
			return
		}

		// Process all complete requests in buffer (pipelining support)
		while (state.buffer.length > 0) {
			// Try to parse HTTP request
			const parsed = wasm.parse_http(new Uint8Array(state.buffer))

			if (parsed.state === 0) {
				// Incomplete - wait for more data
				parsed.free()
				return
			}

			if (parsed.state === 2) {
				// Parse error
				parsed.free()
				clearTimers()
				socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
				socket.end()
				return
			}

			// Complete - process request
			state.requestCount++
			state.isProcessing = true
			startRequestTimeout()
			const requestBuffer = state.buffer

			try {
				const headers = parseHeaders(requestBuffer, parsed.header_offsets, parsed.headers_count)
				const ctx = createContext(socket, requestBuffer, parsed, headers)

				// Determine if keep-alive
				const connectionHeader = headers.connection?.toLowerCase() || ''
				const keepAlive = connectionHeader !== 'close' // HTTP/1.1 default is keep-alive

				// Check if we should close after this request
				const shouldClose = !keepAlive || state.requestCount >= config.maxRequests

				// Calculate body end position for buffer slicing
				const requestEnd =
					parsed.body_start +
					(headers['content-length'] ? parseInt(headers['content-length'], 10) : 0)

				parsed.free()

				const response = await handler(ctx)
				clearRequestTimeout()
				state.isProcessing = false
				sendResponse(socket, response, shouldClose)

				if (shouldClose) {
					clearTimers()
					socket.end()
					return
				}

				// Remove processed request from buffer
				state.buffer =
					state.buffer.length > requestEnd ? state.buffer.subarray(requestEnd) : EMPTY_BUFFER
			} catch (error) {
				config.onError?.(error as Error)
				clearTimers()
				sendResponse(socket, serverError(), true)
				socket.end()
				return
			}
		}
	})

	socket.on('close', clearTimers)
	socket.on('error', (err) => {
		clearTimers()
		config.onError?.(err)
	})
}

/**
 * Send HTTP response with optional keep-alive
 * Optimized for single write when possible
 */
const sendResponse = (
	socket: Socket | TLSSocket,
	response: ServerResponse,
	shouldClose: boolean
): void => {
	// Check if body is streaming (AsyncIterable)
	if (isStreamingBody(response.body)) {
		sendStreamingResponse(socket, response, shouldClose)
		return
	}

	// Buffered response - build complete response and send in single write
	const statusLine = STATUS_LINES[response.status] || `HTTP/1.1 ${response.status} Unknown\r\n`
	const connHeader = shouldClose ? CONN_CLOSE : CONN_KEEP_ALIVE
	const body = response.body
	const bodyLen = body !== null ? Buffer.byteLength(body) : 0

	// Build headers string
	let headers = statusLine
	for (const key in response.headers) {
		headers += `${key}: ${response.headers[key]}\r\n`
	}
	headers += `content-length: ${bodyLen}\r\n`
	headers += connHeader
	headers += '\r\n'

	// Single write: headers + body combined
	if (body !== null && bodyLen > 0) {
		const headerBuf = Buffer.from(headers)
		const bodyBuf = typeof body === 'string' ? Buffer.from(body) : body
		socket.write(Buffer.concat([headerBuf, bodyBuf]))
	} else {
		socket.write(headers)
	}
}

/**
 * Send streaming response with chunked transfer encoding
 */
const sendStreamingResponse = async (
	socket: Socket | TLSSocket,
	response: ServerResponse,
	shouldClose: boolean
): Promise<void> => {
	const statusLine = STATUS_LINES[response.status] || `HTTP/1.1 ${response.status} Unknown\r\n`
	const connHeader = shouldClose ? CONN_CLOSE : CONN_KEEP_ALIVE

	let headers = statusLine
	for (const key in response.headers) {
		headers += `${key}: ${response.headers[key]}\r\n`
	}
	headers += 'transfer-encoding: chunked\r\n'
	headers += connHeader
	headers += '\r\n'

	socket.write(headers)

	// Stream chunks with backpressure handling
	try {
		for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
			if (!socket.writable) break

			// Combine chunk header + data + trailer into single write
			const sizeHex = chunk.length.toString(16)
			const chunkBuf = Buffer.allocUnsafe(sizeHex.length + 2 + chunk.length + 2)
			chunkBuf.write(sizeHex, 0)
			chunkBuf.write('\r\n', sizeHex.length)
			chunkBuf.set(chunk, sizeHex.length + 2)
			chunkBuf.write('\r\n', sizeHex.length + 2 + chunk.length)

			const canWrite = socket.write(chunkBuf)
			if (!canWrite) {
				await new Promise<void>((resolve) => socket.once('drain', resolve))
			}
		}

		// Send terminating chunk
		socket.write('0\r\n\r\n')
	} catch {
		// Stream error - close connection
		socket.destroy()
	}
}
