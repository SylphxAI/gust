/**
 * Router - Type-safe route definitions
 *
 * Two patterns supported:
 * 1. Simple functions: get<App>('/path', handler) - explicit type
 * 2. Factory pattern: createRouter<App>() - type currying
 */

import type { ServerResponse } from '@sylphx/gust-core'
import type { Context } from './context'

// ============================================================================
// Handler Type Detection
// ============================================================================

/**
 * Symbol to mark handlers that expect Fetch-style invocation (Request → Response)
 * Used by callHandler() to dispatch correctly without try-catch
 */
export const FETCH_HANDLER_MARKER = Symbol.for('gust.fetchHandler')

/**
 * Check if a handler is marked as Fetch-style
 */
export const isFetchHandler = (handler: unknown): boolean => {
	return (
		typeof handler === 'function' &&
		FETCH_HANDLER_MARKER in handler &&
		(handler as Record<symbol, boolean>)[FETCH_HANDLER_MARKER] === true
	)
}

// ============================================================================
// Fetch Handler Adapter
// ============================================================================

/**
 * Fetch-style handler type (Request → Response)
 */
export type FetchHandler = (request: Request) => Response | Promise<Response>

/**
 * Wrap a fetch-style handler for use with Gust routes
 *
 * Enables seamless integration with fetch-based libraries like:
 * - GraphQL Yoga
 * - tRPC
 * - Hono
 * - Any handler following the fetch convention
 *
 * @example
 * ```typescript
 * import { createYoga } from 'graphql-yoga'
 *
 * const yoga = createYoga({ schema })
 *
 * const app = createApp({
 *   routes: [
 *     // Direct integration - no manual conversion needed!
 *     all('/graphql', fetchHandler(yoga.fetch)),
 *   ],
 * })
 * ```
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono'
 *
 * const hono = new Hono()
 * hono.get('/hello', (c) => c.json({ hello: 'world' }))
 *
 * const app = createApp({
 *   routes: [
 *     // Mount Hono at /api
 *     all('/api/*', fetchHandler(hono.fetch)),
 *   ],
 * })
 * ```
 */
export const fetchHandler = <App = Record<string, never>>(
	handler: FetchHandler
): RouteHandlerFn<App, string> => {
	const wrapped = ({ ctx }: { ctx: Context<App> }) => {
		if (!ctx.request) {
			// Fallback: reconstruct request from context
			const url = `http://localhost${ctx.path}${ctx.query ? `?${ctx.query}` : ''}`
			const request = new Request(url, {
				method: ctx.method,
				headers: ctx.headers,
				body: ctx.method !== 'GET' && ctx.method !== 'HEAD' ? ctx.body : undefined,
			})
			return handler(request) as unknown as ServerResponse
		}
		return handler(ctx.request) as unknown as ServerResponse
	}

	// Mark as fetch-style handler for callHandler() dispatch
	;(wrapped as unknown as Record<symbol, boolean>)[FETCH_HANDLER_MARKER] = true

	return wrapped as RouteHandlerFn<App, string>
}

// ============================================================================
// Type-Level Path Parsing
// ============================================================================

/** Extract param names from path string */
type ExtractParams<Path extends string> = Path extends `${string}:${infer Param}/${infer Rest}`
	? Param | ExtractParams<`/${Rest}`>
	: Path extends `${string}:${infer Param}`
		? Param
		: never

/** Check if path has params */
type HasParams<Path extends string> = ExtractParams<Path> extends never ? false : true

/** Params object type for handler context (always string) */
type ParamsFor<Path extends string> =
	HasParams<Path> extends true ? { [K in ExtractParams<Path>]: string } : Record<string, string>

// ============================================================================
// Route Types
// ============================================================================

/**
 * Handler function type for routes
 * Receives { ctx, input } and returns a ServerResponse
 */
export type RouteHandlerFn<
	App = Record<string, never>,
	TPath extends string = string,
	Input = void,
> = (args: {
	readonly ctx: Context<App> & { readonly params: ParamsFor<TPath> }
	readonly input: Input
}) => ServerResponse | Promise<ServerResponse>

/**
 * Route definition with method, path, and handler
 */
export type Route<
	TMethod extends string = string,
	TPath extends string = string,
	App = Record<string, never>,
> = {
	readonly method: TMethod
	readonly path: TPath
	readonly handler: RouteHandlerFn<App, TPath>
}

export type Routes<App = unknown> = Route<string, string, App>[]

// ============================================================================
// Route Helpers (Simple functions with optional App type)
// ============================================================================

/**
 * Create a GET route
 *
 * @example
 * ```typescript
 * // Without app context
 * const users = get('/users', ({ ctx }) => json(ctx.query))
 *
 * // With app context
 * const users = get<App>('/users', ({ ctx }) => json(ctx.app.db.getUsers()))
 * ```
 */
