/**
 * Response types and helpers
 * Immutable response objects
 */

/**
 * Response body type
 * - string | Buffer: Buffered response (sent all at once)
 * - AsyncIterable<Uint8Array>: Streaming response (sent chunk by chunk)
 * - null: No body
 */
export type ResponseBody = string | Buffer | AsyncIterable<Uint8Array> | null

export type ServerResponse = {
	readonly status: number
	readonly headers: Readonly<Record<string, string>>
	readonly body: ResponseBody
}

/**
 * Check if body is a streaming response (AsyncIterable)
 */
export const isStreamingBody = (body: ResponseBody): body is AsyncIterable<Uint8Array> =>
	body !== null &&
	typeof body === 'object' &&
	!Buffer.isBuffer(body) &&
	Symbol.asyncIterator in body

// Response constructors
export const response = (
	body: string | Buffer | null = null,
	init: { status?: number; headers?: Record<string, string> } = {}
): ServerResponse => ({
	status: init.status ?? 200,
	headers: init.headers ?? {},
	body,
})

export const json = <T>(
	data: T,
	init: { status?: number; headers?: Record<string, string> } = {}
): ServerResponse => ({
	status: init.status ?? 200,
	headers: {
		'content-type': 'application/json',
		...init.headers,
	},
	body: JSON.stringify(data),
})

export const text = (
	data: string,
	init: { status?: number; headers?: Record<string, string> } = {}
): ServerResponse => ({
	status: init.status ?? 200,
	headers: {
		'content-type': 'text/plain',
		...init.headers,
	},
	body: data,
})

export const html = (
	data: string,
	init: { status?: number; headers?: Record<string, string> } = {}
): ServerResponse => ({
	status: init.status ?? 200,
	headers: {
		'content-type': 'text/html',
		...init.headers,
	},
	body: data,
})

export const redirect = (
	url: string,
	status: 301 | 302 | 303 | 307 | 308 = 302
): ServerResponse => ({
	status,
	headers: { location: url },
	body: null,
})

// Error responses
export const notFound = (message = 'Not Found'): ServerResponse =>
	json({ error: message }, { status: 404 })

export const badRequest = (message = 'Bad Request'): ServerResponse =>
	json({ error: message }, { status: 400 })

export const unauthorized = (message = 'Unauthorized'): ServerResponse =>
	json({ error: message }, { status: 401 })

export const forbidden = (message = 'Forbidden'): ServerResponse =>
	json({ error: message }, { status: 403 })

export const serverError = (message = 'Internal Server Error'): ServerResponse =>
	json({ error: message }, { status: 500 })
