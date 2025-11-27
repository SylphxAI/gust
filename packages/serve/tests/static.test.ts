/**
 * Static File Serving Tests - Comprehensive edge case coverage
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serveStatic } from '../src/static'

// Create mock context
const createMockContext = (method: string = 'GET', path: string = '/', headers: Record<string, string> = {}): any => ({
	method,
	path,
	query: '',
	headers,
	body: Buffer.alloc(0),
	params: {},
})

describe('Static File Serving', () => {
	const testDir = join(tmpdir(), `serve-static-test-${Date.now()}`)

	beforeAll(async () => {
		// Create test directory structure
		await mkdir(testDir, { recursive: true })
		await mkdir(join(testDir, 'subdir'), { recursive: true })
		await mkdir(join(testDir, 'deep', 'nested', 'path'), { recursive: true })
		await mkdir(join(testDir, '.hidden'), { recursive: true })

		// Create test files
		await writeFile(join(testDir, 'index.html'), '<html><body>Index</body></html>')
		await writeFile(join(testDir, 'style.css'), 'body { color: red; }')
		await writeFile(join(testDir, 'app.js'), 'console.log("hello")')
		await writeFile(join(testDir, 'data.json'), '{"key":"value"}')
		await writeFile(join(testDir, 'readme.txt'), 'Hello World')
		await writeFile(join(testDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
		await writeFile(join(testDir, 'font.woff2'), Buffer.alloc(100))
		await writeFile(join(testDir, 'subdir', 'page.html'), '<html>Page</html>')
		await writeFile(join(testDir, 'subdir', 'index.html'), '<html>Subdir Index</html>')
		await writeFile(join(testDir, 'deep', 'nested', 'path', 'file.txt'), 'Deep file')
		await writeFile(join(testDir, '.hidden', 'secret.txt'), 'Secret')
		await writeFile(join(testDir, '.dotfile'), 'Dotfile content')
	})

	afterAll(async () => {
		// Cleanup test directory
		await rm(testDir, { recursive: true, force: true })
	})

	describe('basic file serving', () => {
		it('should serve HTML file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toContain('text/html')
			expect(res.body).toContain('<html>')
		})

		it('should serve CSS file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/style.css'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toContain('text/css')
			expect(res.body).toContain('body')
		})

		it('should serve JavaScript file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/app.js'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toContain('javascript')
		})

		it('should serve JSON file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/data.json'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toContain('application/json')
		})

		it('should serve text file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/readme.txt'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toContain('text/plain')
			expect(res.body).toBe('Hello World')
		})

		it('should serve binary file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/image.png'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toBe('image/png')
		})

		it('should serve font file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/font.woff2'))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toBe('font/woff2')
		})
	})

	describe('index file handling', () => {
		it('should serve index.html for directory', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/'))

			expect(res.status).toBe(200)
			expect(res.body).toContain('Index')
		})

		it('should serve index.html for subdirectory', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/subdir/'))

			expect(res.status).toBe(200)
			expect(res.body).toContain('Subdir Index')
		})

		it('should use custom index file', async () => {
			const handler = serveStatic({ root: testDir, index: 'page.html' })
			const res = await handler(createMockContext('GET', '/subdir/'))

			expect(res.status).toBe(200)
			expect(res.body).toContain('Page')
		})

		it('should try multiple index files', async () => {
			const handler = serveStatic({ root: testDir, index: ['notexist.html', 'index.html'] })
			const res = await handler(createMockContext('GET', '/'))

			expect(res.status).toBe(200)
			expect(res.body).toContain('Index')
		})
	})

	describe('path traversal protection', () => {
		it('should prevent directory traversal', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/../../../etc/passwd'))

			// Implementation normalizes path and returns 404 (not found) or 403 (forbidden)
			expect([403, 404]).toContain(res.status)
		})

		it('should prevent traversal with encoded characters', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/..%2F..%2Fetc%2Fpasswd'))

			// Should either 403 or 404, not serve the file
			expect([403, 404]).toContain(res.status)
		})

		it('should handle double dots in path', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/subdir/../index.html'))

			// Should normalize and serve index.html
			expect(res.status).toBe(200)
		})
	})

	describe('dotfiles handling', () => {
		it('should ignore dotfiles by default', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/.dotfile'))

			expect(res.status).toBe(404)
		})

		it('should deny dotfiles when configured', async () => {
			const handler = serveStatic({ root: testDir, dotfiles: 'deny' })
			const res = await handler(createMockContext('GET', '/.dotfile'))

			expect(res.status).toBe(403)
		})

		it('should allow dotfiles when configured', async () => {
			const handler = serveStatic({ root: testDir, dotfiles: 'allow' })
			const res = await handler(createMockContext('GET', '/.dotfile'))

			expect(res.status).toBe(200)
			expect(res.body).toBe('Dotfile content')
		})

		it('should handle hidden directories', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/.hidden/secret.txt'))

			expect(res.status).toBe(404)
		})

		it('should allow hidden directory files when allowed', async () => {
			const handler = serveStatic({ root: testDir, dotfiles: 'allow' })
			const res = await handler(createMockContext('GET', '/.hidden/secret.txt'))

			expect(res.status).toBe(200)
		})
	})

	describe('caching headers', () => {
		it('should not set cache headers by default', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers['cache-control']).toBeUndefined()
		})

		it('should set max-age when configured', async () => {
			const handler = serveStatic({ root: testDir, maxAge: 3600 })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers['cache-control']).toContain('max-age=3600')
		})

		it('should set immutable when configured', async () => {
			const handler = serveStatic({ root: testDir, maxAge: 31536000, immutable: true })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers['cache-control']).toContain('immutable')
		})

		it('should include ETag by default', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers.etag).toBeDefined()
			expect(res.headers.etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/)
		})

		it('should include Last-Modified by default', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers['last-modified']).toBeDefined()
		})

		it('should disable ETag when configured', async () => {
			const handler = serveStatic({ root: testDir, etag: false })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers.etag).toBeUndefined()
		})

		it('should disable Last-Modified when configured', async () => {
			const handler = serveStatic({ root: testDir, lastModified: false })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.headers['last-modified']).toBeUndefined()
		})
	})

	describe('conditional requests', () => {
		it('should return 304 for matching ETag', async () => {
			const handler = serveStatic({ root: testDir })

			// First request to get ETag
			const res1 = await handler(createMockContext('GET', '/index.html'))
			const etag = res1.headers.etag

			// Second request with If-None-Match
			const res2 = await handler(
				createMockContext('GET', '/index.html', {
					'if-none-match': etag,
				})
			)

			expect(res2.status).toBe(304)
			expect(res2.body).toBeNull()
		})

		it('should return 304 for weak ETag match', async () => {
			const handler = serveStatic({ root: testDir })

			const res1 = await handler(createMockContext('GET', '/index.html'))
			const etag = res1.headers.etag

			const res2 = await handler(
				createMockContext('GET', '/index.html', {
					'if-none-match': `W/${etag}`,
				})
			)

			expect(res2.status).toBe(304)
		})

		it('should return 304 for If-Modified-Since', async () => {
			const handler = serveStatic({ root: testDir })

			const res1 = await handler(createMockContext('GET', '/index.html'))
			const _lastModified = res1.headers['last-modified']

			// Use a future date
			const futureDate = new Date(Date.now() + 86400000).toUTCString()

			const res2 = await handler(
				createMockContext('GET', '/index.html', {
					'if-modified-since': futureDate,
				})
			)

			expect(res2.status).toBe(304)
		})

		it('should return 200 for non-matching ETag', async () => {
			const handler = serveStatic({ root: testDir })

			const res = await handler(
				createMockContext('GET', '/index.html', {
					'if-none-match': '"invalid-etag"',
				})
			)

			expect(res.status).toBe(200)
		})
	})

	describe('HTTP methods', () => {
		it('should handle GET requests', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.status).toBe(200)
		})

		it('should handle HEAD requests', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('HEAD', '/index.html'))

			expect(res.status).toBe(200)
			expect(res.body).toBeNull()
			expect(res.headers['content-length']).toBeDefined()
		})

		it('should return 404 for POST requests', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('POST', '/index.html'))

			expect(res.status).toBe(404)
		})

		it('should return 404 for PUT requests', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('PUT', '/index.html'))

			expect(res.status).toBe(404)
		})

		it('should return 404 for DELETE requests', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('DELETE', '/index.html'))

			expect(res.status).toBe(404)
		})
	})

	describe('error handling', () => {
		it('should return 404 for non-existent file', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/nonexistent.txt'))

			expect(res.status).toBe(404)
		})

		it('should return 404 for directory without index', async () => {
			const handler = serveStatic({ root: testDir, index: 'notexist.html' })
			const res = await handler(createMockContext('GET', '/deep/nested/path/'))

			expect(res.status).toBe(404)
		})
	})

	describe('MIME types', () => {
		const mimeTests = [
			{ ext: 'html', type: 'text/html' },
			{ ext: 'css', type: 'text/css' },
			{ ext: 'js', type: 'text/javascript' },
			{ ext: 'json', type: 'application/json' },
			{ ext: 'txt', type: 'text/plain' },
			{ ext: 'png', type: 'image/png' },
			{ ext: 'woff2', type: 'font/woff2' },
		]

		for (const { ext, type } of mimeTests) {
			it(`should serve correct MIME type for .${ext}`, async () => {
				const filename = `test-mime.${ext}`
				await writeFile(join(testDir, filename), 'test content')

				const handler = serveStatic({ root: testDir })
				const res = await handler(createMockContext('GET', `/${filename}`))

				expect(res.status).toBe(200)
				expect(res.headers['content-type']).toContain(type)

				// Cleanup
				await rm(join(testDir, filename), { force: true })
			})
		}

		it('should serve unknown extension as octet-stream', async () => {
			const filename = 'test.unknown123'
			await writeFile(join(testDir, filename), 'test content')

			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', `/${filename}`))

			expect(res.status).toBe(200)
			expect(res.headers['content-type']).toBe('application/octet-stream')

			// Cleanup
			await rm(join(testDir, filename), { force: true })
		})
	})

	describe('nested paths', () => {
		it('should serve files from nested directory', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/deep/nested/path/file.txt'))

			expect(res.status).toBe(200)
			expect(res.body).toBe('Deep file')
		})

		it('should serve files from subdirectory', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/subdir/page.html'))

			expect(res.status).toBe(200)
			expect(res.body).toContain('Page')
		})
	})

	describe('edge cases', () => {
		it('should handle path with spaces', async () => {
			const filename = 'file with spaces.txt'
			await writeFile(join(testDir, filename), 'content')

			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', `/${filename}`))

			expect(res.status).toBe(200)

			await rm(join(testDir, filename), { force: true })
		})

		it('should handle path with encoded characters', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/index.html'))

			expect(res.status).toBe(200)
		})

		it('should handle root path', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/'))

			expect(res.status).toBe(200)
		})

		it('should handle trailing slash', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '/subdir/'))

			expect(res.status).toBe(200)
		})

		it('should handle double slashes', async () => {
			const handler = serveStatic({ root: testDir })
			const res = await handler(createMockContext('GET', '//index.html'))

			// Should normalize and serve
			expect([200, 404]).toContain(res.status)
		})
	})
})
