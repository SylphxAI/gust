/**
 * Cache Middleware
 * In-memory and pluggable response caching
 */

import { createHash } from 'node:crypto'
import type { Context } from './context'
import type { ServerResponse, Handler, Wrapper } from '@aspect/serve-core'

// ============================================================================
// Types
// ============================================================================

export type CacheEntry = {
  /** Cached response */
  response: ServerResponse
  /** Timestamp when cached */
  timestamp: number
  /** Cache key */
  key: string
  /** TTL in milliseconds */
  ttl: number
  /** Cache tags for invalidation */
  tags?: string[]
}

export type CacheStore = {
  /** Get cached entry */
  get: (key: string) => Promise<CacheEntry | null>
  /** Set cache entry */
  set: (key: string, entry: CacheEntry) => Promise<void>
  /** Delete cache entry */
  delete: (key: string) => Promise<void>
  /** Delete entries by tag */
  deleteByTag?: (tag: string) => Promise<void>
  /** Clear all entries */
  clear: () => Promise<void>
}

export type CacheOptions = {
  /** Cache store (default: MemoryCache) */
  readonly store?: CacheStore
  /** TTL in milliseconds (default: 5 minutes) */
  readonly ttl?: number
  /** Generate cache key */
  readonly key?: (ctx: Context) => string
  /** Skip caching for certain requests */
  readonly skip?: (ctx: Context) => boolean
  /** Skip caching certain responses */
  readonly skipResponse?: (res: ServerResponse) => boolean
  /** Cache tags for invalidation */
  readonly tags?: (ctx: Context) => string[]
  /** HTTP methods to cache (default: GET, HEAD) */
  readonly methods?: string[]
  /** Status codes to cache (default: 200) */
  readonly statusCodes?: number[]
  /** Add cache headers */
  readonly cacheControl?: boolean
  /** Stale-while-revalidate in milliseconds */
  readonly staleWhileRevalidate?: number
}

// ============================================================================
// Memory Cache Store
// ============================================================================

export class MemoryCache implements CacheStore {
  private cache = new Map<string, CacheEntry>()
  private tagIndex = new Map<string, Set<string>>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(cleanupMs = 60000) {
    // Cleanup expired entries periodically
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.cache) {
        if (entry.timestamp + entry.ttl < now) {
          this.cache.delete(key)
          this.removeFromTagIndex(key, entry.tags)
        }
      }
    }, cleanupMs)
  }

  private removeFromTagIndex(key: string, tags?: string[]): void {
    if (!tags) return
    for (const tag of tags) {
      const keys = this.tagIndex.get(tag)
      if (keys) {
        keys.delete(key)
        if (keys.size === 0) {
          this.tagIndex.delete(tag)
        }
      }
    }
  }

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check if expired
    if (entry.timestamp + entry.ttl < Date.now()) {
      this.cache.delete(key)
      this.removeFromTagIndex(key, entry.tags)
      return null
    }

    return entry
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    // Remove old entry from tag index
    const old = this.cache.get(key)
    if (old) {
      this.removeFromTagIndex(key, old.tags)
    }

    this.cache.set(key, entry)

    // Add to tag index
    if (entry.tags) {
      for (const tag of entry.tags) {
        let keys = this.tagIndex.get(tag)
        if (!keys) {
          keys = new Set()
          this.tagIndex.set(tag, keys)
        }
        keys.add(key)
      }
    }
  }

  async delete(key: string): Promise<void> {
    const entry = this.cache.get(key)
    if (entry) {
      this.removeFromTagIndex(key, entry.tags)
      this.cache.delete(key)
    }
  }

  async deleteByTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag)
    if (!keys) return

    for (const key of keys) {
      const entry = this.cache.get(key)
      if (entry) {
        this.removeFromTagIndex(key, entry.tags)
        this.cache.delete(key)
      }
    }

    this.tagIndex.delete(tag)
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.tagIndex.clear()
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; tags: number } {
    return {
      size: this.cache.size,
      tags: this.tagIndex.size,
    }
  }

  /**
   * Close and cleanup
   */
  close(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// ============================================================================
// LRU Cache Store
// ============================================================================

export class LRUCache implements CacheStore {
  private cache = new Map<string, CacheEntry>()
  private readonly maxSize: number

  constructor(maxSize = 1000) {
    this.maxSize = maxSize
  }

  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key)
    if (!entry) return null

    // Check if expired
    if (entry.timestamp + entry.ttl < Date.now()) {
      this.cache.delete(key)
      return null
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    // Remove if exists
    this.cache.delete(key)

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }

    this.cache.set(key, entry)
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }

  stats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.maxSize }
  }
}

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Generate cache key from request
 */