export const get = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'GET', TPath, App> => ({
	method: 'GET',
	path,
	handler,
})

export const post = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'POST', TPath, App> => ({
	method: 'POST',
	path,
	handler,
})

export const put = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'PUT', TPath, App> => ({
	method: 'PUT',
	path,
	handler,
})

export const patch = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'PATCH', TPath, App> => ({
	method: 'PATCH',
	path,
	handler,
})

export const del = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'DELETE', TPath, App> => ({
	method: 'DELETE',
	path,
	handler,
})

export const head = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'HEAD', TPath, App> => ({
	method: 'HEAD',
	path,
	handler,
})

export const options = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'OPTIONS', TPath, App> => ({
	method: 'OPTIONS',
	path,
	handler,
})

export const all = <App = Record<string, never>, TPath extends string = string>(
	path: TPath,
	handler: RouteHandlerFn<App, TPath>
): Route<'*', TPath, App> => ({
	method: '*',
	path,
	handler,
})

// ============================================================================
// Route Grouping
// ============================================================================

/**
 * Prefix routes with a path segment (for nested routes)
 *
 * @example
 * ```typescript
 * const memberRoutes = routes('/members', [
 *   get('/', ({ ctx }) => json(getAll())),
 *   get('/:id', ({ ctx }) => json(getOne(ctx.params.id))),
 * ])
 *
 * // Nested
 * const adminRoutes = routes('/admin', [
 *   get('/dashboard', ...),
 *   ...routes('/users', [
 *     get('/', ...),        // /admin/users
 *     get('/:id', ...),     // /admin/users/:id
 *   ]),
 * ])
 *
 * serve({
 *   routes: [
 *     get('/', () => json({ home: true })),
 *     ...memberRoutes,
 *     ...adminRoutes,
 *   ],
 * })
 * ```
 */
export const routes = <App = Record<string, never>>(
	prefix: string,
	routeList: Route<string, string, App>[]
): Route<string, string, App>[] =>
	routeList.map((route) => ({
		...route,
		path: prefix + route.path,
	}))

// ============================================================================
// Typed Router Factory
// ============================================================================

/**
 * Typed route builders for a specific App context
 */
export type TypedRouteBuilders<App> = {
	get: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'GET', TPath, App>
	post: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'POST', TPath, App>
	put: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'PUT', TPath, App>
	patch: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'PATCH', TPath, App>
	del: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'DELETE', TPath, App>
	head: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'HEAD', TPath, App>
	options: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'OPTIONS', TPath, App>
	all: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	) => Route<'*', TPath, App>
	routes: (prefix: string, routeList: Route<string, string, App>[]) => Route<string, string, App>[]
}

/**
 * Create typed route builders for a specific App context
 *
 * This factory pattern provides full type inference for app context
 * without repeating the type parameter on every route.
 *
 * @example
 * ```typescript
 * type AppContext = { db: Database; user: User | null }
 *
 * const { get, post, routes } = createRouter<AppContext>()
 *
 * // Full type inference - ctx.app.db and ctx.app.user are typed
 * const users = get('/users', ({ ctx }) => json(ctx.app.db.getUsers()))
 *
 * // Nested routes
 * const memberRoutes = routes('/members', [
 *   get('/', ({ ctx }) => json(ctx.app.db.getMembers())),
 *   get('/:id', ({ ctx }) => json(ctx.app.db.getMember(ctx.params.id))),
 * ])
 *
 * serve({
 *   routes: [users, ...memberRoutes],
 *   context: () => ({ db: createDb(), user: null }),
 *   port: 3000,
 * })
 * ```
 */
export const createRouter = <App>(): TypedRouteBuilders<App> => ({
	get: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'GET', TPath, App> => ({
		method: 'GET',
		path,
		handler,
	}),
	post: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'POST', TPath, App> => ({
		method: 'POST',
		path,
		handler,
	}),
	put: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'PUT', TPath, App> => ({
		method: 'PUT',
		path,
		handler,
	}),
	patch: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'PATCH', TPath, App> => ({
		method: 'PATCH',
		path,
		handler,
	}),
	del: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'DELETE', TPath, App> => ({
		method: 'DELETE',
		path,
		handler,
	}),
	head: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'HEAD', TPath, App> => ({
		method: 'HEAD',
		path,
		handler,
	}),
	options: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'OPTIONS', TPath, App> => ({
		method: 'OPTIONS',
		path,
		handler,
	}),
	all: <TPath extends string>(
		path: TPath,
		handler: RouteHandlerFn<App, TPath>
	): Route<'*', TPath, App> => ({
		method: '*',
		path,
		handler,
	}),
	routes: (prefix: string, routeList: Route<string, string, App>[]): Route<string, string, App>[] =>
		routeList.map((route) => ({
			...route,
			path: prefix + route.path,
		})),
})
