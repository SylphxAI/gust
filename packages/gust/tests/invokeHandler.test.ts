/**
 * invokeHandler Tests - Native Server Handler Invocation
 *
 * Tests the direct handler invocation path used by the Rust native server.
 * This is the critical integration point between Rust routing and JS handlers.
 */

import { describe, expect, it } from 'bun:test'
import { createApp, get, post } from '@sylphx/gust'
import type { NativeHandlerContext } from '@sylphx/gust-app'

// Simple response helpers
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

/**
 * Create a NativeHandlerContext for testing
 */
const createNativeContext = (overrides: Partial<NativeHandlerContext> = {}): NativeHandlerContext => ({
	method: 'GET',
	path: '/',
	query: '',
	headers: {},
	params: {},
	body: new Uint8Array(),
	...overrides,
})

describe('GustApp.invokeHandler', () => {
	describe('basic invocation', () => {
		it('should invoke handler by ID', async () => {
			const app = createApp({
				routes: [get('/test', () => json({ ok: true }))],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/test' }))

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ ok: true })
		})

		it('should invoke correct handler when multiple routes exist', async () => {
			const app = createApp({
				routes: [
					get('/first', () => json({ handler: 'first' })),
					get('/second', () => json({ handler: 'second' })),
					get('/third', () => json({ handler: 'third' })),
				],
			})

			const res0 = await app.invokeHandler(0, createNativeContext({ path: '/first' }))
			const res1 = await app.invokeHandler(1, createNativeContext({ path: '/second' }))
			const res2 = await app.invokeHandler(2, createNativeContext({ path: '/third' }))

			expect(JSON.parse(res0.body as string)).toEqual({ handler: 'first' })
			expect(JSON.parse(res1.body as string)).toEqual({ handler: 'second' })
			expect(JSON.parse(res2.body as string)).toEqual({ handler: 'third' })
		})

		it('should return 404 for invalid handler ID', async () => {
			const app = createApp({
				routes: [get('/test', () => json({}))],
			})

			const response = await app.invokeHandler(999, createNativeContext())

			expect(response.status).toBe(404)
		})

		it('should return 404 for negative handler ID', async () => {
			const app = createApp({
				routes: [get('/test', () => json({}))],
			})

			const response = await app.invokeHandler(-1, createNativeContext())

			expect(response.status).toBe(404)
		})
	})

	describe('path parameters', () => {
		it('should receive params from native context', async () => {
			const app = createApp({
				routes: [get('/users/:id', ({ ctx }) => json({ id: ctx.params.id }))],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/users/123',
					params: { id: '123' },
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ id: '123' })
		})

		it('should receive multiple params', async () => {
			const app = createApp({
				routes: [
					get('/posts/:postId/comments/:commentId', ({ ctx }) =>
						json({
							postId: ctx.params.postId,
							commentId: ctx.params.commentId,
						})
					),
				],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/posts/456/comments/789',
					params: { postId: '456', commentId: '789' },
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({
				postId: '456',
				commentId: '789',
			})
		})

		it('should handle empty params', async () => {
			const app = createApp({
				routes: [get('/static', ({ ctx }) => json({ params: ctx.params }))],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/static',
					params: {},
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ params: {} })
		})
	})

	describe('request body', () => {
		it('should parse body from Uint8Array', async () => {
			const app = createApp({
				routes: [
					post('/users', ({ ctx }) => {
						const body = ctx.json<{ name: string }>()
						return json({ created: body.name })
					}),
				],
			})

			const bodyStr = JSON.stringify({ name: 'Alice' })
			const bodyBytes = new TextEncoder().encode(bodyStr)

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					method: 'POST',
					path: '/users',
					headers: { 'content-type': 'application/json' },
					body: bodyBytes,
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ created: 'Alice' })
		})

		it('should handle empty body', async () => {
			const app = createApp({
				routes: [
					post('/empty', ({ ctx }) => {
						const body = ctx.json<Record<string, never>>()
						return json({ received: body })
					}),
				],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					method: 'POST',
					path: '/empty',
					body: new Uint8Array(),
				})
			)

			expect(response.status).toBe(200)
		})

		it('should handle large body', async () => {
			const app = createApp({
				routes: [
					post('/large', ({ ctx }) => {
						const body = ctx.json<{ data: string }>()
						return json({ length: body.data.length })
					}),
				],
			})

			const largeData = 'x'.repeat(10000)
			const bodyStr = JSON.stringify({ data: largeData })
			const bodyBytes = new TextEncoder().encode(bodyStr)

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					method: 'POST',
					path: '/large',
					headers: { 'content-type': 'application/json' },
					body: bodyBytes,
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ length: 10000 })
		})
	})

	describe('query string', () => {
		it('should pass query string to handler', async () => {
			const app = createApp({
				routes: [get('/search', ({ ctx }) => json({ query: ctx.query }))],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/search',
					query: 'q=hello&page=1',
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ query: 'q=hello&page=1' })
		})

		it('should handle empty query', async () => {
			const app = createApp({
				routes: [get('/search', ({ ctx }) => json({ query: ctx.query }))],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/search',
					query: '',
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ query: '' })
		})
	})

	describe('headers', () => {
		it('should pass headers to handler', async () => {
			const app = createApp({
				routes: [
					get('/headers', ({ ctx }) =>
						json({
							auth: ctx.headers.authorization,
							contentType: ctx.headers['content-type'],
						})
					),
				],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/headers',
					headers: {
						authorization: 'Bearer token123',
						'content-type': 'application/json',
					},
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({
				auth: 'Bearer token123',
				contentType: 'application/json',
			})
		})
	})

	describe('context provider', () => {
		it('should execute context provider in invoke path', async () => {
			type App = { userId: string }

			const app = createApp<App>({
				routes: [get('/me', ({ ctx }) => json({ userId: ctx.app.userId }))],
				context: () => ({ userId: 'user-123' }),
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/me' }))

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ userId: 'user-123' })
		})

		it('should execute async context provider', async () => {
			type App = { userId: string }

			const app = createApp<App>({
				routes: [get('/me', ({ ctx }) => json({ userId: ctx.app.userId }))],
				context: async () => {
					await new Promise((r) => setTimeout(r, 10))
					return { userId: 'async-user-456' }
				},
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/me' }))

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ userId: 'async-user-456' })
		})

		it('should pass raw context to context provider', async () => {
			type App = { requestPath: string }

			const app = createApp<App>({
				routes: [get('/info', ({ ctx }) => json({ path: ctx.app.requestPath }))],
				context: (raw) => ({ requestPath: raw.path }),
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					path: '/info',
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ path: '/info' })
		})
	})

	describe('middleware', () => {
		it('should apply middleware in invoke path', async () => {
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
				routes: [get('/test', () => json({ ok: true }))],
				middleware: addHeader,
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/test' }))

			expect(response.status).toBe(200)
			expect(response.headers['x-custom']).toBe('added')
		})

		it('should apply middleware that modifies context', async () => {
			const addTimestamp =
				<_App>(handler: any) =>
				async (ctx: any) => {
					const ctxWithTimestamp = { ...ctx, timestamp: Date.now() }
					return handler(ctxWithTimestamp)
				}

			const app = createApp({
				routes: [
					get('/test', ({ ctx }) => {
						// Middleware added timestamp should be accessible
						const timestamp = (ctx as any).timestamp
						return json({ hasTimestamp: typeof timestamp === 'number' })
					}),
				],
				middleware: addTimestamp,
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/test' }))

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ hasTimestamp: true })
		})
	})

	describe('error handling', () => {
		it('should handle handler errors gracefully', async () => {
			const app = createApp({
				routes: [
					get('/error', () => {
						throw new Error('Test error')
					}),
				],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/error' }))

			// Should not crash, should return error response
			expect(response.status).toBeGreaterThanOrEqual(500)
		})

		it('should handle async handler errors', async () => {
			const app = createApp({
				routes: [
					get('/async-error', async () => {
						await new Promise((r) => setTimeout(r, 10))
						throw new Error('Async test error')
					}),
				],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/async-error' }))

			expect(response.status).toBeGreaterThanOrEqual(500)
		})
	})

	describe('response types', () => {
		it('should handle json response', async () => {
			const app = createApp({
				routes: [get('/json', () => json({ key: 'value' }))],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/json' }))

			expect(response.status).toBe(200)
			expect(response.headers['content-type']).toBe('application/json')
		})

		it('should handle text response', async () => {
			const app = createApp({
				routes: [get('/text', () => text('Hello World'))],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/text' }))

			expect(response.status).toBe(200)
			expect(response.headers['content-type']).toBe('text/plain')
			expect(response.body).toBe('Hello World')
		})

		it('should handle custom status codes', async () => {
			const app = createApp({
				routes: [
					get('/created', () => ({
						status: 201,
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ created: true }),
					})),
				],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/created' }))

			expect(response.status).toBe(201)
		})

		it('should handle custom headers', async () => {
			const app = createApp({
				routes: [
					get('/custom', () => ({
						status: 200,
						headers: {
							'content-type': 'application/json',
							'x-custom-header': 'custom-value',
							'cache-control': 'no-cache',
						},
						body: '{}',
					})),
				],
			})

			const response = await app.invokeHandler(0, createNativeContext({ path: '/custom' }))

			expect(response.headers['x-custom-header']).toBe('custom-value')
			expect(response.headers['cache-control']).toBe('no-cache')
		})
	})

	describe('method handling', () => {
		it('should pass method to handler', async () => {
			const app = createApp({
				routes: [post('/data', ({ ctx }) => json({ method: ctx.method }))],
			})

			const response = await app.invokeHandler(
				0,
				createNativeContext({
					method: 'POST',
					path: '/data',
				})
			)

			expect(response.status).toBe(200)
			expect(JSON.parse(response.body as string)).toEqual({ method: 'POST' })
		})
	})

	describe('sequential invocations', () => {
		it('should handle multiple sequential invocations', async () => {
			let counter = 0
			const app = createApp({
				routes: [
					get('/counter', () => {
						counter++
						return json({ count: counter })
					}),
				],
			})

			const ctx = createNativeContext({ path: '/counter' })

			const res1 = await app.invokeHandler(0, ctx)
			const res2 = await app.invokeHandler(0, ctx)
			const res3 = await app.invokeHandler(0, ctx)

			expect(JSON.parse(res1.body as string).count).toBe(1)
			expect(JSON.parse(res2.body as string).count).toBe(2)
			expect(JSON.parse(res3.body as string).count).toBe(3)
		})

		it('should isolate context between invocations', async () => {
			type App = { requestId: string }

			let callCount = 0
			const app = createApp<App>({
				routes: [get('/request', ({ ctx }) => json({ id: ctx.app.requestId }))],
				context: () => {
					callCount++
					return { requestId: `req-${callCount}` }
				},
			})

			const ctx = createNativeContext({ path: '/request' })

			const res1 = await app.invokeHandler(0, ctx)
			const res2 = await app.invokeHandler(0, ctx)

			expect(JSON.parse(res1.body as string).id).toBe('req-1')
			expect(JSON.parse(res2.body as string).id).toBe('req-2')
		})
	})
})
