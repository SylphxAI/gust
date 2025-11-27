/**
 * Authentication Helpers
 * Basic Auth, Bearer Token, API Key authentication
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { response, unauthorized as unauthorizedResponse } from '@sylphx/gust-core'
import type { Context } from './context'

// ============================================================================
// Basic Auth
// ============================================================================

export type BasicAuthOptions = {
	/** Validate credentials (return true if valid) */
	readonly validate: (
		username: string,
		password: string,
		ctx: Context
	) => boolean | Promise<boolean>
	/** Realm for WWW-Authenticate header */
	readonly realm?: string
	/** Skip auth for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Custom unauthorized response */
	readonly onUnauthorized?: (ctx: Context) => ServerResponse
}

/**
 * Parse Basic Auth header
 */
export const parseBasicAuth = (header: string): { username: string; password: string } | null => {
	if (!header.toLowerCase().startsWith('basic ')) return null

	const encoded = header.slice(6).trim()
	let decoded: string

	try {
		decoded = Buffer.from(encoded, 'base64').toString('utf-8')
	} catch {
		return null
	}

	const colonIndex = decoded.indexOf(':')
	if (colonIndex === -1) return null

	return {
		username: decoded.slice(0, colonIndex),
		password: decoded.slice(colonIndex + 1),
	}
}

/**
 * Create Basic Auth header value
 */
export const createBasicAuth = (username: string, password: string): string => {
	return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/**
 * Basic Auth middleware
 */
export const basicAuth = (options: BasicAuthOptions): Wrapper<Context> => {
	const { validate, realm = 'Secure Area', skip, onUnauthorized } = options

	const unauthorized =
		onUnauthorized ??
		(() =>
			response('Unauthorized', {
				status: 401,
				headers: {
					'www-authenticate': `Basic realm="${realm}"`,
					'content-type': 'text/plain',
				},
			}))

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const authHeader = ctx.headers.authorization
			if (!authHeader) {
				return unauthorized(ctx)
			}

			const credentials = parseBasicAuth(authHeader)
			if (!credentials) {
				return unauthorized(ctx)
			}

			const isValid = await validate(credentials.username, credentials.password, ctx)
			if (!isValid) {
				return unauthorized(ctx)
			}

			return handler(ctx)
		}
	}
}

/**
 * Simple Basic Auth with static credentials
 */
export const simpleBasicAuth = (
	username: string,
	password: string,
	realm = 'Secure Area'
): Wrapper<Context> => {
	// Pre-compute expected values for timing-safe comparison
	const expectedUser = Buffer.from(username)
	const expectedPass = Buffer.from(password)

	return basicAuth({
		realm,
		validate: (u, p) => {
			const userBuf = Buffer.from(u)
			const passBuf = Buffer.from(p)

			// Timing-safe comparison to prevent timing attacks
			const userMatch =
				userBuf.length === expectedUser.length && timingSafeEqual(userBuf, expectedUser)
			const passMatch =
				passBuf.length === expectedPass.length && timingSafeEqual(passBuf, expectedPass)

			return userMatch && passMatch
		},
	})
}

// ============================================================================
// Bearer Token / API Key
// ============================================================================

export type BearerAuthOptions = {
	/** Validate token (return true if valid) */
	readonly validate: (token: string, ctx: Context) => boolean | Promise<boolean>
	/** Skip auth for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Custom unauthorized response */
	readonly onUnauthorized?: (ctx: Context) => ServerResponse
	/** Token header name (default: authorization) */
	readonly header?: string
	/** Token prefix (default: Bearer) */
	readonly prefix?: string
}

/**
 * Parse Bearer token from header
 */
export const parseBearerToken = (header: string, prefix = 'Bearer'): string | null => {
	const prefixLower = prefix.toLowerCase()
	if (!header.toLowerCase().startsWith(`${prefixLower} `)) return null
	return header.slice(prefix.length + 1).trim()
}

/**
 * Bearer token middleware
 */
