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
import type { Context, RawContext } from './context'
import {
	requestToRawContext,
	responseToServerResponse,
	serverResponseToResponse,
	withApp,
} from './context'
import type { Route, RouteHandlerFn } from './router'
import type { ContextProvider, Middleware } from './types'
import { WILDCARD_METHODS } from './types'

// ============================================================================
// Response Normalization
// ============================================================================

/**
 * Normalize handler result - auto-convert Response to ServerResponse
 *
 * Allows handlers to return either ServerResponse or fetch Response.
 * Enables seamless integration with fetch-based handlers like GraphQL Yoga.
 */
const normalizeResponse = async (
	result: ServerResponse | Response | Promise<ServerResponse | Response>
): Promise<ServerResponse> => {
	const resolved = await result

	// Check if it's a fetch Response (has arrayBuffer method)
	if (resolved instanceof Response) {
		return responseToServerResponse(resolved)
	}

	return resolved as ServerResponse
}

/**
 * Gust-style handler type
 * Takes { ctx, input } object and returns ServerResponse
 */
type GustHandler<App = unknown> = (args: {
	ctx: Context<App>
	input: unknown
}) => ServerResponse | Promise<ServerResponse>

/**
 * Call handler with type-safe dispatch
 *
 * Uses marker symbol to detect handler type instead of try-catch.
 * Handlers wrapped with fetchHandler() are dispatched as Fetch-style,
 * all other handlers are dispatched as Gust-style.
 *
 * @example Gust-style (default)
 * ```typescript
 * get('/users', ({ ctx }) => json(ctx.app.users))
 * ```
 *
 * @example Fetch-style (with fetchHandler wrapper)
 * ```typescript
 * import { createYoga } from 'graphql-yoga'
 * all('/graphql', fetchHandler(yoga.fetch))
 * ```
 */
const callHandler = async (
	handler: GustHandler,
	ctx: Context<unknown>,
	input: unknown
): Promise<ServerResponse> => {
	// Fetch-style handlers are already wrapped by fetchHandler()
	// They accept { ctx, input } but internally use ctx.request
	// So we can call them uniformly as Gust-style
	const result = handler({ ctx, input })
	return normalizeResponse(result)
}

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
 * Route entry for manifest - describes a single route
 */
export interface RouteEntry {
	/** HTTP method (GET, POST, etc.) or * for all */
	readonly method: string
	/** Route path pattern (e.g., /users/:id) */
	readonly path: string
	/** Handler ID for Rust to reference */
	readonly handlerId: number
	/** Whether route has path parameters */
	readonly hasParams: boolean
	/** Whether route has wildcard */
	readonly hasWildcard: boolean
}

/**
 * Route manifest - all routes for Rust registration
 *
 * Enables Rust server to:
 * 1. Build its own Radix Trie router
 * 2. Route requests without calling JS
 * 3. Call specific handler by ID only for matched routes
 */
export interface RouteManifest {
	/** All route definitions */
	readonly routes: readonly RouteEntry[]
	/** Total number of handlers */
	readonly handlerCount: number
}

/**
 * Handler context passed from Rust to JS
 * Contains pre-parsed request data from Rust router
 */
export interface NativeHandlerContext {
	readonly method: string
	readonly path: string
	readonly query: string
	readonly headers: Record<string, string>
	readonly params: Record<string, string>
	readonly body: Uint8Array
}

/**
 * Input for invoke handler callback from Rust
 * Wraps handlerId and context for clean marshalling
 */
export interface InvokeHandlerInput {
	readonly handler_id: number
	readonly ctx: NativeHandlerContext
}

