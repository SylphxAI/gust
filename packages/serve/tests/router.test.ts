/**
 * Router Tests - Route Definition and Group Functions
 * Comprehensive tests covering all edge cases
 */

import { describe, expect, it } from 'bun:test'
import { text } from '@sylphx/gust-core'
import { all, del, get, group, head, merge, options, patch, post, prefix, put, router } from '../src/router'

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

	describe('router with prefix', () => {
		it('should create prefixed routes', () => {
			const api = router('/api', {
				health: get('/health', () => text('ok')),
				users: get('/users', () => text('ok')),
			})

			expect(api.routes.health.path).toBe('/api/health')
			expect(api.routes.users.path).toBe('/api/users')
		})

		it('should generate prefixed URLs', () => {
			const api = router('/api', {
				health: get('/health', () => text('ok')),
				user: get('/users/:id', () => text('ok')),
			})

			expect(api.url.health()).toBe('/api/health')
			expect(api.url.user({ id: 42 })).toBe('/api/users/42')
		})

		it('should compose with spread', () => {
			const api = router('/api', {
				health: get('/health', () => text('ok')),
			})

			const app = router({
				home: get('/', () => text('home')),
				...api.routes,
			})

			expect(app.routes.home.path).toBe('/')
			expect(app.routes.health.path).toBe('/api/health')
			expect(app.url.home()).toBe('/')
			expect(app.url.health()).toBe('/api/health')
		})

		it('should work without prefix', () => {
			const app = router({
				health: get('/health', () => text('ok')),
			})

			expect(app.routes.health.path).toBe('/health')
			expect(app.url.health()).toBe('/health')
		})
	})

	describe('nested routers', () => {
		it('should flatten nested routers', () => {
			const home = get('/', () => text('hi'))
			const help = get('/help', () => text('help'))
			const member = router({ home, help })

			const login = get('/login', () => text('login'))
			const app = router({ login, member })

			// Should have all routes flattened
			expect(app.routes.login.path).toBe('/login')
			expect(app.routes.home.path).toBe('/')
			expect(app.routes.help.path).toBe('/help')
		})

		it('should generate URLs for nested routes', () => {
			const home = get('/', () => text('hi'))
			const help = get('/help', () => text('help'))
			const member = router({ home, help })

			const login = get('/login', () => text('login'))
			const app = router({ login, member })

			expect(app.url.login()).toBe('/login')
			expect(app.url.home()).toBe('/')
			expect(app.url.help()).toBe('/help')
		})

		it('should work with prefixed nested routers', () => {
			const health = get('/health', () => text('ok'))
			const users = get('/users', () => text('users'))
			const api = router('/api', { health, users })

			const home = get('/', () => text('home'))
			const app = router({ home, api })

			expect(app.routes.home.path).toBe('/')
			expect(app.routes.health.path).toBe('/api/health')
			expect(app.routes.users.path).toBe('/api/users')
		})

		it('should work with multiple nested routers', () => {
			const health = get('/health', () => text('ok'))
			const api = router('/api', { health })

			const login = get('/login', () => text('login'))
			const auth = router('/auth', { login })

			const home = get('/', () => text('home'))
			const app = router({ home, api, auth })

			expect(app.routes.home.path).toBe('/')
			expect(app.routes.health.path).toBe('/api/health')
			expect(app.routes.login.path).toBe('/auth/login')
		})

		it('should deeply nest routers', () => {
			const item = get('/item', () => text('item'))
			const inner = router({ item })

			const list = get('/list', () => text('list'))
			const middle = router('/mid', { list, inner })

			const home = get('/', () => text('home'))
			const app = router({ home, middle })

			expect(app.routes.home.path).toBe('/')
			expect(app.routes.list.path).toBe('/mid/list')
			expect(app.routes.item.path).toBe('/mid/item')
		})
	})

	describe('route groups (legacy)', () => {
		it('should prefix routes with spread operator', () => {
			const routes = group(
				'/api',
				get('/users', () => text('ok')),
				get('/posts', () => text('ok'))
			)

			expect(routes).toHaveLength(2)
			expect(routes[0].path).toBe('/api/users')
			expect(routes[1].path).toBe('/api/posts')
		})

		it('should handle nested groups', () => {
			const routes = group(
				'/api',
				...group(
					'/v1',
					get('/users', () => text('ok'))
				),
				...group(
					'/v2',
					get('/users', () => text('ok'))
				)
			)

			expect(routes).toHaveLength(2)
			expect(routes[0].path).toBe('/api/v1/users')
			expect(routes[1].path).toBe('/api/v2/users')
		})

		it('should handle empty prefix', () => {
			const routes = group(
				'',
				get('/users', () => text('ok'))
			)

			expect(routes[0].path).toBe('/users')
		})

		it('should handle root prefix', () => {
			const routes = group(
				'/',
				get('users', () => text('ok'))
			)

			expect(routes[0].path).toBe('/users')
		})

		it('should preserve method in groups', () => {
			const routes = group(
				'/api',
				get('/read', () => text('ok')),
				post('/create', () => text('ok')),
				put('/update', () => text('ok')),
				del('/delete', () => text('ok'))
			)

			expect(routes[0].method).toBe('GET')
			expect(routes[1].method).toBe('POST')
			expect(routes[2].method).toBe('PUT')
			expect(routes[3].method).toBe('DELETE')
		})

		it('should preserve handler references', () => {
			const handler1 = () => text('handler1')
			const handler2 = () => text('handler2')

			const routes = group('/api', get('/a', handler1), get('/b', handler2))

			expect(routes[0].handler).toBe(handler1)
			expect(routes[1].handler).toBe(handler2)
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
			const handler = (ctx: any) => text(`path: ${ctx.path}`)
			const route = get('/test', handler)
			expect(route.handler).toBe(handler)
		})
	})

	describe('edge cases', () => {
		it('should handle empty group', () => {
			const routes = group('/api')
			expect(routes).toHaveLength(0)
		})

		it('should handle deep nesting', () => {
			const routes = group(
				'/a',
				...group(
					'/b',
					...group(
						'/c',
						...group(
							'/d',
							get('/e', () => text('ok'))
						)
					)
				)
			)

			expect(routes[0].path).toBe('/a/b/c/d/e')
		})

		it('should handle multiple routes in group', () => {
			const routes = group(
				'/api',
				get('/a', () => text('a')),
				get('/b', () => text('b')),
				get('/c', () => text('c')),
				get('/d', () => text('d')),
				get('/e', () => text('e'))
			)

			expect(routes).toHaveLength(5)
		})

		it('should handle single character paths', () => {
			const route = get('/a', () => text('ok'))
			expect(route.path).toBe('/a')
		})

		it('should handle numeric-like path segments', () => {
			const route = get('/v1/users/123', () => text('ok'))
			expect(route.path).toBe('/v1/users/123')
		})

		it('should handle mixed method groups', () => {
			const routes = group(
				'/api',
				get('/resource', () => text('get')),
				post('/resource', () => text('post')),
				put('/resource/:id', () => text('put')),
				patch('/resource/:id', () => text('patch')),
				del('/resource/:id', () => text('delete')),
				head('/resource', () => text('head')),
				options('/resource', () => text('options')),
				all('/catch-all', () => text('all'))
			)

			expect(routes).toHaveLength(8)
			expect(routes.map((r) => r.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', '*'])
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

		it('should handle group with all HTTP methods', () => {
			const routes = group(
				'/test',
				get('/', () => text('get')),
				post('/', () => text('post')),
				put('/', () => text('put')),
				patch('/', () => text('patch')),
				del('/', () => text('delete')),
				head('/', () => text('head')),
				options('/', () => text('options'))
			)

			expect(routes).toHaveLength(7)
			routes.forEach((route) => {
				expect(route.path).toBe('/test/')
			})
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

		it('should not share route objects between groups', () => {
			const handler = () => text('ok')
			const routes1 = group('/api1', get('/users', handler))
			const routes2 = group('/api2', get('/users', handler))

			expect(routes1[0]).not.toBe(routes2[0])
			expect(routes1[0].path).not.toBe(routes2[0].path)
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

	describe('router()', () => {
		it('should create router from named routes', () => {
			const home = get('/', () => text('home'))
			const about = get('/about', () => text('about'))

			const app = router({ home, about })

			expect(app).toHaveProperty('handler')
			expect(app).toHaveProperty('routes')
			expect(app).toHaveProperty('url')
			expect(typeof app.handler).toBe('function')
		})

		it('should expose routes object', () => {
			const home = get('/', () => text('home'))
			const users = get('/users', () => text('users'))

			const app = router({ home, users })

			expect(app.routes.home).toBe(home)
			expect(app.routes.users).toBe(users)
		})

		it('should generate URLs for static routes', () => {
			const home = get('/', () => text('home'))
			const about = get('/about', () => text('about'))

			const app = router({ home, about })

			expect(app.url.home()).toBe('/')
			expect(app.url.about()).toBe('/about')
		})

		it('should generate URLs with params', () => {
			const user = get('/users/:id', () => text('user'))
			const post = get('/users/:userId/posts/:postId', () => text('post'))

			const app = router({ user, post })

			expect(app.url.user({ id: 42 })).toBe('/users/42')
			expect(app.url.post({ userId: 1, postId: 99 })).toBe('/users/1/posts/99')
		})

		it('should throw on missing URL params', () => {
			const user = get('/users/:id', () => text('user'))
			const app = router({ user })

			expect(() => app.url.user({})).toThrow('Missing param: id')
		})

		it('should handle mixed static and param routes', () => {
			const home = get('/', () => text('home'))
			const user = get('/users/:id', () => text('user'))
			const settings = get('/settings', () => text('settings'))

			const app = router({ home, user, settings })

			expect(app.url.home()).toBe('/')
			expect(app.url.user({ id: 'abc' })).toBe('/users/abc')
			expect(app.url.settings()).toBe('/settings')
		})
	})

	describe('prefix()', () => {
		it('should prefix all routes', () => {
			const users = get('/users', () => text('users'))
			const posts = get('/posts', () => text('posts'))

			const prefixed = prefix('/api', { users, posts })

			expect(prefixed.users.path).toBe('/api/users')
			expect(prefixed.posts.path).toBe('/api/posts')
		})

		it('should preserve route methods', () => {
			const read = get('/data', () => text('read'))
			const write = post('/data', () => text('write'))

			const prefixed = prefix('/v1', { read, write })

			expect(prefixed.read.method).toBe('GET')
			expect(prefixed.write.method).toBe('POST')
		})
	})

	describe('merge()', () => {
		it('should merge multiple route objects', () => {
			const userRoutes = {
				listUsers: get('/users', () => text('list')),
				getUser: get('/users/:id', () => text('get')),
			}

			const postRoutes = {
				listPosts: get('/posts', () => text('list')),
				getPost: get('/posts/:id', () => text('get')),
			}

			const merged = merge(userRoutes, postRoutes)

			expect(merged.listUsers).toBe(userRoutes.listUsers)
			expect(merged.getUser).toBe(userRoutes.getUser)
			expect(merged.listPosts).toBe(postRoutes.listPosts)
			expect(merged.getPost).toBe(postRoutes.getPost)
		})

		it('should handle empty merge', () => {
			const merged = merge({}, {})
			expect(Object.keys(merged)).toHaveLength(0)
		})
	})
})
