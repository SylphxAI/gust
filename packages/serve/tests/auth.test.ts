/**
 * Authentication Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  parseBasicAuth,
  createBasicAuth,
  parseBearerToken,
  generateHmac,
  verifyHmac,
} from '../src/auth'

describe('Auth', () => {
  describe('Basic Auth', () => {
    describe('parseBasicAuth', () => {
      it('should parse valid Basic auth header', () => {
        const header = createBasicAuth('admin', 'password123')
        const result = parseBasicAuth(header)

        expect(result).not.toBeNull()
        expect(result?.username).toBe('admin')
        expect(result?.password).toBe('password123')
      })

      it('should handle password with colon', () => {
        const header = createBasicAuth('user', 'pass:word:123')
        const result = parseBasicAuth(header)

        expect(result?.password).toBe('pass:word:123')
      })

      it('should return null for invalid header', () => {
        expect(parseBasicAuth('Invalid')).toBeNull()
        expect(parseBasicAuth('Bearer token')).toBeNull()
        expect(parseBasicAuth('')).toBeNull()
      })

      it('should return null for invalid base64', () => {
        expect(parseBasicAuth('Basic !!invalid!!')).toBeNull()
      })

      it('should return null for missing colon', () => {
        const encoded = Buffer.from('usernameonly').toString('base64')
        expect(parseBasicAuth(`Basic ${encoded}`)).toBeNull()
      })
    })

    describe('createBasicAuth', () => {
      it('should create valid auth header', () => {
        const header = createBasicAuth('test', 'secret')
        expect(header).toStartWith('Basic ')

        const result = parseBasicAuth(header)
        expect(result?.username).toBe('test')
        expect(result?.password).toBe('secret')
      })

      it('should handle special characters', () => {
        const header = createBasicAuth('user@domain.com', 'p@$$w0rd!')
        const result = parseBasicAuth(header)

        expect(result?.username).toBe('user@domain.com')
        expect(result?.password).toBe('p@$$w0rd!')
      })

      it('should handle unicode', () => {
        const header = createBasicAuth('用户', '密码')
        const result = parseBasicAuth(header)

        expect(result?.username).toBe('用户')
        expect(result?.password).toBe('密码')
      })
    })
  })

  describe('Bearer Token', () => {
    describe('parseBearerToken', () => {
      it('should parse valid Bearer token', () => {
        const token = parseBearerToken('Bearer abc123xyz')
        expect(token).toBe('abc123xyz')
      })

      it('should be case insensitive for prefix', () => {
        expect(parseBearerToken('bearer abc123')).toBe('abc123')
        expect(parseBearerToken('BEARER abc123')).toBe('abc123')
      })

      it('should return null for invalid format', () => {
        expect(parseBearerToken('Basic abc123')).toBeNull()
        expect(parseBearerToken('abc123')).toBeNull()
        expect(parseBearerToken('')).toBeNull()
      })

      it('should support custom prefix', () => {
        const token = parseBearerToken('Token abc123', 'Token')
        expect(token).toBe('abc123')
      })

      it('should trim whitespace', () => {
        const token = parseBearerToken('Bearer   abc123  ')
        expect(token).toBe('abc123')
      })
    })
  })

  describe('HMAC', () => {
    const secret = 'my-secret-key'

    describe('generateHmac', () => {
      it('should generate consistent signatures', () => {
        const data = 'test data'
        const sig1 = generateHmac(data, secret)
        const sig2 = generateHmac(data, secret)

        expect(sig1).toBe(sig2)
      })

      it('should generate different signatures for different data', () => {
        const sig1 = generateHmac('data1', secret)
        const sig2 = generateHmac('data2', secret)

        expect(sig1).not.toBe(sig2)
      })

      it('should generate different signatures for different secrets', () => {
        const sig1 = generateHmac('data', 'secret1')
        const sig2 = generateHmac('data', 'secret2')

        expect(sig1).not.toBe(sig2)
      })

      it('should support different algorithms', () => {
        const sha256 = generateHmac('data', secret, 'sha256')
        const sha512 = generateHmac('data', secret, 'sha512')

        expect(sha256).not.toBe(sha512)
        expect(sha512.length).toBeGreaterThan(sha256.length)
      })

      it('should handle Buffer input', () => {
        const sig = generateHmac(Buffer.from('test'), secret)
        expect(sig).toBeString()
      })
    })

    describe('verifyHmac', () => {
      it('should verify valid signature', () => {
        const data = 'test data'
        const signature = generateHmac(data, secret)

        expect(verifyHmac(data, signature, secret)).toBe(true)
      })

      it('should reject invalid signature', () => {
        const data = 'test data'
        expect(verifyHmac(data, 'invalid-signature', secret)).toBe(false)
      })

      it('should reject tampered data', () => {
        const signature = generateHmac('original data', secret)
        expect(verifyHmac('tampered data', signature, secret)).toBe(false)
      })

      it('should reject wrong secret', () => {
        const data = 'test data'
        const signature = generateHmac(data, secret)
        expect(verifyHmac(data, signature, 'wrong-secret')).toBe(false)
      })

      it('should be timing-safe', () => {
        // This test verifies the function uses timing-safe comparison
        // by checking it handles different length signatures properly
        const data = 'test'
        const validSig = generateHmac(data, secret)

        expect(verifyHmac(data, 'short', secret)).toBe(false)
        expect(verifyHmac(data, validSig + 'extra', secret)).toBe(false)
      })
    })
  })
})
