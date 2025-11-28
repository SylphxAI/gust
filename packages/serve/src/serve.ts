/**
 * Serve - High performance HTTP/HTTPS server
 * Uses Node.js net/tls + WASM HTTP parser
 * Runtime-agnostic: works with Bun, Node.js, Deno
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
		buffer: Buffer.alloc(0),
		requestCount: 0,
		idleTimer: null,
		requestTimer: null,
		isProcessing: false,
	}

	// Reset idle timer
	const resetIdleTimer = () => {
		if (state.idleTimer) {
			clearTimeout(state.idleTimer)
		}
		state.idleTimer = setTimeout(() => {
			socket.end()
		}, config.keepAliveTimeout)
	}

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

	// Start request timeout
	const startRequestTimeout = () => {
		if (state.requestTimer) {
			clearTimeout(state.requestTimer)
		}
		state.requestTimer = setTimeout(() => {
			if (state.isProcessing) {
				clearTimers()
				socket.write('HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n')
				socket.end()
			}
		}, config.requestTimeout)
	}

	// Clear request timeout
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

		state.buffer = Buffer.concat([state.buffer, chunk])

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
				const isHttp11 = true // We assume HTTP/1.1
				const keepAlive = isHttp11
					? connectionHeader !== 'close'
					: connectionHeader === 'keep-alive'

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
				await sendResponse(socket, response, shouldClose)

				if (shouldClose) {
					clearTimers()
					socket.end()
					return
				}

				// Remove processed request from buffer
				state.buffer = state.buffer.subarray(requestEnd)
			} catch (error) {
				config.onError?.(error as Error)
				clearTimers()
				await sendResponse(socket, serverError(), true)
				socket.end()
				return
			}
		}
	})

	socket.on('close', () => {
		clearTimers()
	})

	socket.on('error', (err) => {
		clearTimers()
		config.onError?.(err)
	})
}

/**
 * Send HTTP response with optional keep-alive
 * Supports both buffered and streaming (AsyncIterable) bodies
 */
const sendResponse = async (
	socket: Socket | TLSSocket,
	response: ServerResponse,
	shouldClose: boolean
): Promise<void> => {
	const statusText = getStatusText(response.status)
	let head = `HTTP/1.1 ${response.status} ${statusText}\r\n`

	// Add headers
	for (const [key, value] of Object.entries(response.headers)) {
		head += `${key}: ${value}\r\n`
	}

	// Check if body is streaming (AsyncIterable)
	if (isStreamingBody(response.body)) {
		// Streaming response - use chunked transfer encoding
		head += 'transfer-encoding: chunked\r\n'
		head += `connection: ${shouldClose ? 'close' : 'keep-alive'}\r\n`
		head += '\r\n'

		socket.write(head)

		// Stream chunks with backpressure handling
		try {
			for await (const chunk of response.body) {
				if (!socket.writable) break

				// Write chunk in chunked encoding format: size\r\n + data + \r\n
				const sizeHex = chunk.length.toString(16)
				const canWrite = socket.write(`${sizeHex}\r\n`)
				socket.write(chunk)
				socket.write('\r\n')

				// Handle backpressure
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
	} else {
		// Buffered response - use content-length
		if (response.body !== null) {
			const bodyLen = Buffer.byteLength(response.body)
			head += `content-length: ${bodyLen}\r\n`
		} else {
			head += 'content-length: 0\r\n'
		}

		head += `connection: ${shouldClose ? 'close' : 'keep-alive'}\r\n`
		head += '\r\n'

		socket.write(head)
		if (response.body !== null) {
			socket.write(response.body)
		}
	}
}

/**
 * Get status text for HTTP status code
 */
const getStatusText = (status: number): string => {
	const texts: Record<number, string> = {
		200: 'OK',
		201: 'Created',
		204: 'No Content',
		301: 'Moved Permanently',
		302: 'Found',
		303: 'See Other',
		304: 'Not Modified',
		307: 'Temporary Redirect',
		308: 'Permanent Redirect',
		400: 'Bad Request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not Found',
		405: 'Method Not Allowed',
		408: 'Request Timeout',
		413: 'Content Too Large',
		429: 'Too Many Requests',
		431: 'Request Header Fields Too Large',
		500: 'Internal Server Error',
		502: 'Bad Gateway',
		503: 'Service Unavailable',
		504: 'Gateway Timeout',
	}
	return texts[status] || 'Unknown'
}
