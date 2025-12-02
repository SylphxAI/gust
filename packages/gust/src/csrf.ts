/**
 * CSRF Protection
 * Cross-Site Request Forgery prevention
 *
 * Uses native Rust/WASM for random generation.
 * HMAC signing uses Node.js crypto (requires user secret).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { forbidden } from '@sylphx/gust-core'
import type { Context } from './context'
import { type CookieOptions, parseCookies, serializeCookie } from './cookie'
import { nativeGenerateTraceId } from './native'

// ============================================================================
// Types
// ============================================================================

export type CsrfOptions = {
	/** Secret for token generation */
	readonly secret: string
	/** Cookie name (default: _csrf) */
	readonly cookie?: string
	/** Header name (default: x-csrf-token) */
	readonly header?: string
	/** Form field name (default: _csrf) */
	readonly field?: string
	/** Token length in bytes (default: 32) */
	readonly tokenLength?: number
	/** Cookie options */
	readonly cookieOptions?: Omit<CookieOptions, 'httpOnly'>
	/** HTTP methods to protect (default: POST, PUT, PATCH, DELETE) */
	readonly methods?: string[]
	/** Skip CSRF for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Custom error response */
	readonly onError?: (ctx: Context) => ServerResponse
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate random bytes as base64url
 * Uses native Rust/WASM for random generation.
 * @param byteLength - Number of random bytes (output will be ~4/3 longer in base64)
 */
const generateRandomBase64url = (byteLength: number): string => {
	// Each trace ID = 32 hex chars = 16 bytes
	const bytesNeeded = byteLength
	const traceIdsNeeded = Math.ceil(bytesNeeded / 16)

	let hexString = ''
	for (let i = 0; i < traceIdsNeeded; i++) {
		const traceId = nativeGenerateTraceId()
		if (!traceId) throw new Error('Native trace ID generation unavailable')
		hexString += traceId
	}

	// Convert hex to bytes and then to base64url
	const bytes = Buffer.from(hexString.slice(0, byteLength * 2), 'hex')
	return bytes.toString('base64url')
}

/**
 * Generate CSRF secret (stored in cookie)
 * Uses native Rust/WASM for random generation.
 * @param length - Number of random bytes (default 32)
 */
export const generateCsrfSecret = (length = 32): string => {
	return generateRandomBase64url(length)
}

/**
 * Generate CSRF token from secret
 * Uses native random for salt, HMAC for signing.
 */
export const generateCsrfToken = (secret: string, salt?: string): string => {
	const tokenSalt = salt || generateRandomBase64url(8) // 8 bytes = ~11 base64 chars
	const hash = createHmac('sha256', secret).update(tokenSalt).digest('base64url')
	return `${tokenSalt}.${hash}`
}

/**
 * Verify CSRF token against secret
 */
export const verifyCsrfToken = (token: string, secret: string): boolean => {
	const dotIndex = token.indexOf('.')
	if (dotIndex === -1) return false

	const salt = token.slice(0, dotIndex)
	const hash = token.slice(dotIndex + 1)

	const expected = createHmac('sha256', secret).update(salt).digest('base64url')

	const hashBuf = Buffer.from(hash)
	const expectedBuf = Buffer.from(expected)

	if (hashBuf.length !== expectedBuf.length) return false
	return timingSafeEqual(hashBuf, expectedBuf)
}

// ============================================================================
// Context Storage
// ============================================================================

const csrfTokenMap = new WeakMap<Context, string>()
const csrfSecretMap = new WeakMap<Context, string>()

/**
 * Get CSRF token for context (for templates)
 */
export const getCsrfToken = (ctx: Context): string | undefined => {
	return csrfTokenMap.get(ctx)
}

// ============================================================================
// Middleware
// ============================================================================

const DEFAULT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']

/**
 * CSRF protection middleware
 */
