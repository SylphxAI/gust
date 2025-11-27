/**
 * CORS Tests - Comprehensive edge case coverage
 */

import { describe, it, expect } from 'bun:test'
import { cors, simpleCors } from '../src/cors'
import { text } from '@aspect/serve-core'

const createMockContext = (method: string, headers: Record<string, string> = {}): any => ({
  method,
  path: '/test',
  query: '',
  headers,
  body: Buffer.alloc(0),
})

describe('CORS', () => {
  describe('cors middleware', () => {
    it('should add CORS headers to response', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should handle preflight OPTIONS request', async () => {
      const middleware = cors({ origin: '*', methods: ['GET', 'POST'] })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
      }))

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-methods']).toContain('GET')
      expect(res.headers['access-control-allow-methods']).toContain('POST')
    })

    it('should handle specific origin string', async () => {
      const middleware = cors({ origin: 'https://example.com' })
      const handler = middleware(() => text('ok'))

      // Matching origin
      const res1 = await handler(createMockContext('GET', {
        origin: 'https://example.com',
      }))
      expect(res1.headers['access-control-allow-origin']).toBe('https://example.com')

      // Non-matching origin
      const res2 = await handler(createMockContext('GET', {
        origin: 'https://other.com',
      }))
      expect(res2.headers['access-control-allow-origin']).toBeFalsy()
    })

    it('should check allowed origins array', async () => {
      const middleware = cors({
        origin: ['https://allowed.com', 'https://also-allowed.com'],
      })
      const handler = middleware(() => text('ok'))

      // Allowed origin
      const res1 = await handler(createMockContext('GET', {
        origin: 'https://allowed.com',
      }))
      expect(res1.headers['access-control-allow-origin']).toBe('https://allowed.com')

      // Second allowed origin
      const res2 = await handler(createMockContext('GET', {
        origin: 'https://also-allowed.com',
      }))
      expect(res2.headers['access-control-allow-origin']).toBe('https://also-allowed.com')

      // Not allowed origin
      const res3 = await handler(createMockContext('GET', {
        origin: 'https://not-allowed.com',
      }))
      expect(res3.headers['access-control-allow-origin']).toBeFalsy()
    })

    it('should handle credentials', async () => {
      const middleware = cors({ origin: '*', credentials: true })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('should set allowed headers', async () => {
      const middleware = cors({
        origin: '*',
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      }))

      expect(res.headers['access-control-allow-headers']).toContain('Content-Type')
      expect(res.headers['access-control-allow-headers']).toContain('Authorization')
      expect(res.headers['access-control-allow-headers']).toContain('X-Custom-Header')
    })

    it('should set exposed headers', async () => {
      const middleware = cors({
        origin: '*',
        exposedHeaders: ['X-Custom-Header', 'X-Another-Header'],
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-expose-headers']).toContain('X-Custom-Header')
      expect(res.headers['access-control-expose-headers']).toContain('X-Another-Header')
    })

    it('should set max age', async () => {
      const middleware = cors({ origin: '*', maxAge: 86400 })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'GET',
      }))

      expect(res.headers['access-control-max-age']).toBe('86400')
    })

    it('should add Vary header when origin is not wildcard', async () => {
      const middleware = cors({ origin: 'https://example.com' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {
        origin: 'https://example.com',
      }))

      expect(res.headers['vary']).toBe('Origin')
    })

    it('should not add Vary header for wildcard origin', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['vary']).toBeUndefined()
    })

    it('should handle preflight with all default methods', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'DELETE',
      }))

      const methods = res.headers['access-control-allow-methods']
      expect(methods).toContain('GET')
      expect(methods).toContain('POST')
      expect(methods).toContain('PUT')
      expect(methods).toContain('DELETE')
      expect(methods).toContain('PATCH')
    })

    it('should pass through non-preflight OPTIONS request', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('options response'))

      // OPTIONS without access-control-request-method is not a preflight
      const res = await handler(createMockContext('OPTIONS', {}))

      expect(res.body).toBe('options response')
    })

    it('should disable preflight handling when preflight: false', async () => {
      const middleware = cors({ origin: '*', preflight: false })
      const handler = middleware(() => text('handled'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
      }))

      expect(res.body).toBe('handled')
      expect(res.status).toBe(200)
    })
  })

  describe('simpleCors', () => {
    it('should allow all origins', async () => {
      const middleware = simpleCors()
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should include default methods', async () => {
      const middleware = simpleCors()
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
      }))

      const methods = res.headers['access-control-allow-methods']
      expect(methods).toContain('GET')
      expect(methods).toContain('POST')
    })

    it('should include default allowed headers', async () => {
      const middleware = simpleCors()
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
      }))

      const headers = res.headers['access-control-allow-headers']
      expect(headers).toContain('Content-Type')
      expect(headers).toContain('Authorization')
    })
  })

  describe('origin function', () => {
    it('should handle origin function returning true', async () => {
      const middleware = cors({
        origin: (origin) => origin?.endsWith('.example.com') ?? false,
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {
        origin: 'https://sub.example.com',
      }))
      expect(res.headers['access-control-allow-origin']).toBe('https://sub.example.com')
    })

    it('should handle origin function returning false', async () => {
      const middleware = cors({
        origin: (origin) => origin?.endsWith('.example.com') ?? false,
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {
        origin: 'https://evil.com',
      }))
      expect(res.headers['access-control-allow-origin']).toBeFalsy()
    })

    it('should handle complex origin validation function', async () => {
      const allowedDomains = ['example.com', 'test.org']
      const middleware = cors({
        origin: (origin) => {
          if (!origin) return false
          try {
            const url = new URL(origin)
            return allowedDomains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))
          } catch {
            return false
          }
        },
      })
      const handler = middleware(() => text('ok'))

      // Exact match
      const res1 = await handler(createMockContext('GET', { origin: 'https://example.com' }))
      expect(res1.headers['access-control-allow-origin']).toBe('https://example.com')

      // Subdomain match
      const res2 = await handler(createMockContext('GET', { origin: 'https://api.example.com' }))
      expect(res2.headers['access-control-allow-origin']).toBe('https://api.example.com')

      // Different allowed domain
      const res3 = await handler(createMockContext('GET', { origin: 'https://test.org' }))
      expect(res3.headers['access-control-allow-origin']).toBe('https://test.org')

      // Not allowed
      const res4 = await handler(createMockContext('GET', { origin: 'https://malicious.com' }))
      expect(res4.headers['access-control-allow-origin']).toBeFalsy()
    })
  })

  describe('edge cases', () => {
    it('should handle missing origin header', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {}))
      expect(res.body).toBe('ok')
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should handle empty origin header', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', { origin: '' }))
      expect(res.body).toBe('ok')
    })

    it('should handle empty methods array', async () => {
      const middleware = cors({ origin: '*', methods: [] })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'GET',
      }))

      expect(res.status).toBe(204)
      expect(res.headers['access-control-allow-methods']).toBe('')
    })

    it('should handle empty allowedHeaders array', async () => {
      const middleware = cors({ origin: '*', allowedHeaders: [] })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
      }))

      expect(res.headers['access-control-allow-headers']).toBe('')
    })

    it('should handle empty exposedHeaders array', async () => {
      const middleware = cors({ origin: '*', exposedHeaders: [] })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-expose-headers']).toBeUndefined()
    })

    it('should handle maxAge of 0', async () => {
      const middleware = cors({ origin: '*', maxAge: 0 })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'GET',
      }))

      expect(res.headers['access-control-max-age']).toBe('0')
    })

    it('should merge CORS headers with existing response headers', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => ({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'custom-value',
        },
        body: '{"ok":true}',
      }))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['content-type']).toBe('application/json')
      expect(res.headers['x-custom-header']).toBe('custom-value')
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should handle async handler', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(async () => {
        await new Promise(r => setTimeout(r, 10))
        return text('async ok')
      })

      const res = await handler(createMockContext('GET'))
      expect(res.body).toBe('async ok')
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should handle handler throwing error', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => {
        throw new Error('Handler error')
      })

      await expect(handler(createMockContext('GET'))).rejects.toThrow('Handler error')
    })

    it('should handle all HTTP methods in preflight', async () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
      const middleware = cors({ origin: '*', methods })
      const handler = middleware(() => text('ok'))

      for (const method of methods) {
        const res = await handler(createMockContext('OPTIONS', {
          'access-control-request-method': method,
        }))
        expect(res.status).toBe(204)
        expect(res.headers['access-control-allow-methods']).toContain(method)
      }
    })

    it('should handle single origin in array', async () => {
      const middleware = cors({ origin: ['https://only.com'] })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {
        origin: 'https://only.com',
      }))
      expect(res.headers['access-control-allow-origin']).toBe('https://only.com')
    })

    it('should handle many origins in array', async () => {
      const origins = Array.from({ length: 100 }, (_, i) => `https://origin${i}.com`)
      const middleware = cors({ origin: origins })
      const handler = middleware(() => text('ok'))

      // Test first origin
      const res1 = await handler(createMockContext('GET', { origin: 'https://origin0.com' }))
      expect(res1.headers['access-control-allow-origin']).toBe('https://origin0.com')

      // Test last origin
      const res2 = await handler(createMockContext('GET', { origin: 'https://origin99.com' }))
      expect(res2.headers['access-control-allow-origin']).toBe('https://origin99.com')

      // Test not in list
      const res3 = await handler(createMockContext('GET', { origin: 'https://origin100.com' }))
      expect(res3.headers['access-control-allow-origin']).toBeFalsy()
    })

    it('should handle credentials with specific origin', async () => {
      const middleware = cors({
        origin: 'https://example.com',
        credentials: true,
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET', {
        origin: 'https://example.com',
      }))

      expect(res.headers['access-control-allow-origin']).toBe('https://example.com')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    })

    it('should handle default options', async () => {
      const middleware = cors()
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('GET'))
      expect(res.headers['access-control-allow-origin']).toBe('*')
    })

    it('should handle preflight for custom methods', async () => {
      const middleware = cors({
        origin: '*',
        methods: ['GET', 'POST', 'CUSTOMMETHOD'],
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'CUSTOMMETHOD',
      }))

      expect(res.headers['access-control-allow-methods']).toContain('CUSTOMMETHOD')
    })

    it('should handle case-sensitive headers', async () => {
      const middleware = cors({
        origin: '*',
        allowedHeaders: ['Content-Type', 'X-Custom-Header'],
      })
      const handler = middleware(() => text('ok'))

      const res = await handler(createMockContext('OPTIONS', {
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Content-Type, X-Custom-Header',
      }))

      expect(res.headers['access-control-allow-headers']).toContain('Content-Type')
      expect(res.headers['access-control-allow-headers']).toContain('X-Custom-Header')
    })
  })

  describe('response merging', () => {
    it('should not overwrite response status', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => ({
        status: 201,
        headers: {},
        body: 'created',
      }))

      const res = await handler(createMockContext('POST'))
      expect(res.status).toBe(201)
    })

    it('should preserve response body', async () => {
      const middleware = cors({ origin: '*' })
      const handler = middleware(() => ({
        status: 200,
        headers: {},
        body: JSON.stringify({ data: 'test' }),
      }))

      const res = await handler(createMockContext('GET'))
      expect(res.body).toBe('{"data":"test"}')
    })
  })
})
