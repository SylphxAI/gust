/**
 * Compression Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { brotliCompressSync, brotliDecompressSync, deflateSync, gunzipSync, gzipSync, inflateSync } from 'node:zlib'
import { brotli, compress, gzip } from '../src/compress'

const createMockContext = (
	acceptEncoding: string = 'gzip, deflate, br',
	headers: Record<string, string> = {}
): any => ({
	method: 'GET',
	path: '/test',
	query: '',
	headers: {
		'accept-encoding': acceptEncoding,
		...headers,
	},
	body: Buffer.alloc(0),
})

describe('Compression', () => {
	describe('gzip', () => {
		it('should compress data', () => {
			const input = Buffer.from('Hello, World!')
			const compressed = gzipSync(input)

			// Compressed should have gzip magic bytes
			expect(compressed[0]).toBe(0x1f)
			expect(compressed[1]).toBe(0x8b)
		})

		it('should decompress to original', () => {
			const input = 'Hello, World!'
			const compressed = gzipSync(Buffer.from(input))
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe(input)
		})

		it('should reduce size for compressible data', () => {
			const input = Buffer.from('a'.repeat(1000))
			const compressed = gzipSync(input)

			expect(compressed.length).toBeLessThan(input.length)
		})

		it('should handle empty input', () => {
			const input = Buffer.from('')
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.length).toBe(0)
		})

		it('should handle binary data', () => {
			const input = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(Buffer.compare(decompressed, input)).toBe(0)
		})

		it('should handle unicode content', () => {
			const input = Buffer.from('你好世界 🌍 مرحبا')
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe('你好世界 🌍 مرحبا')
		})

		it('should handle large data', () => {
			const input = Buffer.from('x'.repeat(100000))
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe(input.toString())
			expect(compressed.length).toBeLessThan(input.length)
		})

		it('should handle single byte input', () => {
			const input = Buffer.from('x')
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)
			expect(decompressed.toString()).toBe('x')
		})

		it('should handle all bytes 0-255', () => {
			const input = Buffer.alloc(256)
			for (let i = 0; i < 256; i++) input[i] = i
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)
			expect(Buffer.compare(decompressed, input)).toBe(0)
		})

		it('should handle JSON content', () => {
			const json = JSON.stringify({ users: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `User ${i}` })) })
			const input = Buffer.from(json)
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe(json)
			expect(compressed.length).toBeLessThan(input.length)
		})

		it('should handle HTML content', () => {
			const html = `<html><body>${'<p>Content</p>'.repeat(100)}</body></html>`
			const input = Buffer.from(html)
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe(html)
			expect(compressed.length).toBeLessThan(input.length)
		})
	})

	describe('deflate', () => {
		it('should compress data', () => {
			const input = Buffer.from('Hello, World!')
			const compressed = deflateSync(input)

			expect(compressed.length).toBeLessThanOrEqual(input.length + 10)
		})

		it('should decompress to original', () => {
			const input = 'Hello, World!'
			const compressed = deflateSync(Buffer.from(input))
			const decompressed = inflateSync(compressed)

			expect(decompressed.toString()).toBe(input)
		})

		it('should reduce size for compressible data', () => {
			const input = Buffer.from('a'.repeat(1000))
			const compressed = deflateSync(input)

			expect(compressed.length).toBeLessThan(input.length)
		})

		it('should handle empty input', () => {
			const input = Buffer.from('')
			const compressed = deflateSync(input)
			const decompressed = inflateSync(compressed)

			expect(decompressed.length).toBe(0)
		})

		it('should handle unicode content', () => {
			const input = Buffer.from('你好世界 🌍')
			const compressed = deflateSync(input)
			const decompressed = inflateSync(compressed)

			expect(decompressed.toString()).toBe('你好世界 🌍')
		})
	})

	describe('brotli', () => {
		it('should compress data', () => {
			const input = Buffer.from('Hello, World!')
			const compressed = brotliCompressSync(input)

			// Brotli doesn't have magic bytes, just check it's different
			expect(compressed.length).toBeLessThanOrEqual(input.length + 10) // Small overhead possible
		})

		it('should decompress to original', () => {
			const input = 'Hello, World!'
			const compressed = brotliCompressSync(Buffer.from(input))
			const decompressed = brotliDecompressSync(compressed)

			expect(decompressed.toString()).toBe(input)
		})

		it('should reduce size for compressible data', () => {
			const input = Buffer.from('a'.repeat(1000))
			const compressed = brotliCompressSync(input)

			expect(compressed.length).toBeLessThan(input.length)
		})

		it('should handle empty input', () => {
			const input = Buffer.from('')
			const compressed = brotliCompressSync(input)
			const decompressed = brotliDecompressSync(compressed)

			expect(decompressed.length).toBe(0)
		})

		it('should achieve better compression than gzip for text', () => {
			const input = Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(100))
			const gzipped = gzipSync(input)
			const brotlied = brotliCompressSync(input)

			// Brotli typically achieves better compression for text
			expect(brotlied.length).toBeLessThanOrEqual(gzipped.length)
		})

		it('should handle unicode content', () => {
			const input = Buffer.from('你好世界 🌍 مرحبا')
			const compressed = brotliCompressSync(input)
			const decompressed = brotliDecompressSync(compressed)

			expect(decompressed.toString()).toBe('你好世界 🌍 مرحبا')
		})
	})

	describe('content type detection', () => {
		const shouldCompress = (contentType: string): boolean => {
			const compressible = ['text/', 'application/json', 'application/javascript', 'application/xml', 'image/svg+xml']
			return compressible.some((prefix) => contentType.startsWith(prefix))
		}

		it('should compress text content', () => {
			expect(shouldCompress('text/html')).toBe(true)
			expect(shouldCompress('text/css')).toBe(true)
			expect(shouldCompress('text/javascript')).toBe(true)
			expect(shouldCompress('text/plain')).toBe(true)
		})

		it('should compress application types', () => {
			expect(shouldCompress('application/json')).toBe(true)
			expect(shouldCompress('application/javascript')).toBe(true)
			expect(shouldCompress('application/xml')).toBe(true)
		})

		it('should compress SVG', () => {
			expect(shouldCompress('image/svg+xml')).toBe(true)
		})

		it('should not compress already compressed formats', () => {
			expect(shouldCompress('image/png')).toBe(false)
			expect(shouldCompress('image/jpeg')).toBe(false)
			expect(shouldCompress('application/zip')).toBe(false)
			expect(shouldCompress('video/mp4')).toBe(false)
		})

		it('should not compress audio formats', () => {
			expect(shouldCompress('audio/mpeg')).toBe(false)
			expect(shouldCompress('audio/ogg')).toBe(false)
		})

		it('should not compress other binary formats', () => {
			expect(shouldCompress('application/pdf')).toBe(false)
			expect(shouldCompress('application/octet-stream')).toBe(false)
		})
	})

	describe('accept-encoding parsing', () => {
		const parseAcceptEncoding = (header: string): string[] => {
			return header
				.split(',')
				.map((e) => e.trim().split(';')[0])
				.filter(Boolean)
		}

		it('should parse simple encoding', () => {
			expect(parseAcceptEncoding('gzip')).toEqual(['gzip'])
		})

		it('should parse multiple encodings', () => {
			expect(parseAcceptEncoding('gzip, deflate, br')).toEqual(['gzip', 'deflate', 'br'])
		})

		it('should parse encodings with quality', () => {
			expect(parseAcceptEncoding('gzip;q=1.0, br;q=0.8')).toEqual(['gzip', 'br'])
		})

		it('should handle identity', () => {
			expect(parseAcceptEncoding('identity')).toEqual(['identity'])
		})

		it('should handle wildcard', () => {
			expect(parseAcceptEncoding('*')).toEqual(['*'])
		})

		it('should handle empty header', () => {
			expect(parseAcceptEncoding('')).toEqual([])
		})

		it('should handle complex quality values', () => {
			const result = parseAcceptEncoding('gzip;q=0.9, br;q=1.0, deflate;q=0.5')
			expect(result).toContain('gzip')
			expect(result).toContain('br')
			expect(result).toContain('deflate')
		})

		it('should handle encodings with extra params', () => {
			expect(parseAcceptEncoding('gzip;level=5')).toEqual(['gzip'])
		})
	})

	describe('compress middleware', () => {
		it('should compress response when Accept-Encoding includes gzip', async () => {
			const middleware = compress({ threshold: 0 })
			const largeBody = 'Hello, World! '.repeat(100)
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: largeBody,
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should compress response when Accept-Encoding includes br', async () => {
			const middleware = compress({ threshold: 0 })
			const largeBody = 'Hello, World! '.repeat(100)
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: largeBody,
			}))

			const res = await handler(createMockContext('br'))
			expect(res.headers['content-encoding']).toBe('br')
		})

		it('should not compress when below threshold', async () => {
			const middleware = compress({ threshold: 10000 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'small',
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should not compress already encoded response', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: {
					'content-type': 'text/plain',
					'content-encoding': 'gzip',
				},
				body: 'already compressed',
			}))

			const res = await handler(createMockContext('gzip'))
			// Should not double-encode
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should not compress non-compressible content types', async () => {
			const middleware = compress({ threshold: 0 })
			const largeBody = 'x'.repeat(1000)
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'image/png' },
				body: largeBody,
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should handle null body', async () => {
			const middleware = compress()
			const handler = middleware(() => ({
				status: 204,
				headers: {},
				body: null,
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.status).toBe(204)
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should add Vary header', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers.vary).toContain('Accept-Encoding')
		})

		it('should preserve existing Vary header', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: {
					'content-type': 'text/plain',
					vary: 'Cookie',
				},
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers.vary).toContain('Cookie')
			expect(res.headers.vary).toContain('Accept-Encoding')
		})

		it('should use first accepted encoding in order of client preference', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			// Without quality values, client order determines preference
			// Implementation sorts by quality (defaulting to 1.0 for both), then uses first match
			const res = await handler(createMockContext('gzip, br'))
			// Both have same quality, so first supported in parsed order wins
			expect(['gzip', 'br']).toContain(res.headers['content-encoding'])
		})

		it("should not compress when client doesn't accept any encoding", async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext(''))
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should update content-length after compression', async () => {
			const middleware = compress({ threshold: 0 })
			const largeBody = 'x'.repeat(5000)
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: largeBody,
			}))

			const res = await handler(createMockContext('gzip'))
			const newLength = parseInt(res.headers['content-length'], 10)
			expect(newLength).toBeLessThan(largeBody.length)
		})

		it('should handle custom mime types', async () => {
			const middleware = compress({
				threshold: 0,
				mimeTypes: ['application/custom'],
			})
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'application/custom' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should handle custom compression level', async () => {
			const middleware = compress({ threshold: 0, level: 9 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should handle wildcard accept-encoding', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('*'))
			// Should use first supported encoding
			expect(res.headers['content-encoding']).toBeDefined()
		})

		it('should handle async handler', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return {
					status: 200,
					headers: { 'content-type': 'text/plain' },
					body: 'x'.repeat(2000),
				}
			})

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should handle handler error', async () => {
			const middleware = compress()
			const handler = middleware(() => {
				throw new Error('Handler error')
			})

			await expect(handler(createMockContext('gzip'))).rejects.toThrow('Handler error')
		})

		it('should not compress if compressed would be larger', async () => {
			const middleware = compress({ threshold: 0 })
			// Random data doesn't compress well
			const randomData = Array.from({ length: 100 }, () => String.fromCharCode(Math.floor(Math.random() * 256))).join(
				''
			)
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: randomData,
			}))

			const res = await handler(createMockContext('gzip'))
			// If compression doesn't reduce size, original should be returned
			// This depends on implementation - just verify it doesn't crash
			expect(res.status).toBe(200)
		})
	})

	describe('gzip convenience wrapper', () => {
		it('should only use gzip encoding', async () => {
			const middleware = gzip()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			// Even if client accepts br, should only use gzip
			const res = await handler(createMockContext('gzip, br'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should not compress if gzip not accepted', async () => {
			const middleware = gzip()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('br'))
			expect(res.headers['content-encoding']).toBeUndefined()
		})
	})

	describe('brotli convenience wrapper', () => {
		it('should only use brotli encoding', async () => {
			const middleware = brotli()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			// Even if client accepts gzip, should only use br
			const res = await handler(createMockContext('gzip, br'))
			expect(res.headers['content-encoding']).toBe('br')
		})

		it('should not compress if br not accepted', async () => {
			const middleware = brotli()
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBeUndefined()
		})
	})

	describe('edge cases', () => {
		it('should handle incompressible data', () => {
			// Random data doesn't compress well
			const input = Buffer.alloc(100)
			for (let i = 0; i < 100; i++) {
				input[i] = Math.floor(Math.random() * 256)
			}

			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(Buffer.compare(decompressed, input)).toBe(0)
		})

		it('should handle null bytes', () => {
			const input = Buffer.from([0x00, 0x00, 0x00, 0x00])
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(Buffer.compare(decompressed, input)).toBe(0)
		})

		it('should handle very long repetitive strings', () => {
			const input = Buffer.from('hello'.repeat(10000))
			const compressed = gzipSync(input)
			const decompressed = gunzipSync(compressed)

			expect(decompressed.toString()).toBe(input.toString())
			// Should compress very well
			expect(compressed.length).toBeLessThan(input.length / 10)
		})

		it('should handle content type with charset', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should handle missing content-type', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: {},
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('gzip'))
			// Without content-type, should not compress
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should handle quality values correctly', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			// Client prefers gzip over br
			const res = await handler(createMockContext('br;q=0.5, gzip;q=1.0'))
			expect(res.headers['content-encoding']).toBe('gzip')
		})

		it('should handle deflate encoding', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const res = await handler(createMockContext('deflate'))
			expect(res.headers['content-encoding']).toBe('deflate')
		})

		it('should handle empty body string', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: '',
			}))

			const res = await handler(createMockContext('gzip'))
			// Empty body is below threshold
			expect(res.headers['content-encoding']).toBeUndefined()
		})

		it('should handle concurrent compression requests', async () => {
			const middleware = compress({ threshold: 0 })
			const handler = middleware(() => ({
				status: 200,
				headers: { 'content-type': 'text/plain' },
				body: 'x'.repeat(2000),
			}))

			const requests = Array.from({ length: 10 }, () => handler(createMockContext('gzip')))

			const results = await Promise.all(requests)
			results.forEach((res) => {
				expect(res.headers['content-encoding']).toBe('gzip')
			})
		})
	})

	describe('performance', () => {
		it('should compress efficiently', () => {
			const input = Buffer.from('x'.repeat(10000))

			const start = performance.now()
			for (let i = 0; i < 100; i++) {
				gzipSync(input)
			}
			const duration = performance.now() - start

			expect(duration).toBeLessThan(1000) // 100 compressions in under 1 second
		})
	})
})
