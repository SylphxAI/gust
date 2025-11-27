/**
 * Cookie Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  parseCookies,
  serializeCookie,
  deleteCookie,
  getCookies,
  getCookie,
  setCookie,
  setCookies,
} from '../src/cookie'

describe('Cookie', () => {
  describe('parseCookies', () => {
    it('should parse single cookie', () => {
      const cookies = parseCookies('name=value')
      expect(cookies).toEqual({ name: 'value' })
    })

    it('should parse multiple cookies', () => {
      const cookies = parseCookies('name=value; session=abc123; theme=dark')
      expect(cookies).toEqual({
        name: 'value',
        session: 'abc123',
        theme: 'dark',
      })
    })

    it('should handle URL encoded values', () => {
      const cookies = parseCookies('data=%7B%22key%22%3A%22value%22%7D')
      expect(cookies.data).toBe('{"key":"value"}')
    })

    it('should handle empty string', () => {
      const cookies = parseCookies('')
      expect(cookies).toEqual({})
    })

    it('should handle spaces', () => {
      const cookies = parseCookies('  name  =  value  ;  other  =  data  ')
      expect(cookies.name).toBe('value')
      expect(cookies.other).toBe('data')
    })

    it('should handle values with equals sign', () => {
      const cookies = parseCookies('token=abc=123=xyz')
      expect(cookies.token).toBe('abc=123=xyz')
    })

    it('should handle empty values', () => {
      const cookies = parseCookies('empty=; other=value')
      expect(cookies.empty).toBe('')
      expect(cookies.other).toBe('value')
    })
  })

  describe('serializeCookie', () => {
    it('should serialize basic cookie', () => {
      const cookie = serializeCookie('name', 'value')
      expect(cookie).toBe('name=value')
    })

    it('should URL encode value', () => {
      const cookie = serializeCookie('data', '{"key":"value"}')
      expect(cookie).toContain('%7B')
    })

    it('should add HttpOnly', () => {
      const cookie = serializeCookie('name', 'value', { httpOnly: true })
      expect(cookie).toContain('HttpOnly')
    })

    it('should add Secure', () => {
      const cookie = serializeCookie('name', 'value', { secure: true })
      expect(cookie).toContain('Secure')
    })

    it('should add SameSite', () => {
      const strict = serializeCookie('name', 'value', { sameSite: 'strict' })
      expect(strict.toLowerCase()).toContain('samesite=strict')

      const lax = serializeCookie('name', 'value', { sameSite: 'lax' })
      expect(lax.toLowerCase()).toContain('samesite=lax')

      const none = serializeCookie('name', 'value', { sameSite: 'none' })
      expect(none.toLowerCase()).toContain('samesite=none')
    })

    it('should add MaxAge', () => {
      const cookie = serializeCookie('name', 'value', { maxAge: 3600 })
      expect(cookie).toContain('Max-Age=3600')
    })

    it('should add Expires', () => {
      const expires = new Date('2025-01-01T00:00:00Z')
      const cookie = serializeCookie('name', 'value', { expires })
      expect(cookie).toContain('Expires=')
      expect(cookie).toContain('2025')
    })

    it('should add Domain', () => {
      const cookie = serializeCookie('name', 'value', { domain: 'example.com' })
      expect(cookie).toContain('Domain=example.com')
    })

    it('should add Path', () => {
      const cookie = serializeCookie('name', 'value', { path: '/api' })
      expect(cookie).toContain('Path=/api')
    })

    it('should combine all options', () => {
      const cookie = serializeCookie('session', 'abc123', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 86400,
        path: '/',
        domain: 'example.com',
      })

      expect(cookie).toContain('session=abc123')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie.toLowerCase()).toContain('samesite=strict')
      expect(cookie).toContain('Max-Age=86400')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Domain=example.com')
    })
  })

  describe('deleteCookie', () => {
    it('should create expired cookie', () => {
      const cookie = deleteCookie('session')
      expect(cookie).toContain('session=')
      expect(cookie).toContain('Max-Age=0')
    })

    it('should preserve path and domain', () => {
      const cookie = deleteCookie('session', { path: '/api', domain: 'example.com' })
      expect(cookie).toContain('Path=/api')
      expect(cookie).toContain('Domain=example.com')
    })

    it('should set Expires to epoch', () => {
      const cookie = deleteCookie('session')
      expect(cookie).toContain('Expires=Thu, 01 Jan 1970')
    })
  })

  describe('getCookies', () => {
    it('should get cookies from headers object', () => {
      const headers = { cookie: 'name=value; session=abc123' }
      const cookies = getCookies(headers)

      expect(cookies.name).toBe('value')
      expect(cookies.session).toBe('abc123')
    })

    it('should return empty object when no cookie header', () => {
      const headers = {}
      const cookies = getCookies(headers)

      expect(cookies).toEqual({})
    })

    it('should handle empty cookie header', () => {
      const headers = { cookie: '' }
      const cookies = getCookies(headers)

      expect(cookies).toEqual({})
    })

    it('should work with complex headers object', () => {
      const headers = {
        'content-type': 'application/json',
        'cookie': 'auth=token123',
        'accept': 'text/html',
      }
      const cookies = getCookies(headers)

      expect(cookies.auth).toBe('token123')
    })
  })

  describe('getCookie', () => {
    it('should get specific cookie by name', () => {
      const headers = { cookie: 'name=value; session=abc123' }

      expect(getCookie(headers, 'name')).toBe('value')
      expect(getCookie(headers, 'session')).toBe('abc123')
    })

    it('should return undefined for non-existent cookie', () => {
      const headers = { cookie: 'name=value' }

      expect(getCookie(headers, 'missing')).toBeUndefined()
    })

    it('should return undefined when no cookie header', () => {
      const headers = {}

      expect(getCookie(headers, 'name')).toBeUndefined()
    })

    it('should handle URL encoded values', () => {
      const headers = { cookie: 'data=%7B%22key%22%3A%22value%22%7D' }

      expect(getCookie(headers, 'data')).toBe('{"key":"value"}')
    })
  })

  describe('setCookie', () => {
    it('should be alias for serializeCookie', () => {
      const cookie1 = setCookie('name', 'value')
      const cookie2 = serializeCookie('name', 'value')

      expect(cookie1).toBe(cookie2)
    })

    it('should accept all options', () => {
      const cookie = setCookie('session', 'token', {
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        maxAge: 3600,
        path: '/',
        domain: 'example.com',
      })

      expect(cookie).toContain('session=token')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Max-Age=3600')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Domain=example.com')
    })

    it('should handle special characters in value', () => {
      const cookie = setCookie('data', '{"key":"value"}')

      expect(cookie).toContain('%7B')
      expect(cookie).toContain('%7D')
    })
  })

  describe('setCookies', () => {
    it('should create multiple Set-Cookie headers', () => {
      const cookies = setCookies([
        { name: 'session', value: 'abc123', httpOnly: true },
        { name: 'theme', value: 'dark' },
        { name: 'lang', value: 'en', path: '/' },
      ])

      expect(cookies).toHaveLength(3)
      expect(cookies[0]).toContain('session=abc123')
      expect(cookies[0]).toContain('HttpOnly')
      expect(cookies[1]).toContain('theme=dark')
      expect(cookies[2]).toContain('lang=en')
      expect(cookies[2]).toContain('Path=/')
    })

    it('should return empty array for empty input', () => {
      const cookies = setCookies([])

      expect(cookies).toEqual([])
    })

    it('should handle single cookie', () => {
      const cookies = setCookies([
        { name: 'single', value: 'cookie' },
      ])

      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toBe('single=cookie')
    })

    it('should apply all options to each cookie', () => {
      const expires = new Date('2025-12-31')
      const cookies = setCookies([
        {
          name: 'auth',
          value: 'token',
          httpOnly: true,
          secure: true,
          sameSite: 'Strict',
          expires,
          domain: 'example.com',
          path: '/api',
        },
      ])

      const cookie = cookies[0]
      expect(cookie).toContain('auth=token')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Strict')
      expect(cookie).toContain('Expires=')
      expect(cookie).toContain('Domain=example.com')
      expect(cookie).toContain('Path=/api')
    })
  })

  describe('partitioned attribute (CHIPS)', () => {
    it('should add Partitioned attribute', () => {
      const cookie = serializeCookie('name', 'value', { partitioned: true })
      expect(cookie).toContain('Partitioned')
    })

    it('should not add Partitioned when false', () => {
      const cookie = serializeCookie('name', 'value', { partitioned: false })
      expect(cookie).not.toContain('Partitioned')
    })

    it('should combine Partitioned with other attributes', () => {
      const cookie = serializeCookie('__Host-session', 'value', {
        secure: true,
        httpOnly: true,
        sameSite: 'None',
        path: '/',
        partitioned: true,
      })

      expect(cookie).toContain('Secure')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=None')
      expect(cookie).toContain('Path=/')
      expect(cookie).toContain('Partitioned')
    })
  })

  describe('edge cases', () => {
    it('should handle cookie name with underscores', () => {
      const cookies = parseCookies('my_cookie_name=value')
      expect(cookies['my_cookie_name']).toBe('value')
    })

    it('should handle cookie name with dashes', () => {
      const cookies = parseCookies('my-cookie-name=value')
      expect(cookies['my-cookie-name']).toBe('value')
    })

    it('should handle quoted values', () => {
      const cookies = parseCookies('name="quoted value"')
      expect(cookies['name']).toBe('quoted value')
    })

    it('should handle multiple equals in value', () => {
      const cookies = parseCookies('base64=abc==def===')
      expect(cookies['base64']).toBe('abc==def===')
    })

    it('should handle malformed decode gracefully', () => {
      // %ZZ is not valid percent encoding
      const cookies = parseCookies('bad=%ZZ')
      expect(cookies['bad']).toBe('%ZZ')
    })

    it('should handle very long cookie values', () => {
      const longValue = 'x'.repeat(4096)
      const cookie = serializeCookie('long', longValue)
      expect(cookie).toContain(`long=${longValue}`)
    })

    it('should handle unicode in cookie value', () => {
      const cookie = serializeCookie('greeting', '你好')
      // Should be URL encoded
      expect(cookie).toContain('%')

      // Should parse back correctly
      const parsed = parseCookies(cookie.split('=')[0] + '=' + cookie.split('=')[1].split(';')[0])
      expect(parsed['greeting']).toBe('你好')
    })

    it('should handle Date expires correctly', () => {
      const expires = new Date('2025-06-15T12:00:00Z')
      const cookie = serializeCookie('session', 'value', { expires })

      expect(cookie).toContain('Expires=Sun, 15 Jun 2025')
    })

    it('should handle maxAge of 0', () => {
      const cookie = serializeCookie('session', 'value', { maxAge: 0 })
      expect(cookie).toContain('Max-Age=0')
    })

    it('should handle negative maxAge', () => {
      const cookie = serializeCookie('session', 'value', { maxAge: -1 })
      expect(cookie).toContain('Max-Age=-1')
    })

    it('should preserve trailing semicolons in cookie header', () => {
      const cookies = parseCookies('name=value;')
      expect(cookies['name']).toBe('value')
    })

    it('should handle only semicolons', () => {
      const cookies = parseCookies(';;;')
      expect(cookies).toEqual({})
    })

    it('should handle no equals sign', () => {
      const cookies = parseCookies('name')
      expect(cookies).toEqual({})
    })
  })

  describe('SameSite variations', () => {
    it('should handle Strict', () => {
      const cookie = serializeCookie('name', 'value', { sameSite: 'Strict' })
      expect(cookie).toContain('SameSite=Strict')
    })

    it('should handle Lax', () => {
      const cookie = serializeCookie('name', 'value', { sameSite: 'Lax' })
      expect(cookie).toContain('SameSite=Lax')
    })

    it('should handle None', () => {
      const cookie = serializeCookie('name', 'value', { sameSite: 'None' })
      expect(cookie).toContain('SameSite=None')
    })

    it('should not add SameSite when undefined', () => {
      const cookie = serializeCookie('name', 'value', {})
      expect(cookie).not.toContain('SameSite')
    })
  })
})
