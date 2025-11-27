/**
 * Cache Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { MemoryCache, LRUCache, defaultCacheKey } from '../src/cache'

describe('Cache', () => {
  describe('MemoryCache', () => {
    let cache: MemoryCache

    beforeEach(() => {
      cache = new MemoryCache()
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
  })

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
  })
})
