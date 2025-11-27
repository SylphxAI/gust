/**
 * JWT (JSON Web Token) Helper
 * High-performance JWT creation and verification
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Context } from './context'
import type { ServerResponse, Handler, Wrapper } from '@aspect/serve-core'
import { response } from '@aspect/serve-core'

// ============================================================================
// Types
// ============================================================================

export type JwtHeader = {
  alg: 'HS256' | 'HS384' | 'HS512'
  typ: 'JWT'
}

export type JwtPayload = {
  /** Subject (user ID) */
  sub?: string
  /** Issuer */
  iss?: string
  /** Audience */
  aud?: string | string[]
  /** Expiration time (Unix timestamp) */
  exp?: number
  /** Not before (Unix timestamp) */
  nbf?: number
  /** Issued at (Unix timestamp) */
  iat?: number
  /** JWT ID */
  jti?: string
  /** Custom claims */
  [key: string]: unknown
}

export type JwtOptions = {
  /** Secret key for signing */
  readonly secret: string
  /** Algorithm (default: HS256) */
  readonly algorithm?: 'HS256' | 'HS384' | 'HS512'
  /** Token expiration in seconds (default: 1 hour) */
  readonly expiresIn?: number
  /** Issuer */
  readonly issuer?: string
  /** Audience */
  readonly audience?: string | string[]
}

export type VerifyOptions = {
  /** Secret key */
  readonly secret: string
  /** Expected algorithms */
  readonly algorithms?: ('HS256' | 'HS384' | 'HS512')[]
  /** Expected issuer */
  readonly issuer?: string
  /** Expected audience */
  readonly audience?: string | string[]
  /** Clock tolerance in seconds (default: 0) */
  readonly clockTolerance?: number
  /** Ignore expiration */
  readonly ignoreExpiration?: boolean
}

export type JwtResult<T = JwtPayload> =
  | { valid: true; payload: T; header: JwtHeader }
  | { valid: false; error: string }

// ============================================================================
// Base64URL Encoding (RFC 7515)
// ============================================================================

const base64UrlEncode = (data: string | Buffer): string => {
  const base64 = Buffer.from(data).toString('base64')
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const base64UrlDecode = (str: string): Buffer => {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return Buffer.from(base64, 'base64')
}

// ============================================================================
// HMAC Algorithms
// ============================================================================

const algorithms: Record<string, string> = {
  HS256: 'sha256',
  HS384: 'sha384',
  HS512: 'sha512',
}

const sign = (data: string, secret: string, alg: string): string => {
  const algorithm = algorithms[alg]
  if (!algorithm) throw new Error(`Unsupported algorithm: ${alg}`)
  return createHmac(algorithm, secret).update(data).digest('base64url')
}

const verifySignature = (
  data: string,
  signature: string,
  secret: string,
  alg: string
): boolean => {
  const expected = sign(data, secret, alg)
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length) return false
  return timingSafeEqual(sigBuf, expBuf)
}

// ============================================================================
// JWT Functions
// ============================================================================

/**
 * Create a JWT token
 */
export const createJwt = (payload: JwtPayload, options: JwtOptions): string => {
  const { secret, algorithm = 'HS256', expiresIn = 3600, issuer, audience } = options

  const now = Math.floor(Date.now() / 1000)

  const header: JwtHeader = {
    alg: algorithm,
    typ: 'JWT',
  }

  const claims: JwtPayload = {
    ...payload,
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + expiresIn,
  }

  if (issuer) claims.iss = issuer
  if (audience) claims.aud = audience

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(claims))
  const signature = sign(`${headerB64}.${payloadB64}`, secret, algorithm)

  return `${headerB64}.${payloadB64}.${signature}`
}

/**
 * Verify and decode a JWT token
 */
export const verifyJwt = <T extends JwtPayload = JwtPayload>(
  token: string,
  options: VerifyOptions
): JwtResult<T> => {
  const {
    secret,
    algorithms: allowedAlgs = ['HS256', 'HS384', 'HS512'],
    issuer,
    audience,
    clockTolerance = 0,
    ignoreExpiration = false,
  } = options

  // Split token
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { valid: false, error: 'Invalid token format' }
  }

  const [headerB64, payloadB64, signature] = parts

  // Decode header
  let header: JwtHeader
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf-8'))
  } catch {
    return { valid: false, error: 'Invalid header' }
  }

  // Check algorithm
  if (!allowedAlgs.includes(header.alg)) {
    return { valid: false, error: `Algorithm ${header.alg} not allowed` }
  }

  // Verify signature
  if (!verifySignature(`${headerB64}.${payloadB64}`, signature, secret, header.alg)) {
    return { valid: false, error: 'Invalid signature' }
  }

  // Decode payload
  let payload: T
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8'))
  } catch {
    return { valid: false, error: 'Invalid payload' }
  }

  const now = Math.floor(Date.now() / 1000)

  // Check expiration
  if (!ignoreExpiration && payload.exp !== undefined) {
    if (now > payload.exp + clockTolerance) {
      return { valid: false, error: 'Token expired' }
    }
  }

  // Check not before
  if (payload.nbf !== undefined) {
    if (now < payload.nbf - clockTolerance) {
      return { valid: false, error: 'Token not yet valid' }
    }
  }

  // Check issuer
  if (issuer && payload.iss !== issuer) {
    return { valid: false, error: 'Invalid issuer' }
  }

  // Check audience
  if (audience) {
    const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    const expectedAud = Array.isArray(audience) ? audience : [audience]
    const hasAud = expectedAud.some((a) => tokenAud.includes(a))
    if (!hasAud) {
      return { valid: false, error: 'Invalid audience' }
    }
  }

  return { valid: true, payload, header }
}