export const defaultCacheKey = (ctx: Context): string => {
  const data = `${ctx.method}:${ctx.path}:${ctx.query || ''}`
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

/**
 * Generate cache key with headers
 */
export const varyingCacheKey = (headers: string[]) => (ctx: Context): string => {
  const headerValues = headers.map((h) => ctx.headers[h.toLowerCase()] || '').join(':')
  const data = `${ctx.method}:${ctx.path}:${ctx.query || ''}:${headerValues}`
  return createHash('sha256').update(data).digest('hex').slice(0, 16)
}

// ============================================================================
// Cache Middleware
// ============================================================================

const DEFAULT_METHODS = ['GET', 'HEAD']
const DEFAULT_STATUS_CODES = [200]
const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

// Shared default store
let defaultStore: MemoryCache | null = null

const getDefaultStore = (): MemoryCache => {
  if (!defaultStore) {
    defaultStore = new MemoryCache()
  }
  return defaultStore
}

/**
 * Response caching middleware
 */
export const cache = (options: CacheOptions = {}): Wrapper<Context> => {
  const {
    store = getDefaultStore(),
    ttl = DEFAULT_TTL,
    key: keyGen = defaultCacheKey,
    skip,
    skipResponse,
    tags,
    methods = DEFAULT_METHODS,
    statusCodes = DEFAULT_STATUS_CODES,
    cacheControl = true,
    staleWhileRevalidate,
  } = options

  const methodSet = new Set(methods.map((m) => m.toUpperCase()))
  const statusSet = new Set(statusCodes)

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      // Only cache specified methods
      if (!methodSet.has(ctx.method.toUpperCase())) {
        return handler(ctx)
      }

      // Skip if configured
      if (skip?.(ctx)) {
        return handler(ctx)
      }

      const cacheKey = keyGen(ctx)

      // Try to get from cache
      const cached = await store.get(cacheKey)

      if (cached) {
        const age = Math.floor((Date.now() - cached.timestamp) / 1000)
        const maxAge = Math.floor(cached.ttl / 1000)

        // Add cache headers
        const headers: Record<string, string> = {
          ...cached.response.headers,
          'x-cache': 'HIT',
          'x-cache-age': String(age),
        }

        if (cacheControl) {
          headers['cache-control'] = `public, max-age=${maxAge - age}`
        }

        return { ...cached.response, headers }
      }

      // Execute handler
      const res = await handler(ctx)

      // Check if response should be cached
      if (!statusSet.has(res.status)) {
        return res
      }

      if (skipResponse?.(res)) {
        return res
      }

      // Store in cache
      const entry: CacheEntry = {
        response: res,
        timestamp: Date.now(),
        key: cacheKey,
        ttl,
        tags: tags?.(ctx),
      }

      // Don't await cache set (fire and forget)
      store.set(cacheKey, entry)

      // Add cache headers
      const headers: Record<string, string> = {
        ...res.headers,
        'x-cache': 'MISS',
      }

      if (cacheControl) {
        let cc = `public, max-age=${Math.floor(ttl / 1000)}`
        if (staleWhileRevalidate) {
          cc += `, stale-while-revalidate=${Math.floor(staleWhileRevalidate / 1000)}`
        }
        headers['cache-control'] = cc
      }

      return { ...res, headers }
    }
  }
}

/**
 * Cache invalidation helper
 */
export const invalidateCache = async (
  store: CacheStore,
  keyOrTag: string,
  isTag = false
): Promise<void> => {
  if (isTag && store.deleteByTag) {
    await store.deleteByTag(keyOrTag)
  } else {
    await store.delete(keyOrTag)
  }
}

/**
 * No-cache middleware (prevent caching)
 */
export const noCache = (): Wrapper<Context> => {
  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      const res = await handler(ctx)
      return {
        ...res,
        headers: {
          ...res.headers,
          'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          pragma: 'no-cache',
          expires: '0',
        },
      }
    }
  }
}

/**
 * ETag-based conditional caching
 */
export const etag = (): Wrapper<Context> => {
  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      const res = await handler(ctx)

      // Skip if no body or already has ETag
      if (!res.body || res.headers['etag']) {
        return res
      }

      // Generate ETag from body
      const hash = createHash('md5')
        .update(typeof res.body === 'string' ? res.body : res.body)
        .digest('hex')
      const etagValue = `"${hash}"`

      // Check If-None-Match
      const ifNoneMatch = ctx.headers['if-none-match']
      if (ifNoneMatch === etagValue) {
        return {
          status: 304,
          headers: { etag: etagValue },
          body: null,
        }
      }

      return {
        ...res,
        headers: {
          ...res.headers,
          etag: etagValue,
        },
      }
    }
  }
}
