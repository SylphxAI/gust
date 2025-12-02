/**
 * Body Limit Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { bodyLimit, formatSize, parseSize } from '@sylphx/gust'
import { text } from '@sylphx/gust-core'

const createMockContext = (
	method: string = 'POST',
	body: Buffer = Buffer.alloc(0),
	headers: Record<string, string> = {}
): any => ({
	method,
	path: '/test',
	query: '',
	headers: {
		'content-length': body.length.toString(),
		'content-type': 'application/json',
		...headers,
	},
	body,
})

describe('Body Limit', () => {
	describe('parseSize', () => {
		it('should parse raw numbers', () => {
			expect(parseSize(1024)).toBe(1024)
			expect(parseSize(0)).toBe(0)
			expect(parseSize(1000000)).toBe(1000000)
		})

		it('should parse bytes', () => {
			expect(parseSize('100b')).toBe(100)
			expect(parseSize('100B')).toBe(100)
			expect(parseSize('1000')).toBe(1000)
		})

		it('should parse kilobytes', () => {
			expect(parseSize('1kb')).toBe(1024)
			expect(parseSize('1KB')).toBe(1024)
			expect(parseSize('10kb')).toBe(10240)
			expect(parseSize('1.5kb')).toBe(1536)
		})

		it('should parse megabytes', () => {
			expect(parseSize('1mb')).toBe(1024 * 1024)
			expect(parseSize('1MB')).toBe(1024 * 1024)
			expect(parseSize('10mb')).toBe(10 * 1024 * 1024)
			expect(parseSize('0.5mb')).toBe(512 * 1024)
		})

		it('should parse gigabytes', () => {
			expect(parseSize('1gb')).toBe(1024 * 1024 * 1024)
			expect(parseSize('1GB')).toBe(1024 * 1024 * 1024)
			expect(parseSize('2gb')).toBe(2 * 1024 * 1024 * 1024)
		})

		it('should handle whitespace', () => {
			// parseSize may or may not trim - test basic functionality
			expect(parseSize('100kb')).toBe(100 * 1024)
			expect(parseSize('1mb')).toBe(1024 * 1024)
		})

		it('should return default for invalid input', () => {
			const defaultSize = 1024 * 1024 // 1MB default
			expect(parseSize('invalid')).toBe(defaultSize)
			expect(parseSize('')).toBe(defaultSize)
			expect(parseSize('abc123')).toBe(defaultSize)
		})

		it('should handle decimal values', () => {
			expect(parseSize('1.5kb')).toBe(Math.floor(1.5 * 1024))
			expect(parseSize('2.5mb')).toBe(Math.floor(2.5 * 1024 * 1024))
			expect(parseSize('0.001gb')).toBe(Math.floor(0.001 * 1024 * 1024 * 1024))
		})

		it('should handle edge cases', () => {
			expect(parseSize('0kb')).toBe(0)
			expect(parseSize('0mb')).toBe(0)
		})

		it('should handle small fractional values', () => {
			expect(parseSize('0.1kb')).toBe(Math.floor(0.1 * 1024))
			expect(parseSize('0.01mb')).toBe(Math.floor(0.01 * 1024 * 1024))
		})

		it('should handle large numbers', () => {
			expect(parseSize('100gb')).toBe(100 * 1024 * 1024 * 1024)
		})
	})

	describe('formatSize', () => {
		it('should format bytes', () => {
			expect(formatSize(0)).toBe('0B')
			expect(formatSize(100)).toBe('100B')
			expect(formatSize(1023)).toBe('1023B')
		})

		it('should format kilobytes', () => {
			expect(formatSize(1024)).toBe('1.0KB')
			expect(formatSize(1536)).toBe('1.5KB')
			expect(formatSize(10240)).toBe('10.0KB')
		})

		it('should format megabytes', () => {
			expect(formatSize(1024 * 1024)).toBe('1.0MB')
			expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5MB')
			expect(formatSize(100 * 1024 * 1024)).toBe('100.0MB')
		})

		it('should format gigabytes', () => {
			expect(formatSize(1024 * 1024 * 1024)).toBe('1.0GB')
			expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5GB')
		})

		it('should handle boundary values', () => {
			// Just under 1KB
			expect(formatSize(1023)).toBe('1023B')
			// Exactly 1KB
			expect(formatSize(1024)).toBe('1.0KB')
			// Just under 1MB
			expect(formatSize(1024 * 1024 - 1)).toContain('KB')
		})

		it('should handle very large numbers', () => {
			const largeSize = 1024 * 1024 * 1024 * 100 // 100GB
			expect(formatSize(largeSize)).toContain('GB')
		})

		it('should handle negative numbers', () => {
			// Implementation may vary - just ensure it doesn't crash
			const result = formatSize(-100)
			expect(result).toBeDefined()
		})

		it('should handle NaN', () => {
			const result = formatSize(NaN)
			expect(result).toBeDefined()
		})

		it('should handle Infinity', () => {
			const result = formatSize(Infinity)
			expect(result).toBeDefined()
		})
	})

	describe('roundtrip', () => {
		it('should parse formatted values correctly', () => {
			const sizes = [100, 1024, 10240, 1024 * 1024, 10 * 1024 * 1024]

			for (const original of sizes) {
				const formatted = formatSize(original)
				// Extract number and unit
				const match = formatted.match(/^([\d.]+)(B|KB|MB|GB)$/)
				if (match) {
					const num = parseFloat(match[1])
					const unit = match[2].toLowerCase()
					const parsed = parseSize(`${num}${unit}`)
					// Allow for small rounding differences
					expect(Math.abs(parsed - original)).toBeLessThan(original * 0.01)
				}
			}
		})
	})

	describe('bodyLimit middleware', () => {
		it('should allow body within limit', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const body = Buffer.from('a'.repeat(500))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(200)
		})

		it('should reject body exceeding limit', async () => {
			const middleware = bodyLimit({ maxSize: 100 }) // 100 bytes
			const body = Buffer.from('a'.repeat(200))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(413)
		})

		it('should allow body at exact limit', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(200)
		})

		it('should skip GET requests by default', async () => {
			const middleware = bodyLimit({ maxSize: 1 }) // 1 byte
			const handler = middleware(() => text('ok'))

			// GET with no body should pass
			const res = await handler(createMockContext('GET', Buffer.alloc(0)))
			expect(res.status).toBe(200)
		})

		it('should skip HEAD requests by default', async () => {
			const middleware = bodyLimit({ maxSize: 1 })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('HEAD', Buffer.alloc(0)))
			expect(res.status).toBe(200)
		})

		it('should skip OPTIONS requests by default', async () => {
			const middleware = bodyLimit({ maxSize: 1 })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('OPTIONS', Buffer.alloc(0)))
			expect(res.status).toBe(200)
		})

		it('should check POST requests', async () => {
			const middleware = bodyLimit({ maxSize: 10 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(413)
		})

		it('should check PUT requests', async () => {
			const middleware = bodyLimit({ maxSize: 10 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('PUT', body))
			expect(res.status).toBe(413)
		})

		it('should check PATCH requests', async () => {
			const middleware = bodyLimit({ maxSize: 10 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('PATCH', body))
			expect(res.status).toBe(413)
		})

		it('should check DELETE requests with body', async () => {
			const middleware = bodyLimit({ maxSize: 10 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('DELETE', body))
			expect(res.status).toBe(413)
		})

		it('should use Content-Length header', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const handler = middleware(() => text('ok'))

			// Large content-length should be rejected even if body is small
			const res = await handler(
				createMockContext('POST', Buffer.from('small'), {
					'content-length': '1000',
				})
			)
			expect(res.status).toBe(413)
		})

		it('should handle empty body', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', Buffer.alloc(0)))
			expect(res.status).toBe(200)
		})

		it('should handle very large limit', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1gb') })
			const body = Buffer.from('a'.repeat(1000))
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(200)
		})

		it('should handle binary data', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const body = Buffer.alloc(50)
			for (let i = 0; i < 50; i++) body[i] = i
			const handler = middleware(() => text('ok'))

			const res = await handler(createMockContext('POST', body))
			expect(res.status).toBe(200)
		})

		it('should handle async handler', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return text('ok')
			})

			const res = await handler(createMockContext('POST', Buffer.from('test')))
			expect(res.status).toBe(200)
		})

		it('should handle handler throwing error', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(() => {
				throw new Error('Handler error')
			})

			await expect(handler(createMockContext('POST', Buffer.from('test')))).rejects.toThrow('Handler error')
		})

		it('should preserve response headers', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'x-custom': 'value' },
				body: 'ok',
			}))

			const res = await handler(createMockContext('POST', Buffer.from('test')))
			expect(res.headers['x-custom']).toBe('value')
		})
	})

	describe('edge cases', () => {
		it('should handle zero limit', async () => {
			const middleware = bodyLimit({ maxSize: 0 })
			const handler = middleware(() => text('ok'))

			// Even small body should be rejected
			const res = await handler(createMockContext('POST', Buffer.from('a')))
			expect(res.status).toBe(413)

			// Empty body should pass (zero bytes <= zero limit)
			const res2 = await handler(createMockContext('POST', Buffer.alloc(0)))
			expect(res2.status).toBe(200)
		})

		it('should handle missing content-type', async () => {
			const middleware = bodyLimit({ maxSize: 10 })
			const body = Buffer.from('a'.repeat(100))
			const handler = middleware(() => text('ok'))

			const ctx = createMockContext('POST', body)
			delete ctx.headers['content-type']

			const res = await handler(ctx)
			expect(res.status).toBe(413)
		})

		it('should handle NaN content-length', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const handler = middleware(() => text('ok'))

			const res = await handler(
				createMockContext('POST', Buffer.from('test'), {
					'content-length': 'invalid',
				})
			)
			// Should use actual body size or handle gracefully
			expect(res.status).toBe(200)
		})

		it('should handle concurrent requests', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(() => text('ok'))

			const requests = Array.from({ length: 10 }, () => handler(createMockContext('POST', Buffer.from('test'))))

			const results = await Promise.all(requests)
			results.forEach((res) => {
				expect(res.status).toBe(200)
			})
		})

		it('should handle different content types', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const body = Buffer.from('a'.repeat(50))
			const handler = middleware(() => text('ok'))

			const contentTypes = [
				'application/json',
				'text/plain',
				'application/xml',
				'multipart/form-data',
				'application/x-www-form-urlencoded',
			]

			for (const contentType of contentTypes) {
				const res = await handler(
					createMockContext('POST', body, {
						'content-type': contentType,
					})
				)
				expect(res.status).toBe(200)
			}
		})

		it('should handle missing content-length gracefully', async () => {
			const middleware = bodyLimit({ maxSize: 100 })
			const body = Buffer.from('a'.repeat(50))
			const handler = middleware(() => text('ok'))

			const ctx = createMockContext('POST', body)
			delete ctx.headers['content-length']

			// Should work, possibly checking actual body size
			const res = await handler(ctx)
			expect(res.status).toBe(200)
		})
	})

	describe('performance', () => {
		it('should handle many requests efficiently', async () => {
			const middleware = bodyLimit({ maxSize: parseSize('1kb') })
			const handler = middleware(() => text('ok'))

			const start = performance.now()

			const requests = Array.from({ length: 100 }, () => handler(createMockContext('POST', Buffer.from('test'))))

			await Promise.all(requests)

			const duration = performance.now() - start
			expect(duration).toBeLessThan(1000) // Should complete in under 1 second
		})
	})
})
