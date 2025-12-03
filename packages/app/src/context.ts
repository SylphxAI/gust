/**
 * Request Context
 *
 * Single unified context type with app always present.
 * Middleware is polymorphic over App type.
 */

import type { Socket } from 'node:net'
import type { ParseResult } from '@sylphx/gust-core'
import { type MethodCode, MethodNames } from '@sylphx/gust-core'

// =============================================================================
// Context Type
// =============================================================================

/**
 * Request context with HTTP data and user's app context
 *
 * @example
 * ```typescript
 * type App = { db: Database; user: User }
 *
 * get<App>('/users', ({ ctx }) => {
 *   ctx.method      // HTTP request data
 *   ctx.app.db      // User's app context
 *   ctx.app.user    // Per-request context
 * })
 * ```
 */
export type Context<App = Record<string, never>> = {
	readonly method: string
	readonly path: string
	readonly query: string
	readonly headers: Readonly<Record<string, string>>
	readonly params: Readonly<Record<string, string>>
	readonly body: Buffer
	readonly json: <T>() => T
	readonly raw: Buffer
	readonly socket: Socket | null
	readonly app: App
	/**
	 * Original Fetch Request (available when using app.fetch)
	 *
	 * Useful for delegating to other fetch-based handlers like GraphQL Yoga.
	 *
	 * @example
	 * ```typescript
	 * import { createYoga } from 'graphql-yoga'
	 * const yoga = createYoga({ schema })
	 *
	 * all('/graphql', ({ ctx }) => yoga.fetch(ctx.request!))
	 * ```
	 */
	readonly request?: Request
}

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Handler arguments with context and validated input
 */
export type HandlerArgs<App = Record<string, never>, Input = void> = {
	readonly ctx: Context<App>
	readonly input: Input
}

/**
 * Route handler function
 */
export type RouteHandler<App = Record<string, never>, Input = void> = (
	args: HandlerArgs<App, Input>
) =>
	| import('@sylphx/gust-core').ServerResponse
	| Promise<import('@sylphx/gust-core').ServerResponse>

// =============================================================================
// Internal Types (for parsing)
// =============================================================================

/**
 * Raw parsed context (internal - before app is added)
 * @internal
 */
export type RawContext = Omit<Context<never>, 'app'> & {
	readonly request?: Request
}

// =============================================================================
// Context Creation
// =============================================================================

/**
 * Create raw context from parsed request
 * Returns RawContext (without app) - app is added by serve()
 */
export const createRawContext = (
	socket: Socket | null,
	raw: Buffer,
	parsed: ParseResult,
	headers: Record<string, string>,
	params: Record<string, string> = {}
): RawContext => {
	const decoder = new TextDecoder()

	const method = MethodNames[parsed.method as MethodCode] || 'UNKNOWN'
	const path = decoder.decode(raw.subarray(parsed.path_start, parsed.path_end))
	const query =
		parsed.query_start > 0 ? decoder.decode(raw.subarray(parsed.query_start, parsed.query_end)) : ''

	const body = raw.subarray(parsed.body_start)

	return {
		method,
		path,
		query,
		headers,
		params,
		body,
		json: <T>() => JSON.parse(body.toString()) as T,
		raw,
		socket,
	}
}

/**
 * Add app context to raw context
 * @internal
 */
export const withApp = <App>(raw: RawContext, app: App): Context<App> =>
	({ ...raw, app }) as Context<App>

/**
 * Create context with updated params
 * @internal
 */
export const withParams = <App>(ctx: Context<App>, params: Record<string, string>): Context<App> =>
	({
		...ctx,
		params: { ...ctx.params, ...params },
	}) as Context<App>

/**
 * Parse headers from raw buffer using WASM offsets
 * @internal
 */
export const parseHeaders = (
	raw: Buffer,
	offsets: Uint32Array,
	count: number
): Record<string, string> => {
	const headers: Record<string, string> = {}
	const decoder = new TextDecoder()

	for (let i = 0; i < count; i++) {
		const nameStart = offsets[i * 4]
		const nameEnd = offsets[i * 4 + 1]
		const valueStart = offsets[i * 4 + 2]
		const valueEnd = offsets[i * 4 + 3]

		const name = decoder.decode(raw.subarray(nameStart, nameEnd)).toLowerCase()
		const value = decoder.decode(raw.subarray(valueStart, valueEnd))
		headers[name] = value
	}

	return headers
}

// =============================================================================
// Legacy Compatibility
// =============================================================================

/**
 * BaseContext - alias for Context with empty app
 * @deprecated Use Context<App> directly
 */
export type BaseContext = Context<Record<string, never>>

/**
 * Legacy alias for createRawContext
 * @deprecated Use createRawContext instead
 */
export const createContext: typeof createRawContext = createRawContext

// =============================================================================
// Fetch API Conversion Utilities
// =============================================================================

/**
 * Convert Web Fetch Request to RawContext
 *
 * Used by createApp().fetch to handle Fetch API requests.
 * Extracts method, path, query, headers, and body from Request.
 *
 * @example
 * ```typescript
 * const request = new Request('http://localhost/users?page=1', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'Alice' }),
 * })
 * const ctx = await requestToRawContext(request)
 * // ctx.method === 'POST'
 * // ctx.path === '/users'
 * // ctx.query === 'page=1'
 * ```
 */
