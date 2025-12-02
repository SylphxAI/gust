/**
 * Security Headers
 * Helmet-style security headers
 */

import type { Handler, ServerResponse } from '@sylphx/gust-core'
import type { Context } from './context'
import type { Middleware } from './types'

export type SecurityOptions = {
	/** Content Security Policy */
	readonly contentSecurityPolicy?: string | false
	/** Cross-Origin-Embedder-Policy */
	readonly crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false
	/** Cross-Origin-Opener-Policy */
	readonly crossOriginOpenerPolicy?:
		| 'same-origin'
		| 'same-origin-allow-popups'
		| 'unsafe-none'
		| false
	/** Cross-Origin-Resource-Policy */
	readonly crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false
	/** Referrer-Policy */
	readonly referrerPolicy?: string | false
	/** Strict-Transport-Security (HSTS) */
	readonly hsts?: { maxAge: number; includeSubDomains?: boolean; preload?: boolean } | false
	/** X-Content-Type-Options */
	readonly noSniff?: boolean
	/** X-DNS-Prefetch-Control */
	readonly dnsPrefetchControl?: boolean
	/** X-Download-Options */
	readonly ieNoOpen?: boolean
	/** X-Frame-Options */
	readonly frameguard?: 'DENY' | 'SAMEORIGIN' | false
	/** X-Permitted-Cross-Domain-Policies */
	readonly permittedCrossDomainPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all' | false
	/** X-XSS-Protection (legacy) */
	readonly xssFilter?: boolean
}

const DEFAULT_CSP = "default-src 'self'"

/**
 * Create security headers middleware
 *
 * Adds security headers to responses (Helmet-style).
 * Works as both global middleware and route-level middleware.
 *
 * @example
 * ```typescript
 * serve({
 *   middleware: security(),
 *   routes: [...]
 * })
 * ```
 */
export const security = (options: SecurityOptions = {}): Middleware => {
	const headers: Record<string, string> = {}

	// Content-Security-Policy
	if (options.contentSecurityPolicy !== false) {
		headers['content-security-policy'] = options.contentSecurityPolicy || DEFAULT_CSP
	}

	// Cross-Origin-Embedder-Policy
	if (options.crossOriginEmbedderPolicy !== false && options.crossOriginEmbedderPolicy) {
		headers['cross-origin-embedder-policy'] = options.crossOriginEmbedderPolicy
	}

	// Cross-Origin-Opener-Policy
	if (options.crossOriginOpenerPolicy !== false) {
		headers['cross-origin-opener-policy'] = options.crossOriginOpenerPolicy || 'same-origin'
	}

	// Cross-Origin-Resource-Policy
	if (options.crossOriginResourcePolicy !== false) {
		headers['cross-origin-resource-policy'] = options.crossOriginResourcePolicy || 'same-origin'
	}

	// Referrer-Policy
	if (options.referrerPolicy !== false) {
		headers['referrer-policy'] = options.referrerPolicy || 'strict-origin-when-cross-origin'
	}

	// Strict-Transport-Security
	if (options.hsts !== false) {
		const hsts = options.hsts || { maxAge: 15552000 } // 180 days
		let hstsValue = `max-age=${hsts.maxAge}`
		if (hsts.includeSubDomains) hstsValue += '; includeSubDomains'
		if (hsts.preload) hstsValue += '; preload'
		headers['strict-transport-security'] = hstsValue
	}

	// X-Content-Type-Options
	if (options.noSniff !== false) {
		headers['x-content-type-options'] = 'nosniff'
	}

	// X-DNS-Prefetch-Control
	if (options.dnsPrefetchControl !== undefined) {
		headers['x-dns-prefetch-control'] = options.dnsPrefetchControl ? 'on' : 'off'
	}

	// X-Download-Options
	if (options.ieNoOpen !== false) {
		headers['x-download-options'] = 'noopen'
	}

	// X-Frame-Options
	if (options.frameguard !== false) {
		headers['x-frame-options'] = options.frameguard || 'SAMEORIGIN'
	}

	// X-Permitted-Cross-Domain-Policies
	if (options.permittedCrossDomainPolicies !== false) {
		headers['x-permitted-cross-domain-policies'] = options.permittedCrossDomainPolicies || 'none'
	}

	// X-XSS-Protection (legacy, but still used)
	if (options.xssFilter !== false) {
		headers['x-xss-protection'] = '0' // Recommended to disable as it can cause vulnerabilities
	}

	return <App>(handler: Handler<Context<App>>): Handler<Context<App>> =>
		async (ctx: Context<App>): Promise<ServerResponse> => {
			const res = await handler(ctx)

			return {
				...res,
				headers: {
					...headers,
					...res.headers, // Allow overrides
				},
			}
		}
}

/**
 * Pre-configured security for strict mode
 */
export const strictSecurity = (): Middleware =>
	security({
		contentSecurityPolicy:
			"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'",
		crossOriginEmbedderPolicy: 'require-corp',
		crossOriginOpenerPolicy: 'same-origin',
		crossOriginResourcePolicy: 'same-origin',
		referrerPolicy: 'no-referrer',
		hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
		frameguard: 'DENY',
	})

/**
 * Pre-configured security for API servers
 */
export const apiSecurity = (): Middleware =>
	security({
		contentSecurityPolicy: false, // APIs don't need CSP
		crossOriginEmbedderPolicy: false,
		crossOriginOpenerPolicy: false,
		crossOriginResourcePolicy: 'same-site',
		referrerPolicy: 'no-referrer',
		hsts: { maxAge: 31536000 },
		frameguard: 'DENY',
	})