export const bearerAuth = (options: BearerAuthOptions): Wrapper<Context> => {
	const { validate, skip, onUnauthorized, header = 'authorization', prefix = 'Bearer' } = options

	const headerLower = header.toLowerCase()
	const unauthorized = onUnauthorized ?? (() => unauthorizedResponse())

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const authHeader = ctx.headers[headerLower]
			if (!authHeader) {
				return unauthorized(ctx)
			}

			const token = parseBearerToken(authHeader, prefix)
			if (!token) {
				return unauthorized(ctx)
			}

			const isValid = await validate(token, ctx)
			if (!isValid) {
				return unauthorized(ctx)
			}

			return handler(ctx)
		}
	}
}

/**
 * API Key middleware (from header or query)
 */
export type ApiKeyOptions = {
	/** Validate API key */
	readonly validate: (key: string, ctx: Context) => boolean | Promise<boolean>
	/** Header name (default: x-api-key) */
	readonly header?: string
	/** Query parameter name (default: api_key) */
	readonly query?: string
	/** Skip auth for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Custom unauthorized response */
	readonly onUnauthorized?: (ctx: Context) => ServerResponse
}

export const apiKeyAuth = (options: ApiKeyOptions): Wrapper<Context> => {
	const { validate, header = 'x-api-key', query = 'api_key', skip, onUnauthorized } = options

	const headerLower = header.toLowerCase()
	const unauthorized = onUnauthorized ?? (() => unauthorizedResponse('Invalid API Key'))

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			// Try header first
			let apiKey = ctx.headers[headerLower]

			// Try query parameter
			if (!apiKey && ctx.query) {
				const queryMatch = ctx.query.match(new RegExp(`[?&]${query}=([^&]+)`))
				if (queryMatch?.[1]) {
					apiKey = decodeURIComponent(queryMatch[1])
				}
			}

			if (!apiKey) {
				return unauthorized(ctx)
			}

			const isValid = await validate(apiKey, ctx)
			if (!isValid) {
				return unauthorized(ctx)
			}

			return handler(ctx)
		}
	}
}

/**
 * Simple API key validation with static keys
 */
export const simpleApiKey = (
	validKeys: string[],
	options: Partial<Omit<ApiKeyOptions, 'validate'>> = {}
): Wrapper<Context> => {
	const keySet = new Set(validKeys)

	return apiKeyAuth({
		...options,
		validate: (key) => keySet.has(key),
	})
}

// ============================================================================
// HMAC Signature
// ============================================================================

export type HmacOptions = {
	/** Secret key for HMAC */
	readonly secret: string
	/** Algorithm (default: sha256) */
	readonly algorithm?: string
	/** Header name for signature (default: x-signature) */
	readonly header?: string
	/** Skip verification for certain requests */
	readonly skip?: (ctx: Context) => boolean
}

/**
 * Generate HMAC signature
 */
export const generateHmac = (
	data: string | Buffer,
	secret: string,
	algorithm = 'sha256'
): string => {
	return createHmac(algorithm, secret).update(data).digest('hex')
}

/**
 * Verify HMAC signature
 */
export const verifyHmac = (
	data: string | Buffer,
	signature: string,
	secret: string,
	algorithm = 'sha256'
): boolean => {
	const expected = generateHmac(data, secret, algorithm)
	const sigBuf = Buffer.from(signature)
	const expBuf = Buffer.from(expected)

	if (sigBuf.length !== expBuf.length) return false
	return timingSafeEqual(sigBuf, expBuf)
}

/**
 * HMAC signature verification middleware
 */
export const hmacAuth = (options: HmacOptions): Wrapper<Context> => {
	const { secret, algorithm = 'sha256', header = 'x-signature', skip } = options

	const headerLower = header.toLowerCase()

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const signature = ctx.headers[headerLower]
			if (!signature) {
				return unauthorizedResponse('Missing signature')
			}

			const isValid = verifyHmac(ctx.body, signature, secret, algorithm)
			if (!isValid) {
				return unauthorizedResponse('Invalid signature')
			}

			return handler(ctx)
		}
	}
}