export const csrf = (options: CsrfOptions): Wrapper<Context> => {
	const {
		secret: _secret,
		cookie = '_csrf',
		header = 'x-csrf-token',
		field = '_csrf',
		tokenLength = 32,
		cookieOptions = {},
		methods = DEFAULT_METHODS,
		skip,
		onError,
	} = options
	void _secret // Reserved for HMAC-based token signing

	const headerLower = header.toLowerCase()
	const methodSet = new Set(methods.map((m) => m.toUpperCase()))

	const errorResponse = onError ?? (() => forbidden('Invalid CSRF token'))

	const finalCookieOptions: CookieOptions = {
		httpOnly: true,
		sameSite: 'Strict',
		path: '/',
		...cookieOptions,
	}

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Skip if configured
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			// Get or create CSRF secret from cookie
			const cookies = parseCookies(ctx.headers.cookie || '')
			let csrfSecret = cookies[cookie]
			let secretIsNew = false

			if (!csrfSecret) {
				csrfSecret = generateCsrfSecret(tokenLength)
				secretIsNew = true
			}

			// Generate token for this request
			const token = generateCsrfToken(csrfSecret)
			csrfTokenMap.set(ctx, token)
			csrfSecretMap.set(ctx, csrfSecret)

			// Verify token for protected methods
			if (methodSet.has(ctx.method.toUpperCase())) {
				// Get token from header or body
				let submittedToken = ctx.headers[headerLower]

				// Try form body if not in header
				if (!submittedToken && ctx.body) {
					const bodyStr = ctx.body.toString()
					// Simple form field extraction
					const match = bodyStr.match(new RegExp(`${field}=([^&]+)`))
					if (match?.[1]) {
						submittedToken = decodeURIComponent(match[1])
					}
				}

				if (!submittedToken || !verifyCsrfToken(submittedToken, csrfSecret)) {
					return errorResponse(ctx)
				}
			}

			// Execute handler
			const res = await handler(ctx)

			// Set cookie if new
			if (secretIsNew) {
				const setCookie = serializeCookie(cookie, csrfSecret, finalCookieOptions)
				return {
					...res,
					headers: {
						...res.headers,
						'set-cookie': setCookie,
					},
				}
			}

			return res
		}
	}
}

/**
 * Double Submit Cookie pattern (simpler, stateless)
 */
export const csrfDoubleSubmit = (options: Omit<CsrfOptions, 'secret'> = {}): Wrapper<Context> => {
	const {
		cookie = '_csrf',
		header = 'x-csrf-token',
		tokenLength = 32,
		cookieOptions = {},
		methods = DEFAULT_METHODS,
		skip,
		onError,
	} = options

	const headerLower = header.toLowerCase()
	const methodSet = new Set(methods.map((m) => m.toUpperCase()))

	const errorResponse = onError ?? (() => forbidden('Invalid CSRF token'))

	const finalCookieOptions: CookieOptions = {
		httpOnly: false, // Must be readable by JavaScript
		sameSite: 'Strict',
		path: '/',
		...cookieOptions,
	}

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const cookies = parseCookies(ctx.headers.cookie || '')
			let csrfToken = cookies[cookie]
			let tokenIsNew = false

			if (!csrfToken) {
				csrfToken = generateRandomBase64url(tokenLength)
				tokenIsNew = true
			}

			csrfTokenMap.set(ctx, csrfToken)

			// Verify for protected methods
			if (methodSet.has(ctx.method.toUpperCase())) {
				const headerToken = ctx.headers[headerLower]

				if (!headerToken || headerToken !== csrfToken) {
					return errorResponse(ctx)
				}
			}

			const res = await handler(ctx)

			if (tokenIsNew) {
				const setCookie = serializeCookie(cookie, csrfToken, finalCookieOptions)
				return {
					...res,
					headers: {
						...res.headers,
						'set-cookie': setCookie,
					},
				}
			}

			return res
		}
	}
}

/**
 * Generate HTML input field for CSRF token
 */
export const csrfField = (ctx: Context, fieldName = '_csrf'): string => {
	const token = getCsrfToken(ctx)
	if (!token) return ''
	return `<input type="hidden" name="${fieldName}" value="${token}">`
}

/**
 * Generate meta tag for CSRF token (for AJAX)
 */
export const csrfMeta = (ctx: Context, name = 'csrf-token'): string => {
	const token = getCsrfToken(ctx)
	if (!token) return ''
	return `<meta name="${name}" content="${token}">`
}
