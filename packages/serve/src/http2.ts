/**
 * HTTP/2 Server
 * High-performance HTTP/2 with multiplexing and server push
 */

import {
	constants,
	createServer as createH2Server,
	createSecureServer,
	type Http2SecureServer,
	type Http2Server,
	type IncomingHttpHeaders,
	type ServerHttp2Stream,
} from 'node:http2'
import type { Handler, ServerResponse } from '@sylphx/gust-core'
import { serverError } from '@sylphx/gust-core'

const {
	HTTP2_HEADER_METHOD,
	HTTP2_HEADER_PATH,
	HTTP2_HEADER_SCHEME,
	HTTP2_HEADER_AUTHORITY,
	HTTP2_HEADER_STATUS,
	HTTP2_HEADER_CONTENT_TYPE,
	HTTP2_HEADER_CONTENT_LENGTH,
} = constants

// ============================================================================
// Types
// ============================================================================

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
	/** HTTP/2 stream */
	readonly stream: ServerHttp2Stream
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
		stream: ServerHttp2Stream,
		path: string,
		headers?: Record<string, string>
	) => ServerHttp2Stream | null
}

// ============================================================================
// HTTP/2 Server
// ============================================================================

/**
 * Create HTTP/2 context from stream
 */
const createHttp2Context = async (
	stream: ServerHttp2Stream,
	headers: IncomingHttpHeaders
): Promise<Http2Context> => {
	const method = (headers[HTTP2_HEADER_METHOD] as string) || 'GET'
	const fullPath = (headers[HTTP2_HEADER_PATH] as string) || '/'
	const authority = (headers[HTTP2_HEADER_AUTHORITY] as string) || ''
	const scheme = (headers[HTTP2_HEADER_SCHEME] as string) || 'https'

	// Parse path and query
	const queryIdx = fullPath.indexOf('?')
	const path = queryIdx >= 0 ? fullPath.slice(0, queryIdx) : fullPath
	const query = queryIdx >= 0 ? fullPath.slice(queryIdx) : ''

	// Convert headers to flat object
	const headerMap: Record<string, string> = {}
	for (const [key, value] of Object.entries(headers)) {
		if (!key.startsWith(':') && value !== undefined) {
			headerMap[key] = Array.isArray(value) ? value.join(', ') : value
		}
	}

	// Read body
	const chunks: Buffer[] = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}
	const body = Buffer.concat(chunks)

	return {
		method,
		path,
		query,
		headers: headerMap,
		body,
		stream,
		authority,
		scheme,
	}
}

/**
 * Send HTTP/2 response
 */
const sendResponse = (stream: ServerHttp2Stream, response: ServerResponse): void => {
	if (stream.destroyed || stream.closed) return

	const headers: Record<string, string | number> = {
		[HTTP2_HEADER_STATUS]: response.status,
	}

	// Add response headers
	for (const [key, value] of Object.entries(response.headers)) {
		headers[key.toLowerCase()] = value
	}

	// Add content-length if body exists
	if (response.body !== null) {
		const bodyLen =
			typeof response.body === 'string' ? Buffer.byteLength(response.body) : response.body.length
		headers[HTTP2_HEADER_CONTENT_LENGTH] = bodyLen
	}

	// Send response
	stream.respond(headers)

	if (response.body !== null) {
		stream.end(response.body)
	} else {
		stream.end()
	}
}

/**
 * Start HTTP/2 server (secure)
 */
export const serveHttp2 = async (options: Http2Options): Promise<Http2ServerInstance> => {
	const {
		port = options.cert ? 443 : 8443,
		hostname = '0.0.0.0',
		fetch: handler,
		cert,
		key,
		allowHttp1 = true,
		onError,
		maxConcurrentStreams = 100,
		initialWindowSize = 65535,
		maxHeaderListSize = 16384,
	} = options

	const serverOptions = {
		allowHTTP1: allowHttp1,
		settings: {
			maxConcurrentStreams,
			initialWindowSize,
			maxHeaderListSize,
		},
	}

	let server: Http2SecureServer | Http2Server

	if (cert && key) {
		// Secure HTTP/2 server
		server = createSecureServer({
			...serverOptions,
			cert: typeof cert === 'string' ? cert : cert,
			key: typeof key === 'string' ? key : key,
		})
	} else {
		// Plain HTTP/2 (h2c) - not recommended for production
		server = createH2Server(serverOptions)
	}

	// Handle streams
	server.on('stream', async (stream: ServerHttp2Stream, headers: IncomingHttpHeaders) => {
		try {
			const ctx = await createHttp2Context(stream, headers)
			const response = await handler(ctx)
			sendResponse(stream, response)
		} catch (error) {
			onError?.(error as Error)
			sendResponse(stream, serverError())
		}
	})

	// Handle errors
	server.on('error', (err) => {
		onError?.(err)
	})

	return new Promise((resolve, reject) => {
		server.on('error', reject)

		server.listen(port, hostname, () => {
			options.onListen?.({ port, hostname })

			resolve({
				port,
				hostname,
				stop: () => new Promise((res) => server.close(() => res())),
				push: (stream, path, headers = {}) => {
					if (!stream.pushAllowed) return null

					let pushStream: ServerHttp2Stream | null = null

					stream.pushStream(
						{
							[HTTP2_HEADER_PATH]: path,
							...headers,
						},
						(err, ps) => {
							if (err) return
							pushStream = ps
						}
					)

					return pushStream
				},
			})
		})
	})
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
 * Push a resource to the client
 */
export const pushResource = (
	stream: ServerHttp2Stream,
	path: string,
	content: string | Buffer,
	options: PushOptions = {}
): boolean => {
	if (!stream.pushAllowed) return false

	const { contentType = 'application/octet-stream', cacheControl, headers = {} } = options

	try {
		stream.pushStream(
			{
				[HTTP2_HEADER_PATH]: path,
			},
			(err, pushStream) => {
				if (err || !pushStream) return

				const responseHeaders: Record<string, string | number> = {
					[HTTP2_HEADER_STATUS]: 200,
					[HTTP2_HEADER_CONTENT_TYPE]: contentType,
					[HTTP2_HEADER_CONTENT_LENGTH]:
						typeof content === 'string' ? Buffer.byteLength(content) : content.length,
					...headers,
				}

				if (cacheControl) {
					responseHeaders['cache-control'] = cacheControl
				}

				pushStream.respond(responseHeaders)
				pushStream.end(content)
			}
		)

		return true
	} catch {
		return false
	}
}

/**
 * Push multiple resources
 */
export const pushResources = (
	stream: ServerHttp2Stream,
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

/**
 * Common preload types
 */
export const preload = {
	script: (path: string) => ({ path, as: 'script' }),
	style: (path: string) => ({ path, as: 'style' }),
	image: (path: string) => ({ path, as: 'image' }),
	font: (path: string, crossorigin = true) => ({ path, as: 'font', crossorigin }),
	fetch: (path: string) => ({ path, as: 'fetch' }),
}
