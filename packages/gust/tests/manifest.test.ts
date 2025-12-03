/**
 * Manifest Tests - Route Manifest Generation
 *
 * Tests route manifest generation for Rust native router integration.
 * The Rust router now uses Express-style syntax (:id, *path) directly,
 * so no path conversion is needed.
 */

import { describe, expect, it } from 'bun:test'
import { all, createApp, del, get, patch, post, put, routes } from '@sylphx/gust'

// Simple response helper
const json = <T>(data: T) => ({
	status: 200,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(data),
})

describe('Route Manifest', () => {
	describe('manifest structure', () => {
		it('should have correct manifest properties', () => {
			const app = createApp({
				routes: [get('/test', () => json({}))],
			})

			expect(app.manifest).toBeDefined()
			expect(app.manifest.routes).toBeDefined()
			expect(app.manifest.handlerCount).toBeDefined()
			expect(Array.isArray(app.manifest.routes)).toBe(true)
		})

		it('should have correct handlerCount', () => {
			const app = createApp({
				routes: [get('/a', () => json({})), get('/b', () => json({})), post('/c', () => json({}))],
			})

			expect(app.manifest.handlerCount).toBe(3)
		})

		it('should assign sequential handler IDs', () => {
			const app = createApp({
				routes: [get('/first', () => json({})), get('/second', () => json({})), get('/third', () => json({}))],
			})

			expect(app.manifest.routes[0].handlerId).toBe(0)
			expect(app.manifest.routes[1].handlerId).toBe(1)
			expect(app.manifest.routes[2].handlerId).toBe(2)
		})

		it('should include correct method for each route', () => {
			const app = createApp({
				routes: [
					get('/get', () => json({})),
					post('/post', () => json({})),
					put('/put', () => json({})),
					patch('/patch', () => json({})),
					del('/delete', () => json({})),
				],
			})

			expect(app.manifest.routes[0].method).toBe('GET')
			expect(app.manifest.routes[1].method).toBe('POST')
			expect(app.manifest.routes[2].method).toBe('PUT')
			expect(app.manifest.routes[3].method).toBe('PATCH')
			expect(app.manifest.routes[4].method).toBe('DELETE')
		})
	})

	describe('path passthrough (Express-style)', () => {
		it('should keep static paths unchanged', () => {
			const app = createApp({
				routes: [get('/users', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/users')
		})

		it('should keep root path unchanged', () => {
			const app = createApp({
				routes: [get('/', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/')
		})

		it('should keep Express-style :id parameters unchanged', () => {
			const app = createApp({
				routes: [get('/users/:id', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/users/:id')
		})

		it('should keep multiple parameters unchanged', () => {
			const app = createApp({
				routes: [get('/posts/:postId/comments/:commentId', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/posts/:postId/comments/:commentId')
		})

		it('should keep complex nested parameters unchanged', () => {
			const app = createApp({
				routes: [get('/api/v1/orgs/:orgId/teams/:teamId/members/:memberId', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/api/v1/orgs/:orgId/teams/:teamId/members/:memberId')
		})

		it('should keep wildcard *path unchanged', () => {
			const app = createApp({
				routes: [get('/files/*path', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/files/*path')
		})

		it('should keep bare wildcard * unchanged', () => {
			const app = createApp({
				routes: [get('/static/*', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/static/*')
		})

		it('should keep parameter followed by extension unchanged', () => {
			const app = createApp({
				routes: [get('/files/:name.json', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/files/:name.json')
		})

		it('should keep parameters with hyphens unchanged', () => {
			const app = createApp({
				routes: [get('/users/:user-id', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/users/:user-id')
		})

		it('should keep parameters with underscores unchanged', () => {
			const app = createApp({
				routes: [get('/users/:user_id', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/users/:user_id')
		})

		it('should keep mixed static and dynamic segments unchanged', () => {
			const app = createApp({
				routes: [get('/api/users/:id/profile', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/api/users/:id/profile')
		})

		it('should keep paths with trailing slash unchanged', () => {
			const app = createApp({
				routes: [get('/users/:id/', () => json({}))],
			})

			expect(app.manifest.routes[0].path).toBe('/users/:id/')
		})
	})

	describe('hasParams detection', () => {
		it('should set hasParams=false for static routes', () => {
			const app = createApp({
				routes: [get('/users', () => json({}))],
			})

			expect(app.manifest.routes[0].hasParams).toBe(false)
		})

		it('should set hasParams=true for parameterized routes', () => {
			const app = createApp({
				routes: [get('/users/:id', () => json({}))],
			})

			expect(app.manifest.routes[0].hasParams).toBe(true)
		})

		it('should set hasParams=true for multiple parameters', () => {
			const app = createApp({
				routes: [get('/posts/:postId/comments/:commentId', () => json({}))],
			})

			expect(app.manifest.routes[0].hasParams).toBe(true)
		})
	})

	describe('hasWildcard detection', () => {
		it('should set hasWildcard=false for non-wildcard routes', () => {
			const app = createApp({
				routes: [get('/users', () => json({}))],
			})

			expect(app.manifest.routes[0].hasWildcard).toBe(false)
		})

		it('should set hasWildcard=false for param routes without wildcard', () => {
			const app = createApp({
				routes: [get('/users/:id', () => json({}))],
			})

			expect(app.manifest.routes[0].hasWildcard).toBe(false)
		})

		it('should set hasWildcard=true for wildcard routes', () => {
			const app = createApp({
				routes: [get('/files/*path', () => json({}))],
			})

			expect(app.manifest.routes[0].hasWildcard).toBe(true)
		})

		it('should set hasWildcard=true for bare wildcard', () => {
			const app = createApp({
				routes: [get('/static/*', () => json({}))],
			})

			expect(app.manifest.routes[0].hasWildcard).toBe(true)
		})
	})

	describe('wildcard method expansion', () => {
		it('should expand all() to multiple HTTP methods', () => {
			const app = createApp({
				routes: [all('/api/health', () => json({}))],
			})

			// Should have multiple entries for the same path
			expect(app.manifest.routes.length).toBeGreaterThan(1)

			const methods = app.manifest.routes.map((r) => r.method)
			expect(methods).toContain('GET')
			expect(methods).toContain('POST')
			expect(methods).toContain('PUT')
			expect(methods).toContain('DELETE')
			expect(methods).toContain('PATCH')
			expect(methods).toContain('HEAD')
			expect(methods).toContain('OPTIONS')
		})

		it('should use same handlerId for all expanded methods', () => {
			const app = createApp({
				routes: [all('/api/data', () => json({}))],
			})

			const handlerIds = new Set(app.manifest.routes.map((r) => r.handlerId))
			expect(handlerIds.size).toBe(1)
			expect(handlerIds.has(0)).toBe(true)
		})

		it('should keep Express-style path in expanded routes', () => {
			const app = createApp({
				routes: [all('/users/:id', () => json({}))],
			})

			// All expanded routes should keep Express-style path
			for (const route of app.manifest.routes) {
				expect(route.path).toBe('/users/:id')
			}
		})

		it('should handle handlerCount correctly with wildcard expansion', () => {
			const app = createApp({
				routes: [get('/a', () => json({})), all('/b', () => json({})), post('/c', () => json({}))],
			})

			// handlerCount should be number of original routes, not expanded
			expect(app.manifest.handlerCount).toBe(3)
		})
	})

	describe('routes() prefix helper manifest generation', () => {
		it('should prefix paths correctly', () => {
			const app = createApp({
				routes: routes('/api', [get('/users', () => json({})), get('/users/:id', () => json({}))]),
			})

			expect(app.manifest.routes[0].path).toBe('/api/users')
			expect(app.manifest.routes[1].path).toBe('/api/users/:id')
		})

		it('should handle nested routes() with params', () => {
			const app = createApp({
				routes: routes('/api', [
					...routes('/orgs/:orgId', [get('/members', () => json({})), get('/members/:memberId', () => json({}))]),
				]),
			})

			expect(app.manifest.routes[0].path).toBe('/api/orgs/:orgId/members')
			expect(app.manifest.routes[1].path).toBe('/api/orgs/:orgId/members/:memberId')
		})
	})

	describe('empty and edge cases', () => {
		it('should handle empty routes array', () => {
			const app = createApp({
				routes: [],
			})

			expect(app.manifest.routes).toHaveLength(0)
			expect(app.manifest.handlerCount).toBe(0)
		})

		it('should handle single route', () => {
			const app = createApp({
				routes: [get('/', () => json({}))],
			})

			expect(app.manifest.routes).toHaveLength(1)
			expect(app.manifest.handlerCount).toBe(1)
		})

		it('should handle many routes', () => {
			const routeList = Array.from({ length: 100 }, (_, i) => get(`/route${i}`, () => json({})))

			const app = createApp({ routes: routeList })

			expect(app.manifest.routes).toHaveLength(100)
			expect(app.manifest.handlerCount).toBe(100)
		})
	})

	describe('manifest route entry structure', () => {
		it('should have all required fields in route entry', () => {
			const app = createApp({
				routes: [get('/users/:id', () => json({}))],
			})

			const entry = app.manifest.routes[0]
			expect(entry).toHaveProperty('method')
			expect(entry).toHaveProperty('path')
			expect(entry).toHaveProperty('handlerId')
			expect(entry).toHaveProperty('hasParams')
			expect(entry).toHaveProperty('hasWildcard')
		})

		it('should have correct types for all fields', () => {
			const app = createApp({
				routes: [get('/users/:id', () => json({}))],
			})

			const entry = app.manifest.routes[0]
			expect(typeof entry.method).toBe('string')
			expect(typeof entry.path).toBe('string')
			expect(typeof entry.handlerId).toBe('number')
			expect(typeof entry.hasParams).toBe('boolean')
			expect(typeof entry.hasWildcard).toBe('boolean')
		})
	})
})
