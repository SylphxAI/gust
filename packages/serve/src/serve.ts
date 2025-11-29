/**
 * Serve - High performance HTTP/HTTPS server
 *
 * Native-first architecture:
 * - Primary: Rust native server via napi-rs (~220k req/s)
 * - Fallback: Node.js net/tls + WASM HTTP parser (edge/serverless)
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
import type { Context, RawContext } from './context'
import { createRawContext, parseHeaders, withApp } from './context'
import { isNativeAvailable, isTlsAvailable, loadNativeBinding } from './native'
import type { Route, RouteHandlerFn } from './router'

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

/**
 * Context provider function - creates app context for each request
 * Can be sync (static context) or async (per-request context)
 */
export type ContextProvider<App> = (raw: RawContext) => App | Promise<App>

/**
 * Middleware type - polymorphic over App
 *
 * Middleware works with any App type, making it usable as both
 * global middleware and route-level middleware.
 *
 * @example
 * ```typescript
 * // Middleware that works with any App
 * const cors = (options?: CorsOptions): Middleware =>
 *   <App>(handler: Handler<Context<App>>) =>
 *     async (ctx: Context<App>) => {
 *       // Add CORS headers
 *       const res = await handler(ctx)
 *       return { ...res, headers: { ...res.headers, ...corsHeaders } }
 *     }
 *
 * // Usage - no type annotations needed
 * serve({
 *   middleware: cors(),
 *   routes: [...]
 * })
 * ```
 */
export type Middleware = <App>(handler: Handler<Context<App>>) => Handler<Context<App>>

/**
 * Serve options
 */
export type ServeOptions<App = Record<string, never>> = {
	readonly port?: number
	readonly hostname?: string
	/** Routes created with get(), post(), etc. */
	readonly routes: Route<string, string, App>[]
	/** Global middleware - wraps the entire router */
	readonly middleware?: Middleware
	/** Context provider - creates app context for each request */
	readonly context?: ContextProvider<App>
	readonly onListen?: (info: { port: number; hostname: string; tls: boolean }) => void
	readonly onError?: (error: Error) => void
	readonly keepAliveTimeout?: number
	readonly maxRequestsPerConnection?: number
	readonly requestTimeout?: number
	readonly maxHeaderSize?: number
	/** Maximum body size in bytes (default: 1MB) */
	readonly maxBodySize?: number
	/** TLS configuration for HTTPS */
	readonly tls?: TlsOptions
	/** Enable HTTP/2 (only with TLS) */
	readonly http2?: boolean
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
 * Create handler from routes and optional context provider
 */
const createHandler = <App>(
	routes: Route<string, string, App>[],
	contextProvider?: ContextProvider<App>
): Handler<Context<App>> => {
	type WasmRouterType = {
		insert: (m: string, p: string, id: number) => void
		find: (
			m: string,
			p: string
		) => { found: boolean; handler_id: number; params: string[]; free: () => void }
	}

	let wasmRouter: WasmRouterType | null = null
	const handlers: RouteHandlerFn<App, string>[] = []

	const initRouter = () => {
		if (wasmRouter) return wasmRouter
		const wasm = getWasm()
		wasmRouter = new wasm.WasmRouter() as WasmRouterType

		for (const route of routes) {
			const handlerId = handlers.length
			handlers.push(route.handler as RouteHandlerFn<App, string>)
			wasmRouter.insert(route.method, route.path, handlerId)

			if (route.method === '*') {
				for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
					wasmRouter.insert(method, route.path, handlerId)
				}
			}
		}
		return wasmRouter
	}

	return async (ctx: Context<App>) => {
		const r = initRouter()
		const match = r.find(ctx.method, ctx.path)

		if (!match.found) {
			match.free()
			return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not Found' }
		}

		const h = handlers[match.handler_id]
		const params: Record<string, string> = {}

		const paramArray = match.params
		for (let i = 0; i < paramArray.length; i += 2) {
			const key = paramArray[i]
			const value = paramArray[i + 1]
			if (key !== undefined && value !== undefined) {
				params[key] = value
			}
		}
		match.free()

		if (!h) {
			return { status: 404, headers: { 'content-type': 'text/plain' }, body: 'Not Found' }
		}

		// Update params in context
		const ctxWithParams = { ...ctx, params: { ...ctx.params, ...params } }

		return h({ ctx: ctxWithParams, input: undefined as never })
	}
}

/**
 * Create the entry handler that builds Context<App> and routes
 */
const createEntryHandler = <App>(
	routes: Route<string, string, App>[],
	contextProvider?: ContextProvider<App>,
	middleware?: Middleware
): Handler<RawContext> => {
	const routerHandler = createHandler(routes, contextProvider)

	// Wrap with middleware if provided
	const finalHandler = middleware ? middleware<App>(routerHandler) : routerHandler

	return async (raw: RawContext) => {
		// Create app context
		const app = contextProvider ? await contextProvider(raw) : ({} as App)
		const ctx = withApp(raw, app)

		return finalHandler(ctx)
	}
}

/**
 * Start the HTTP/HTTPS server
 *
 * @example
 * ```ts
 * type App = { db: Database }
 * const { get } = createRouter<App>()
 *
 * serve({
 *   routes: [get('/users', ({ ctx }) => json(ctx.app.db.getUsers()))],
 *   context: () => ({ db: createDb() }),
 *   middleware: cors(),
 *   port: 3000,
 * })
 * ```
 *
 * Architecture:
 * - Primary: Rust native server via napi-rs (~220k req/s) - full feature support
 * - Fallback: Node.js net/tls + WASM HTTP parser (edge/serverless)
 */
