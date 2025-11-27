/**
 * Cookie Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  parseCookies,
  serializeCookie,
  deleteCookie,
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
  })
})
