/**
 * Tests for createApp() and GustApp
 *
 * These tests verify the new stateless app architecture
 */

import { describe, expect, it } from 'bun:test'
import { createApp, get, post } from '@sylphx/gust'

// Simple response helpers for testing (avoid importing from core which may not be built)
const json = <T>(data: T) => ({
	status: 200,
	headers: { 'content-type': 'application/json' },
	body: JSON.stringify(data),
})

const text = (data: string) => ({
	status: 200,
	headers: { 'content-type': 'text/plain' },
	body: data,
})

describe('createApp', () => {
	it('should create a GustApp with fetch and handle', () => {
		const app = createApp({
			routes: [get('/health', () => json({ status: 'ok' }))],
		})

		expect(app.fetch).toBeDefined()
		expect(app.handle).toBeDefined()
		expect(app.config).toBeDefined()
		expect(app.isReady).toBeDefined()
		expect(app.init).toBeDefined()
	})

	it('should handle a simple GET request via fetch', async () => {
		const app = createApp({
			routes: [get('/health', () => json({ status: 'ok' }))],
		})

		const request = new Request('http://localhost/health')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body).toEqual({ status: 'ok' })
	})

	it('should handle route parameters', async () => {
		const app = createApp({
			routes: [get('/users/:id', ({ ctx }) => json({ id: ctx.params.id }))],
		})

		const request = new Request('http://localhost/users/123')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body).toEqual({ id: '123' })
	})

	it('should handle query parameters', async () => {
		const app = createApp({
			routes: [get('/search', ({ ctx }) => json({ query: ctx.query }))],
		})

		const request = new Request('http://localhost/search?q=hello&page=1')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body.query).toBe('q=hello&page=1')
	})

	it('should handle POST with body', async () => {
		const app = createApp({
			routes: [
				post('/users', ({ ctx }) => {
					const body = ctx.json<{ name: string }>()
					return json({ created: body.name })
				}),
			],
		})

		const request = new Request('http://localhost/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Alice' }),
		})
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body).toEqual({ created: 'Alice' })
	})

	it('should return 404 for unknown routes', async () => {
		const app = createApp({
			routes: [get('/known', () => text('ok'))],
		})

		const request = new Request('http://localhost/unknown')
		const response = await app.fetch(request)

		expect(response.status).toBe(404)
	})

	it('should work with middleware', async () => {
		// Simple middleware that adds a custom header
		const addHeader =
			<_App>(handler: any) =>
			async (ctx: any) => {
				const res = await handler(ctx)
				return {
					...res,
					headers: { ...res.headers, 'x-custom': 'added' },
				}
			}

		const app = createApp({
			routes: [get('/api/data', () => json({ data: 'test' }))],
			middleware: addHeader,
		})

		const request = new Request('http://localhost/api/data')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		expect(response.headers.get('x-custom')).toBe('added')
	})

	it('should work with context provider', async () => {
		type App = { requestId: string }

		const app = createApp<App>({
			routes: [get('/request-id', ({ ctx }) => json({ id: ctx.app.requestId }))],
			context: () => ({ requestId: 'req-123' }),
		})

		const request = new Request('http://localhost/request-id')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body).toEqual({ id: 'req-123' })
	})

	it('should work with async context provider', async () => {
		type App = { userId: string }

		const app = createApp<App>({
			routes: [get('/me', ({ ctx }) => json({ userId: ctx.app.userId }))],
			context: async () => {
				// Simulate async context creation (e.g., DB lookup)
				await new Promise((resolve) => setTimeout(resolve, 1))
				return { userId: 'user-456' }
			},
		})

		const request = new Request('http://localhost/me')
		const response = await app.fetch(request)

		expect(response.status).toBe(200)
		const body = await response.json()
		expect(body).toEqual({ userId: 'user-456' })
	})

	it('should handle multiple routes', async () => {
		const app = createApp({
			routes: [
				get('/users', () => json({ users: [] })),
				get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
				post('/users', () => json({ created: true })),
			],
		})

		// Test GET /users
		const res1 = await app.fetch(new Request('http://localhost/users'))
		expect(res1.status).toBe(200)
		expect(await res1.json()).toEqual({ users: [] })

		// Test GET /users/:id
		const res2 = await app.fetch(new Request('http://localhost/users/42'))
		expect(res2.status).toBe(200)
		expect(await res2.json()).toEqual({ id: '42' })

		// Test POST /users
		const res3 = await app.fetch(new Request('http://localhost/users', { method: 'POST' }))
		expect(res3.status).toBe(200)
		expect(await res3.json()).toEqual({ created: true })
	})

	it('should preserve headers from response', async () => {
		const app = createApp({
			routes: [
				get('/custom', () => ({
					status: 200,
					headers: {
						'content-type': 'application/json',
						'x-custom-header': 'custom-value',
					},
					body: '{}',
				})),
			],
		})

		const request = new Request('http://localhost/custom')
		const response = await app.fetch(request)

		expect(response.headers.get('x-custom-header')).toBe('custom-value')
	})

	it('should handle errors gracefully', async () => {
		const app = createApp({
			routes: [
				get('/error', () => {
					throw new Error('Test error')
				}),
			],
		})

		const request = new Request('http://localhost/error')
		const response = await app.fetch(request)

		expect(response.status).toBe(500)
	})

	it('should be usable with Bun.serve pattern', async () => {
		const app = createApp({
			routes: [get('/', () => text('Hello'))],
		})

		// This is the pattern for Bun.serve: { fetch: app.fetch }
		expect(typeof app.fetch).toBe('function')

		// Simulate Bun.serve calling the fetch handler
		const response = await app.fetch(new Request('http://localhost/'))
		expect(response.status).toBe(200)
		expect(await response.text()).toBe('Hello')
	})
})

describe('GustApp.handle', () => {
	it('should work with RawContext directly', async () => {
		const app = createApp({
			routes: [get('/test', () => json({ ok: true }))],
		})

		// Initialize the app
		await app.init()

		// Create a raw context manually
		const rawContext = {
			method: 'GET',
			path: '/test',
			query: '',
			headers: {},
			params: {},
			body: Buffer.alloc(0),
			json: <T>() => ({}) as T,
			raw: Buffer.alloc(0),
			socket: null as any,
		}

		const response = await app.handle(rawContext)

		expect(response.status).toBe(200)
		expect(JSON.parse(response.body as string)).toEqual({ ok: true })
	})
})

describe('GustApp.isReady', () => {
	it('should return false before first request', () => {
		const app = createApp({
			routes: [get('/', () => text('ok'))],
		})

		expect(app.isReady()).toBe(false)
	})

	it('should return true after init()', async () => {
		const app = createApp({
			routes: [get('/', () => text('ok'))],
		})

		await app.init()
		expect(app.isReady()).toBe(true)
	})

	it('should return true after first request', async () => {
		const app = createApp({
			routes: [get('/', () => text('ok'))],
		})

		await app.fetch(new Request('http://localhost/'))
		expect(app.isReady()).toBe(true)
	})
})
