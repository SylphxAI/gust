/**
 * CORS - Cross-Origin Resource Sharing support
 * Wrapper for handling CORS preflight and response headers
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { response } from '@sylphx/gust-core'
import type { BaseContext } from './context'

export type CorsOptions = {
	/** Allowed origins (string, array, or function) */
	readonly origin?: string | string[] | ((origin: string) => boolean)
	/** Allowed HTTP methods */
	readonly methods?: string[]
	/** Allowed headers */
	readonly allowedHeaders?: string[]
	/** Exposed headers */
	readonly exposedHeaders?: string[]
	/** Allow credentials */
	readonly credentials?: boolean
	/** Max age for preflight cache (seconds) */
	readonly maxAge?: number
	/** Handle preflight automatically */
	readonly preflight?: boolean
}

// Default CORS options
const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE']
const DEFAULT_ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With']

/**
 * Check if origin is allowed
 */
const isOriginAllowed = (
	origin: string,
	allowed: string | string[] | ((origin: string) => boolean) | undefined
): boolean => {
	if (!allowed) return true
	if (allowed === '*') return true
	if (typeof allowed === 'string') return origin === allowed
	if (Array.isArray(allowed)) return allowed.includes(origin)
	if (typeof allowed === 'function') return allowed(origin)
	return false
}

/**
 * Get allowed origin for response header
 */
const getAllowedOrigin = (
	origin: string,
	allowed: string | string[] | ((origin: string) => boolean) | undefined
): string => {
	if (!allowed) return '*'
	if (allowed === '*') return '*'
	if (isOriginAllowed(origin, allowed)) return origin
	return ''
}

/**
 * Create CORS headers for response
 */
const createCorsHeaders = (origin: string, options: CorsOptions): Record<string, string> => {
	const headers: Record<string, string> = {}

	// Access-Control-Allow-Origin
	const allowedOrigin = getAllowedOrigin(origin, options.origin)
	if (allowedOrigin) {
		headers['access-control-allow-origin'] = allowedOrigin
	}

	// Access-Control-Allow-Credentials
	if (options.credentials) {
		headers['access-control-allow-credentials'] = 'true'
	}

	// Access-Control-Expose-Headers
	if (options.exposedHeaders && options.exposedHeaders.length > 0) {
		headers['access-control-expose-headers'] = options.exposedHeaders.join(', ')
	}

	// Vary header (important for caching)
	if (allowedOrigin && allowedOrigin !== '*') {
		headers.vary = 'Origin'
	}

	return headers
}

/**
 * Create CORS preflight headers
 */
const createPreflightHeaders = (origin: string, options: CorsOptions): Record<string, string> => {
	const headers = createCorsHeaders(origin, options)

	// Access-Control-Allow-Methods
	const methods = options.methods || DEFAULT_METHODS
	headers['access-control-allow-methods'] = methods.join(', ')

	// Access-Control-Allow-Headers
	const allowedHeaders = options.allowedHeaders || DEFAULT_ALLOWED_HEADERS
	headers['access-control-allow-headers'] = allowedHeaders.join(', ')

	// Access-Control-Max-Age
	if (options.maxAge !== undefined) {
		headers['access-control-max-age'] = options.maxAge.toString()
	}

	return headers
}

/**
 * Create CORS wrapper
 * Handles preflight OPTIONS requests and adds CORS headers to responses
 *
 * Works as both global middleware (BaseContext) and route middleware (Context)
 */
export const cors = <Ctx extends BaseContext = BaseContext>(
	options: CorsOptions = {}
): Wrapper<Ctx> => {
	const handlePreflight = options.preflight !== false

	return (handler: Handler<Ctx>): Handler<Ctx> => {
		return async (ctx: Ctx): Promise<ServerResponse> => {
			const origin = ctx.headers.origin || ''

			// Handle preflight OPTIONS request
			if (handlePreflight && ctx.method === 'OPTIONS') {
				const requestMethod = ctx.headers['access-control-request-method']

				// If it's a CORS preflight request
				if (requestMethod) {
					const preflightHeaders = createPreflightHeaders(origin, options)
					return response(null, {
						status: 204,
						headers: preflightHeaders,
					})
				}
			}

			// Execute the handler
			const res = await handler(ctx)

			// Add CORS headers to response
			const corsHeaders = createCorsHeaders(origin, options)
			const mergedHeaders = { ...res.headers, ...corsHeaders }

			return {
				...res,
				headers: mergedHeaders,
			}
		}
	}
}

/**
 * Simple CORS - allows all origins
 * Convenience wrapper for development
 */
export const simpleCors = <Ctx extends BaseContext = BaseContext>(): Wrapper<Ctx> =>
	cors<Ctx>({
		origin: '*',
		methods: DEFAULT_METHODS,
		allowedHeaders: DEFAULT_ALLOWED_HEADERS,
	})
