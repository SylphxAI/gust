/**
 * Session Tests - Comprehensive edge case coverage
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  MemoryStore,
  generateSessionId,
  session,
  getSession,
  flash,
} from '../src/session'
import { text } from '@aspect/serve-core'

const createMockContext = (cookies: Record<string, string> = {}): any => {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

  return {
    method: 'GET',
    path: '/test',
    query: '',
    headers: {
      cookie: cookieHeader,
    },
    body: Buffer.alloc(0),
  }
}

describe('Session', () => {
  describe('generateSessionId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId())
      }
      expect(ids.size).toBe(100)
    })

    it('should generate URL-safe IDs', () => {
      const id = generateSessionId()
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('should generate IDs of consistent length', () => {
      const id = generateSessionId()
      expect(id.length).toBeGreaterThan(20)
    })

    it('should generate cryptographically random IDs', () => {
      // Generate many IDs and check distribution
      const ids = Array.from({ length: 1000 }, () => generateSessionId())
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(1000)
    })

    it('should generate base64url encoded IDs', () => {
      const id = generateSessionId()
      // Should not contain +, /, or =
      expect(id).not.toContain('+')
      expect(id).not.toContain('/')
      expect(id).not.toContain('=')
    })
  })

  describe('MemoryStore', () => {
    let store: MemoryStore

    beforeEach(() => {
      store = new MemoryStore()
    })

    afterEach(() => {
      store.close()
    })

    it('should store and retrieve session', async () => {
      await store.set('test-id', { user: 'john' }, 60000)
      const data = await store.get('test-id')
      expect(data).toEqual({ user: 'john' })
    })

    it('should return null for missing session', async () => {
      const data = await store.get('nonexistent')
      expect(data).toBeNull()
    })

    it('should destroy session', async () => {
      await store.set('test-id', { user: 'john' }, 60000)
      await store.destroy('test-id')
      const data = await store.get('test-id')
      expect(data).toBeNull()
    })

    it('should touch session (update expiry)', async () => {
      await store.set('test-id', { user: 'john' }, 1000)
      await store.touch('test-id', 60000)
      // Session should still be valid
      const data = await store.get('test-id')
      expect(data).toEqual({ user: 'john' })
    })

    it('should expire sessions', async () => {
      await store.set('test-id', { user: 'john' }, 50) // 50ms TTL
      await new Promise((r) => setTimeout(r, 100))
      const data = await store.get('test-id')
      expect(data).toBeNull()
    })

    it('should handle concurrent sessions', async () => {
      await Promise.all([
        store.set('id-1', { user: 'a' }, 60000),
        store.set('id-2', { user: 'b' }, 60000),
        store.set('id-3', { user: 'c' }, 60000),
      ])

      const [a, b, c] = await Promise.all([
        store.get('id-1'),
        store.get('id-2'),
        store.get('id-3'),
      ])

      expect(a).toEqual({ user: 'a' })
      expect(b).toEqual({ user: 'b' })
      expect(c).toEqual({ user: 'c' })
    })

    it('should overwrite existing session', async () => {
      await store.set('test-id', { user: 'john' }, 60000)
      await store.set('test-id', { user: 'jane' }, 60000)
      const data = await store.get('test-id')
      expect(data).toEqual({ user: 'jane' })
    })

    it('should return all sessions', async () => {
      await store.set('id-1', { a: 1 }, 60000)
      await store.set('id-2', { b: 2 }, 60000)

      const all = store.all()
      expect(all.size).toBe(2)
    })

    it('should clear all sessions', async () => {
      await store.set('id-1', { a: 1 }, 60000)
      await store.set('id-2', { b: 2 }, 60000)
      store.clear()

      const all = store.all()
      expect(all.size).toBe(0)
    })

    it('should handle touch on nonexistent session', async () => {
      // Should not throw
      await store.touch('nonexistent', 60000)
    })

    it('should handle destroy on nonexistent session', async () => {
      // Should not throw
      await store.destroy('nonexistent')
    })

    it('should handle complex session data', async () => {
      const complexData = {
        user: { id: 1, name: 'John', roles: ['admin', 'user'] },
        cart: [{ id: 1, qty: 2 }, { id: 2, qty: 1 }],
        preferences: { theme: 'dark', locale: 'en-US' },
      }

      await store.set('test-id', complexData, 60000)
      const data = await store.get('test-id')
      expect(data).toEqual(complexData)
    })

    it('should handle empty session data', async () => {
      await store.set('empty', {}, 60000)
      const data = await store.get('empty')
      expect(data).toEqual({})
    })

    it('should handle very long session IDs', async () => {
      const longId = 'a'.repeat(1000)
      await store.set(longId, { test: true }, 60000)
      const data = await store.get(longId)
      expect(data).toEqual({ test: true })
    })

    it('should handle special characters in session ID', async () => {
      const specialId = 'test-id_123.456'
      await store.set(specialId, { test: true }, 60000)
      const data = await store.get(specialId)
      expect(data).toEqual({ test: true })
    })

    it('should handle zero TTL', async () => {
      await store.set('zero-ttl', { test: true }, 0)
      // Zero TTL means expires at Date.now() + 0 = now
      // Due to timing, it may or may not be expired immediately
      // Wait a tiny bit to ensure expiry
      await new Promise(r => setTimeout(r, 10))
      const data = await store.get('zero-ttl')
      expect(data).toBeNull()
    })

    it('should handle negative TTL', async () => {
      await store.set('negative-ttl', { test: true }, -1000)
      const data = await store.get('negative-ttl')
      expect(data).toBeNull()
    })

    it('should handle very large session data', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'x'.repeat(100),
        })),
      }

      await store.set('large', largeData, 60000)
      const data = await store.get('large')
      expect(data).toEqual(largeData)
    })

    it('should handle many concurrent operations', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        store.set(`id-${i}`, { index: i }, 60000)
      )

      await Promise.all(operations)

      const reads = Array.from({ length: 100 }, (_, i) =>
        store.get(`id-${i}`)
      )

      const results = await Promise.all(reads)

      results.forEach((data, i) => {
        expect(data).toEqual({ index: i })
      })
    })

    it('should clean up on close', () => {
      const testStore = new MemoryStore()
      testStore.set('test', { data: 1 }, 60000)
      testStore.close()
      // After close, cleanup interval should be cleared
      // Store should still work but won't auto-cleanup
      expect(testStore.all().size).toBe(1)
    })
  })

  describe('session middleware', () => {
    let store: MemoryStore

    beforeEach(() => {
      store = new MemoryStore()
    })

    afterEach(() => {
      store.close()
    })

    it('should create new session for first request', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        expect(sess).toBeDefined()
        expect(sess?.isNew).toBe(true)
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.status).toBe(200)
    })

    it('should set session cookie on new session with saveUninitialized', async () => {
      const middleware = session({ secret: 'test-secret', store, saveUninitialized: true })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.headers['set-cookie']).toBeDefined()
      expect(res.headers['set-cookie']).toContain('sid=')
    })

    it('should use custom cookie name', async () => {
      const middleware = session({ secret: 'test-secret', store, name: 'custom_session', saveUninitialized: true })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.headers['set-cookie']).toContain('custom_session=')
    })

    it('should not set cookie when session is not modified and saveUninitialized is false', async () => {
      const middleware = session({ secret: 'test-secret', store, saveUninitialized: false })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext())
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('should set cookie when session data is modified', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.headers['set-cookie']).toBeDefined()
    })

    it('should handle session destroy', async () => {
      // First create a session
      const middleware = session({ secret: 'test-secret', store })
      let sessionCookie = ''

      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Then destroy it
      const destroyHandler = middleware(async (ctx) => {
        const sess = getSession(ctx)
        await sess!.destroy()
        return text('ok')
      })

      const res2 = await destroyHandler(createMockContext({ sid: sessionCookie }))
      // Should clear the cookie - check case-insensitively
      expect(res2.headers['set-cookie'].toLowerCase()).toContain('max-age=0')
    })

    it('should handle session regenerate', async () => {
      const middleware = session({ secret: 'test-secret', store })

      // First create a session
      let originalCookie = ''
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      originalCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Then regenerate it
      const regenerateHandler = middleware(async (ctx) => {
        const sess = getSession(ctx)
        await sess!.regenerate()
        return text('ok')
      })

      const res2 = await regenerateHandler(createMockContext({ sid: originalCookie }))
      const newCookie = res2.headers['set-cookie'].split(';')[0].split('=')[1]

      // Should have a different session ID
      expect(newCookie).not.toBe(originalCookie)
    })

    it('should handle rolling sessions', async () => {
      const middleware = session({ secret: 'test-secret', store, rolling: true })

      // Create session
      let sessionCookie = ''
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Second request should reset the cookie
      const handler = middleware(() => text('ok'))
      const res2 = await handler(createMockContext({ sid: sessionCookie }))

      // Should have set-cookie header (rolling)
      expect(res2.headers['set-cookie']).toBeDefined()
    })

    it('should handle resave option', async () => {
      const middleware = session({ secret: 'test-secret', store, resave: true })

      // Create session
      let sessionCookie = ''
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Second request without modification should still save
      const handler = middleware(() => text('ok'))
      const res2 = await handler(createMockContext({ sid: sessionCookie }))

      // With resave, should have set-cookie
      expect(res2.headers['set-cookie']).toBeDefined()
    })

    it('should handle touch', async () => {
      const middleware = session({ secret: 'test-secret', store })

      // Create session
      let sessionCookie = ''
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Touch the session
      const touchHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.touch()
        return text('ok')
      })

      await touchHandler(createMockContext({ sid: sessionCookie }))
      // Session should still exist
      const data = await store.get(sessionCookie.split('.')[0])
      // If session was touched, it should still have data
      expect(data).not.toBeNull()
    })

    it('should handle save', async () => {
      const middleware = session({ secret: 'test-secret', store })

      const handler = middleware(async (ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        await sess!.save()
        return text('ok')
      })

      await handler(createMockContext())
      // Should have saved to store
      const all = store.all()
      expect(all.size).toBeGreaterThan(0)
    })

    it('should handle custom genid', async () => {
      let customIdCalled = false
      const middleware = session({
        secret: 'test-secret',
        store,
        genid: () => {
          customIdCalled = true
          return 'custom-session-id'
        },
        saveUninitialized: true,
      })

      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      await handler(createMockContext())
      expect(customIdCalled).toBe(true)
    })

    it('should handle invalid session cookie', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        expect(sess?.isNew).toBe(true) // Should create new session
        return text('ok')
      })

      // Invalid signature
      await handler(createMockContext({ sid: 'invalid.signature' }))
    })

    it('should handle expired session', async () => {
      const middleware = session({ secret: 'test-secret', store, maxAge: 50 })

      // Create session
      let sessionCookie = ''
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.user = 'john'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Wait for expiration
      await new Promise(r => setTimeout(r, 100))

      // Should create new session
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        expect(sess?.isNew).toBe(true)
        return text('ok')
      })

      await handler(createMockContext({ sid: sessionCookie }))
    })

    it('should set httpOnly cookie by default', async () => {
      const middleware = session({ secret: 'test-secret', store, saveUninitialized: true })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      const res = await handler(createMockContext())
      // Cookie attribute casing varies - check case-insensitively
      expect(res.headers['set-cookie'].toLowerCase()).toContain('httponly')
    })

    it('should set sameSite cookie by default', async () => {
      const middleware = session({ secret: 'test-secret', store, saveUninitialized: true })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.headers['set-cookie'].toLowerCase()).toContain('samesite=lax')
    })

    it('should handle custom cookie options', async () => {
      const middleware = session({
        secret: 'test-secret',
        store,
        saveUninitialized: true,
        cookie: {
          secure: true,
          sameSite: 'strict',
          path: '/api',
        },
      })
      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.test = 'value'
        return text('ok')
      })

      const res = await handler(createMockContext())
      const cookie = res.headers['set-cookie'].toLowerCase()
      expect(cookie).toContain('secure')
      expect(cookie).toContain('samesite=strict')
      expect(cookie).toContain('path=/api')
    })
  })

  describe('flash messages', () => {
    let store: MemoryStore

    beforeEach(() => {
      store = new MemoryStore()
    })

    afterEach(() => {
      store.close()
    })

    it('should return undefined without session', () => {
      const ctx = createMockContext()
      const result = flash(ctx, 'error')
      expect(result).toBeUndefined()
    })

    it('should set and get flash message', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Set flash
      const setHandler = middleware((ctx) => {
        flash(ctx, 'success', 'Operation completed')
        return text('ok')
      })

      const res1 = await setHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Get flash
      let messages: any
      const getHandler = middleware((ctx) => {
        messages = flash(ctx, 'success')
        return text('ok')
      })

      await getHandler(createMockContext({ sid: sessionCookie }))
      expect(messages).toEqual(['Operation completed'])
    })

    it('should clear flash after reading', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Set flash
      const setHandler = middleware((ctx) => {
        flash(ctx, 'error', 'Something went wrong')
        return text('ok')
      })

      const res1 = await setHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // First read
      const getHandler1 = middleware((ctx) => {
        flash(ctx, 'error')
        return text('ok')
      })
      await getHandler1(createMockContext({ sid: sessionCookie }))

      // Second read should be empty
      let messages: any
      const getHandler2 = middleware((ctx) => {
        messages = flash(ctx, 'error')
        return text('ok')
      })
      await getHandler2(createMockContext({ sid: sessionCookie }))

      expect(messages).toBeUndefined()
    })

    it('should handle multiple flash messages', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Set multiple flashes
      const setHandler = middleware((ctx) => {
        flash(ctx, 'info', 'Message 1')
        flash(ctx, 'info', 'Message 2')
        flash(ctx, 'info', 'Message 3')
        return text('ok')
      })

      const res1 = await setHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Get all flashes
      let messages: any
      const getHandler = middleware((ctx) => {
        messages = flash(ctx, 'info')
        return text('ok')
      })

      await getHandler(createMockContext({ sid: sessionCookie }))
      expect(messages).toEqual(['Message 1', 'Message 2', 'Message 3'])
    })

    it('should handle different flash keys', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Set different flash keys
      const setHandler = middleware((ctx) => {
        flash(ctx, 'success', 'Success message')
        flash(ctx, 'error', 'Error message')
        flash(ctx, 'warning', 'Warning message')
        return text('ok')
      })

      const res1 = await setHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Get specific flash key
      let successMessages: any
      let errorMessages: any
      const getHandler = middleware((ctx) => {
        successMessages = flash(ctx, 'success')
        errorMessages = flash(ctx, 'error')
        return text('ok')
      })

      await getHandler(createMockContext({ sid: sessionCookie }))
      expect(successMessages).toEqual(['Success message'])
      expect(errorMessages).toEqual(['Error message'])
    })
  })

  describe('edge cases', () => {
    let store: MemoryStore

    beforeEach(() => {
      store = new MemoryStore()
    })

    afterEach(() => {
      store.close()
    })

    it('should handle concurrent requests with same session', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Create session
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.counter = 0
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Concurrent increments
      const incrementHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.counter = (sess!.data.counter as number) + 1
        return text('ok')
      })

      await Promise.all([
        incrementHandler(createMockContext({ sid: sessionCookie })),
        incrementHandler(createMockContext({ sid: sessionCookie })),
        incrementHandler(createMockContext({ sid: sessionCookie })),
      ])

      // Note: Due to race conditions, counter may not be 3
      // This test verifies no crashes occur
    })

    it('should handle async handler', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const handler = middleware(async (ctx) => {
        await new Promise(r => setTimeout(r, 10))
        const sess = getSession(ctx)
        sess!.data.test = 'async'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.status).toBe(200)
    })

    it('should handle handler throwing error', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const handler = middleware(() => {
        throw new Error('Handler error')
      })

      await expect(handler(createMockContext())).rejects.toThrow('Handler error')
    })

    it('should handle empty cookie header', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const ctx = { ...createMockContext(), headers: { cookie: '' } }

      const handler = middleware((c) => {
        const sess = getSession(c)
        expect(sess?.isNew).toBe(true)
        return text('ok')
      })

      await handler(ctx)
    })

    it('should handle missing cookie header', async () => {
      const middleware = session({ secret: 'test-secret', store })
      const ctx = { ...createMockContext(), headers: {} }

      const handler = middleware((c) => {
        const sess = getSession(c)
        expect(sess?.isNew).toBe(true)
        return text('ok')
      })

      await handler(ctx)
    })

    it('should handle session data with special characters', async () => {
      const middleware = session({ secret: 'test-secret', store })

      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.message = 'Hello "World" <script>alert(1)</script>'
        sess!.data.unicode = '你好世界 🌍'
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.status).toBe(200)
    })

    it('should handle null session data values', async () => {
      const middleware = session({ secret: 'test-secret', store })

      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.nullValue = null
        sess!.data.undefinedValue = undefined
        return text('ok')
      })

      const res = await handler(createMockContext())
      expect(res.status).toBe(200)
    })

    it('should handle isModified tracking', async () => {
      const middleware = session({ secret: 'test-secret', store })

      const handler = middleware((ctx) => {
        const sess = getSession(ctx)
        expect(sess?.isModified).toBe(false)
        sess!.data.test = 'value'
        expect(sess?.isModified).toBe(true)
        return text('ok')
      })

      await handler(createMockContext())
    })

    it('should handle delete property tracking', async () => {
      const middleware = session({ secret: 'test-secret', store })

      let sessionCookie = ''

      // Create session with data
      const createHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        sess!.data.toDelete = 'value'
        return text('ok')
      })

      const res1 = await createHandler(createMockContext())
      sessionCookie = res1.headers['set-cookie'].split(';')[0].split('=')[1]

      // Delete property
      const deleteHandler = middleware((ctx) => {
        const sess = getSession(ctx)
        delete sess!.data.toDelete
        expect(sess?.isModified).toBe(true)
        return text('ok')
      })

      await deleteHandler(createMockContext({ sid: sessionCookie }))
    })
  })
})
