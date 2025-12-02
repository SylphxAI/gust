/**
 * GustApp - Stateless application container
 *
 * Separates app logic (routes, middleware, context) from transport (TCP, TLS).
 * Enables serverless, edge, and traditional server deployments with same code.
 *
 * @example
 * ```typescript
 * // Create stateless app
 * const app = createApp({
 *   routes: [get('/users', handler)],
 *   middleware: cors(),
 *   context: () => ({ db: getDb() }),
 * })
 *
 * // Use with Fetch API (Bun, Deno, CF Workers)
 * export default app  // Has .fetch property
 *
 * // Or with traditional server
 * const server = await serve({ app, port: 3000 })
 * ```
 */

import type { Handler, ServerResponse } from '@sylphx/gust-core'
import { getWasm, initWasm } from '@sylphx/gust-core'
import type { RawContext } from './context'
import { requestToRawContext, serverResponseToResponse, withApp } from './context'
import type { Route, RouteHandlerFn } from './router'
import type { ContextProvider, Middleware } from './serve'

// ============================================================================
// Types
// ============================================================================

/**
 * GustApp configuration
 */
export interface AppConfig<App = Record<string, never>> {
	/** Routes created with get(), post(), etc. */
	readonly routes: Route<string, string, App>[]
	/** Global middleware - wraps the entire router */
	readonly middleware?: Middleware<Partial<App>>
	/** Context provider - creates app context for each request */
	readonly context?: ContextProvider<App>
}

/**
 * GustApp - Stateless application container
 *
 * Contains the pure handler function and exposes multiple interfaces:
 * - `fetch` - Web Fetch API (Request → Response)
 * - `handle` - Internal handler (RawContext → ServerResponse)
 */
export interface GustApp<App = unknown> {
	/**
	 * Fetch API handler
	 *
	 * Compatible with Bun.serve, Deno.serve, Cloudflare Workers.
	 * Converts Request → RawContext → ServerResponse → Response.
	 *
	 * @example
	 * ```typescript
	 * // Bun
	 * Bun.serve({ fetch: app.fetch, port: 3000 })
	 *
	 * // Deno
	 * Deno.serve(app.fetch)
	 *
	 * // Direct call
	 * const response = await app.fetch(new Request('http://localhost/users'))
	 * ```
	 */
	readonly fetch: (request: Request) => Promise<Response>

	/**
	 * Internal handler (for advanced use)
	 *
	 * Takes RawContext directly, returns ServerResponse.
	 * Used by serve() and custom adapters.
	 */
	readonly handle: Handler<RawContext>

	/**
	 * App configuration (for introspection)
	 *
	 * Access routes, middleware, context provider.
	 */
	readonly config: AppConfig<App>

	/**
	 * Check if WASM router is initialized
	 */
	readonly isReady: () => boolean

	/**
	 * Initialize WASM router (called automatically on first request)
	 */
	readonly init: () => Promise<void>
}

// ============================================================================
// Router Builder
// ============================================================================

type WasmRouterType = {
	insert: (m: string, p: string, id: number) => void
	find: (
		m: string,
		p: string
	) => { found: boolean; handler_id: number; params: string[]; free: () => void }
}

/**
 * Create router handler from routes
 * Initializes WASM router lazily on first request
 */
const createRouterHandler = <App>(
	routes: Route<string, string, App>[]
): {
	handler: Handler<RawContext & { app: App }>
	init: () => Promise<void>
	isReady: () => boolean
} => {
	let wasmRouter: WasmRouterType | null = null
	let isInitialized = false
	const handlers: RouteHandlerFn<App, string>[] = []

	const initRouter = async () => {
		if (wasmRouter) return wasmRouter

		await initWasm()
		const wasm = getWasm()
		wasmRouter = new wasm.WasmRouter() as WasmRouterType

		for (const route of routes) {
			const handlerId = handlers.length
			handlers.push(route.handler as RouteHandlerFn<App, string>)
			wasmRouter.insert(route.method, route.path, handlerId)

			// Wildcard method - register for all HTTP methods
			if (route.method === '*') {
				for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
					wasmRouter.insert(method, route.path, handlerId)
				}
			}
		}

		isInitialized = true
		return wasmRouter
	}

	const handler: Handler<RawContext & { app: App }> = async (ctx) => {
		const router = await initRouter()
		const match = router.find(ctx.method, ctx.path)

		if (!match.found) {
			match.free()
			return {
				status: 404,
				headers: { 'content-type': 'text/plain' },
				body: 'Not Found',
			}
		}

		const h = handlers[match.handler_id]
		const params: Record<string, string> = {}

		const paramArray = match.params
		for (let i = 0; i < paramArray.length; i += 2) {
			const key = paramArray[i]
			const value = paramArray[i + 1]
			if (key !== undefined && value !== undefined) {
				params[key] = value
			}
		}
		match.free()

		if (!h) {
			return {
				status: 404,
				headers: { 'content-type': 'text/plain' },
				body: 'Not Found',
			}
		}

		// Update params in context
		const ctxWithParams = { ...ctx, params: { ...ctx.params, ...params } }

		return h({ ctx: ctxWithParams, input: undefined as never })
	}

	return {
		handler,
		init: async () => {
			await initRouter()
		},
		isReady: () => isInitialized,
	}
}

// ============================================================================
// App Builder
// ============================================================================

/**
 * Create a stateless Gust application
 *
 * Returns a GustApp that can be used with:
 * - `serve({ app })` - Traditional server
 * - `Bun.serve({ fetch: app.fetch })` - Bun
 * - `Deno.serve(app.fetch)` - Deno
 * - Direct `app.fetch(request)` calls
 *
 * @example
 * ```typescript
 * type App = { db: Database }
 *
 * const app = createApp<App>({
 *   routes: [
 *     get('/users', ({ ctx }) => json(ctx.app.db.getUsers())),
 *     get('/users/:id', ({ ctx }) => json(ctx.app.db.getUser(ctx.params.id))),
 *   ],
 *   middleware: compose(cors(), rateLimit()),
 *   context: () => ({ db: getDb() }),
 * })
 *
 * // Export for serverless
 * export default app
 *
 * // Or use with server
 * await serve({ app, port: 3000 })
 * ```
 */
export const createApp = <App = Record<string, never>>(config: AppConfig<App>): GustApp<App> => {
	const { routes, middleware, context: contextProvider } = config

	// Build router handler
	const { handler: routerHandler, init, isReady } = createRouterHandler(routes)

	// Wrap with middleware if provided
	const wrappedHandler = middleware ? middleware<App>(routerHandler) : routerHandler

	// Create internal handler that builds context
	const handle: Handler<RawContext> = async (raw: RawContext) => {
		// Create app context
		const app = contextProvider ? await contextProvider(raw) : ({} as App)
		const ctx = withApp(raw, app)

		return wrappedHandler(ctx)
	}

	// Create Fetch API handler
	const fetch = async (request: Request): Promise<Response> => {
		// Ensure WASM is initialized
		if (!isReady()) {
			await init()
		}

		// Convert Request to RawContext
		const raw = await requestToRawContext(request)

		// Handle request
		let response: ServerResponse
		try {
			response = await handle(raw)
		} catch (error) {
			console.error('Request handler error:', error)
			response = {
				status: 500,
				headers: { 'content-type': 'text/plain' },
				body: 'Internal Server Error',
			}
		}

		// Convert ServerResponse to Response
		return serverResponseToResponse(response)
	}

	return {
		fetch,
		handle,
		config,
		isReady,
		init,
	}
}
