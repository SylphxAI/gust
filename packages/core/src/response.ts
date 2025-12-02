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

// ============================================================================
// Error Response Types
// ============================================================================

/**
 * Standard error response body
 * Use this format for all error responses to ensure consistency
 */
export type ErrorResponseBody = {
	/** Human-readable error message (backwards compatible) */
	readonly error: string
	/** Programmatic error code (e.g., "NOT_FOUND", "VALIDATION_ERROR") */
	readonly code?: string
	/** Additional error details (validation errors, debug info, etc.) */
	readonly details?: unknown
}

/**
 * Create a standardized error response
 * @param error - Human-readable error message
 * @param status - HTTP status code
 * @param code - Programmatic error code (optional)
 * @param details - Additional context (optional)
 */
export const errorResponse = (
	error: string,
	status: number,
	code?: string,
	details?: unknown
): ServerResponse => {
	const body: Record<string, unknown> = { error }
	if (code !== undefined) body.code = code
	if (details !== undefined) body.details = details
	return json(body as ErrorResponseBody, { status })
}

// Error response helpers (backwards compatible)
export const notFound = (message = 'Not Found'): ServerResponse =>
	errorResponse(message, 404, 'NOT_FOUND')

export const badRequest = (message = 'Bad Request', details?: unknown): ServerResponse =>
	errorResponse(message, 400, 'BAD_REQUEST', details)

export const unauthorized = (message = 'Unauthorized'): ServerResponse =>
	errorResponse(message, 401, 'UNAUTHORIZED')

export const forbidden = (message = 'Forbidden'): ServerResponse =>
	errorResponse(message, 403, 'FORBIDDEN')

export const serverError = (message = 'Internal Server Error', details?: unknown): ServerResponse =>
	errorResponse(message, 500, 'INTERNAL_ERROR', details)

export const validationError = (message = 'Validation Error', details?: unknown): ServerResponse =>
	errorResponse(message, 400, 'VALIDATION_ERROR', details)

export const payloadTooLarge = (message = 'Payload Too Large', details?: unknown): ServerResponse =>
	errorResponse(message, 413, 'PAYLOAD_TOO_LARGE', details)

export const tooManyRequests = (message = 'Too Many Requests', details?: unknown): ServerResponse =>
	errorResponse(message, 429, 'TOO_MANY_REQUESTS', details)