/**
 * GustApp - Stateless application container
 *
 * Contains the pure handler function and exposes multiple interfaces:
 * - `fetch` - Web Fetch API (Request → Response)
 * - `handle` - Internal handler (RawContext → ServerResponse)
 * - `manifest` - Route definitions for Rust registration
 * - `invokeHandler` - Direct handler invocation by ID (for Rust)
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
	 * Route manifest for Rust registration
	 *
	 * Describes all routes so Rust can build its own router
	 * and dispatch to specific handlers by ID.
	 */
	readonly manifest: RouteManifest

	/**
	 * Invoke handler by ID (for Rust native server)
	 *
	 * Called by Rust after routing - skips JS routing entirely.
	 * Rust passes pre-parsed context and matched params.
	 *
	 * @param handlerId - Handler ID from route manifest
	 * @param ctx - Pre-parsed context from Rust
	 * @returns ServerResponse
	 */
	readonly invokeHandler: (handlerId: number, ctx: NativeHandlerContext) => Promise<ServerResponse>

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
				for (const method of WILDCARD_METHODS) {
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

		// Call handler with auto-detection (supports both Gust and fetch-style)
		return callHandler(h, ctxWithParams, undefined)
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

// ============================================================================
// Manifest Builder
// ============================================================================

/**
 * Build route manifest from route definitions
 * Used by Rust server to register routes
 */
const buildManifest = <App>(routes: Route<string, string, App>[]): RouteManifest => {
	const entries: RouteEntry[] = []

	for (let i = 0; i < routes.length; i++) {
		const route = routes[i]
		if (!route) continue
		const hasParams = route.path.includes(':')
		const hasWildcard = route.path.includes('*')

		entries.push({
			method: route.method,
			path: route.path,
			handlerId: i,
			hasParams,
			hasWildcard,
		})

		// Wildcard method - register for all HTTP methods
		if (route.method === '*') {
			for (const method of WILDCARD_METHODS) {
				entries.push({
					method,
					path: route.path,
					handlerId: i,
					hasParams,
					hasWildcard,
				})
			}
		}
	}

	return {
		routes: entries,
		handlerCount: routes.length,
	}
}

// ============================================================================
// App Builder
// ============================================================================

/**
 * Create a stateless Gust application
 *
 * Returns a GustApp that can be used with:
 * - `serve({ app })` - Traditional server (Rust routes, JS handlers)
 * - `Bun.serve({ fetch: app.fetch })` - Bun
 * - `Deno.serve(app.fetch)` - Deno
 * - Direct `app.fetch(request)` calls
 *
 * Architecture:
 * ```
 * createApp() → GustApp
 *   ├── .fetch (Fetch API) → WASM routing → handler
 *   ├── .handle (RawContext) → WASM routing → handler
 *   ├── .manifest → Route definitions for Rust
 *   └── .invokeHandler(id, ctx) → Direct handler call (Rust routed)
 * ```
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
 * // Or use with server (Rust routes, calls invokeHandler)
 * await serve({ app, port: 3000 })
 * ```
 */
export const createApp = <App = Record<string, never>>(config: AppConfig<App>): GustApp<App> => {
	const { routes, middleware, context: contextProvider } = config

	// Store handlers for direct invocation by Rust
	const handlers: RouteHandlerFn<App, string>[] = routes.map(
		(r) => r.handler as RouteHandlerFn<App, string>
	)

	// Build manifest for Rust registration
	const manifest = buildManifest(routes)

	// Build WASM router handler (for JS-side routing)
	const { handler: routerHandler, init, isReady } = createRouterHandler(routes)

	// Wrap with middleware if provided
	const wrappedHandler = middleware ? middleware<App>(routerHandler) : routerHandler

	// Create internal handler that builds context (JS routing path)
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

	/**
	 * Invoke handler by ID (Rust routing path)
	 *
	 * Called by Rust native server after routing.
	 * Rust does: HTTP parse → Route → Extract params → Call this
	 * This does: Build context → Apply middleware → Call handler
	 */
	const invokeHandler = async (
		handlerId: number,
		nativeCtx: NativeHandlerContext
	): Promise<ServerResponse> => {
		const h = handlers[handlerId]
		if (!h) {
			return {
				status: 404,
				headers: { 'content-type': 'text/plain' },
				body: 'Not Found',
			}
		}

		// Convert NativeHandlerContext to RawContext
		const body = Buffer.from(nativeCtx.body)
		const raw: RawContext = {
			method: nativeCtx.method,
			path: nativeCtx.path,
			query: nativeCtx.query,
			headers: nativeCtx.headers,
			params: nativeCtx.params,
			body,
			json: <T>() => {
				try {
					return JSON.parse(body.toString()) as T
				} catch {
					return {} as T
				}
			},
			raw: body,
			socket: null, // Not available in native path
		}

		// Create app context
		const app = contextProvider ? await contextProvider(raw) : ({} as App)
		const ctx = withApp(raw, app)

		// Create handler that just calls the matched handler
		const directHandler: Handler<typeof ctx> = async (c) => {
			// Call handler with auto-detection (supports both Gust and fetch-style)
			return callHandler(h, c, undefined)
		}

		// Apply middleware if present
		const finalHandler = middleware ? middleware<App>(directHandler) : directHandler

		return finalHandler(ctx)
	}

	return {
		fetch,
		handle,
		manifest,
		invokeHandler,
		config,
		isReady,
		init,
	}
}
