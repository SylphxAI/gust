/**
 * Rate Limiting Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test'

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
})
