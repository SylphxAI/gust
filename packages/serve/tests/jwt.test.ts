/**
 * JWT Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  createJwt,
  verifyJwt,
  decodeJwt,
  isJwtExpired,
} from '../src/jwt'

describe('JWT', () => {
  const secret = 'test-secret-key-32-chars-long!!'

  describe('createJwt', () => {
    it('should create a valid JWT', () => {
      const token = createJwt({ sub: 'user123' }, { secret })
      expect(token).toBeString()
      expect(token.split('.')).toHaveLength(3)
    })

    it('should include custom claims', () => {
      const token = createJwt({ sub: 'user123', role: 'admin' }, { secret })
      const decoded = decodeJwt(token)
      expect(decoded?.payload.sub).toBe('user123')
      expect(decoded?.payload.role).toBe('admin')
    })

    it('should set expiration', () => {
      const token = createJwt({ sub: 'user123' }, { secret, expiresIn: 3600 })
      const decoded = decodeJwt(token)
      expect(decoded?.payload.exp).toBeDefined()
      expect(decoded?.payload.iat).toBeDefined()
      expect(decoded!.payload.exp! - decoded!.payload.iat!).toBe(3600)
    })

    it('should set issuer and audience', () => {
      const token = createJwt(
        { sub: 'user123' },
        { secret, issuer: 'test-app', audience: 'api' }
      )
      const decoded = decodeJwt(token)
      expect(decoded?.payload.iss).toBe('test-app')
      expect(decoded?.payload.aud).toBe('api')
    })
  })

  describe('verifyJwt', () => {
    it('should verify valid token', () => {
      const token = createJwt({ sub: 'user123' }, { secret })
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.payload.sub).toBe('user123')
      }
    })

    it('should reject invalid signature', () => {
      const token = createJwt({ sub: 'user123' }, { secret })
      const result = verifyJwt(token, { secret: 'wrong-secret' })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid signature')
      }
    })

    it('should reject expired token', () => {
      const token = createJwt(
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) - 100 },
        { secret }
      )
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Token expired')
      }
    })

    it('should accept token within clock tolerance', () => {
      const token = createJwt(
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) - 5 },
        { secret }
      )
      const result = verifyJwt(token, { secret, clockTolerance: 10 })
      expect(result.valid).toBe(true)
    })

    it('should reject token not yet valid', () => {
      const token = createJwt(
        { sub: 'user123', nbf: Math.floor(Date.now() / 1000) + 1000 },
        { secret }
      )
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Token not yet valid')
      }
    })

    it('should verify issuer', () => {
      const token = createJwt({ sub: 'user123' }, { secret, issuer: 'app-a' })
      const result = verifyJwt(token, { secret, issuer: 'app-b' })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid issuer')
      }
    })

    it('should verify audience', () => {
      const token = createJwt({ sub: 'user123' }, { secret, audience: 'api-1' })
      const result = verifyJwt(token, { secret, audience: 'api-2' })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.error).toBe('Invalid audience')
      }
    })

    it('should reject invalid algorithm', () => {
      const token = createJwt({ sub: 'user123' }, { secret, algorithm: 'HS512' })
      const result = verifyJwt(token, { secret, algorithms: ['HS256'] })
      expect(result.valid).toBe(false)
    })
  })

  describe('decodeJwt', () => {
    it('should decode without verification', () => {
      const token = createJwt({ sub: 'user123', custom: 'data' }, { secret })
      const decoded = decodeJwt(token)
      expect(decoded).not.toBeNull()
      expect(decoded?.payload.sub).toBe('user123')
      expect(decoded?.payload.custom).toBe('data')
      expect(decoded?.header.alg).toBe('HS256')
      expect(decoded?.header.typ).toBe('JWT')
    })

    it('should return null for invalid token', () => {
      expect(decodeJwt('invalid')).toBeNull()
      expect(decodeJwt('a.b')).toBeNull()
      expect(decodeJwt('')).toBeNull()
    })
  })

  describe('isJwtExpired', () => {
    it('should return false for valid token', () => {
      const token = createJwt({ sub: 'user123' }, { secret, expiresIn: 3600 })
      expect(isJwtExpired(token)).toBe(false)
    })

    it('should return true for expired token', () => {
      const token = createJwt(
        { sub: 'user123', exp: Math.floor(Date.now() / 1000) - 100 },
        { secret }
      )
      expect(isJwtExpired(token)).toBe(true)
    })

    it('should return true for invalid token', () => {
      expect(isJwtExpired('invalid')).toBe(true)
    })
  })

  describe('algorithms', () => {
    it('should support HS256', () => {
      const token = createJwt({ sub: 'user' }, { secret, algorithm: 'HS256' })
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(true)
    })

    it('should support HS384', () => {
      const token = createJwt({ sub: 'user' }, { secret, algorithm: 'HS384' })
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(true)
    })

    it('should support HS512', () => {
      const token = createJwt({ sub: 'user' }, { secret, algorithm: 'HS512' })
      const result = verifyJwt(token, { secret })
      expect(result.valid).toBe(true)
    })
  })
})
