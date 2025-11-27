/**
 * CSRF Protection Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  generateCsrfSecret,
  generateCsrfToken,
  verifyCsrfToken,
} from '../src/csrf'

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
})
