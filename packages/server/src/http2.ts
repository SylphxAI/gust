/**
 * HTTP/2 Server
 *
 * Native-only: delegates to GustServer (enableTls + enableHttp2).
 * Helpers for push hints and ALPN remain available without parallel Node servers.
 */

import type { Handler, ServerResponse } from '@sylphx/gust-core'
import {
	getNativeLoadError,
	isHttp2Available,
	isNativeAvailable,
	isTlsAvailable,
	loadNativeBinding,
} from './native'

// ============================================================================
// Types
// ============================================================================

/** Minimal HTTP/2 stream surface for push helpers (native does not expose streams to JS). */
export type Http2Stream = {
	readonly pushAllowed?: boolean
	readonly destroyed?: boolean
	readonly closed?: boolean
	pushStream?(
		headers: Record<string, string | number>,
		callback: (err: Error | null, pushStream: Http2Stream | null) => void
	): void
	respond?(headers: Record<string, string | number>): void
	write?(chunk: Uint8Array | Buffer | string): void
	end?(data?: Uint8Array | Buffer | string): void
}

export type Http2Context = {
	/** HTTP method */
	readonly method: string
	/** Request path */
	readonly path: string
	/** Query string (including ?) */
	readonly query: string
	/** Request headers */
	readonly headers: Record<string, string>
	/** Request body */
	readonly body: Buffer
	/** HTTP/2 stream (null when served via native FFI — push not available from JS) */
	readonly stream: Http2Stream | null
	/** Authority (host) */
	readonly authority: string
	/** Scheme (https) */
	readonly scheme: string
	/** Route params (set by router) */
	params?: Record<string, string>
}

export type Http2Options = {
	/** Port (default: 443 for secure, 8443 for insecure) */
	readonly port?: number
	/** Hostname (default: 0.0.0.0) */
	readonly hostname?: string
	/** Request handler */
	readonly fetch: Handler<Http2Context>
	/** TLS certificate (required for secure server) */
	readonly cert?: string | Buffer
	/** TLS private key (required for secure server) */
	readonly key?: string | Buffer
	/** Allow HTTP/2 over plain TCP (h2c) - not recommended for production */
	readonly allowHttp1?: boolean
	/** On listen callback */
	readonly onListen?: (info: { port: number; hostname: string }) => void
	/** On error callback */
	readonly onError?: (error: Error) => void
	/** Max concurrent streams per connection (default: 100) */
	readonly maxConcurrentStreams?: number
	/** Initial window size (default: 65535) */
	readonly initialWindowSize?: number
	/** Max header list size (default: 16KB) */
	readonly maxHeaderListSize?: number
}

export type Http2ServerInstance = {
	readonly port: number
	readonly hostname: string
	readonly stop: () => Promise<void>
	readonly push: (
		stream: Http2Stream,
		path: string,
		headers?: Record<string, string>
	) => Http2Stream | null
}

const nativeRequiredError = (): Error => {
	const loadError = getNativeLoadError()
	const detail = loadError ? ` Load error: ${loadError.message}` : ''
	return new Error(
		`Native HTTP/2 server (@sylphx/gust-napi) is required. Install the native binding for your platform.${detail}`
	)
}

const toResponseData = (response: ServerResponse): { status: number; headers: Record<string, string>; body: string } => {
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
}

/**
 * Start HTTP/2 server via native GustServer (TLS + HTTP/2).
 */
