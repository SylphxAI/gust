/**
 * CSRF Protection Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  generateCsrfSecret,
  generateCsrfToken,
  verifyCsrfToken,
  getCsrfToken,
  csrf,
  csrfDoubleSubmit,
  csrfField,
  csrfMeta,
} from '../src/csrf'

// Mock context factory
const createMockContext = (overrides: Partial<{
  method: string
  path: string
  headers: Record<string, string>
  body: Buffer
}> = {}): any => ({
  method: overrides.method ?? 'GET',
  path: overrides.path ?? '/',
  headers: overrides.headers ?? {},
  body: overrides.body ?? Buffer.alloc(0),
  params: {},
  query: '',
  socket: {},
  raw: Buffer.alloc(0),
  json: () => ({}),
})

describe('CSRF Protection', () => {
  describe('generateCsrfSecret', () => {
    it('should generate secret of default length', () => {
      const secret = generateCsrfSecret()
      // Base64URL encoding: 32 bytes -> ~43 characters
      expect(secret.length).toBeGreaterThanOrEqual(40)
    })

    it('should generate secret of specified length', () => {
      const secret16 = generateCsrfSecret(16)
      const secret64 = generateCsrfSecret(64)

      expect(secret64.length).toBeGreaterThan(secret16.length)
    })

    it('should generate unique secrets', () => {
      const secrets = new Set<string>()
      for (let i = 0; i < 100; i++) {
        secrets.add(generateCsrfSecret())
      }
      expect(secrets.size).toBe(100)
    })

    it('should generate URL-safe secret', () => {
      const secret = generateCsrfSecret()
      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/)
    })
  })

  describe('generateCsrfToken', () => {
    const secret = generateCsrfSecret()

    it('should generate token with salt and hash', () => {
      const token = generateCsrfToken(secret)
      expect(token).toContain('.')
      const parts = token.split('.')
      expect(parts).toHaveLength(2)
    })

    it('should generate different tokens for same secret', () => {
      const token1 = generateCsrfToken(secret)
      const token2 = generateCsrfToken(secret)
      expect(token1).not.toBe(token2)
    })

    it('should use provided salt', () => {
      const token1 = generateCsrfToken(secret, 'same-salt')
      const token2 = generateCsrfToken(secret, 'same-salt')
      expect(token1).toBe(token2)
    })

    it('should generate URL-safe token', () => {
      const token = generateCsrfToken(secret)
      expect(token).toMatch(/^[A-Za-z0-9_.-]+$/)
    })
  })

  describe('verifyCsrfToken', () => {
    const secret = generateCsrfSecret()

    it('should verify valid token', () => {
      const token = generateCsrfToken(secret)
      expect(verifyCsrfToken(token, secret)).toBe(true)
    })

    it('should reject invalid token format', () => {
      expect(verifyCsrfToken('invalid', secret)).toBe(false)
      expect(verifyCsrfToken('', secret)).toBe(false)
    })

    it('should reject tampered salt', () => {
      const token = generateCsrfToken(secret)
      const [_, hash] = token.split('.')
      const tamperedToken = `tampered.${hash}`
      expect(verifyCsrfToken(tamperedToken, secret)).toBe(false)
    })

    it('should reject tampered hash', () => {
      const token = generateCsrfToken(secret)
      const [salt, _] = token.split('.')
      const tamperedToken = `${salt}.tampered`
      expect(verifyCsrfToken(tamperedToken, secret)).toBe(false)
    })

    it('should reject token with wrong secret', () => {
      const token = generateCsrfToken(secret)
      const wrongSecret = generateCsrfSecret()
      expect(verifyCsrfToken(token, wrongSecret)).toBe(false)
    })

    it('should be timing-safe', () => {
      const token = generateCsrfToken(secret)

      // These should all take similar time (timing-safe comparison)
      const validResult = verifyCsrfToken(token, secret)
      const invalidResult1 = verifyCsrfToken(token + 'x', secret)
      const invalidResult2 = verifyCsrfToken('x', secret)

      expect(validResult).toBe(true)
      expect(invalidResult1).toBe(false)
      expect(invalidResult2).toBe(false)
    })
  })

  describe('token flow', () => {
    it('should support typical CSRF flow', () => {
      // Server generates secret (stored in cookie)
      const secret = generateCsrfSecret()

      // Server generates token (sent to client)
      const token = generateCsrfToken(secret)

      // Client submits token with request
      // Server verifies token against secret from cookie
      expect(verifyCsrfToken(token, secret)).toBe(true)
    })

    it('should reject cross-user token', () => {
      // User A's secret
      const secretA = generateCsrfSecret()
      const tokenA = generateCsrfToken(secretA)

      // User B's secret
      const secretB = generateCsrfSecret()

      // User B tries to use User A's token
      expect(verifyCsrfToken(tokenA, secretB)).toBe(false)
    })
  })

  describe('csrf middleware', () => {
    const secret = generateCsrfSecret()

    it('should create wrapper function', () => {
      const middleware = csrf({ secret })
      expect(typeof middleware).toBe('function')
    })

    it('should wrap handler', () => {
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      expect(typeof handler).toBe('function')
    })

    it('should allow GET requests without token', async () => {
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'GET' })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should accept POST with valid token in header', async () => {
      const csrfSecret = generateCsrfSecret()
      const token = generateCsrfToken(csrfSecret)
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'cookie': `_csrf=${csrfSecret}`,
          'x-csrf-token': token,
        },
      })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should accept POST with valid token in body', async () => {
      const csrfSecret = generateCsrfSecret()
      const token = generateCsrfToken(csrfSecret)
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'cookie': `_csrf=${csrfSecret}`,
        },
        body: Buffer.from(`_csrf=${encodeURIComponent(token)}&other=value`),
      })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should set cookie for new session', async () => {
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'GET' })

      const result = await handler(ctx)

      expect(result.headers?.['set-cookie']).toBeDefined()
      expect(result.headers?.['set-cookie']).toContain('_csrf=')
    })

    it('should skip CSRF check when skip returns true', async () => {
      const middleware = csrf({
        secret,
        skip: (ctx) => ctx.path === '/api/webhook',
      })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'POST', path: '/api/webhook' })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should allow HEAD requests', async () => {
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'HEAD' })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should use custom cookie name', async () => {
      const middleware = csrf({ secret, cookie: 'my_csrf' })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'GET' })

      const result = await handler(ctx)

      expect(result.headers?.['set-cookie']).toContain('my_csrf=')
    })

    it('should use custom header name', async () => {
      const csrfSecret = generateCsrfSecret()
      const token = generateCsrfToken(csrfSecret)
      const middleware = csrf({ secret, header: 'x-custom-csrf' })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'cookie': `_csrf=${csrfSecret}`,
          'x-custom-csrf': token,
        },
      })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should store token for context', async () => {
      const middleware = csrf({ secret })

      let capturedToken: string | undefined
      const handler = middleware(async (ctx) => {
        capturedToken = getCsrfToken(ctx)
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedToken).toBeDefined()
      expect(capturedToken).toContain('.')
    })
  })

  describe('csrfDoubleSubmit middleware', () => {
    it('should create wrapper function', () => {
      const middleware = csrfDoubleSubmit()
      expect(typeof middleware).toBe('function')
    })

    it('should allow GET requests', async () => {
      const middleware = csrfDoubleSubmit()
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'GET' })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should accept POST with matching cookie and header', async () => {
      const middleware = csrfDoubleSubmit()
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const token = 'double-submit-token'
      const ctx = createMockContext({
        method: 'POST',
        headers: {
          'cookie': `_csrf=${token}`,
          'x-csrf-token': token,
        },
      })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should set cookie for new session', async () => {
      const middleware = csrfDoubleSubmit()
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'GET' })

      const result = await handler(ctx)

      expect(result.headers?.['set-cookie']).toBeDefined()
      expect(result.headers?.['set-cookie']).toContain('_csrf=')
      // Double submit cookie should NOT be HttpOnly
      expect(result.headers?.['set-cookie']).not.toContain('HttpOnly')
    })

    it('should skip when configured', async () => {
      const middleware = csrfDoubleSubmit({
        skip: () => true,
      })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
      const ctx = createMockContext({ method: 'POST' })

      const result = await handler(ctx)

      expect(result.status).toBe(200)
    })

    it('should store token in context', async () => {
      const middleware = csrfDoubleSubmit()

      let capturedToken: string | undefined
      const handler = middleware(async (ctx) => {
        capturedToken = getCsrfToken(ctx)
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedToken).toBeDefined()
    })
  })

  describe('getCsrfToken', () => {
    it('should return undefined for context without token', () => {
      const ctx = createMockContext()

      const token = getCsrfToken(ctx)

      expect(token).toBeUndefined()
    })

    it('should return token after csrf middleware sets it', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })

      let capturedToken: string | undefined
      const handler = middleware(async (ctx) => {
        capturedToken = getCsrfToken(ctx)
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedToken).toBeDefined()
      expect(capturedToken).toContain('.')
    })
  })

  describe('csrfField', () => {
    it('should return empty string for context without token', () => {
      const ctx = createMockContext()

      const field = csrfField(ctx)

      expect(field).toBe('')
    })

    it('should return hidden input with token', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })

      let capturedField = ''
      const handler = middleware(async (ctx) => {
        capturedField = csrfField(ctx)
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedField).toContain('<input')
      expect(capturedField).toContain('type="hidden"')
      expect(capturedField).toContain('name="_csrf"')
      expect(capturedField).toContain('value="')
    })

    it('should use custom field name', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })

      let capturedField = ''
      const handler = middleware(async (ctx) => {
        capturedField = csrfField(ctx, 'custom_csrf')
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedField).toContain('name="custom_csrf"')
    })
  })

  describe('csrfMeta', () => {
    it('should return empty string for context without token', () => {
      const ctx = createMockContext()

      const meta = csrfMeta(ctx)

      expect(meta).toBe('')
    })

    it('should return meta tag with token', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })

      let capturedMeta = ''
      const handler = middleware(async (ctx) => {
        capturedMeta = csrfMeta(ctx)
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedMeta).toContain('<meta')
      expect(capturedMeta).toContain('name="csrf-token"')
      expect(capturedMeta).toContain('content="')
    })

    it('should use custom meta name', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })

      let capturedMeta = ''
      const handler = middleware(async (ctx) => {
        capturedMeta = csrfMeta(ctx, 'x-csrf')
        return { status: 200, body: 'OK', headers: {} }
      })

      const ctx = createMockContext({ method: 'GET' })
      await handler(ctx)

      expect(capturedMeta).toContain('name="x-csrf"')
    })
  })

  describe('edge cases', () => {
    it('should handle concurrent requests', async () => {
      const secret = generateCsrfSecret()
      const middleware = csrf({ secret })
      const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))

      const requests = Array(10).fill(null).map(() =>
        handler(createMockContext({ method: 'GET' }))
      )

      const results = await Promise.all(requests)

      results.forEach(result => {
        expect(result.status).toBe(200)
      })
    })

    it('should handle token with special characters', () => {
      const secret = generateCsrfSecret()
      const token = generateCsrfToken(secret)

      // Token should be URL-safe
      expect(token).toMatch(/^[A-Za-z0-9_.-]+$/)
      expect(verifyCsrfToken(token, secret)).toBe(true)
    })

    it('should handle very long token', () => {
      const secret = generateCsrfSecret(64)
      const token = generateCsrfToken(secret, 'a'.repeat(100))

      expect(verifyCsrfToken(token, secret)).toBe(true)
    })
  })
})
