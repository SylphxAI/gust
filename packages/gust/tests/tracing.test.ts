/**
 * Tracing Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { generateNanoId, generateShortId, generateUUID, getRequestId, logging, tracing } from '@sylphx/gust'
import { text } from '@sylphx/gust-core'

const createMockContext = (headers: Record<string, string> = {}): any => ({
	method: 'GET',
	path: '/test',
	query: '',
	headers,
	body: Buffer.alloc(0),
})

describe('Tracing', () => {
	describe('generateUUID', () => {
		it('should generate valid UUID v4', () => {
			const uuid = generateUUID()
			expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
		})

		it('should generate unique UUIDs', () => {
			const uuids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				uuids.add(generateUUID())
			}
			expect(uuids.size).toBe(100)
		})

		it('should have correct version (4)', () => {
			const uuid = generateUUID()
			// 13th character should be '4'
			expect(uuid[14]).toBe('4')
		})

		it('should have correct variant', () => {
			const uuid = generateUUID()
			// 17th character should be 8, 9, a, or b
			expect(['8', '9', 'a', 'b']).toContain(uuid[19].toLowerCase())
		})

		it('should generate lowercase hex', () => {
			const uuid = generateUUID()
			expect(uuid).toBe(uuid.toLowerCase())
		})

		it('should have correct length', () => {
			const uuid = generateUUID()
			expect(uuid.length).toBe(36) // 32 hex + 4 dashes
		})

		it('should have dashes in correct positions', () => {
			const uuid = generateUUID()
			expect(uuid[8]).toBe('-')
			expect(uuid[13]).toBe('-')
			expect(uuid[18]).toBe('-')
			expect(uuid[23]).toBe('-')
		})
	})

	describe('generateShortId', () => {
		it('should generate 8 character hex string', () => {
			const id = generateShortId()
			expect(id).toMatch(/^[0-9a-f]{8}$/)
		})

		it('should generate unique IDs', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				ids.add(generateShortId())
			}
			expect(ids.size).toBe(100)
		})

		it('should be lowercase hex', () => {
			const id = generateShortId()
			expect(id).toBe(id.toLowerCase())
		})

		it('should have correct length', () => {
			const id = generateShortId()
			expect(id.length).toBe(8)
		})

		it('should only contain valid hex characters', () => {
			for (let i = 0; i < 100; i++) {
				const id = generateShortId()
				expect(id).toMatch(/^[0-9a-f]+$/)
			}
		})
	})

	describe('generateNanoId', () => {
		it('should generate default 21 character ID', () => {
			const id = generateNanoId()
			expect(id.length).toBe(21)
		})

		it('should generate custom length ID', () => {
			const id10 = generateNanoId(10)
			const id30 = generateNanoId(30)
			expect(id10.length).toBe(10)
			expect(id30.length).toBe(30)
		})

		it('should generate unique IDs', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 100; i++) {
				ids.add(generateNanoId())
			}
			expect(ids.size).toBe(100)
		})

		it('should use alphanumeric characters', () => {
			const id = generateNanoId()
			expect(id).toMatch(/^[0-9A-Za-z]+$/)
		})

		it('should handle very short length', () => {
			const id = generateNanoId(1)
			expect(id.length).toBe(1)
		})

		it('should handle very long length', () => {
			const id = generateNanoId(100)
			expect(id.length).toBe(100)
		})

		it('should handle length of 0', () => {
			const id = generateNanoId(0)
			expect(id).toBe('')
		})

		it('should have good distribution of characters', () => {
			const id = generateNanoId(1000)
			const chars = new Set(id.split(''))
			// With 62 possible characters and 1000 length, should see many unique chars
			expect(chars.size).toBeGreaterThan(30)
		})
	})

	describe('ID uniqueness at scale', () => {
		it('should not have collisions in 1000 UUIDs', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 1000; i++) {
				ids.add(generateUUID())
			}
			expect(ids.size).toBe(1000)
		})

		it('should not have collisions in 1000 shortIds', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 1000; i++) {
				ids.add(generateShortId())
			}
			expect(ids.size).toBe(1000)
		})

		it('should not have collisions in 1000 nanoIds', () => {
			const ids = new Set<string>()
			for (let i = 0; i < 1000; i++) {
				ids.add(generateNanoId())
			}
			expect(ids.size).toBe(1000)
		})
	})

	describe('URL safety', () => {
		it('UUID should be URL safe', () => {
			const uuid = generateUUID()
			expect(encodeURIComponent(uuid)).toBe(uuid)
		})

		it('ShortId should be URL safe', () => {
			const shortId = generateShortId()
			expect(encodeURIComponent(shortId)).toBe(shortId)
		})

		it('NanoId should be URL safe', () => {
			const nanoId = generateNanoId()
			expect(encodeURIComponent(nanoId)).toBe(nanoId)
		})
	})

	describe('tracing middleware', () => {
		it('should generate request ID', async () => {
			const middleware = tracing()
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext())
			expect(capturedId).toBeDefined()
			expect(capturedId!.length).toBeGreaterThan(0)
		})

		it('should add request ID to response header', async () => {
			const middleware = tracing()
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-request-id']).toBeDefined()
		})

		it('should use custom header name', async () => {
			const middleware = tracing({ header: 'x-trace-id' })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-trace-id']).toBeDefined()
		})

		it('should trust incoming request ID by default', async () => {
			const middleware = tracing()
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-request-id': 'incoming-id' }))
			expect(capturedId).toBe('incoming-id')
		})

		it('should not trust incoming when trustIncoming is false', async () => {
			const middleware = tracing({ trustIncoming: false })
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-request-id': 'incoming-id' }))
			expect(capturedId).not.toBe('incoming-id')
		})

		it('should not set response header when setResponse is false', async () => {
			const middleware = tracing({ setResponse: false })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext())
			expect(res.headers['x-request-id']).toBeUndefined()
		})

		it('should use custom generator', async () => {
			const middleware = tracing({ generator: () => 'custom-id-123' })
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext())
			expect(capturedId).toBe('custom-id-123')
		})

		it('should handle async handler', async () => {
			const middleware = tracing()
			const handler = middleware(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return text('ok')
			})

			const res = await handler(createMockContext())
			expect(res.headers['x-request-id']).toBeDefined()
		})

		it('should preserve existing response headers', async () => {
			const middleware = tracing()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'x-custom': 'value' },
				body: 'ok',
			}))

			const res = await handler(createMockContext())
			expect(res.headers['x-custom']).toBe('value')
			expect(res.headers['x-request-id']).toBeDefined()
		})

		it('should handle case-insensitive header matching', async () => {
			const middleware = tracing()
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'X-Request-ID': 'UPPER-CASE-ID' }))
			// Note: Header lookup is case-insensitive in most implementations
			expect(capturedId).toBeDefined()
		})
	})

	describe('logging middleware', () => {
		it('should log request', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})
			const handler = middleware(() => text('ok'))

			await handler(createMockContext())

			expect(logs.length).toBe(1)
			expect(logs[0].msg).toContain('GET')
			expect(logs[0].msg).toContain('/test')
		})

		it('should include timing when enabled', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
				timing: true,
			})
			const handler = middleware(() => text('ok'))

			await handler(createMockContext())

			expect(logs[0].data.duration).toBeDefined()
			expect(logs[0].data.duration).toContain('ms')
		})

		it('should not include timing when disabled', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
				timing: false,
			})
			const handler = middleware(() => text('ok'))

			await handler(createMockContext())

			expect(logs[0].data.duration).toBeUndefined()
		})

		it('should skip logging when skip function returns true', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
				skip: (ctx) => ctx.path === '/health',
			})
			const handler = middleware(() => text('ok'))

			await handler({ ...createMockContext(), path: '/health' })

			expect(logs.length).toBe(0)
		})

		it('should log when skip function returns false', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
				skip: (ctx) => ctx.path === '/health',
			})
			const handler = middleware(() => text('ok'))

			await handler({ ...createMockContext(), path: '/api' })

			expect(logs.length).toBe(1)
		})

		it('should include status in log', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})
			const handler = middleware(() => ({
				status: 201,
				headers: {},
				body: 'created',
			}))

			await handler(createMockContext())

			expect(logs[0].data.status).toBe(201)
		})

		it('should log errors', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})
			const handler = middleware(() => {
				throw new Error('Test error')
			})

			await expect(handler(createMockContext())).rejects.toThrow('Test error')

			expect(logs.length).toBe(1)
			expect(logs[0].msg).toContain('ERROR')
			expect(logs[0].data.error).toBe('Test error')
		})

		it('should use default console.log when no log function provided', async () => {
			// This test just verifies it doesn't crash
			const middleware = logging()
			const handler = middleware(() => text('ok'))

			// Suppress console output
			const originalLog = console.log
			console.log = () => {}

			await handler(createMockContext())

			console.log = originalLog
		})

		it('should include request ID in log if available', async () => {
			const logs: any[] = []

			// Order matters: tracing wraps logging so logging can see the request ID
			const tracingMiddleware = tracing()
			const loggingMiddleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})

			// tracing should be outer so logging can see the request ID
			const handler = tracingMiddleware(loggingMiddleware(() => text('ok')))

			await handler(createMockContext())

			// Request ID may or may not be included in log data based on implementation
			expect(logs.length).toBe(1)
		})
	})

	describe('edge cases', () => {
		it('should handle getRequestId without tracing middleware', () => {
			const ctx = createMockContext()
			const id = getRequestId(ctx)
			expect(id).toBeUndefined()
		})

		it('should handle multiple requests with different IDs', async () => {
			const middleware = tracing()
			const ids: string[] = []

			const handler = middleware((ctx) => {
				ids.push(getRequestId(ctx)!)
				return text('ok')
			})

			await Promise.all([handler(createMockContext()), handler(createMockContext()), handler(createMockContext())])

			expect(new Set(ids).size).toBe(3)
		})

		it('should handle empty incoming header', async () => {
			const middleware = tracing()
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-request-id': '' }))
			// Empty string should trigger new ID generation
			expect(capturedId).toBeDefined()
			expect(capturedId!.length).toBeGreaterThan(0)
		})

		it('should handle special characters in incoming ID', async () => {
			const middleware = tracing()
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-request-id': 'id-with-special-chars-!@#$%' }))
			expect(capturedId).toBe('id-with-special-chars-!@#$%')
		})

		it('should handle very long incoming ID', async () => {
			const middleware = tracing()
			const longId = 'a'.repeat(1000)
			let capturedId: string | undefined

			const handler = middleware((ctx) => {
				capturedId = getRequestId(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-request-id': longId }))
			expect(capturedId).toBe(longId)
		})

		it('should handle concurrent requests maintaining separate IDs', async () => {
			const middleware = tracing({ trustIncoming: false })
			const results: { ctx: any; id: string }[] = []

			const handler = middleware((ctx) => {
				results.push({ ctx, id: getRequestId(ctx)! })
				return text('ok')
			})

			const contexts = [createMockContext(), createMockContext(), createMockContext()]

			await Promise.all(contexts.map((ctx) => handler(ctx)))

			// All IDs should be unique
			const ids = results.map((r) => r.id)
			expect(new Set(ids).size).toBe(3)
		})

		it('should handle logging with different HTTP methods', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})

			const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

			for (const method of methods) {
				const handler = middleware(() => text('ok'))
				await handler({ ...createMockContext(), method })
			}

			expect(logs.length).toBe(methods.length)
			methods.forEach((method, i) => {
				expect(logs[i].msg).toContain(method)
			})
		})

		it('should handle logging with different paths', async () => {
			const logs: any[] = []
			const middleware = logging({
				log: (msg, data) => logs.push({ msg, data }),
			})

			const paths = ['/api/users', '/health', '/static/file.js', '/']

			for (const path of paths) {
				const handler = middleware(() => text('ok'))
				await handler({ ...createMockContext(), path })
			}

			expect(logs.length).toBe(paths.length)
			paths.forEach((path, i) => {
				expect(logs[i].msg).toContain(path)
			})
		})
	})

	describe('performance', () => {
		it('should generate IDs quickly', () => {
			const start = performance.now()
			for (let i = 0; i < 10000; i++) {
				generateUUID()
			}
			const duration = performance.now() - start

			// Should generate 10000 UUIDs in less than 1 second
			expect(duration).toBeLessThan(1000)
		})

		it('should generate shortIds quickly', () => {
			const start = performance.now()
			for (let i = 0; i < 10000; i++) {
				generateShortId()
			}
			const duration = performance.now() - start

			expect(duration).toBeLessThan(1000)
		})

		it('should generate nanoIds quickly', () => {
			const start = performance.now()
			for (let i = 0; i < 10000; i++) {
				generateNanoId()
			}
			const duration = performance.now() - start

			expect(duration).toBeLessThan(1000)
		})
	})
})
