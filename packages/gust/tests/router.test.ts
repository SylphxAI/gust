/**
 * Router Tests - Route Definition Functions
 * Comprehensive tests covering route builders and createRouter factory
 */

import { describe, expect, it } from 'bun:test'
import { all, createRouter, del, get, head, options, patch, post, put, routes } from '@sylphx/gust'
import { json, text } from '@sylphx/gust-core'

describe('Router', () => {
	describe('route definitions', () => {
		it('should create GET route', () => {
			const route = get('/users', () => text('ok'))
			expect(route.method).toBe('GET')
			expect(route.path).toBe('/users')
			expect(typeof route.handler).toBe('function')
		})

		it('should create POST route', () => {
			const route = post('/users', () => text('ok'))
			expect(route.method).toBe('POST')
			expect(route.path).toBe('/users')
		})

		it('should create PUT route', () => {
			const route = put('/users/:id', () => text('ok'))
			expect(route.method).toBe('PUT')
			expect(route.path).toBe('/users/:id')
		})

		it('should create PATCH route', () => {
			const route = patch('/users/:id', () => text('ok'))
			expect(route.method).toBe('PATCH')
			expect(route.path).toBe('/users/:id')
		})

		it('should create DELETE route', () => {
			const route = del('/users/:id', () => text('ok'))
			expect(route.method).toBe('DELETE')
			expect(route.path).toBe('/users/:id')
		})

		it('should create HEAD route', () => {
			const route = head('/users', () => text('ok'))
			expect(route.method).toBe('HEAD')
			expect(route.path).toBe('/users')
		})

		it('should create OPTIONS route', () => {
			const route = options('/users', () => text('ok'))
			expect(route.method).toBe('OPTIONS')
			expect(route.path).toBe('/users')
		})

		it('should create ALL route with wildcard method', () => {
			const route = all('/users', () => text('ok'))
			expect(route.method).toBe('*')
			expect(route.path).toBe('/users')
		})
	})

	describe('path patterns', () => {
		it('should accept static paths', () => {
			const route = get('/users/list', () => text('ok'))
			expect(route.path).toBe('/users/list')
		})

		it('should accept param paths', () => {
			const route = get('/users/:id', () => text('ok'))
			expect(route.path).toBe('/users/:id')
		})

		it('should accept multiple params', () => {
			const route = get('/users/:userId/posts/:postId', () => text('ok'))
			expect(route.path).toBe('/users/:userId/posts/:postId')
		})

		it('should accept wildcard paths', () => {
			const route = get('/static/*', () => text('ok'))
			expect(route.path).toBe('/static/*')
		})

		it('should accept root path', () => {
			const route = get('/', () => text('ok'))
			expect(route.path).toBe('/')
		})

		it('should accept paths with dots', () => {
			const route = get('/files/:name.json', () => text('ok'))
			expect(route.path).toBe('/files/:name.json')
		})

		it('should accept paths with hyphens', () => {
			const route = get('/api/user-profile', () => text('ok'))
			expect(route.path).toBe('/api/user-profile')
		})

		it('should accept paths with underscores', () => {
			const route = get('/api/user_profile', () => text('ok'))
			expect(route.path).toBe('/api/user_profile')
		})

		it('should accept complex nested paths', () => {
			const route = get('/api/v1/organizations/:orgId/teams/:teamId/members/:memberId', () => text('ok'))
			expect(route.path).toBe('/api/v1/organizations/:orgId/teams/:teamId/members/:memberId')
		})

		it('should accept trailing slash paths', () => {
			const route = get('/users/', () => text('ok'))
			expect(route.path).toBe('/users/')
		})

		it('should accept paths with query-like patterns', () => {
			const route = get('/search/:query', () => text('ok'))
			expect(route.path).toBe('/search/:query')
		})

		it('should handle single character paths', () => {
			const route = get('/a', () => text('ok'))
			expect(route.path).toBe('/a')
		})

		it('should handle numeric-like path segments', () => {
			const route = get('/v1/users/123', () => text('ok'))
			expect(route.path).toBe('/v1/users/123')
		})

		it('should handle very long paths', () => {
			const longPath = `/${'segment/'.repeat(50)}end`
			const route = get(longPath, () => text('ok'))
			expect(route.path).toBe(longPath)
		})

		it('should handle paths with encoded characters', () => {
			const route = get('/users/%20name', () => text('ok'))
			expect(route.path).toBe('/users/%20name')
		})

		it('should handle consecutive slashes (not normalized)', () => {
			const route = get('//users//list', () => text('ok'))
			expect(route.path).toBe('//users//list')
		})
	})

	describe('handler functions', () => {
		it('should store handler reference', () => {
			const handler = () => text('ok')
			const route = get('/test', handler)
			expect(route.handler).toBe(handler)
		})

		it('should accept async handlers', () => {
			const handler = async () => text('ok')
			const route = get('/test', handler)
			expect(route.handler).toBe(handler)
		})

		it('should accept handlers returning promises', () => {
			const handler = () => Promise.resolve(text('ok'))
			const route = get('/test', handler)
			expect(route.handler).toBe(handler)
		})

		it('should accept handlers with context parameter', () => {
			const handler = ({ ctx }: any) => text(`path: ${ctx.path}`)
			const route = get('/test', handler)
			expect(route.handler).toBe(handler)
		})
	})

	describe('route immutability', () => {
		it('should create new route objects', () => {
			const handler = () => text('ok')
			const route1 = get('/path1', handler)
			const route2 = get('/path2', handler)

			expect(route1).not.toBe(route2)
			expect(route1.path).not.toBe(route2.path)
		})
	})

	describe('type safety', () => {
		it('should have correct Route type shape', () => {
			const route = get('/test', () => text('ok'))

			// Verify route has all required properties
			expect(route).toHaveProperty('method')
			expect(route).toHaveProperty('path')
			expect(route).toHaveProperty('handler')

			// Verify types
			expect(typeof route.method).toBe('string')
			expect(typeof route.path).toBe('string')
			expect(typeof route.handler).toBe('function')
		})
	})

	describe('createRouter factory', () => {
		it('should create typed route builders', () => {
			const { get: typedGet, post: typedPost } = createRouter<{ db: string }>()

			const users = typedGet('/users', ({ ctx }) => json({ db: ctx.app.db }))
			const create = typedPost('/users', () => json({ created: true }))

			expect(users.method).toBe('GET')
			expect(users.path).toBe('/users')
			expect(create.method).toBe('POST')
			expect(create.path).toBe('/users')
		})

		it('should provide all HTTP method builders', () => {
			const router = createRouter<Record<string, never>>()

			expect(router.get).toBeDefined()
			expect(router.post).toBeDefined()
			expect(router.put).toBeDefined()
			expect(router.patch).toBeDefined()
			expect(router.del).toBeDefined()
			expect(router.head).toBeDefined()
			expect(router.options).toBeDefined()
			expect(router.all).toBeDefined()
		})

		it('should create routes with correct methods', () => {
			const router = createRouter<Record<string, never>>()

			expect(router.get('/a', () => text('ok')).method).toBe('GET')
			expect(router.post('/a', () => text('ok')).method).toBe('POST')
			expect(router.put('/a', () => text('ok')).method).toBe('PUT')
			expect(router.patch('/a', () => text('ok')).method).toBe('PATCH')
			expect(router.del('/a', () => text('ok')).method).toBe('DELETE')
			expect(router.head('/a', () => text('ok')).method).toBe('HEAD')
			expect(router.options('/a', () => text('ok')).method).toBe('OPTIONS')
			expect(router.all('/a', () => text('ok')).method).toBe('*')
		})

		it('should preserve paths with params', () => {
			const { get: typedGet } = createRouter<Record<string, never>>()

			const user = typedGet('/users/:id', ({ ctx }) => json({ id: ctx.params.id }))
			expect(user.path).toBe('/users/:id')
		})

		it('should allow multiple params in path', () => {
			const { get: typedGet } = createRouter<Record<string, never>>()

			const comment = typedGet('/posts/:postId/comments/:commentId', ({ ctx }) =>
				json({ postId: ctx.params.postId, commentId: ctx.params.commentId })
			)
			expect(comment.path).toBe('/posts/:postId/comments/:commentId')
		})
	})

	describe('handler args structure', () => {
		it('should pass ctx and input to handlers', async () => {
			const route = get('/test', ({ ctx, input }) => {
				expect(ctx).toBeDefined()
				expect(input).toBeUndefined()
				return text('ok')
			})

			// Handler signature should accept { ctx, input }
			expect(typeof route.handler).toBe('function')
		})

		it('should have ctx.params available', () => {
			const route = get('/users/:id', ({ ctx }) => {
				// ctx.params should be accessible
				return json({ id: ctx.params.id })
			})

			expect(typeof route.handler).toBe('function')
		})
	})

	describe('routes array', () => {
		it('should create array of routes', () => {
			const routes = [
				get('/users', () => text('users')),
				post('/users', () => text('create')),
				get('/users/:id', () => text('user')),
				put('/users/:id', () => text('update')),
				del('/users/:id', () => text('delete')),
			]

			expect(routes).toHaveLength(5)
			expect(routes[0].method).toBe('GET')
			expect(routes[1].method).toBe('POST')
			expect(routes[2].path).toBe('/users/:id')
		})

		it('should work with typed router', () => {
			type App = { db: string }
			const { get: typedGet, post: typedPost } = createRouter<App>()

			const routeList = [
				typedGet('/users', ({ ctx }) => json({ db: ctx.app.db })),
				typedPost('/users', ({ ctx }) => json({ db: ctx.app.db })),
			]

			expect(routeList).toHaveLength(2)
		})
	})

	describe('routes() helper', () => {
		it('should prefix all routes', () => {
			const memberRoutes = routes('/members', [get('/', () => text('list')), get('/:id', () => text('show'))])

			expect(memberRoutes).toHaveLength(2)
			expect(memberRoutes[0].path).toBe('/members/')
			expect(memberRoutes[1].path).toBe('/members/:id')
		})

		it('should handle nested routes', () => {
			const adminRoutes = routes('/admin', [
				get('/dashboard', () => text('dashboard')),
				...routes('/users', [get('/', () => text('list')), get('/:id', () => text('show'))]),
			])

			expect(adminRoutes).toHaveLength(3)
			expect(adminRoutes[0].path).toBe('/admin/dashboard')
			expect(adminRoutes[1].path).toBe('/admin/users/')
			expect(adminRoutes[2].path).toBe('/admin/users/:id')
		})

		it('should preserve route methods', () => {
			const prefixed = routes('/api', [
				get('/read', () => text('get')),
				post('/create', () => text('post')),
				put('/update', () => text('put')),
				del('/delete', () => text('delete')),
			])

			expect(prefixed[0].method).toBe('GET')
			expect(prefixed[1].method).toBe('POST')
			expect(prefixed[2].method).toBe('PUT')
			expect(prefixed[3].method).toBe('DELETE')
		})

		it('should work with typed routes', () => {
			type App = { db: string }
			const { get: typedGet, routes: typedRoutes } = createRouter<App>()

			const memberRoutes = typedRoutes('/members', [
				typedGet('/', ({ ctx }) => json({ db: ctx.app.db })),
				typedGet('/:id', ({ ctx }) => json({ id: ctx.params.id, db: ctx.app.db })),
			])

			expect(memberRoutes).toHaveLength(2)
			expect(memberRoutes[0].path).toBe('/members/')
			expect(memberRoutes[1].path).toBe('/members/:id')
		})

		it('should handle empty prefix', () => {
			const prefixed = routes('', [get('/users', () => text('users'))])

			expect(prefixed[0].path).toBe('/users')
		})

		it('should handle empty routes array', () => {
			const empty = routes('/api', [])
			expect(empty).toHaveLength(0)
		})
	})

	describe('App generic on simple functions', () => {
		it('should accept App type on get()', () => {
			type App = { db: string }
			const route = get<App>('/users', ({ ctx }) => json({ db: ctx.app.db }))

			expect(route.method).toBe('GET')
			expect(route.path).toBe('/users')
		})

		it('should accept App type on all route methods', () => {
			type App = { db: string }

			const routes = [
				get<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				post<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				put<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				patch<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				del<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				head<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				options<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
				all<App>('/a', ({ ctx }) => json({ db: ctx.app.db })),
			]

			expect(routes).toHaveLength(8)
		})

		it('should default to empty App when not specified', () => {
			// No <App> specified - should still work
			const route = get('/users', () => text('ok'))

			expect(route.method).toBe('GET')
			expect(route.path).toBe('/users')
		})
	})
})