export const serve = async <App = Record<string, never>>(
	options: ServeOptions<App>
): Promise<Server> => {
	const port = options.port ?? (options.tls ? 443 : 3000)
	const hostname = options.hostname ?? '0.0.0.0'
	const useTls = !!options.tls
	const handler = createEntryHandler(options.routes, options.context, options.middleware)

	// Try native server first (supports both HTTP and HTTPS)
	if (isNativeAvailable()) {
		// For TLS, check if native TLS is available
		if (useTls && !isTlsAvailable()) {
			// Native doesn't have TLS support compiled in, use JS fallback
			return serveJs(options, handler, port, hostname, useTls)
		}

		const nativeServer = await serveNative(options, handler, port, hostname, useTls)
		if (nativeServer) {
			return nativeServer
		}
	}

	// Fallback to pure JS
	return serveJs(options, handler, port, hostname, useTls)
}

/**
 * Native server implementation using Rust napi-rs backend
 *
 * Architecture:
 * - All HTTP parsing and routing happens in Rust
 * - JS handler is called via threadsafe callback for dynamic routes
 * - Middleware (CORS, rate limiting, security) runs in Rust
 * - Supports TLS/HTTPS when compiled with 'tls' feature
 */
const serveNative = async <App>(
	options: ServeOptions<App>,
	handler: Handler<RawContext>,
	port: number,
	hostname: string,
	useTls: boolean
): Promise<Server | null> => {
	const binding = loadNativeBinding()
	if (!binding) return null

	try {
		const server = new binding.GustServer()

		// Enable TLS if configured
		if (useTls && options.tls) {
			const tlsConfig: {
				certPath?: string
				keyPath?: string
				cert?: string
				key?: string
			} = {}

			// Convert cert/key to string if Buffer
			if (typeof options.tls.cert === 'string') {
				tlsConfig.cert = options.tls.cert
			} else if (Buffer.isBuffer(options.tls.cert)) {
				tlsConfig.cert = options.tls.cert.toString('utf-8')
			}

			if (typeof options.tls.key === 'string') {
				tlsConfig.key = options.tls.key
			} else if (Buffer.isBuffer(options.tls.key)) {
				tlsConfig.key = options.tls.key.toString('utf-8')
			}

			await server.enableTls(tlsConfig)

			// Enable HTTP/2 if requested (only with TLS)
			if (options.http2) {
				await server.enableHttp2()
			}
		}

		// Apply timeout and limit configurations
		if (options.requestTimeout !== undefined) {
			await server.setRequestTimeout(options.requestTimeout)
		}
		if (options.maxBodySize !== undefined) {
			await server.setMaxBodySize(options.maxBodySize)
		}
		if (options.keepAliveTimeout !== undefined) {
			await server.setKeepAliveTimeout(options.keepAliveTimeout)
		}
		if (options.maxHeaderSize !== undefined) {
			await server.setMaxHeaderSize(options.maxHeaderSize)
		}

		// Set fallback handler that routes all requests to JS handler
		// This is the native-first architecture: Rust handles HTTP, JS handles business logic
		server.setFallback(async (ctx) => {
			try {
				// Parse body if present
				const bodyBuffer = ctx.body ? Buffer.from(ctx.body) : Buffer.alloc(0)

				// Create raw context for the handler
				const rawCtx: RawContext = {
					method: ctx.method,
					path: ctx.path,
					query: ctx.query ?? '',
					headers: ctx.headers,
					params: ctx.params,
					body: bodyBuffer,
					json: <T>() => {
						try {
							return JSON.parse(ctx.body || '{}') as T
						} catch {
							return {} as T
						}
					},
					raw: bodyBuffer,
					socket: null as unknown as Socket, // Not available for native
				}

				const response = await handler(rawCtx)

				// Convert ServerResponse to native format
				const headers: Record<string, string> = {}
				if (response.headers) {
					for (const key in response.headers) {
						headers[key] = String(response.headers[key])
					}
				}

				const body =
					response.body === null
						? ''
						: typeof response.body === 'string'
							? response.body
							: Buffer.isBuffer(response.body)
								? response.body.toString()
								: String(response.body)

				return {
					status: response.status,
					headers,
					body,
				}
			} catch (err) {
				options.onError?.(err as Error)
				return {
					status: 500,
					headers: { 'content-type': 'text/plain' },
					body: 'Internal Server Error',
				}
			}
		})

		// Start server with hostname (non-blocking)
		server.serveWithHostname(port, hostname).catch((err) => {
			options.onError?.(err as Error)
		})

		options.onListen?.({ port, hostname, tls: useTls })

		return {
			port,
			hostname,
			tls: useTls,
			connections: () => server.activeConnections(),
			stop: async () => {
				await server.shutdown()
			},
			shutdown: async (timeout = 30000) => {
				await server.gracefulShutdown(timeout)
			},
		}
	} catch (err) {
		options.onError?.(err as Error)
		return null
	}
}

/**
 * Pure JS server implementation using node:net + WASM HTTP parser
 */
const serveJs = async <App>(
	options: ServeOptions<App>,
	handler: Handler<RawContext>,
	port: number,
	hostname: string,
	useTls: boolean
): Promise<Server> => {
	// Initialize WASM
	await initWasm()
	const wasm = getWasm()
	const keepAliveTimeout = options.keepAliveTimeout ?? DEFAULT_KEEP_ALIVE_TIMEOUT
	const maxRequests = options.maxRequestsPerConnection ?? DEFAULT_MAX_REQUESTS
	const requestTimeout = options.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT
	const maxHeaderSize = options.maxHeaderSize ?? DEFAULT_MAX_HEADER_SIZE

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
	handler: Handler<RawContext>,
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
				const ctx = createRawContext(socket, requestBuffer, parsed, headers)

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
