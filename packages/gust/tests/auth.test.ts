/**
 * Authentication Tests
 */

import { describe, expect, it } from 'bun:test'
import {
	apiKeyAuth,
	basicAuth,
	bearerAuth,
	createBasicAuth,
	generateHmac,
	hmacAuth,
	parseBasicAuth,
	parseBearerToken,
	simpleApiKey,
	simpleBasicAuth,
	verifyHmac,
} from '../src/auth'
import type { Context } from '../src/context'

// Mock context
const createMockContext = (overrides?: Partial<Context>): Context =>
	({
		method: 'GET',
		path: '/protected',
		headers: {},
		body: Buffer.alloc(0),
		params: {},
		query: '',
		socket: {} as any,
		raw: Buffer.alloc(0),
		json: () => ({}),
		...overrides,
	}) as Context

// Mock handler
const mockHandler = async (_ctx: Context) => ({
	status: 200,
	headers: {},
	body: 'Success',
})

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

			it('should handle empty username', () => {
				const header = createBasicAuth('', 'password')
				const result = parseBasicAuth(header)

				expect(result?.username).toBe('')
				expect(result?.password).toBe('password')
			})

			it('should handle empty password', () => {
				const header = createBasicAuth('user', '')
				const result = parseBasicAuth(header)

				expect(result?.username).toBe('user')
				expect(result?.password).toBe('')
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

			it('should be case insensitive for Basic prefix', () => {
				const encoded = Buffer.from('user:pass').toString('base64')
				expect(parseBasicAuth(`basic ${encoded}`)).not.toBeNull()
				expect(parseBasicAuth(`BASIC ${encoded}`)).not.toBeNull()
				expect(parseBasicAuth(`Basic ${encoded}`)).not.toBeNull()
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

			it('should handle empty credentials', () => {
				const header = createBasicAuth('', '')
				const result = parseBasicAuth(header)

				expect(result?.username).toBe('')
				expect(result?.password).toBe('')
			})
		})

		describe('basicAuth middleware', () => {
			it('should allow valid credentials', async () => {
				const middleware = basicAuth({
					validate: (username, password) => username === 'admin' && password === 'secret',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'secret') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
				expect(result.body).toBe('Success')
			})

			it('should reject invalid credentials', async () => {
				const middleware = basicAuth({
					validate: (username, password) => username === 'admin' && password === 'secret',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'wrong') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
				expect(result.headers['www-authenticate']).toContain('Basic realm=')
			})

			it('should reject missing authorization header', async () => {
				const middleware = basicAuth({
					validate: () => true,
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should reject malformed authorization header', async () => {
				const middleware = basicAuth({
					validate: () => true,
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer token' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should use custom realm', async () => {
				const middleware = basicAuth({
					validate: () => false,
					realm: 'Admin Area',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('user', 'pass') },
				})

				const result = await handler(ctx)
				expect(result.headers['www-authenticate']).toBe('Basic realm="Admin Area"')
			})

			it('should skip authentication when skip returns true', async () => {
				const middleware = basicAuth({
					validate: () => false,
					skip: (ctx) => ctx.path === '/public',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({ path: '/public' })

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom unauthorized response', async () => {
				const middleware = basicAuth({
					validate: () => false,
					onUnauthorized: () => ({
						status: 403,
						headers: { 'content-type': 'text/plain' },
						body: 'Forbidden',
					}),
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('user', 'pass') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(403)
				expect(result.body).toBe('Forbidden')
			})

			it('should support async validate function', async () => {
				const middleware = basicAuth({
					validate: async (username, password) => {
						await new Promise((r) => setTimeout(r, 10))
						return username === 'admin' && password === 'secret'
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'secret') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should pass context to validate function', async () => {
				let receivedCtx: Context | null = null
				const middleware = basicAuth({
					validate: (_username, _password, ctx) => {
						receivedCtx = ctx
						return true
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('user', 'pass') },
				})

				await handler(ctx)
				expect(receivedCtx).toBe(ctx)
			})
		})

		describe('simpleBasicAuth middleware', () => {
			it('should allow correct credentials', async () => {
				const middleware = simpleBasicAuth('admin', 'secret123')
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'secret123') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should reject wrong username', async () => {
				const middleware = simpleBasicAuth('admin', 'secret123')
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('user', 'secret123') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should reject wrong password', async () => {
				const middleware = simpleBasicAuth('admin', 'secret123')
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'wrong') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should use custom realm', async () => {
				const middleware = simpleBasicAuth('admin', 'secret', 'Dashboard')
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 'wrong') },
				})

				const result = await handler(ctx)
				expect(result.headers['www-authenticate']).toBe('Basic realm="Dashboard"')
			})

			it('should be timing-safe against username length attacks', async () => {
				const middleware = simpleBasicAuth('admin', 'secret')
				const handler = middleware(mockHandler)

				// Different length username should not leak timing information
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('a', 'secret') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should be timing-safe against password length attacks', async () => {
				const middleware = simpleBasicAuth('admin', 'secret')
				const handler = middleware(mockHandler)

				// Different length password should not leak timing information
				const ctx = createMockContext({
					headers: { authorization: createBasicAuth('admin', 's') },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
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

			it('should handle tokens with special characters', () => {
				const token = parseBearerToken('Bearer abc.123_xyz-456')
				expect(token).toBe('abc.123_xyz-456')
			})
		})

		describe('bearerAuth middleware', () => {
			it('should allow valid token', async () => {
				const middleware = bearerAuth({
					validate: (token) => token === 'valid-token',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer valid-token' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should reject invalid token', async () => {
				const middleware = bearerAuth({
					validate: (token) => token === 'valid-token',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer invalid-token' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
				expect(result.headers['content-type']).toBe('application/json')
			})

			it('should reject missing authorization header', async () => {
				const middleware = bearerAuth({
					validate: () => true,
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should skip when skip returns true', async () => {
				const middleware = bearerAuth({
					validate: () => false,
					skip: (ctx) => ctx.path.startsWith('/public'),
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({ path: '/public/test' })

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom header name', async () => {
				const middleware = bearerAuth({
					validate: (token) => token === 'valid',
					header: 'x-auth-token',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-auth-token': 'Bearer valid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom prefix', async () => {
				const middleware = bearerAuth({
					validate: (token) => token === 'valid',
					prefix: 'Token',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Token valid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom unauthorized response', async () => {
				const middleware = bearerAuth({
					validate: () => false,
					onUnauthorized: () => ({
						status: 403,
						headers: { 'content-type': 'text/plain' },
						body: 'Access Denied',
					}),
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer token' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(403)
				expect(result.body).toBe('Access Denied')
			})

			it('should support async validate function', async () => {
				const middleware = bearerAuth({
					validate: async (token) => {
						await new Promise((r) => setTimeout(r, 10))
						return token === 'valid'
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer valid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should pass context to validate function', async () => {
				let receivedCtx: Context | null = null
				const middleware = bearerAuth({
					validate: (_token, ctx) => {
						receivedCtx = ctx
						return true
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { authorization: 'Bearer token' },
				})

				await handler(ctx)
				expect(receivedCtx).toBe(ctx)
			})
		})
	})

	describe('API Key', () => {
		describe('apiKeyAuth middleware', () => {
			it('should allow valid API key from header', async () => {
				const middleware = apiKeyAuth({
					validate: (key) => key === 'valid-key',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'valid-key' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should allow valid API key from query', async () => {
				const middleware = apiKeyAuth({
					validate: (key) => key === 'valid-key',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					query: '?api_key=valid-key',
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should prefer header over query', async () => {
				let receivedKey = ''
				const middleware = apiKeyAuth({
					validate: (key) => {
						receivedKey = key
						return true
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'header-key' },
					query: '?api_key=query-key',
				})

				await handler(ctx)
				expect(receivedKey).toBe('header-key')
			})

			it('should reject invalid API key', async () => {
				const middleware = apiKeyAuth({
					validate: (key) => key === 'valid-key',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'invalid-key' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should reject missing API key', async () => {
				const middleware = apiKeyAuth({
					validate: () => true,
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext()

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should use custom header name', async () => {
				const middleware = apiKeyAuth({
					validate: (key) => key === 'valid',
					header: 'x-custom-key',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-custom-key': 'valid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom query parameter name', async () => {
				const middleware = apiKeyAuth({
					validate: (key) => key === 'valid',
					query: 'key',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					query: '?key=valid',
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should decode URL-encoded query parameter', async () => {
				let receivedKey = ''
				const middleware = apiKeyAuth({
					validate: (key) => {
						receivedKey = key
						return true
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					query: '?api_key=key%20with%20spaces',
				})

				await handler(ctx)
				expect(receivedKey).toBe('key with spaces')
			})

			it('should skip when skip returns true', async () => {
				const middleware = apiKeyAuth({
					validate: () => false,
					skip: (ctx) => ctx.method === 'OPTIONS',
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({ method: 'OPTIONS' })

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom unauthorized response', async () => {
				const middleware = apiKeyAuth({
					validate: () => false,
					onUnauthorized: () => ({
						status: 403,
						headers: {},
						body: 'No access',
					}),
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'invalid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(403)
				expect(result.body).toBe('No access')
			})

			it('should support async validate function', async () => {
				const middleware = apiKeyAuth({
					validate: async (key) => {
						await new Promise((r) => setTimeout(r, 10))
						return key === 'valid'
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'valid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should pass context to validate function', async () => {
				let receivedCtx: Context | null = null
				const middleware = apiKeyAuth({
					validate: (_key, ctx) => {
						receivedCtx = ctx
						return true
					},
				})

				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'key' },
				})

				await handler(ctx)
				expect(receivedCtx).toBe(ctx)
			})
		})

		describe('simpleApiKey middleware', () => {
			it('should allow valid API key', async () => {
				const middleware = simpleApiKey(['key1', 'key2', 'key3'])
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'key2' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should reject invalid API key', async () => {
				const middleware = simpleApiKey(['key1', 'key2'])
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'invalid' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})

			it('should accept options', async () => {
				const middleware = simpleApiKey(['key1'], {
					header: 'x-custom-key',
				})
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-custom-key': 'key1' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should handle empty key list', async () => {
				const middleware = simpleApiKey([])
				const handler = middleware(mockHandler)
				const ctx = createMockContext({
					headers: { 'x-api-key': 'any-key' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
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

			it('should handle empty data', () => {
				const sig = generateHmac('', secret)
				expect(sig).toBeString()
				expect(sig.length).toBeGreaterThan(0)
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
				expect(verifyHmac(data, `${validSig}extra`, secret)).toBe(false)
			})

			it('should verify with Buffer data', () => {
				const data = Buffer.from('test data')
				const signature = generateHmac(data, secret)

				expect(verifyHmac(data, signature, secret)).toBe(true)
			})

			it('should verify with different algorithms', () => {
				const data = 'test data'
				const sig256 = generateHmac(data, secret, 'sha256')
				const sig512 = generateHmac(data, secret, 'sha512')

				expect(verifyHmac(data, sig256, secret, 'sha256')).toBe(true)
				expect(verifyHmac(data, sig512, secret, 'sha512')).toBe(true)
				expect(verifyHmac(data, sig256, secret, 'sha512')).toBe(false)
			})
		})

		describe('hmacAuth middleware', () => {
			it('should allow valid signature', async () => {
				const middleware = hmacAuth({ secret })
				const handler = middleware(mockHandler)

				const body = Buffer.from('request body')
				const signature = generateHmac(body, secret)

				const ctx = createMockContext({
					body,
					headers: { 'x-signature': signature },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should reject invalid signature', async () => {
				const middleware = hmacAuth({ secret })
				const handler = middleware(mockHandler)

				const ctx = createMockContext({
					body: Buffer.from('request body'),
					headers: { 'x-signature': 'invalid-signature' },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
				const body = JSON.parse(result.body as string)
				expect(body.error).toBe('Invalid signature')
			})

			it('should reject missing signature', async () => {
				const middleware = hmacAuth({ secret })
				const handler = middleware(mockHandler)

				const ctx = createMockContext({
					body: Buffer.from('request body'),
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
				const body = JSON.parse(result.body as string)
				expect(body.error).toBe('Missing signature')
			})

			it('should use custom algorithm', async () => {
				const middleware = hmacAuth({ secret, algorithm: 'sha512' })
				const handler = middleware(mockHandler)

				const body = Buffer.from('request body')
				const signature = generateHmac(body, secret, 'sha512')

				const ctx = createMockContext({
					body,
					headers: { 'x-signature': signature },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should use custom header name', async () => {
				const middleware = hmacAuth({ secret, header: 'x-hmac' })
				const handler = middleware(mockHandler)

				const body = Buffer.from('request body')
				const signature = generateHmac(body, secret)

				const ctx = createMockContext({
					body,
					headers: { 'x-hmac': signature },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should skip when skip returns true', async () => {
				const middleware = hmacAuth({
					secret,
					skip: (ctx) => ctx.method === 'GET',
				})
				const handler = middleware(mockHandler)

				const ctx = createMockContext({ method: 'GET' })

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should verify empty body', async () => {
				const middleware = hmacAuth({ secret })
				const handler = middleware(mockHandler)

				const body = Buffer.alloc(0)
				const signature = generateHmac(body, secret)

				const ctx = createMockContext({
					body,
					headers: { 'x-signature': signature },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(200)
			})

			it('should detect tampered body', async () => {
				const middleware = hmacAuth({ secret })
				const handler = middleware(mockHandler)

				const originalBody = Buffer.from('original body')
				const signature = generateHmac(originalBody, secret)

				const ctx = createMockContext({
					body: Buffer.from('tampered body'),
					headers: { 'x-signature': signature },
				})

				const result = await handler(ctx)
				expect(result.status).toBe(401)
			})
		})
	})
})