/**
 * Decode JWT without verification (unsafe - for debugging only)
 */
export const decodeJwt = <T extends JwtPayload = JwtPayload>(
  token: string
): { header: JwtHeader; payload: T } | null => {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf-8'))
    const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf-8'))

    return { header, payload }
  } catch {
    return null
  }
}

/**
 * Check if token is expired (without full verification)
 */
export const isJwtExpired = (token: string): boolean => {
  const decoded = decodeJwt(token)
  if (!decoded) return true
  if (!decoded.payload.exp) return false
  return Date.now() / 1000 > decoded.payload.exp
}

// ============================================================================
// Middleware
// ============================================================================

// Store JWT payload in context
const jwtPayloadMap = new WeakMap<Context, JwtPayload>()

/**
 * Get JWT payload from context
 */
export const getJwtPayload = <T extends JwtPayload = JwtPayload>(ctx: Context): T | undefined => {
  return jwtPayloadMap.get(ctx) as T | undefined
}

export type JwtAuthOptions = {
  /** Secret key */
  readonly secret: string
  /** Allowed algorithms */
  readonly algorithms?: ('HS256' | 'HS384' | 'HS512')[]
  /** Expected issuer */
  readonly issuer?: string
  /** Expected audience */
  readonly audience?: string | string[]
  /** Clock tolerance in seconds */
  readonly clockTolerance?: number
  /** Skip auth for certain requests */
  readonly skip?: (ctx: Context) => boolean
  /** Custom error response */
  readonly onError?: (ctx: Context, error: string) => ServerResponse
  /** Get token from request (default: Authorization Bearer) */
  readonly getToken?: (ctx: Context) => string | null
}

/**
 * JWT authentication middleware
 */
export const jwtAuth = (options: JwtAuthOptions): Wrapper<Context> => {
  const {
    secret,
    algorithms = ['HS256'],
    issuer,
    audience,
    clockTolerance = 0,
    skip,
    onError,
    getToken,
  } = options

  const defaultGetToken = (ctx: Context): string | null => {
    const auth = ctx.headers['authorization']
    if (!auth?.toLowerCase().startsWith('bearer ')) return null
    return auth.slice(7).trim()
  }

  const tokenGetter = getToken ?? defaultGetToken

  const errorResponse = onError ?? ((_, error) =>
    response(JSON.stringify({ error: 'Unauthorized', message: error }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })
  )

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      if (skip?.(ctx)) {
        return handler(ctx)
      }

      const token = tokenGetter(ctx)
      if (!token) {
        return errorResponse(ctx, 'Missing token')
      }

      const result = verifyJwt(token, {
        secret,
        algorithms,
        issuer,
        audience,
        clockTolerance,
      })

      if (!result.valid) {
        return errorResponse(ctx, result.error)
      }

      // Store payload for later access
      jwtPayloadMap.set(ctx, result.payload)

      return handler(ctx)
    }
  }
}

/**
 * Optional JWT - validates if present, continues if not
 */
export const optionalJwt = (options: Omit<JwtAuthOptions, 'skip'>): Wrapper<Context> => {
  const {
    secret,
    algorithms = ['HS256'],
    issuer,
    audience,
    clockTolerance = 0,
    getToken,
  } = options

  const defaultGetToken = (ctx: Context): string | null => {
    const auth = ctx.headers['authorization']
    if (!auth?.toLowerCase().startsWith('bearer ')) return null
    return auth.slice(7).trim()
  }

  const tokenGetter = getToken ?? defaultGetToken

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      const token = tokenGetter(ctx)

      if (token) {
        const result = verifyJwt(token, {
          secret,
          algorithms,
          issuer,
          audience,
          clockTolerance,
        })

        if (result.valid) {
          jwtPayloadMap.set(ctx, result.payload)
        }
      }

      return handler(ctx)
    }
  }
}
