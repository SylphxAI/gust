/**
 * HTTP/2 Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { getAlpnProtocol, isHttp2, preload, preloadHint } from '../src/http2'

describe('HTTP/2', () => {
	describe('preloadHint', () => {
		it('should generate link header for single resource', () => {
			const hint = preloadHint([{ path: '/script.js', as: 'script' }])

			expect(hint).toBe('</script.js>; rel=preload; as=script')
		})

		it('should generate link header for multiple resources', () => {
			const hint = preloadHint([
				{ path: '/script.js', as: 'script' },
				{ path: '/style.css', as: 'style' },
			])

			expect(hint).toContain('</script.js>; rel=preload; as=script')
			expect(hint).toContain('</style.css>; rel=preload; as=style')
			expect(hint).toContain(', ')
		})

		it('should include crossorigin attribute', () => {
			const hint = preloadHint([{ path: '/font.woff2', as: 'font', crossorigin: true }])

			expect(hint).toContain('crossorigin')
		})

		it('should not include crossorigin when false', () => {
			const hint = preloadHint([{ path: '/script.js', as: 'script', crossorigin: false }])

			expect(hint).not.toContain('crossorigin')
		})

		it('should handle empty array', () => {
			const hint = preloadHint([])
			expect(hint).toBe('')
		})

		it('should handle many resources', () => {
			const resources = Array.from({ length: 10 }, (_, i) => ({
				path: `/resource${i}.js`,
				as: 'script',
			}))

			const hint = preloadHint(resources)

			expect(hint.split(', ').length).toBe(10)
		})

		it('should handle paths with special characters', () => {
			const hint = preloadHint([{ path: '/path/to/file.js?v=123', as: 'script' }])

			expect(hint).toContain('/path/to/file.js?v=123')
		})

		it('should handle absolute URLs', () => {
			const hint = preloadHint([{ path: 'https://cdn.example.com/script.js', as: 'script' }])

			expect(hint).toContain('https://cdn.example.com/script.js')
		})

		it('should support all as types', () => {
			const types = ['script', 'style', 'image', 'font', 'fetch', 'document', 'track', 'worker']

			for (const type of types) {
				const hint = preloadHint([{ path: '/file', as: type }])
				expect(hint).toContain(`as=${type}`)
			}
		})
	})

	describe('preload helpers', () => {
		it('should create script preload', () => {
			const resource = preload.script('/app.js')

			expect(resource.path).toBe('/app.js')
			expect(resource.as).toBe('script')
		})

		it('should create style preload', () => {
			const resource = preload.style('/styles.css')

			expect(resource.path).toBe('/styles.css')
			expect(resource.as).toBe('style')
		})

		it('should create image preload', () => {
			const resource = preload.image('/logo.png')

			expect(resource.path).toBe('/logo.png')
			expect(resource.as).toBe('image')
		})

		it('should create font preload with crossorigin', () => {
			const resource = preload.font('/font.woff2')

			expect(resource.path).toBe('/font.woff2')
			expect(resource.as).toBe('font')
			expect(resource.crossorigin).toBe(true)
		})

		it('should create font preload without crossorigin', () => {
			const resource = preload.font('/font.woff2', false)

			expect(resource.crossorigin).toBe(false)
		})

		it('should create fetch preload', () => {
			const resource = preload.fetch('/api/data')

			expect(resource.path).toBe('/api/data')
			expect(resource.as).toBe('fetch')
		})

		it('should work with preloadHint', () => {
			const hint = preloadHint([preload.script('/app.js'), preload.style('/styles.css'), preload.font('/font.woff2')])

			expect(hint).toContain('</app.js>; rel=preload; as=script')
			expect(hint).toContain('</styles.css>; rel=preload; as=style')
			expect(hint).toContain('</font.woff2>; rel=preload; as=font; crossorigin')
		})
	})

	describe('getAlpnProtocol', () => {
		it('should return alpn protocol from socket', () => {
			const socket = { alpnProtocol: 'h2' }
			expect(getAlpnProtocol(socket)).toBe('h2')
		})

		it('should return http/1.1 for missing protocol', () => {
			const socket = {}
			expect(getAlpnProtocol(socket)).toBe('http/1.1')
		})

		it('should return http/1.1 for undefined protocol', () => {
			const socket = { alpnProtocol: undefined }
			expect(getAlpnProtocol(socket)).toBe('http/1.1')
		})

		it('should return actual protocol when set', () => {
			expect(getAlpnProtocol({ alpnProtocol: 'h2' })).toBe('h2')
			expect(getAlpnProtocol({ alpnProtocol: 'http/1.1' })).toBe('http/1.1')
			expect(getAlpnProtocol({ alpnProtocol: 'h2c' })).toBe('h2c')
		})
	})

	describe('isHttp2', () => {
		it('should return true for h2 protocol', () => {
			const socket = { alpnProtocol: 'h2' }
			expect(isHttp2(socket)).toBe(true)
		})

		it('should return false for http/1.1', () => {
			const socket = { alpnProtocol: 'http/1.1' }
			expect(isHttp2(socket)).toBe(false)
		})

		it('should return false for missing protocol', () => {
			const socket = {}
			expect(isHttp2(socket)).toBe(false)
		})

		it('should return false for undefined protocol', () => {
			const socket = { alpnProtocol: undefined }
			expect(isHttp2(socket)).toBe(false)
		})

		it('should return false for h2c (clear text)', () => {
			const socket = { alpnProtocol: 'h2c' }
			expect(isHttp2(socket)).toBe(false)
		})

		it('should be case sensitive', () => {
			const socket = { alpnProtocol: 'H2' }
			expect(isHttp2(socket)).toBe(false)
		})
	})

	describe('preload integration', () => {
		it('should generate complete preload header', () => {
			const resources = [
				preload.script('/js/app.js'),
				preload.script('/js/vendor.js'),
				preload.style('/css/main.css'),
				preload.font('/fonts/roboto.woff2'),
				preload.image('/images/hero.jpg'),
			]

			const hint = preloadHint(resources)
			const parts = hint.split(', ')

			expect(parts.length).toBe(5)
			expect(parts[0]).toContain('app.js')
			expect(parts[1]).toContain('vendor.js')
			expect(parts[2]).toContain('main.css')
			expect(parts[3]).toContain('roboto.woff2')
			expect(parts[3]).toContain('crossorigin')
			expect(parts[4]).toContain('hero.jpg')
		})
	})

	describe('edge cases', () => {
		it('should handle path with unicode', () => {
			const hint = preloadHint([{ path: '/assets/图片.png', as: 'image' }])

			expect(hint).toContain('图片.png')
		})

		it('should handle empty path', () => {
			const hint = preloadHint([{ path: '', as: 'script' }])

			expect(hint).toContain('<>')
		})

		it('should handle path with spaces', () => {
			const hint = preloadHint([{ path: '/path/with spaces/file.js', as: 'script' }])

			expect(hint).toContain('with spaces')
		})

		it('should handle multiple fonts with different crossorigin', () => {
			const hint = preloadHint([
				{ path: '/font1.woff2', as: 'font', crossorigin: true },
				{ path: '/font2.woff2', as: 'font', crossorigin: false },
			])

			expect(hint).toContain('font1.woff2')
			expect(hint).toContain('crossorigin')
			// Check that second one doesn't have crossorigin
			const parts = hint.split(', ')
			expect(parts[0]).toContain('crossorigin')
			expect(parts[1]).not.toContain('crossorigin')
		})

		it('should handle very long paths', () => {
			const longPath = `/path/${'subdir/'.repeat(50)}file.js`
			const hint = preloadHint([{ path: longPath, as: 'script' }])

			expect(hint).toContain(longPath)
		})
	})

	describe('performance', () => {
		it('should generate hints quickly', () => {
			const resources = Array.from({ length: 100 }, (_, i) => ({
				path: `/resource${i}.js`,
				as: 'script',
			}))

			const start = performance.now()
			for (let i = 0; i < 1000; i++) {
				preloadHint(resources)
			}
			const duration = performance.now() - start

			expect(duration).toBeLessThan(500)
		})
	})
})
