/**
 * Rate Limiting
 * Token bucket and sliding window rate limiters
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { json } from '@sylphx/gust-core'
import type { Context } from './context'

export type RateLimitOptions = {
	/** Maximum requests per window */
	readonly max: number
	/** Window size in milliseconds */
	readonly windowMs: number
	/** Key generator (default: IP address) */
	readonly keyGenerator?: (ctx: Context) => string
	/** Skip rate limiting for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Custom response when rate limited */
	readonly onLimitReached?: (ctx: Context) => ServerResponse
	/** Include rate limit headers in response */
	readonly headers?: boolean
	/** Use sliding window (more accurate but uses more memory) */
	readonly slidingWindow?: boolean
}

type RequestRecord = {
	count: number
	resetTime: number
	requests?: number[] // For sliding window
}

/**
 * In-memory rate limit store
 */
class RateLimitStore {
	private store = new Map<string, RequestRecord>()
	private cleanupInterval: ReturnType<typeof setInterval> | null = null

	constructor(windowMs: number) {
		// Cleanup expired entries periodically
		this.cleanupInterval = setInterval(
			() => {
				const now = Date.now()
				for (const [key, record] of this.store) {
					if (record.resetTime < now) {
						this.store.delete(key)
					}
				}
			},
			Math.min(windowMs, 60000)
		)
	}

	get(key: string): RequestRecord | undefined {
		return this.store.get(key)
	}

	set(key: string, record: RequestRecord): void {
		this.store.set(key, record)
	}

	delete(key: string): void {
		this.store.delete(key)
	}

	destroy(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
		this.store.clear()
	}
}

/**
 * Get client IP from context
 */
const getClientIp = (ctx: Context): string => {
	// Try X-Forwarded-For first (for proxies)
	const forwarded = ctx.headers['x-forwarded-for']
	if (forwarded) {
		return forwarded.split(',')[0]?.trim() ?? 'unknown'
	}

	// Try X-Real-IP
	const realIp = ctx.headers['x-real-ip']
	if (realIp) {
		return realIp
	}

	// Fall back to socket remote address
	return ctx.socket.remoteAddress || 'unknown'
}

/**
 * Fixed window rate limiter
 */
const fixedWindowCheck = (
	store: RateLimitStore,
	key: string,
	max: number,
	windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } => {
	const now = Date.now()
	let record = store.get(key)

	if (!record || record.resetTime < now) {
		// New window
		record = {
			count: 1,
			resetTime: now + windowMs,
		}
		store.set(key, record)
		return { allowed: true, remaining: max - 1, resetTime: record.resetTime }
	}

	if (record.count >= max) {
		return { allowed: false, remaining: 0, resetTime: record.resetTime }
	}

	record.count++
	return { allowed: true, remaining: max - record.count, resetTime: record.resetTime }
}

/**
 * Sliding window rate limiter
 */
const slidingWindowCheck = (
	store: RateLimitStore,
	key: string,
	max: number,
	windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } => {
	const now = Date.now()
	const windowStart = now - windowMs

	let record = store.get(key)

	if (!record) {
		record = {
			count: 1,
			resetTime: now + windowMs,
			requests: [now],
		}
		store.set(key, record)
		return { allowed: true, remaining: max - 1, resetTime: record.resetTime }
	}

	// Filter out old requests
	record.requests = (record.requests || []).filter((t) => t > windowStart)
	record.count = record.requests.length

	if (record.count >= max) {
		// Calculate when the oldest request will expire
		const oldestRequest = record.requests[0] ?? now
		const resetTime = oldestRequest + windowMs
		return { allowed: false, remaining: 0, resetTime }
	}

	record.requests.push(now)
	record.count++
	record.resetTime = (record.requests[0] ?? now) + windowMs

	return { allowed: true, remaining: max - record.count, resetTime: record.resetTime }
}

/**
 * Create rate limiting wrapper
 */
export const rateLimit = (options: RateLimitOptions): Wrapper<Context> => {
	const {
		max,
		windowMs,
		keyGenerator = getClientIp,
		skip,
		onLimitReached,
		headers = true,
		slidingWindow = false,
	} = options

	const store = new RateLimitStore(windowMs)

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Check if should skip
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const key = keyGenerator(ctx)
			const check = slidingWindow
				? slidingWindowCheck(store, key, max, windowMs)
				: fixedWindowCheck(store, key, max, windowMs)

			if (!check.allowed) {
				// Rate limited
				const limitedResponse = onLimitReached
					? onLimitReached(ctx)
					: json({ error: 'Too Many Requests' }, { status: 429 })

				if (headers) {
					return {
						...limitedResponse,
						headers: {
							...limitedResponse.headers,
							'x-ratelimit-limit': max.toString(),
							'x-ratelimit-remaining': '0',
							'x-ratelimit-reset': Math.ceil(check.resetTime / 1000).toString(),
							'retry-after': Math.ceil((check.resetTime - Date.now()) / 1000).toString(),
						},
					}
				}

				return limitedResponse
			}

			// Allowed - continue
			const res = await handler(ctx)

			if (headers) {
				return {
					...res,
					headers: {
						...res.headers,
						'x-ratelimit-limit': max.toString(),
						'x-ratelimit-remaining': check.remaining.toString(),
						'x-ratelimit-reset': Math.ceil(check.resetTime / 1000).toString(),
					},
				}
			}

			return res
		}
	}
}

/**
 * Create a rate limiter with custom store (for distributed systems)
 */
export type RateLimitStore2 = {
	increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>
	get(key: string): Promise<{ count: number; resetTime: number } | null>
}

export const rateLimitWithStore = (
	options: Omit<RateLimitOptions, 'slidingWindow'> & { store: RateLimitStore2 }
): Wrapper<Context> => {
	const {
		max,
		windowMs,
		keyGenerator = getClientIp,
		skip,
		onLimitReached,
		headers = true,
		store,
	} = options

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			const key = keyGenerator(ctx)
			const { count, resetTime } = await store.increment(key, windowMs)
			const remaining = Math.max(0, max - count)

			if (count > max) {
				const limitedResponse = onLimitReached
					? onLimitReached(ctx)
					: json({ error: 'Too Many Requests' }, { status: 429 })

				if (headers) {
					return {
						...limitedResponse,
						headers: {
							...limitedResponse.headers,
							'x-ratelimit-limit': max.toString(),
							'x-ratelimit-remaining': '0',
							'x-ratelimit-reset': Math.ceil(resetTime / 1000).toString(),
							'retry-after': Math.ceil((resetTime - Date.now()) / 1000).toString(),
						},
					}
				}

				return limitedResponse
			}

			const res = await handler(ctx)

			if (headers) {
				return {
					...res,
					headers: {
						...res.headers,
						'x-ratelimit-limit': max.toString(),
						'x-ratelimit-remaining': remaining.toString(),
						'x-ratelimit-reset': Math.ceil(resetTime / 1000).toString(),
					},
				}
			}

			return res
		}
	}
}
