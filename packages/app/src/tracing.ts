/**
 * Request ID and Tracing
 * Generate unique request IDs for logging and tracing
 *
 * Uses WASM implementation for random generation.
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import type { Context } from './context'
import { wasmGenerateSpanId, wasmGenerateTraceId } from './wasm-loader'

export type TracingOptions = {
	/** Header name for request ID (default: x-request-id) */
	readonly header?: string
	/** Generate custom request ID */
	readonly generator?: () => string
	/** Trust incoming request ID header */
	readonly trustIncoming?: boolean
	/** Add request ID to response */
	readonly setResponse?: boolean
}

/**
 * Generate default request ID (32 hex chars)
 * Uses WASM implementation.
 */
const defaultGenerator = (): string => {
	const traceId = wasmGenerateTraceId()
	if (traceId) return traceId
	// Fallback should not happen - WASM always available
	throw new Error('WASM trace ID generation unavailable')
}

/**
 * Generate UUID v4
 * Uses WASM random bytes with UUID v4 formatting.
 */
export const generateUUID = (): string => {
	// Use trace ID (32 hex = 16 bytes) and format as UUID v4
	const hex = wasmGenerateTraceId()
	if (!hex) throw new Error('WASM trace ID generation unavailable')

	// Format as UUID v4: set version (4) and variant bits
	const chars = hex.split('')
	chars[12] = '4' // version 4
	chars[16] = '89ab'[parseInt(chars[16] ?? '0', 16) & 0x3] ?? '8' // variant

	return [
		chars.slice(0, 8).join(''),
		chars.slice(8, 12).join(''),
		chars.slice(12, 16).join(''),
		chars.slice(16, 20).join(''),
		chars.slice(20, 32).join(''),
	].join('-')
}

/**
 * Generate short ID (8 hex chars)
 * Uses WASM span ID generation.
 */
export const generateShortId = (): string => {
	const spanId = wasmGenerateSpanId()
	if (!spanId) throw new Error('WASM span ID generation unavailable')
	return spanId.slice(0, 8)
}

/**
 * Generate nanoid-style ID
 * Uses WASM random with base62 encoding.
 */
export const generateNanoId = (size = 21): string => {
	const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
	// Generate enough trace IDs to cover the size (each trace ID = 32 hex = 16 bytes)
	let hex = ''
	while (hex.length < size * 2) {
		const traceId = wasmGenerateTraceId()
		if (!traceId) throw new Error('WASM trace ID generation unavailable')
		hex += traceId
	}

	let id = ''
	for (let i = 0; i < size; i++) {
		const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
		id += alphabet[byte % alphabet.length]
	}
	return id
}

// Store request ID in context (using WeakMap to avoid memory leaks)
const requestIdMap = new WeakMap<Context, string>()

/**
 * Get request ID from context
 */
export const getRequestId = (ctx: Context): string | undefined => {
	return requestIdMap.get(ctx)
}

/**
 * Create request ID/tracing wrapper
 */
export const tracing = (options: TracingOptions = {}): Wrapper<Context> => {
	const {
		header = 'x-request-id',
		generator = defaultGenerator,
		trustIncoming = true,
		setResponse = true,
	} = options

	const headerLower = header.toLowerCase()

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Get or generate request ID
			let requestId = trustIncoming ? ctx.headers[headerLower] : undefined

			if (!requestId) {
				requestId = generator()
			}

			// Store request ID
			requestIdMap.set(ctx, requestId)

			// Execute handler
			const res = await handler(ctx)

			// Add request ID to response
			if (setResponse) {
				return {
					...res,
					headers: {
						...res.headers,
						[header]: requestId,
					},
				}
			}

			return res
		}
	}
}

/**
 * Logging wrapper with request ID
 */
export type LogFn = (msg: string, data?: Record<string, unknown>) => void

export type LoggingOptions = {
	/** Log function */
	readonly log?: LogFn
	/** Include request timing */
	readonly timing?: boolean
	/** Skip logging for certain requests */
	readonly skip?: (ctx: Context) => boolean
}

export const logging = (options: LoggingOptions = {}): Wrapper<Context> => {
	const { log = console.log, timing = true, skip } = options

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const start = timing ? performance.now() : 0
			const requestId = getRequestId(ctx)

			try {
				const res = await handler(ctx)

				const duration = timing ? performance.now() - start : undefined

				log(`${ctx.method} ${ctx.path}`, {
					status: res.status,
					duration: duration ? `${duration.toFixed(2)}ms` : undefined,
					requestId,
				})

				return res
			} catch (error) {
				const duration = timing ? performance.now() - start : undefined

				log(`${ctx.method} ${ctx.path} ERROR`, {
					error: error instanceof Error ? error.message : String(error),
					duration: duration ? `${duration.toFixed(2)}ms` : undefined,
					requestId,
				})

				throw error
			}
		}
	}
}
