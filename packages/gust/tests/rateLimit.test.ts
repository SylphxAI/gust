/**
 * Rate Limiting Tests
 */

import { describe, expect, it } from 'bun:test'
import type { Context } from '@sylphx/gust'
import { type RateLimitStore2, rateLimit, rateLimitWithStore } from '@sylphx/gust'

// Mock context factory
const createMockContext = (overrides?: Partial<Context>): Context =>
	({
		method: 'GET',
		path: '/api/test',
		headers: {},
		body: Buffer.alloc(0),
		params: {},
		query: '',
		socket: { remoteAddress: '127.0.0.1' },
		raw: Buffer.alloc(0),
		json: () => ({}),
		...overrides,
	}) as Context

// Mock handler
const mockHandler = async (_ctx: Context) => ({
	status: 200,
	body: JSON.stringify({ success: true }),
	headers: { 'content-type': 'application/json' },
})

// Test the internal rate limiting logic
describe('Rate Limiting', () => {
	describe('Fixed Window', () => {
		// Simple in-memory fixed window implementation for testing
		class FixedWindow {
			private counts = new Map<string, { count: number; reset: number }>()

			constructor(
				private readonly limit: number,
				private readonly windowMs: number
			) {}

			check(key: string): { allowed: boolean; remaining: number; reset: number } {
				const now = Date.now()
				const entry = this.counts.get(key)

				if (!entry || entry.reset < now) {
					// New window
					this.counts.set(key, { count: 1, reset: now + this.windowMs })
					return { allowed: true, remaining: this.limit - 1, reset: now + this.windowMs }
				}

				if (entry.count >= this.limit) {
					return { allowed: false, remaining: 0, reset: entry.reset }
				}

				entry.count++
				return { allowed: true, remaining: this.limit - entry.count, reset: entry.reset }
			}
		}

		it('should allow requests within limit', () => {
			const limiter = new FixedWindow(5, 60000)

			for (let i = 0; i < 5; i++) {
				const result = limiter.check('user1')
				expect(result.allowed).toBe(true)
				expect(result.remaining).toBe(4 - i)
			}
		})

		it('should block requests over limit', () => {
			const limiter = new FixedWindow(3, 60000)

			// Use up the limit
			for (let i = 0; i < 3; i++) {
				limiter.check('user1')
			}

			// Next request should be blocked
			const result = limiter.check('user1')
			expect(result.allowed).toBe(false)
			expect(result.remaining).toBe(0)
		})

		it('should track different keys separately', () => {
			const limiter = new FixedWindow(2, 60000)

			// User 1 uses both requests
			limiter.check('user1')
			limiter.check('user1')
			expect(limiter.check('user1').allowed).toBe(false)

			// User 2 should still have requests
			expect(limiter.check('user2').allowed).toBe(true)
		})

		it('should reset after window expires', async () => {
			const limiter = new FixedWindow(2, 50) // 50ms window

			// Use up the limit
			limiter.check('user1')
			limiter.check('user1')
			expect(limiter.check('user1').allowed).toBe(false)

			// Wait for window to expire
			await new Promise((r) => setTimeout(r, 100))

			// Should be allowed again
			expect(limiter.check('user1').allowed).toBe(true)
		})
	})

	describe('Sliding Window', () => {
		// Simple sliding window implementation for testing
		class SlidingWindow {
			private requests = new Map<string, number[]>()

			constructor(
				private readonly limit: number,
				private readonly windowMs: number
			) {}

			check(key: string): { allowed: boolean; remaining: number } {
				const now = Date.now()
				const windowStart = now - this.windowMs

				// Get and filter timestamps
				let timestamps = this.requests.get(key) || []
				timestamps = timestamps.filter((t) => t > windowStart)

				if (timestamps.length >= this.limit) {
					return { allowed: false, remaining: 0 }
				}

				timestamps.push(now)
				this.requests.set(key, timestamps)

				return { allowed: true, remaining: this.limit - timestamps.length }
			}
		}

		it('should allow requests within limit', () => {
			const limiter = new SlidingWindow(5, 60000)

			for (let i = 0; i < 5; i++) {
				expect(limiter.check('user1').allowed).toBe(true)
			}
		})

		it('should block requests over limit', () => {
			const limiter = new SlidingWindow(3, 60000)

			for (let i = 0; i < 3; i++) {
				limiter.check('user1')
			}

			expect(limiter.check('user1').allowed).toBe(false)
		})

		it('should allow requests after oldest expires', async () => {
			const limiter = new SlidingWindow(2, 50)

			// Make 2 requests
			limiter.check('user1')
			limiter.check('user1')
			expect(limiter.check('user1').allowed).toBe(false)

			// Wait for oldest to expire
			await new Promise((r) => setTimeout(r, 60))

			// Should allow one more
			expect(limiter.check('user1').allowed).toBe(true)
		})
	})

	describe('Token Bucket', () => {
		class TokenBucket {
			private buckets = new Map<string, { tokens: number; lastRefill: number }>()

			constructor(
				private readonly maxTokens: number,
				private readonly refillRate: number, // tokens per ms
				private readonly tokensPerRequest: number = 1
			) {}

			check(key: string): { allowed: boolean; remaining: number } {
				const now = Date.now()
				let bucket = this.buckets.get(key)

				if (!bucket) {
					bucket = { tokens: this.maxTokens, lastRefill: now }
					this.buckets.set(key, bucket)
				}

				// Refill tokens
				const elapsed = now - bucket.lastRefill
				const refill = elapsed * this.refillRate
				bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill)
				bucket.lastRefill = now

				if (bucket.tokens < this.tokensPerRequest) {
					return { allowed: false, remaining: Math.floor(bucket.tokens) }
				}

				bucket.tokens -= this.tokensPerRequest
				return { allowed: true, remaining: Math.floor(bucket.tokens) }
			}
		}

		it('should allow burst up to max tokens', () => {
			const bucket = new TokenBucket(5, 0.001) // 5 tokens, 1 token per second

			for (let i = 0; i < 5; i++) {
				expect(bucket.check('user1').allowed).toBe(true)
			}
		})

		it('should block when tokens exhausted', () => {
			const bucket = new TokenBucket(3, 0)

			for (let i = 0; i < 3; i++) {
				bucket.check('user1')
			}

			expect(bucket.check('user1').allowed).toBe(false)
		})

		it('should refill tokens over time', async () => {
			const bucket = new TokenBucket(2, 0.02) // 20 tokens per second

			// Use all tokens
			bucket.check('user1')
			bucket.check('user1')
			expect(bucket.check('user1').allowed).toBe(false)

			// Wait for refill
			await new Promise((r) => setTimeout(r, 100))

			// Should have tokens again
			expect(bucket.check('user1').allowed).toBe(true)
		})
	})

	describe('rateLimit middleware', () => {
		describe('basic functionality', () => {
			it('should allow requests within limit', async () => {
				const limiter = rateLimit({ max: 3, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// Make 3 requests
				for (let i = 0; i < 3; i++) {
					const result = await handler(ctx)
					expect(result.status).toBe(200)
				}
			})

			it('should block requests over limit', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// Use up limit
				await handler(ctx)
				await handler(ctx)

				// Third request should be blocked
				const result = await handler(ctx)
				expect(result.status).toBe(429)
				const body = JSON.parse(result.body as string)
				expect(body.error).toBe('Too Many Requests')
			})

			it('should track different IPs separately', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 60000 })
				const handler = limiter(mockHandler)

				// User 1 uses both requests
				const ctx1 = createMockContext({ socket: { remoteAddress: '127.0.0.1' } } as any)
				await handler(ctx1)
				await handler(ctx1)
				const blocked = await handler(ctx1)
				expect(blocked.status).toBe(429)

				// User 2 should still be allowed
				const ctx2 = createMockContext({ socket: { remoteAddress: '192.168.1.1' } } as any)
				const allowed = await handler(ctx2)
				expect(allowed.status).toBe(200)
			})

			it('should reset after window expires', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 50 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// Use up limit
				await handler(ctx)
				await handler(ctx)
				expect((await handler(ctx)).status).toBe(429)

				// Wait for window to expire
				await new Promise((r) => setTimeout(r, 100))

				// Should be allowed again
				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})
		})

		describe('rate limit headers', () => {
			it('should include rate limit headers by default', async () => {
				const limiter = rateLimit({ max: 5, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)

				expect(result.headers?.['x-ratelimit-limit']).toBe('5')
				expect(result.headers?.['x-ratelimit-remaining']).toBe('4')
				expect(result.headers?.['x-ratelimit-reset']).toBeDefined()
			})

			it('should not include headers when headers option is false', async () => {
				const limiter = rateLimit({ max: 5, windowMs: 60000, headers: false })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)

				expect(result.headers?.['x-ratelimit-limit']).toBeUndefined()
				expect(result.headers?.['x-ratelimit-remaining']).toBeUndefined()
			})

			it('should include retry-after header when rate limited', async () => {
				const limiter = rateLimit({ max: 1, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.status).toBe(429)
				expect(blocked.headers?.['retry-after']).toBeDefined()
				expect(blocked.headers?.['x-ratelimit-remaining']).toBe('0')
			})

			it('should update remaining count correctly', async () => {
				const limiter = rateLimit({ max: 3, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const r1 = await handler(ctx)
				expect(r1.headers?.['x-ratelimit-remaining']).toBe('2')

				const r2 = await handler(ctx)
				expect(r2.headers?.['x-ratelimit-remaining']).toBe('1')

				const r3 = await handler(ctx)
				expect(r3.headers?.['x-ratelimit-remaining']).toBe('0')
			})
		})

		describe('custom key generator', () => {
			it('should use custom key generator', async () => {
				const limiter = rateLimit({
					max: 2,
					windowMs: 60000,
					keyGenerator: (ctx) => ctx.headers['api-key'] || 'anonymous',
				})
				const handler = limiter(mockHandler)

				// User with API key
				const ctx1 = createMockContext({ headers: { 'api-key': 'user-123' } })
				await handler(ctx1)
				await handler(ctx1)
				expect((await handler(ctx1)).status).toBe(429)

				// Different API key should be allowed
				const ctx2 = createMockContext({ headers: { 'api-key': 'user-456' } })
				expect((await handler(ctx2)).status).toBe(200)
			})

			it('should extract IP from X-Forwarded-For header', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 60000 })
				const handler = limiter(mockHandler)

				const ctx = createMockContext({
					headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
				})

				await handler(ctx)
				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.status).toBe(429)
			})

			it('should extract IP from X-Real-IP header', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 60000 })
				const handler = limiter(mockHandler)

				const ctx = createMockContext({
					headers: { 'x-real-ip': '10.0.0.5' },
				})

				await handler(ctx)
				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.status).toBe(429)
			})

			it('should prioritize X-Forwarded-For over X-Real-IP', async () => {
				const limiter = rateLimit({
					max: 2,
					windowMs: 60000,
				})
				const handler = limiter(mockHandler)

				const ctx1 = createMockContext({
					headers: {
						'x-forwarded-for': '10.0.0.1',
						'x-real-ip': '10.0.0.2',
					},
				})

				await handler(ctx1)
				await handler(ctx1)

				// Same X-Forwarded-For should be blocked
				expect((await handler(ctx1)).status).toBe(429)

				// Different X-Forwarded-For should be allowed
				const ctx2 = createMockContext({
					headers: {
						'x-forwarded-for': '10.0.0.3',
						'x-real-ip': '10.0.0.2',
					},
				})
				expect((await handler(ctx2)).status).toBe(200)
			})
		})

		describe('skip functionality', () => {
			it('should skip rate limiting when skip returns true', async () => {
				const limiter = rateLimit({
					max: 1,
					windowMs: 60000,
					skip: (ctx) => ctx.headers['skip-rate-limit'] === 'true',
				})
				const handler = limiter(mockHandler)

				const skipCtx = createMockContext({ headers: { 'skip-rate-limit': 'true' } })

				// Multiple requests should be allowed
				for (let i = 0; i < 5; i++) {
					const result = await handler(skipCtx)
					expect(result.status).toBe(200)
				}
			})

			it('should apply rate limiting when skip returns false', async () => {
				const limiter = rateLimit({
					max: 1,
					windowMs: 60000,
					skip: (ctx) => ctx.headers['skip-rate-limit'] === 'true',
				})
				const handler = limiter(mockHandler)

				const ctx = createMockContext({ headers: {} })

				await handler(ctx)
				const blocked = await handler(ctx)
				expect(blocked.status).toBe(429)
			})

			it('should skip based on request path', async () => {
				const limiter = rateLimit({
					max: 1,
					windowMs: 60000,
					skip: (ctx) => ctx.path.startsWith('/health'),
				})
				const handler = limiter(mockHandler)

				// Health endpoint should not be rate limited
				const healthCtx = createMockContext({ path: '/health' } as any)
				for (let i = 0; i < 5; i++) {
					expect((await handler(healthCtx)).status).toBe(200)
				}

				// Other paths should be rate limited
				const apiCtx = createMockContext({ path: '/api/data' } as any)
				await handler(apiCtx)
				expect((await handler(apiCtx)).status).toBe(429)
			})
		})

		describe('custom onLimitReached', () => {
			it('should use custom response when rate limited', async () => {
				const limiter = rateLimit({
					max: 1,
					windowMs: 60000,
					onLimitReached: () => ({
						status: 429,
						body: JSON.stringify({ message: 'Please slow down!' }),
						headers: { 'content-type': 'application/json' },
					}),
				})
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.status).toBe(429)
				const body = JSON.parse(blocked.body as string)
				expect(body.message).toBe('Please slow down!')
			})

			it('should still include rate limit headers with custom response', async () => {
				const limiter = rateLimit({
					max: 1,
					windowMs: 60000,
					headers: true,
					onLimitReached: () => ({
						status: 429,
						body: 'Custom error',
						headers: {},
					}),
				})
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.headers?.['x-ratelimit-limit']).toBe('1')
				expect(blocked.headers?.['retry-after']).toBeDefined()
			})
		})

		describe('sliding window', () => {
			it('should use sliding window when enabled', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 100, slidingWindow: true })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// Make 2 requests
				await handler(ctx)
				await handler(ctx)

				// Third should be blocked
				expect((await handler(ctx)).status).toBe(429)

				// Wait for first request to expire
				await new Promise((r) => setTimeout(r, 120))

				// Should allow one more request
				expect((await handler(ctx)).status).toBe(200)
			})

			it('should be more accurate than fixed window', async () => {
				const slidingLimiter = rateLimit({
					max: 3,
					windowMs: 100,
					slidingWindow: true,
				})
				const slidingHandler = slidingLimiter(mockHandler)
				const ctx = createMockContext()

				// Sliding window allows requests to expire individually
				await slidingHandler(ctx)
				await new Promise((r) => setTimeout(r, 50))
				await slidingHandler(ctx)
				await new Promise((r) => setTimeout(r, 60))

				// First request expired, should allow
				const result = await slidingHandler(ctx)
				expect(result.status).toBe(200)
			})
		})

		describe('edge cases', () => {
			it('should handle requests with no socket address', async () => {
				const limiter = rateLimit({ max: 2, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext({ socket: {} } as any)

				const r1 = await handler(ctx)
				expect(r1.status).toBe(200)

				const r2 = await handler(ctx)
				expect(r2.status).toBe(200)

				const r3 = await handler(ctx)
				expect(r3.status).toBe(429)
			})

			it('should handle concurrent requests', async () => {
				const limiter = rateLimit({ max: 5, windowMs: 60000 })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// Make 5 concurrent requests
				const results = await Promise.all(Array.from({ length: 5 }, () => handler(ctx)))

				// All should succeed
				expect(results.every((r) => r.status === 200)).toBe(true)

				// Next one should fail
				const blocked = await handler(ctx)
				expect(blocked.status).toBe(429)
			})

			it('should handle handler errors', async () => {
				const errorHandler = async () => {
					throw new Error('Handler error')
				}

				const limiter = rateLimit({ max: 5, windowMs: 60000 })
				const handler = limiter(errorHandler)
				const ctx = createMockContext()

				await expect(handler(ctx)).rejects.toThrow('Handler error')
			})

			it('should preserve handler response headers', async () => {
				const customHandler = async () => ({
					status: 200,
					body: 'OK',
					headers: { 'x-custom': 'value' },
				})

				const limiter = rateLimit({ max: 5, windowMs: 60000 })
				const handler = limiter(customHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)

				expect(result.headers?.['x-custom']).toBe('value')
				expect(result.headers?.['x-ratelimit-limit']).toBe('5')
			})
		})
	})

	describe('rateLimitWithStore middleware', () => {
		// Mock custom store
		class MockStore implements RateLimitStore2 {
			private counts = new Map<string, { count: number; resetTime: number }>()

			async increment(key: string, windowMs: number) {
				const now = Date.now()
				let record = this.counts.get(key)

				if (!record || record.resetTime < now) {
					record = { count: 1, resetTime: now + windowMs }
					this.counts.set(key, record)
				} else {
					record.count++
				}

				return { count: record.count, resetTime: record.resetTime }
			}

			async get(key: string) {
				return this.counts.get(key) || null
			}
		}

		describe('basic functionality', () => {
			it('should work with custom store', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({ max: 2, windowMs: 60000, store })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				// First two should succeed
				expect((await handler(ctx)).status).toBe(200)
				expect((await handler(ctx)).status).toBe(200)

				// Third should be blocked
				expect((await handler(ctx)).status).toBe(429)
			})

			it('should include rate limit headers', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({ max: 5, windowMs: 60000, store })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)

				expect(result.headers?.['x-ratelimit-limit']).toBe('5')
				expect(result.headers?.['x-ratelimit-remaining']).toBe('4')
				expect(result.headers?.['x-ratelimit-reset']).toBeDefined()
			})

			it('should work with custom key generator', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({
					max: 2,
					windowMs: 60000,
					store,
					keyGenerator: (ctx) => ctx.headers['user-id'] || 'anonymous',
				})
				const handler = limiter(mockHandler)

				const ctx1 = createMockContext({ headers: { 'user-id': 'user-1' } })
				const ctx2 = createMockContext({ headers: { 'user-id': 'user-2' } })

				// User 1 uses limit
				await handler(ctx1)
				await handler(ctx1)
				expect((await handler(ctx1)).status).toBe(429)

				// User 2 should be allowed
				expect((await handler(ctx2)).status).toBe(200)
			})

			it('should respect skip function', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({
					max: 1,
					windowMs: 60000,
					store,
					skip: (ctx) => ctx.headers.admin === 'true',
				})
				const handler = limiter(mockHandler)

				const adminCtx = createMockContext({ headers: { admin: 'true' } })

				// Multiple requests should succeed for admin
				for (let i = 0; i < 5; i++) {
					expect((await handler(adminCtx)).status).toBe(200)
				}
			})

			it('should use custom onLimitReached', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({
					max: 1,
					windowMs: 60000,
					store,
					onLimitReached: () => ({
						status: 503,
						body: 'Service Unavailable',
						headers: {},
					}),
				})
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				await handler(ctx)
				const blocked = await handler(ctx)

				expect(blocked.status).toBe(503)
				expect(blocked.body).toBe('Service Unavailable')
			})

			it('should not include headers when disabled', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({
					max: 5,
					windowMs: 60000,
					store,
					headers: false,
				})
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)

				expect(result.headers?.['x-ratelimit-limit']).toBeUndefined()
				expect(result.headers?.['x-ratelimit-remaining']).toBeUndefined()
			})
		})

		describe('distributed rate limiting', () => {
			it('should share limits across store instances', async () => {
				const store = new MockStore()

				const limiter1 = rateLimitWithStore({ max: 3, windowMs: 60000, store })
				const limiter2 = rateLimitWithStore({ max: 3, windowMs: 60000, store })

				const handler1 = limiter1(mockHandler)
				const handler2 = limiter2(mockHandler)

				const ctx = createMockContext()

				// Use 2 requests from handler1
				await handler1(ctx)
				await handler1(ctx)

				// Use 1 request from handler2
				await handler2(ctx)

				// Next request from either should be blocked
				expect((await handler1(ctx)).status).toBe(429)
				expect((await handler2(ctx)).status).toBe(429)
			})
		})

		describe('edge cases', () => {
			it('should handle store errors gracefully', async () => {
				const errorStore: RateLimitStore2 = {
					increment: async () => {
						throw new Error('Store error')
					},
					get: async () => null,
				}

				const limiter = rateLimitWithStore({ max: 5, windowMs: 60000, store: errorStore })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				await expect(handler(ctx)).rejects.toThrow('Store error')
			})

			it('should calculate remaining correctly at limit boundary', async () => {
				const store = new MockStore()
				const limiter = rateLimitWithStore({ max: 3, windowMs: 60000, store })
				const handler = limiter(mockHandler)
				const ctx = createMockContext()

				const r1 = await handler(ctx)
				expect(r1.headers?.['x-ratelimit-remaining']).toBe('2')

				const r2 = await handler(ctx)
				expect(r2.headers?.['x-ratelimit-remaining']).toBe('1')

				const r3 = await handler(ctx)
				expect(r3.headers?.['x-ratelimit-remaining']).toBe('0')

				const r4 = await handler(ctx)
				expect(r4.status).toBe(429)
				expect(r4.headers?.['x-ratelimit-remaining']).toBe('0')
			})
		})
	})
})