export const requestToRawContext = async (request: Request): Promise<RawContext> => {
	const url = new URL(request.url)
	const method = request.method
	const path = url.pathname
	const query = url.search.slice(1) // Remove leading '?'

	// Parse headers
	const headers: Record<string, string> = {}
	request.headers.forEach((value, key) => {
		headers[key.toLowerCase()] = value
	})

	// Read body
	let body: Buffer
	if (request.body) {
		const arrayBuffer = await request.arrayBuffer()
		body = Buffer.from(arrayBuffer)
	} else {
		body = Buffer.alloc(0)
	}

	return {
		method,
		path,
		query,
		headers,
		params: {},
		body,
		json: <T>() => {
			try {
				return JSON.parse(body.toString()) as T
			} catch {
				return {} as T
			}
		},
		raw: body,
		socket: null, // Not available in Fetch API
		request, // Store original request for delegation to other handlers
	}
}

/**
 * Convert ServerResponse to Web Fetch Response
 *
 * Used by createApp().fetch to return Fetch API responses.
 * Handles body conversion for string, Buffer, and streaming bodies.
 *
 * @example
 * ```typescript
 * const serverResponse = {
 *   status: 200,
 *   headers: { 'content-type': 'application/json' },
 *   body: '{"name":"Alice"}',
 * }
 * const response = serverResponseToResponse(serverResponse)
 * // response.status === 200
 * // response.headers.get('content-type') === 'application/json'
 * ```
 */
export const serverResponseToResponse = (
	response: import('@sylphx/gust-core').ServerResponse
): Response => {
	// Convert headers
	const headers = new Headers()
	if (response.headers) {
		for (const [key, value] of Object.entries(response.headers)) {
			if (value !== undefined) {
				headers.set(key, String(value))
			}
		}
	}

	// Convert body
	// BodyInit can be string, Blob, ArrayBuffer, DataView, TypedArray, FormData, URLSearchParams, ReadableStream
	let body: string | Uint8Array | Blob | ReadableStream | null = null
	if (response.body !== null && response.body !== undefined) {
		if (typeof response.body === 'string') {
			body = response.body
		} else if (Buffer.isBuffer(response.body)) {
			body = response.body
		} else if (response.body instanceof Uint8Array) {
			body = response.body
		} else if (isAsyncIterable(response.body)) {
			// Streaming body - convert to ReadableStream
			body = asyncIterableToReadableStream(response.body as AsyncIterable<Uint8Array>)
		} else {
			body = String(response.body)
		}
	}

	return new Response(body, {
		status: response.status,
		headers,
	})
}

/**
 * Convert Web Fetch Response to ServerResponse
 *
 * Used for delegating to other fetch-based handlers (GraphQL Yoga, tRPC, etc.)
 * and returning their responses through Gust.
 *
 * @example
 * ```typescript
 * import { createYoga } from 'graphql-yoga'
 * const yoga = createYoga({ schema })
 *
 * all('/graphql', async ({ ctx }) => {
 *   const response = await yoga.fetch(ctx.request!)
 *   return responseToServerResponse(response)
 * })
 * ```
 */
export const responseToServerResponse = async (
	response: Response
): Promise<import('@sylphx/gust-core').ServerResponse> => {
	// Convert headers
	const headers: Record<string, string> = {}
	response.headers.forEach((value, key) => {
		headers[key] = value
	})

	// Handle streaming vs buffered body
	if (response.body) {
		// Check if it's a streaming response by content-type
		const contentType = response.headers.get('content-type') || ''
		const isStreaming =
			contentType.includes('text/event-stream') ||
			contentType.includes('application/x-ndjson') ||
			response.headers.get('transfer-encoding') === 'chunked'

		if (isStreaming) {
			// Return streaming body as AsyncIterable
			return {
				status: response.status,
				headers,
				body: readableStreamToAsyncIterable(response.body) as unknown as string,
			}
		}

		// Buffer non-streaming body
		const arrayBuffer = await response.arrayBuffer()
		return {
			status: response.status,
			headers,
			body: Buffer.from(arrayBuffer),
		}
	}

	return {
		status: response.status,
		headers,
		body: '',
	}
}

/**
 * Convert ReadableStream to AsyncIterable
 */
const readableStreamToAsyncIterable = (
	stream: ReadableStream<Uint8Array>
): AsyncIterable<Uint8Array> => {
	const reader = stream.getReader()

	return {
		[Symbol.asyncIterator]() {
			return {
				async next() {
					const { value, done } = await reader.read()
					if (done) {
						return { value: undefined, done: true }
					}
					return { value, done: false }
				},
				async return() {
					reader.releaseLock()
					return { value: undefined, done: true }
				},
			}
		},
	}
}

/**
 * Check if value is an AsyncIterable
 */
const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
	return value !== null && typeof value === 'object' && Symbol.asyncIterator in value
}

/**
 * Convert AsyncIterable to ReadableStream
 */
const asyncIterableToReadableStream = (
	iterable: AsyncIterable<Uint8Array>
): ReadableStream<Uint8Array> => {
	const iterator = iterable[Symbol.asyncIterator]()

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await iterator.next()
				if (done) {
					controller.close()
				} else {
					controller.enqueue(value)
				}
			} catch (error) {
				controller.error(error)
			}
		},
		cancel() {
			iterator.return?.()
		},
	})
}
