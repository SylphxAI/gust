/**
 * JWT Tests
 */

import { describe, expect, it } from 'bun:test'
import { createJwt, decodeJwt, getJwtPayload, isJwtExpired, jwtAuth, optionalJwt, verifyJwt } from '@sylphx/gust'

// Mock context
const createMockContext = (
	overrides: Partial<{
		method: string
		path: string
		headers: Record<string, string>
	}> = {}
): any => ({
	method: overrides.method ?? 'GET',
	path: overrides.path ?? '/',
	headers: overrides.headers ?? {},
	body: Buffer.alloc(0),
	params: {},
	query: '',
	socket: {},
	raw: Buffer.alloc(0),
	json: () => ({}),
})

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
			const token = createJwt({ sub: 'user123' }, { secret, issuer: 'test-app', audience: 'api' })
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
			const token = createJwt({ sub: 'user123', exp: Math.floor(Date.now() / 1000) - 100 }, { secret })
			const result = verifyJwt(token, { secret })
			expect(result.valid).toBe(false)
			if (!result.valid) {
				expect(result.error).toBe('Token expired')
			}
		})

		it('should accept token within clock tolerance', () => {
			const token = createJwt({ sub: 'user123', exp: Math.floor(Date.now() / 1000) - 5 }, { secret })
			const result = verifyJwt(token, { secret, clockTolerance: 10 })
			expect(result.valid).toBe(true)
		})

		it('should reject token not yet valid', () => {
			const token = createJwt({ sub: 'user123', nbf: Math.floor(Date.now() / 1000) + 1000 }, { secret })
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
			const token = createJwt({ sub: 'user123', exp: Math.floor(Date.now() / 1000) - 100 }, { secret })
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

	describe('jwtAuth middleware', () => {
		it('should create wrapper function', () => {
			const middleware = jwtAuth({ secret })
			expect(typeof middleware).toBe('function')
		})

		it('should allow valid token', async () => {
			const token = createJwt({ sub: 'user123' }, { secret })
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should reject missing token', async () => {
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext()

			const result = await handler(ctx)

			expect(result.status).toBe(401)
			const body = JSON.parse(result.body as string)
			expect(body.error).toBe('Missing token')
		})

		it('should reject invalid token', async () => {
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: 'Bearer invalid.token.here' },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
		})

		it('should reject expired token', async () => {
			const token = createJwt({ sub: 'user', exp: Math.floor(Date.now() / 1000) - 100 }, { secret })
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
			const body = JSON.parse(result.body as string)
			expect(body.error).toBe('Token expired')
		})

		it('should store payload for context', async () => {
			const token = createJwt({ sub: 'user123', role: 'admin' }, { secret })
			const middleware = jwtAuth({ secret })

			let capturedPayload: any
			const handler = middleware(async (ctx) => {
				capturedPayload = getJwtPayload(ctx)
				return { status: 200, body: 'OK', headers: {} }
			})

			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})
			await handler(ctx)

			expect(capturedPayload).toBeDefined()
			expect(capturedPayload.sub).toBe('user123')
			expect(capturedPayload.role).toBe('admin')
		})

		it('should skip auth when configured', async () => {
			const middleware = jwtAuth({
				secret,
				skip: (ctx) => ctx.path === '/public',
			})
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({ path: '/public' })

			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should use custom error response', async () => {
			const middleware = jwtAuth({
				secret,
				onError: () => ({ status: 403, body: 'Forbidden', headers: {} }),
			})
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext()

			const result = await handler(ctx)

			expect(result.status).toBe(403)
			expect(result.body).toBe('Forbidden')
		})

		it('should use custom getToken function', async () => {
			const token = createJwt({ sub: 'user' }, { secret })
			const middleware = jwtAuth({
				secret,
				getToken: (ctx) => ctx.headers['x-token'] ?? null,
			})
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { 'x-token': token },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should verify issuer', async () => {
			const token = createJwt({ sub: 'user' }, { secret, issuer: 'app-a' })
			const middleware = jwtAuth({ secret, issuer: 'app-b' })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
		})

		it('should verify audience', async () => {
			const token = createJwt({ sub: 'user' }, { secret, audience: 'api-1' })
			const middleware = jwtAuth({ secret, audience: 'api-2' })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
		})
	})

	describe('optionalJwt middleware', () => {
		it('should create wrapper function', () => {
			const middleware = optionalJwt({ secret })
			expect(typeof middleware).toBe('function')
		})

		it('should continue without token', async () => {
			const middleware = optionalJwt({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext()

			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should store payload when valid token present', async () => {
			const token = createJwt({ sub: 'user123' }, { secret })
			const middleware = optionalJwt({ secret })

			let capturedPayload: any
			const handler = middleware(async (ctx) => {
				capturedPayload = getJwtPayload(ctx)
				return { status: 200, body: 'OK', headers: {} }
			})

			const ctx = createMockContext({
				headers: { authorization: `Bearer ${token}` },
			})
			await handler(ctx)

			expect(capturedPayload).toBeDefined()
			expect(capturedPayload.sub).toBe('user123')
		})

		it('should continue even with invalid token', async () => {
			const middleware = optionalJwt({ secret })

			let capturedPayload: any
			const handler = middleware(async (ctx) => {
				capturedPayload = getJwtPayload(ctx)
				return { status: 200, body: 'OK', headers: {} }
			})

			const ctx = createMockContext({
				headers: { authorization: 'Bearer invalid.token' },
			})
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(capturedPayload).toBeUndefined()
		})

		it('should use custom getToken function', async () => {
			const token = createJwt({ sub: 'user' }, { secret })
			const middleware = optionalJwt({
				secret,
				getToken: (ctx) => ctx.headers['x-auth'] ?? null,
			})

			let capturedPayload: any
			const handler = middleware(async (ctx) => {
				capturedPayload = getJwtPayload(ctx)
				return { status: 200, body: 'OK', headers: {} }
			})

			const ctx = createMockContext({
				headers: { 'x-auth': token },
			})
			await handler(ctx)

			expect(capturedPayload).toBeDefined()
		})
	})

	describe('getJwtPayload', () => {
		it('should return undefined for context without token', () => {
			const ctx = createMockContext()
			const payload = getJwtPayload(ctx)
			expect(payload).toBeUndefined()
		})
	})

	describe('edge cases', () => {
		it('should handle malformed authorization header', async () => {
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: 'NotBearer token' },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
		})

		it('should handle empty bearer token', async () => {
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: 'Bearer ' },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(401)
		})

		it('should handle token with extra whitespace', async () => {
			const token = createJwt({ sub: 'user' }, { secret })
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `Bearer   ${token}  ` },
			})

			const result = await handler(ctx)

			// Should trim and work
			expect(result.status).toBe(200)
		})

		it('should handle case-insensitive Bearer', async () => {
			const token = createJwt({ sub: 'user' }, { secret })
			const middleware = jwtAuth({ secret })
			const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
			const ctx = createMockContext({
				headers: { authorization: `bearer ${token}` },
			})

			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should handle array audience in token', () => {
			const token = createJwt({ sub: 'user', aud: ['api-1', 'api-2'] }, { secret })
			const result = verifyJwt(token, { secret, audience: 'api-1' })
			expect(result.valid).toBe(true)
		})

		it('should handle array expected audience', () => {
			const token = createJwt({ sub: 'user' }, { secret, audience: 'api-1' })
			const result = verifyJwt(token, { secret, audience: ['api-1', 'api-2'] })
			expect(result.valid).toBe(true)
		})
	})
})
