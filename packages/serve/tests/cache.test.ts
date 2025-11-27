/**
 * Cache Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  MemoryCache,
  LRUCache,
  defaultCacheKey,
  varyingCacheKey,
  cache,
  noCache,
  etag,
  invalidateCache,
} from '../src/cache'
import type { Context } from '../src/context'

// Mock context
const createMockContext = (overrides?: Partial<Context>): Context => ({
  method: 'GET',
  path: '/api/test',
  headers: {},
  body: Buffer.alloc(0),
  params: {},
  query: '',
  socket: {} as any,
  raw: Buffer.alloc(0),
  json: () => ({}),
  ...overrides,
}) as Context

// Mock handler
const mockHandler = async (ctx: Context) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: 'test' }),
})

describe('Cache', () => {
  describe('MemoryCache', () => {
    let cache: MemoryCache

    beforeEach(() => {
      cache = new MemoryCache()
    })

    afterEach(() => {
      cache.close()
    })

    it('should store and retrieve entries', async () => {
      const entry = {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'test-key',
        ttl: 60000,
      }

      await cache.set('test-key', entry)
      const result = await cache.get('test-key')

      expect(result).not.toBeNull()
      expect(result?.response.body).toBe('test')
    })

    it('should return null for missing entries', async () => {
      const result = await cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should expire entries based on TTL', async () => {
      const entry = {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now() - 10000, // 10 seconds ago
        key: 'test-key',
        ttl: 5000, // 5 second TTL (already expired)
      }

      await cache.set('test-key', entry)
      const result = await cache.get('test-key')

      expect(result).toBeNull()
    })

    it('should delete entries', async () => {
      const entry = {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'test-key',
        ttl: 60000,
      }

      await cache.set('test-key', entry)
      await cache.delete('test-key')
      const result = await cache.get('test-key')

      expect(result).toBeNull()
    })

    it('should handle delete of non-existent entry', async () => {
      await cache.delete('nonexistent')
      const stats = cache.stats()
      expect(stats.size).toBe(0)
    })

    it('should clear all entries', async () => {
      for (let i = 0; i < 5; i++) {
        await cache.set(`key-${i}`, {
          response: { status: 200, headers: {}, body: `test-${i}` },
          timestamp: Date.now(),
          key: `key-${i}`,
          ttl: 60000,
        })
      }

      await cache.clear()
      const stats = cache.stats()

      expect(stats.size).toBe(0)
      expect(stats.tags).toBe(0)
    })

    it('should support tags', async () => {
      const entry1 = {
        response: { status: 200, headers: {}, body: 'test1' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
        tags: ['user:123', 'posts'],
      }

      const entry2 = {
        response: { status: 200, headers: {}, body: 'test2' },
        timestamp: Date.now(),
        key: 'key2',
        ttl: 60000,
        tags: ['user:123'],
      }

      const entry3 = {
        response: { status: 200, headers: {}, body: 'test3' },
        timestamp: Date.now(),
        key: 'key3',
        ttl: 60000,
        tags: ['posts'],
      }

      await cache.set('key1', entry1)
      await cache.set('key2', entry2)
      await cache.set('key3', entry3)

      // Delete by tag
      await cache.deleteByTag('user:123')

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).toBeNull()
      expect(await cache.get('key3')).not.toBeNull()
    })

    it('should handle deleteByTag with non-existent tag', async () => {
      await cache.deleteByTag('nonexistent')
      const stats = cache.stats()
      expect(stats.tags).toBe(0)
    })

    it('should update tags when replacing entry', async () => {
      const entry1 = {
        response: { status: 200, headers: {}, body: 'test1' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
        tags: ['tag1', 'tag2'],
      }

      const entry2 = {
        response: { status: 200, headers: {}, body: 'test2' },
        timestamp: Date.now(),
        key: 'key1', // Same key
        ttl: 60000,
        tags: ['tag3'],
      }

      await cache.set('key1', entry1)
      await cache.set('key1', entry2)

      // Old tags should be removed
      await cache.deleteByTag('tag1')
      expect(await cache.get('key1')).not.toBeNull()

      // New tag should work
      await cache.deleteByTag('tag3')
      expect(await cache.get('key1')).toBeNull()
    })

    it('should handle entries without tags', async () => {
      const entry = {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
      }

      await cache.set('key1', entry)
      const stats = cache.stats()

      expect(stats.size).toBe(1)
      expect(stats.tags).toBe(0)
    })

    it('should report stats', async () => {
      for (let i = 0; i < 3; i++) {
        await cache.set(`key-${i}`, {
          response: { status: 200, headers: {}, body: `test-${i}` },
          timestamp: Date.now(),
          key: `key-${i}`,
          ttl: 60000,
          tags: ['tag1'],
        })
      }

      const stats = cache.stats()
      expect(stats.size).toBe(3)
      expect(stats.tags).toBe(1)
    })

    it('should support multiple tags per entry', async () => {
      const entry = {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
        tags: ['tag1', 'tag2', 'tag3'],
      }

      await cache.set('key1', entry)
      const stats = cache.stats()

      expect(stats.tags).toBe(3)
    })

    it('should clean up expired entries periodically', async () => {
      const shortCache = new MemoryCache(100) // 100ms cleanup interval

      await shortCache.set('expired', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now() - 1000,
        key: 'expired',
        ttl: 100, // Already expired
      })

      await shortCache.set('valid', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'valid',
        ttl: 60000,
      })

      // Wait for cleanup
      await new Promise((r) => setTimeout(r, 150))

      const stats = shortCache.stats()
      expect(stats.size).toBe(1)

      shortCache.close()
    })

    it('should close and stop cleanup interval', () => {
      const testCache = new MemoryCache()
      testCache.close()
      // Calling close again should be safe
      testCache.close()
    })
  })

  describe('LRUCache', () => {
    it('should respect max size', async () => {
      const cache = new LRUCache(3)

      for (let i = 0; i < 5; i++) {
        await cache.set(`key-${i}`, {
          response: { status: 200, headers: {}, body: `test-${i}` },
          timestamp: Date.now(),
          key: `key-${i}`,
          ttl: 60000,
        })
      }

      const stats = cache.stats()
      expect(stats.size).toBe(3)
      expect(stats.maxSize).toBe(3)

      // Oldest entries should be evicted
      expect(await cache.get('key-0')).toBeNull()
      expect(await cache.get('key-1')).toBeNull()
      expect(await cache.get('key-2')).not.toBeNull()
    })

    it('should move accessed items to end', async () => {
      const cache = new LRUCache(3)

      await cache.set('key-0', {
        response: { status: 200, headers: {}, body: 'test-0' },
        timestamp: Date.now(),
        key: 'key-0',
        ttl: 60000,
      })

      await cache.set('key-1', {
        response: { status: 200, headers: {}, body: 'test-1' },
        timestamp: Date.now(),
        key: 'key-1',
        ttl: 60000,
      })

      await cache.set('key-2', {
        response: { status: 200, headers: {}, body: 'test-2' },
        timestamp: Date.now(),
        key: 'key-2',
        ttl: 60000,
      })

      // Access key-0 (moves it to end)
      await cache.get('key-0')

      // Add new entry (should evict key-1, not key-0)
      await cache.set('key-3', {
        response: { status: 200, headers: {}, body: 'test-3' },
        timestamp: Date.now(),
        key: 'key-3',
        ttl: 60000,
      })

      expect(await cache.get('key-0')).not.toBeNull()
      expect(await cache.get('key-1')).toBeNull()
    })

    it('should expire old entries', async () => {
      const cache = new LRUCache(10)

      await cache.set('expired', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now() - 10000,
        key: 'expired',
        ttl: 5000, // Already expired
      })

      expect(await cache.get('expired')).toBeNull()
    })

    it('should handle updating existing keys', async () => {
      const cache = new LRUCache(3)

      await cache.set('key-1', {
        response: { status: 200, headers: {}, body: 'test-1' },
        timestamp: Date.now(),
        key: 'key-1',
        ttl: 60000,
      })

      await cache.set('key-2', {
        response: { status: 200, headers: {}, body: 'test-2' },
        timestamp: Date.now(),
        key: 'key-2',
        ttl: 60000,
      })

      // Update key-1
      await cache.set('key-1', {
        response: { status: 200, headers: {}, body: 'updated' },
        timestamp: Date.now(),
        key: 'key-1',
        ttl: 60000,
      })

      const result = await cache.get('key-1')
      expect(result?.response.body).toBe('updated')
      expect(cache.stats().size).toBe(2) // Should still be 2, not 3
    })

    it('should delete entries', async () => {
      const cache = new LRUCache(10)

      await cache.set('key-1', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key-1',
        ttl: 60000,
      })

      await cache.delete('key-1')
      expect(await cache.get('key-1')).toBeNull()
    })

    it('should clear all entries', async () => {
      const cache = new LRUCache(10)

      for (let i = 0; i < 5; i++) {
        await cache.set(`key-${i}`, {
          response: { status: 200, headers: {}, body: `test-${i}` },
          timestamp: Date.now(),
          key: `key-${i}`,
          ttl: 60000,
        })
      }

      await cache.clear()
      expect(cache.stats().size).toBe(0)
    })

    it('should handle size of 1', async () => {
      const cache = new LRUCache(1)

      await cache.set('key-1', {
        response: { status: 200, headers: {}, body: 'test-1' },
        timestamp: Date.now(),
        key: 'key-1',
        ttl: 60000,
      })

      await cache.set('key-2', {
        response: { status: 200, headers: {}, body: 'test-2' },
        timestamp: Date.now(),
        key: 'key-2',
        ttl: 60000,
      })

      expect(await cache.get('key-1')).toBeNull()
      expect(await cache.get('key-2')).not.toBeNull()
    })
  })

  describe('Cache Key Generation', () => {
    describe('defaultCacheKey', () => {
      it('should generate consistent keys', () => {
        const ctx1 = { method: 'GET', path: '/api/users', query: '?page=1' } as any
        const ctx2 = { method: 'GET', path: '/api/users', query: '?page=1' } as any

        expect(defaultCacheKey(ctx1)).toBe(defaultCacheKey(ctx2))
      })

      it('should generate different keys for different requests', () => {
        const ctx1 = { method: 'GET', path: '/api/users', query: '' } as any
        const ctx2 = { method: 'POST', path: '/api/users', query: '' } as any
        const ctx3 = { method: 'GET', path: '/api/posts', query: '' } as any

        expect(defaultCacheKey(ctx1)).not.toBe(defaultCacheKey(ctx2))
        expect(defaultCacheKey(ctx1)).not.toBe(defaultCacheKey(ctx3))
      })

      it('should handle missing query', () => {
        const ctx1 = { method: 'GET', path: '/api/users', query: null } as any
        const ctx2 = { method: 'GET', path: '/api/users', query: '' } as any

        expect(defaultCacheKey(ctx1)).toBe(defaultCacheKey(ctx2))
      })

      it('should generate different keys for different query params', () => {
        const ctx1 = { method: 'GET', path: '/api/users', query: '?page=1' } as any
        const ctx2 = { method: 'GET', path: '/api/users', query: '?page=2' } as any

        expect(defaultCacheKey(ctx1)).not.toBe(defaultCacheKey(ctx2))
      })
    })

    describe('varyingCacheKey', () => {
      it('should include specified headers in key', () => {
        const keyGen = varyingCacheKey(['accept-language'])

        const ctx1 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'accept-language': 'en' },
        } as any

        const ctx2 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'accept-language': 'es' },
        } as any

        expect(keyGen(ctx1)).not.toBe(keyGen(ctx2))
      })

      it('should be case insensitive for header names', () => {
        const keyGen = varyingCacheKey(['Accept-Language'])

        const ctx1 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'accept-language': 'en' },
        } as any

        const ctx2 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'ACCEPT-LANGUAGE': 'en' },
        } as any

        expect(keyGen(ctx1)).toBe(keyGen(ctx1))
      })

      it('should handle multiple headers', () => {
        const keyGen = varyingCacheKey(['accept-language', 'authorization'])

        const ctx1 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'accept-language': 'en', authorization: 'token1' },
        } as any

        const ctx2 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: { 'accept-language': 'en', authorization: 'token2' },
        } as any

        expect(keyGen(ctx1)).not.toBe(keyGen(ctx2))
      })

      it('should handle missing headers', () => {
        const keyGen = varyingCacheKey(['accept-language'])

        const ctx1 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: {},
        } as any

        const ctx2 = {
          method: 'GET',
          path: '/api/users',
          query: '',
          headers: {},
        } as any

        expect(keyGen(ctx1)).toBe(keyGen(ctx2))
      })
    })
  })

  describe('cache middleware', () => {
    it('should cache GET requests', async () => {
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: `Response ${callCount}` }
      }

      const middleware = cache()
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      // First call - cache miss
      const result1 = await cachedHandler(ctx)
      expect(result1.body).toBe('Response 1')
      expect(result1.headers['x-cache']).toBe('MISS')

      // Second call - cache hit
      const result2 = await cachedHandler(ctx)
      expect(result2.body).toBe('Response 1') // Same response
      expect(result2.headers['x-cache']).toBe('HIT')
      expect(callCount).toBe(1) // Handler only called once
    })

    it('should not cache POST requests by default', async () => {
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: `Response ${callCount}` }
      }

      const middleware = cache()
      const cachedHandler = middleware(handler)

      const ctx = createMockContext({ method: 'POST' })

      await cachedHandler(ctx)
      await cachedHandler(ctx)

      expect(callCount).toBe(2) // Handler called twice
    })

    it('should cache specified methods', async () => {
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: `Response ${callCount}` }
      }

      const middleware = cache({ methods: ['GET', 'POST'] })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext({ method: 'POST' })

      const result1 = await cachedHandler(ctx)
      const result2 = await cachedHandler(ctx)

      expect(result1.headers['x-cache']).toBe('MISS')
      expect(result2.headers['x-cache']).toBe('HIT')
      expect(callCount).toBe(1)
    })

    it('should only cache specified status codes', async () => {
      const store = new MemoryCache()
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: callCount === 1 ? 404 : 200, headers: {}, body: 'Response' }
      }

      const middleware = cache({ store, statusCodes: [200] })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      // First call returns 404, should not cache
      const result1 = await cachedHandler(ctx)
      expect(result1.status).toBe(404)

      // Second call returns 200, should cache
      const result2 = await cachedHandler(ctx)
      expect(result2.status).toBe(200)
      expect(result2.headers['x-cache']).toBe('MISS')

      // Third call should hit cache (200 status was cached)
      const result3 = await cachedHandler(ctx)
      expect(result3.status).toBe(200)
      expect(result3.headers['x-cache']).toBe('HIT')

      expect(callCount).toBe(2) // First not cached, second cached, third hit
      store.close()
    })

    it('should skip caching when skip returns true', async () => {
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: 'Response' }
      }

      const middleware = cache({
        skip: (ctx) => ctx.path.startsWith('/admin'),
      })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext({ path: '/admin/users' })

      await cachedHandler(ctx)
      await cachedHandler(ctx)

      expect(callCount).toBe(2) // Not cached
    })

    it('should skip caching response when skipResponse returns true', async () => {
      const store = new MemoryCache()
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return {
          status: 200,
          headers: { 'x-skip': callCount === 1 ? 'true' : 'false' },
          body: `Response ${callCount}`,
        }
      }

      const middleware = cache({
        store,
        skipResponse: (res) => res.headers['x-skip'] === 'true',
      })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      // First call - skip caching (x-skip: true)
      const result1 = await cachedHandler(ctx)
      expect(result1.body).toBe('Response 1')

      // Second call - cache this one (x-skip: false)
      const result2 = await cachedHandler(ctx)
      expect(result2.body).toBe('Response 2')
      expect(result2.headers['x-cache']).toBe('MISS')

      // Third call - should use cached response
      const result3 = await cachedHandler(ctx)
      expect(result3.body).toBe('Response 2') // Same as second call
      expect(result3.headers['x-cache']).toBe('HIT')

      expect(callCount).toBe(2) // First skipped, second cached, third hit
      store.close()
    })

    it('should use custom TTL', async () => {
      const store = new MemoryCache()
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({ store, ttl: 100 }) // 100ms TTL
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      const result1 = await cachedHandler(ctx)
      expect(result1.headers['x-cache']).toBe('MISS')

      // Should hit cache
      const result2 = await cachedHandler(ctx)
      expect(result2.headers['x-cache']).toBe('HIT')

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 150))

      // Should miss cache after expiration
      const result3 = await cachedHandler(ctx)
      expect(result3.headers['x-cache']).toBe('MISS')
      store.close()
    })

    it('should use custom cache key generator', async () => {
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: 'Response' }
      }

      // Key generator that only uses path (ignores query)
      const middleware = cache({
        key: (ctx) => ctx.path,
      })
      const cachedHandler = middleware(handler)

      const ctx1 = createMockContext({ query: '?page=1' })
      const ctx2 = createMockContext({ query: '?page=2' })

      await cachedHandler(ctx1)
      await cachedHandler(ctx2)

      expect(callCount).toBe(1) // Same cache key, so only one call
    })

    it('should support cache tags', async () => {
      const store = new MemoryCache()
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({
        store,
        tags: (ctx) => [`user:${ctx.params.userId}`],
      })
      const cachedHandler = middleware(handler)

      const ctx1 = createMockContext({ params: { userId: '123' } })
      const ctx2 = createMockContext({ params: { userId: '456' } })

      await cachedHandler(ctx1)
      await cachedHandler(ctx2)

      // Invalidate user 123's cache
      await store.deleteByTag('user:123')

      const result1 = await cachedHandler(ctx1)
      expect(result1.headers['x-cache']).toBe('MISS') // Invalidated

      const result2 = await cachedHandler(ctx2)
      expect(result2.headers['x-cache']).toBe('HIT') // Still cached

      store.close()
    })

    it('should add cache-control headers when enabled', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({ cacheControl: true, ttl: 300000 }) // 5 min
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      const result = await cachedHandler(ctx)
      expect(result.headers['cache-control']).toContain('public')
      expect(result.headers['cache-control']).toContain('max-age=')
    })

    it('should not add cache-control headers when disabled', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({ cacheControl: false })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      const result = await cachedHandler(ctx)
      expect(result.headers['cache-control']).toBeUndefined()
    })

    it('should include stale-while-revalidate in cache-control', async () => {
      const store = new MemoryCache()
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({
        store,
        cacheControl: true,
        ttl: 60000,
        staleWhileRevalidate: 30000,
      })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      const result = await cachedHandler(ctx)
      expect(result.headers['cache-control']).toContain('stale-while-revalidate=')
      store.close()
    })

    it('should include cache age in headers', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response',
      })

      const middleware = cache({ ttl: 60000 })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      // First call - cache
      await cachedHandler(ctx)

      // Wait a bit
      await new Promise((r) => setTimeout(r, 100))

      // Second call - hit
      const result = await cachedHandler(ctx)
      expect(result.headers['x-cache-age']).toBeDefined()
      expect(Number(result.headers['x-cache-age'])).toBeGreaterThanOrEqual(0)
    })

    it('should use custom cache store', async () => {
      const customStore = new LRUCache(5)
      let callCount = 0
      const handler = async (ctx: Context) => {
        callCount++
        return { status: 200, headers: {}, body: `Response ${callCount}` }
      }

      const middleware = cache({ store: customStore })
      const cachedHandler = middleware(handler)

      const ctx = createMockContext()

      await cachedHandler(ctx)
      await cachedHandler(ctx)

      expect(callCount).toBe(1)
      expect(customStore.stats().size).toBe(1)
    })
  })

  describe('noCache middleware', () => {
    it('should add no-cache headers', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'Response',
      })

      const middleware = noCache()
      const noCachedHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await noCachedHandler(ctx)

      expect(result.headers['cache-control']).toBe(
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      )
      expect(result.headers['pragma']).toBe('no-cache')
      expect(result.headers['expires']).toBe('0')
    })

    it('should preserve existing headers', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: { 'content-type': 'application/json', 'x-custom': 'value' },
        body: 'Response',
      })

      const middleware = noCache()
      const noCachedHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await noCachedHandler(ctx)

      expect(result.headers['content-type']).toBe('application/json')
      expect(result.headers['x-custom']).toBe('value')
    })
  })

  describe('etag middleware', () => {
    it('should generate ETag for response body', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response body',
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await etagHandler(ctx)

      expect(result.headers['etag']).toBeDefined()
      expect(result.headers['etag']).toStartWith('"')
      expect(result.headers['etag']).toEndWith('"')
    })

    it('should return 304 for matching If-None-Match', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response body',
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx1 = createMockContext()
      const result1 = await etagHandler(ctx1)

      const etagValue = result1.headers['etag']

      const ctx2 = createMockContext({
        headers: { 'if-none-match': etagValue },
      })
      const result2 = await etagHandler(ctx2)

      expect(result2.status).toBe(304)
      expect(result2.body).toBeNull()
    })

    it('should return full response for non-matching If-None-Match', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Response body',
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx = createMockContext({
        headers: { 'if-none-match': '"wrong-etag"' },
      })
      const result = await etagHandler(ctx)

      expect(result.status).toBe(200)
      expect(result.body).toBe('Response body')
    })

    it('should skip ETag for empty body', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: null,
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await etagHandler(ctx)

      expect(result.headers['etag']).toBeUndefined()
    })

    it('should not overwrite existing ETag', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: { etag: '"existing-etag"' },
        body: 'Response body',
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await etagHandler(ctx)

      expect(result.headers['etag']).toBe('"existing-etag"')
    })

    it('should handle Buffer body', async () => {
      const handler = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: Buffer.from('Response body'),
      })

      const middleware = etag()
      const etagHandler = middleware(handler)

      const ctx = createMockContext()
      const result = await etagHandler(ctx)

      expect(result.headers['etag']).toBeDefined()
    })

    it('should generate consistent ETags for same content', async () => {
      const handler1 = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Same content',
      })

      const handler2 = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Same content',
      })

      const middleware = etag()
      const etagHandler1 = middleware(handler1)
      const etagHandler2 = middleware(handler2)

      const ctx = createMockContext()

      const result1 = await etagHandler1(ctx)
      const result2 = await etagHandler2(ctx)

      expect(result1.headers['etag']).toBe(result2.headers['etag'])
    })

    it('should generate different ETags for different content', async () => {
      const handler1 = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Content 1',
      })

      const handler2 = async (ctx: Context) => ({
        status: 200,
        headers: {},
        body: 'Content 2',
      })

      const middleware = etag()
      const etagHandler1 = middleware(handler1)
      const etagHandler2 = middleware(handler2)

      const ctx = createMockContext()

      const result1 = await etagHandler1(ctx)
      const result2 = await etagHandler2(ctx)

      expect(result1.headers['etag']).not.toBe(result2.headers['etag'])
    })
  })

  describe('invalidateCache helper', () => {
    it('should invalidate by key', async () => {
      const store = new MemoryCache()

      await store.set('key1', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
      })

      await invalidateCache(store, 'key1')

      expect(await store.get('key1')).toBeNull()

      store.close()
    })

    it('should invalidate by tag', async () => {
      const store = new MemoryCache()

      await store.set('key1', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
        tags: ['tag1'],
      })

      await invalidateCache(store, 'tag1', true)

      expect(await store.get('key1')).toBeNull()

      store.close()
    })

    it('should handle stores without deleteByTag', async () => {
      const store = new LRUCache()

      await store.set('key1', {
        response: { status: 200, headers: {}, body: 'test' },
        timestamp: Date.now(),
        key: 'key1',
        ttl: 60000,
      })

      // Should delete by key instead
      await invalidateCache(store, 'key1', true)

      expect(await store.get('key1')).toBeNull()
    })
  })
})