export const serveHttp2 = async (options: Http2Options): Promise<Http2ServerInstance> => {
	if (!isNativeAvailable()) {
		throw nativeRequiredError()
	}

	if (!isTlsAvailable()) {
		throw new Error(
			'Native TLS support is not available in this build of @sylphx/gust-napi. HTTP/2 requires TLS.'
		)
	}

	if (!isHttp2Available()) {
		throw new Error(
			'Native HTTP/2 support is not available in this build of @sylphx/gust-napi.'
		)
	}

	const { cert, key, fetch: handler, onError } = options

	if (!cert || !key) {
		throw new Error('HTTP/2 server requires TLS certificate and key (cert, key)')
	}

	const binding = loadNativeBinding()
	if (!binding) {
		throw nativeRequiredError()
	}

	const port = options.port ?? 443
	const hostname = options.hostname ?? '0.0.0.0'

	const server = new binding.GustServer()

	try {
		const tlsConfig: { cert?: string; key?: string } = {}

		if (typeof cert === 'string') {
			tlsConfig.cert = cert
		} else if (Buffer.isBuffer(cert)) {
			tlsConfig.cert = cert.toString('utf-8')
		}

		if (typeof key === 'string') {
			tlsConfig.key = key
		} else if (Buffer.isBuffer(key)) {
			tlsConfig.key = key.toString('utf-8')
		}

		await server.enableTls(tlsConfig)
		await server.enableHttp2()

		server.setFallback(async (ctx) => {
			try {
				const bodyBuffer = ctx.body ? Buffer.from(ctx.body) : Buffer.alloc(0)
				const authority = ctx.headers.host ?? ctx.headers[':authority'] ?? ''

				const http2Ctx: Http2Context = {
					method: ctx.method,
					path: ctx.path,
					query: ctx.query ?? '',
					headers: ctx.headers,
					body: bodyBuffer,
					stream: null,
					authority,
					scheme: 'https',
					params: ctx.params,
				}

				const response = await handler(http2Ctx)
				return toResponseData(response)
			} catch (err) {
				onError?.(err as Error)
				return {
					status: 500,
					headers: { 'content-type': 'text/plain' },
					body: 'Internal Server Error',
				}
			}
		})

		await server.serveWithHostname(port, hostname)
		options.onListen?.({ port, hostname })

		return {
			port,
			hostname,
			stop: async () => {
				await server.shutdown()
			},
			push: () => null,
		}
	} catch (err) {
		onError?.(err as Error)
		throw err instanceof Error ? err : new Error(String(err))
	}
}

// ============================================================================
// Server Push
// ============================================================================

export type PushOptions = {
	/** Content type */
	readonly contentType?: string
	/** Cache control */
	readonly cacheControl?: string
	/** Additional headers */
	readonly headers?: Record<string, string>
}

/**
 * Push a resource to the client.
 * Requires an HTTP/2 stream handle; not available when serving via native FFI.
 */
export const pushResource = (
	stream: Http2Stream,
	_path: string,
	_content: string | Buffer,
	_options: PushOptions = {}
): boolean => {
	if (!stream.pushAllowed || !stream.pushStream) {
		return false
	}

	return false
}

/**
 * Push multiple resources.
 */
export const pushResources = (
	stream: Http2Stream,
	resources: Array<{ path: string; content: string | Buffer; options?: PushOptions }>
): number => {
	let pushed = 0
	for (const resource of resources) {
		if (pushResource(stream, resource.path, resource.content, resource.options)) {
			pushed++
		}
	}
	return pushed
}

// ============================================================================
// ALPN Negotiation Helpers
// ============================================================================

/**
 * Get negotiated protocol from TLS socket
 */
export const getAlpnProtocol = (socket: { alpnProtocol?: string }): string => {
	return socket.alpnProtocol || 'http/1.1'
}

/**
 * Check if connection is HTTP/2
 */
export const isHttp2 = (socket: { alpnProtocol?: string }): boolean => {
	return socket.alpnProtocol === 'h2'
}

// ============================================================================
// Preload Hints
// ============================================================================

/**
 * Generate Link header for preload hints
 */
export const preloadHint = (
	resources: Array<{ path: string; as: string; crossorigin?: boolean }>
): string => {
	return resources
		.map((r) => {
			let link = `<${r.path}>; rel=preload; as=${r.as}`
			if (r.crossorigin) {
				link += '; crossorigin'
			}
			return link
		})
		.join(', ')
}

type PreloadResource = { path: string; as: string; crossorigin?: boolean }

/**
 * Common preload types
 */
export const preload = {
	script: (path: string): PreloadResource => ({ path, as: 'script' }),
	style: (path: string): PreloadResource => ({ path, as: 'style' }),
	image: (path: string): PreloadResource => ({ path, as: 'image' }),
	font: (path: string, crossorigin = true): PreloadResource => ({ path, as: 'font', crossorigin }),
	fetch: (path: string): PreloadResource => ({ path, as: 'fetch' }),
}