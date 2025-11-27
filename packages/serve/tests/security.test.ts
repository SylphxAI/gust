/**
 * Security Headers Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { text } from '@sylphx/gust-core'
import { apiSecurity, security, strictSecurity } from '../src/security'

const createMockContext = (): any => ({
	method: 'GET',
	path: '/test',
	query: '',
	headers: {},
	body: Buffer.alloc(0),
})

describe('Security Headers', () => {
	describe('security middleware - default behavior', () => {
		it('should add default security headers', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())

			expect(res.headers['x-content-type-options']).toBe('nosniff')
			expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
			expect(res.headers['x-xss-protection']).toBe('0')
			expect(res.headers['strict-transport-security']).toBeDefined()
			expect(res.headers['content-security-policy']).toBeDefined()
			expect(res.headers['cross-origin-opener-policy']).toBe('same-origin')
			expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
			expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
		})

		it('should add X-Content-Type-Options: nosniff', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-content-type-options']).toBe('nosniff')
		})

		it('should add default X-Frame-Options: SAMEORIGIN', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
		})

		it('should add default CSP', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBe("default-src 'self'")
		})

		it('should add default HSTS', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toContain('max-age=')
		})
	})

	describe('security middleware - custom options', () => {
		it('should set custom X-Frame-Options: DENY', async () => {
			const middleware = security({ frameguard: 'DENY' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-frame-options']).toBe('DENY')
		})

		it('should disable X-Frame-Options when frameguard: false', async () => {
			const middleware = security({ frameguard: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-frame-options']).toBeUndefined()
		})

		it('should set custom HSTS maxAge', async () => {
			const middleware = security({ hsts: { maxAge: 31536000 } })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toContain('max-age=31536000')
		})

		it('should add HSTS with includeSubDomains', async () => {
			const middleware = security({
				hsts: { maxAge: 31536000, includeSubDomains: true },
			})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toContain('includeSubDomains')
		})

		it('should add HSTS with preload', async () => {
			const middleware = security({
				hsts: { maxAge: 31536000, preload: true },
			})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toContain('preload')
		})

		it('should add HSTS with all options', async () => {
			const middleware = security({
				hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
			})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			const hsts = res.headers['strict-transport-security']
			expect(hsts).toContain('max-age=31536000')
			expect(hsts).toContain('includeSubDomains')
			expect(hsts).toContain('preload')
		})

		it('should disable HSTS when hsts: false', async () => {
			const middleware = security({ hsts: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toBeUndefined()
		})

		it('should set custom Content-Security-Policy', async () => {
			const middleware = security({
				contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'",
			})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBe("default-src 'self'; script-src 'self' 'unsafe-inline'")
		})

		it('should disable CSP when contentSecurityPolicy: false', async () => {
			const middleware = security({ contentSecurityPolicy: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBeUndefined()
		})

		it('should set custom Referrer-Policy', async () => {
			const middleware = security({ referrerPolicy: 'no-referrer' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['referrer-policy']).toBe('no-referrer')
		})

		it('should disable Referrer-Policy when referrerPolicy: false', async () => {
			const middleware = security({ referrerPolicy: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['referrer-policy']).toBeUndefined()
		})

		it('should disable X-Content-Type-Options when noSniff: false', async () => {
			const middleware = security({ noSniff: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-content-type-options']).toBeUndefined()
		})

		it('should set DNS prefetch control', async () => {
			const middleware = security({ dnsPrefetchControl: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-dns-prefetch-control']).toBe('off')
		})

		it('should enable DNS prefetch', async () => {
			const middleware = security({ dnsPrefetchControl: true })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-dns-prefetch-control']).toBe('on')
		})

		it('should set X-Download-Options', async () => {
			const middleware = security()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-download-options']).toBe('noopen')
		})

		it('should disable X-Download-Options when ieNoOpen: false', async () => {
			const middleware = security({ ieNoOpen: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-download-options']).toBeUndefined()
		})

		it('should set Cross-Origin-Embedder-Policy', async () => {
			const middleware = security({ crossOriginEmbedderPolicy: 'require-corp' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp')
		})

		it('should set Cross-Origin-Embedder-Policy to credentialless', async () => {
			const middleware = security({ crossOriginEmbedderPolicy: 'credentialless' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-embedder-policy']).toBe('credentialless')
		})

		it('should disable Cross-Origin-Embedder-Policy when false', async () => {
			const middleware = security({ crossOriginEmbedderPolicy: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-embedder-policy']).toBeUndefined()
		})

		it('should set Cross-Origin-Opener-Policy options', async () => {
			const middleware = security({ crossOriginOpenerPolicy: 'same-origin-allow-popups' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups')
		})

		it('should set Cross-Origin-Opener-Policy to unsafe-none', async () => {
			const middleware = security({ crossOriginOpenerPolicy: 'unsafe-none' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-opener-policy']).toBe('unsafe-none')
		})

		it('should disable Cross-Origin-Opener-Policy when false', async () => {
			const middleware = security({ crossOriginOpenerPolicy: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-opener-policy']).toBeUndefined()
		})

		it('should set Cross-Origin-Resource-Policy options', async () => {
			const middleware = security({ crossOriginResourcePolicy: 'same-site' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-resource-policy']).toBe('same-site')
		})

		it('should set Cross-Origin-Resource-Policy to cross-origin', async () => {
			const middleware = security({ crossOriginResourcePolicy: 'cross-origin' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
		})

		it('should disable Cross-Origin-Resource-Policy when false', async () => {
			const middleware = security({ crossOriginResourcePolicy: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-resource-policy']).toBeUndefined()
		})

		it('should set X-Permitted-Cross-Domain-Policies', async () => {
			const middleware = security({ permittedCrossDomainPolicies: 'master-only' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-permitted-cross-domain-policies']).toBe('master-only')
		})

		it('should disable X-Permitted-Cross-Domain-Policies when false', async () => {
			const middleware = security({ permittedCrossDomainPolicies: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-permitted-cross-domain-policies']).toBeUndefined()
		})

		it('should disable X-XSS-Protection when xssFilter: false', async () => {
			const middleware = security({ xssFilter: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-xss-protection']).toBeUndefined()
		})
	})

	describe('strictSecurity', () => {
		it('should add strict security headers', async () => {
			const middleware = strictSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())

			expect(res.headers['x-content-type-options']).toBe('nosniff')
			expect(res.headers['x-frame-options']).toBe('DENY')
			expect(res.headers['strict-transport-security']).toContain('max-age=31536000')
			expect(res.headers['strict-transport-security']).toContain('includeSubDomains')
			expect(res.headers['strict-transport-security']).toContain('preload')
			expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp')
			expect(res.headers['referrer-policy']).toBe('no-referrer')
		})

		it('should have strict CSP', async () => {
			const middleware = strictSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			const csp = res.headers['content-security-policy']

			expect(csp).toContain("default-src 'self'")
			expect(csp).toContain("script-src 'self'")
			expect(csp).toContain("style-src 'self'")
			expect(csp).toContain("object-src 'none'")
			expect(csp).toContain("frame-ancestors 'none'")
		})
	})

	describe('apiSecurity', () => {
		it('should add API-appropriate headers', async () => {
			const middleware = apiSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())

			expect(res.headers['x-content-type-options']).toBe('nosniff')
			expect(res.headers['x-frame-options']).toBe('DENY')
			expect(res.headers['referrer-policy']).toBe('no-referrer')
		})

		it('should not have CSP (APIs dont need it)', async () => {
			const middleware = apiSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBeUndefined()
		})

		it('should not have Cross-Origin-Embedder-Policy', async () => {
			const middleware = apiSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-embedder-policy']).toBeUndefined()
		})

		it('should not have Cross-Origin-Opener-Policy', async () => {
			const middleware = apiSecurity()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['cross-origin-opener-policy']).toBeUndefined()
		})
	})

	describe('header merging and override', () => {
		it('should preserve existing response headers', async () => {
			const middleware = security()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'x-custom': 'value' },
				body: 'ok',
			}))

			const res = await handler(createMockContext())
			expect(res.headers['x-custom']).toBe('value')
			expect(res.headers['x-content-type-options']).toBe('nosniff')
		})

		it('should allow response headers to override security headers', async () => {
			const middleware = security()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'x-frame-options': 'ALLOW-FROM https://example.com' },
				body: 'ok',
			}))

			const res = await handler(createMockContext())
			expect(res.headers['x-frame-options']).toBe('ALLOW-FROM https://example.com')
		})

		it('should allow custom CSP override', async () => {
			const middleware = security({ contentSecurityPolicy: "default-src 'self'" })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-security-policy': "default-src 'none'" },
				body: 'ok',
			}))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBe("default-src 'none'")
		})
	})

	describe('edge cases', () => {
		it('should handle empty options', async () => {
			const middleware = security({})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-content-type-options']).toBe('nosniff')
		})

		it('should handle all options disabled', async () => {
			const middleware = security({
				contentSecurityPolicy: false,
				crossOriginEmbedderPolicy: false,
				crossOriginOpenerPolicy: false,
				crossOriginResourcePolicy: false,
				referrerPolicy: false,
				hsts: false,
				noSniff: false,
				ieNoOpen: false,
				frameguard: false,
				permittedCrossDomainPolicies: false,
				xssFilter: false,
			})
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())

			// Only DNS prefetch should remain (if not explicitly disabled)
			expect(res.headers['content-security-policy']).toBeUndefined()
			expect(res.headers['cross-origin-embedder-policy']).toBeUndefined()
			expect(res.headers['cross-origin-opener-policy']).toBeUndefined()
			expect(res.headers['cross-origin-resource-policy']).toBeUndefined()
			expect(res.headers['referrer-policy']).toBeUndefined()
			expect(res.headers['strict-transport-security']).toBeUndefined()
			expect(res.headers['x-content-type-options']).toBeUndefined()
			expect(res.headers['x-download-options']).toBeUndefined()
			expect(res.headers['x-frame-options']).toBeUndefined()
			expect(res.headers['x-permitted-cross-domain-policies']).toBeUndefined()
			expect(res.headers['x-xss-protection']).toBeUndefined()
		})

		it('should handle async handler', async () => {
			const middleware = security()
			const handler = middleware(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return text('async ok')
			})

			const res = await handler(createMockContext())
			expect(res.body).toBe('async ok')
			expect(res.headers['x-content-type-options']).toBe('nosniff')
		})

		it('should handle handler throwing error', async () => {
			const middleware = security()
			const handler = middleware(() => {
				throw new Error('Handler error')
			})

			await expect(handler(createMockContext())).rejects.toThrow('Handler error')
		})

		it('should not modify response status', async () => {
			const middleware = security()
			const handler = middleware(() => ({
				status: 201,
				headers: {},
				body: 'created',
			}))

			const res = await handler(createMockContext())
			expect(res.status).toBe(201)
		})

		it('should not modify response body', async () => {
			const middleware = security()
			const handler = middleware(() => ({
				status: 200,
				headers: {},
				body: JSON.stringify({ data: 'test' }),
			}))

			const res = await handler(createMockContext())
			expect(res.body).toBe('{"data":"test"}')
		})

		it('should handle HSTS with only maxAge', async () => {
			const middleware = security({ hsts: { maxAge: 60 } })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['strict-transport-security']).toBe('max-age=60')
		})

		it('should handle very long CSP', async () => {
			const longCsp =
				"default-src 'self'; " +
				"script-src 'self' 'unsafe-inline' https://cdn.example.com; " +
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
				"img-src 'self' data: https:; " +
				"font-src 'self' https://fonts.gstatic.com; " +
				"connect-src 'self' https://api.example.com; " +
				"frame-src 'self' https://youtube.com; " +
				"object-src 'none'; " +
				"base-uri 'self'"

			const middleware = security({ contentSecurityPolicy: longCsp })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['content-security-policy']).toBe(longCsp)
		})

		it('should handle referrer policy values', async () => {
			const policies = [
				'no-referrer',
				'no-referrer-when-downgrade',
				'origin',
				'origin-when-cross-origin',
				'same-origin',
				'strict-origin',
				'strict-origin-when-cross-origin',
				'unsafe-url',
			]

			for (const policy of policies) {
				const middleware = security({ referrerPolicy: policy })
				const handler = middleware(() => text('ok'))
				const res = await handler(createMockContext())
				expect(res.headers['referrer-policy']).toBe(policy)
			}
		})

		it('should handle permitted cross domain policy values', async () => {
			const policies: Array<'none' | 'master-only' | 'by-content-type' | 'all'> = [
				'none',
				'master-only',
				'by-content-type',
				'all',
			]

			for (const policy of policies) {
				const middleware = security({ permittedCrossDomainPolicies: policy })
				const handler = middleware(() => text('ok'))
				const res = await handler(createMockContext())
				expect(res.headers['x-permitted-cross-domain-policies']).toBe(policy)
			}
		})
	})
})
