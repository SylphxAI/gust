/**
 * Serve - High performance HTTP/HTTPS server
 *
 * Native-only architecture:
 * - Rust native server via @sylphx/gust-napi (gust-core authority)
 * - No parallel JS/WASM HTTP accept or parse loops in this package
 */

import {
	type ContextProvider,
	createApp,
	type GustApp,
	type Middleware,
	type RawContext,
	type Route,
} from '@sylphx/gust-app'
import type { Handler } from '@sylphx/gust-core'
import {
	getNativeLoadError,
	isHttp2Available,
	isNativeAvailable,
	isTlsAvailable,
	loadNativeBinding,
	type NativeInvokeHandlerInput,
} from './native'

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
 * Serve options
 *
 * Can provide either:
 * - `app` - Pre-built GustApp (from createApp())
 * - `routes` - Routes to build app from (backward compatible)
 */
export type ServeOptions<App = Record<string, never>> = {
	readonly port?: number
	readonly hostname?: string
	/**
	 * Pre-built GustApp (from createApp())
	 *
	 * When provided, routes/middleware/context are ignored.
	 * Use this for better separation between app logic and server config.
	 *
	 * @example
	 * ```typescript
	 * const app = createApp({ routes: [...] })
	 * await serve({ app, port: 3000 })
	 * ```
	 */
	readonly app?: GustApp<App>
	/** Routes created with get(), post(), etc. */
	readonly routes?: Route<string, string, App>[]
	/** Global middleware - wraps the entire router
	 * Use Middleware (universal) or Middleware<App> (bounded) */
	readonly middleware?: Middleware<Partial<App>>
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

const nativeRequiredError = (): Error => {
	const loadError = getNativeLoadError()
	const detail = loadError ? ` Load error: ${loadError.message}` : ''
	return new Error(
		`Native HTTP server (@sylphx/gust-napi) is required. Install the native binding for your platform.${detail}`
	)
}

/**
 * Start the HTTP/HTTPS server
 *
 * @example
 * ```ts
 * // Option 1: Pass routes directly (backward compatible)
 * serve({
 *   routes: [get('/users', ({ ctx }) => json(ctx.app.db.getUsers()))],
 *   context: () => ({ db: createDb() }),
 *   middleware: cors(),
 *   port: 3000,
 * })
 *
 * // Option 2: Pass pre-built app (new, recommended)
 * const app = createApp({
 *   routes: [...],
 *   middleware: cors(),
 *   context: () => ({ db }),
 * })
 * serve({ app, port: 3000 })
 * ```
 */
export const serve = async <App = Record<string, never>>(
	options: ServeOptions<App>
): Promise<Server> => {
	const port = options.port ?? (options.tls ? 443 : 3000)
	const hostname = options.hostname ?? '0.0.0.0'
	const useTls = !!options.tls

	let handler: Handler<RawContext>
	if (options.app) {
		handler = options.app.handle
	} else if (options.routes) {
		const app = createApp({
			routes: options.routes,
			middleware: options.middleware,
			context: options.context,
		})
		handler = app.handle
	} else {
		throw new Error('Either app or routes must be provided')
	}

	if (!isNativeAvailable()) {
		throw nativeRequiredError()
	}

	if (useTls && !isTlsAvailable()) {
		throw new Error(
			'Native TLS support is not available in this build of @sylphx/gust-napi. Rebuild with the tls feature enabled.'
		)
	}

	if (options.http2) {
		if (!useTls) {
			throw new Error('HTTP/2 requires TLS configuration (options.tls)')
		}
		if (!isHttp2Available()) {
			throw new Error(
				'Native HTTP/2 support is not available in this build of @sylphx/gust-napi.'
			)
		}
	}

	return serveNative(options, handler, port, hostname, useTls)
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
): Promise<Server> => {
	const binding = loadNativeBinding()
	if (!binding) {
		throw nativeRequiredError()
	}

	const server = new binding.GustServer()

	try {
		if (useTls && options.tls) {
			const tlsConfig: {
				certPath?: string
				keyPath?: string
				cert?: string
				key?: string
			} = {}

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

			if (options.http2) {
				await server.enableHttp2()
			}
		}

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

		if (options.app) {
			const nativeManifest = {
				routes: options.app.manifest.routes.map((r) => ({
					method: r.method,
					path: r.path,
					handlerId: r.handlerId,
					hasParams: r.hasParams,
					hasWildcard: r.hasWildcard,
				})),
				handlerCount: options.app.manifest.handlerCount,
			}

			await server.registerRoutes(nativeManifest)

			server.setInvokeHandler(async (input: NativeInvokeHandlerInput) => {
				try {
					// biome-ignore lint/style/noNonNullAssertion: app is checked above
					const response = await options.app!.invokeHandler(input.handlerId, input.ctx)

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
		} else {
			server.setFallback(async (ctx) => {
				try {
					const bodyBuffer = ctx.body ? Buffer.from(ctx.body) : Buffer.alloc(0)

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
						socket: null,
					}

					const response = await handler(rawCtx)

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
		}

		await server.serveWithHostname(port, hostname)

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
		throw err instanceof Error ? err : new Error(String(err))
	}
}