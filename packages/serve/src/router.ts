/**
 * Router - WASM-powered Radix Trie routing
 * Pure functional design with O(k) lookup
 * Fully type-safe routes and URL generation
 */

import type { Handler, WasmRouter } from '@sylphx/gust-core'
import { getWasm, notFound } from '@sylphx/gust-core'
import type { Context } from './context'
import { withParams } from './context'

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

/** Params object type for URL generation (accepts string or number) */
type UrlParamsFor<Path extends string> =
	HasParams<Path> extends true
		? { [K in ExtractParams<Path>]: string | number }
		: Record<string, never>

/** Params object type for handler context (always string) */
type ParamsFor<Path extends string> =
	HasParams<Path> extends true ? { [K in ExtractParams<Path>]: string } : Record<string, string>

/** URL generator function type */
type UrlFn<Path extends string> =
	HasParams<Path> extends true ? (params: UrlParamsFor<Path>) => string : () => string

// ============================================================================
// Route Types
// ============================================================================

export type Route<TMethod extends string = string, TPath extends string = string> = {
	readonly method: TMethod
	readonly path: TPath
	readonly handler: Handler<Context & { params: ParamsFor<TPath> }>
}

export type Routes = Record<string, Route<string, string>>

/** Route accessor - callable for URL generation + has path/method properties */
export type RouteAccessor<TMethod extends string, TPath extends string> = UrlFn<TPath> & {
	readonly path: TPath
	readonly method: TMethod
}

/** Router accessors - each route is callable with path/method properties */
export type RouterAccessors<T extends Routes> = {
	[K in keyof T]: T[K] extends Route<infer M, infer P> ? RouteAccessor<M, P> : never
}

export type Router<T extends Routes> = {
	readonly handler: Handler<Context>
} & RouterAccessors<T>

/** Input to router() - named routes */
export type RoutesInput = Record<string, Route<string, string>>

// ============================================================================
// Route Helpers
// ============================================================================

type RouteHandler<TPath extends string> = Handler<Context & { params: ParamsFor<TPath> }>

export const get = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'GET', TPath> => ({
	method: 'GET',
	path,
	handler: handler as Handler<Context>,
})

export const post = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'POST', TPath> => ({
	method: 'POST',
	path,
	handler: handler as Handler<Context>,
})

export const put = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'PUT', TPath> => ({
	method: 'PUT',
	path,
	handler: handler as Handler<Context>,
})

export const patch = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'PATCH', TPath> => ({
	method: 'PATCH',
	path,
	handler: handler as Handler<Context>,
})

export const del = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'DELETE', TPath> => ({
	method: 'DELETE',
	path,
	handler: handler as Handler<Context>,
})

export const head = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'HEAD', TPath> => ({
	method: 'HEAD',
	path,
	handler: handler as Handler<Context>,
})

export const options = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'OPTIONS', TPath> => ({
	method: 'OPTIONS',
	path,
	handler: handler as Handler<Context>,
})

export const all = <TPath extends string>(
	path: TPath,
	handler: RouteHandler<TPath>
): Route<'*', TPath> => ({
	method: '*',
	path,
	handler: handler as Handler<Context>,
})

// ============================================================================
// URL Generation
// ============================================================================

const generateUrl = (path: string, params?: Record<string, string | number>): string => {
	if (!params) return path
	return path.replace(/:([^/]+)/g, (_, key) => {
		const value = params[key]
		if (value === undefined) throw new Error(`Missing param: ${key}`)
		return String(value)
	})
}

/** Create a callable route accessor with path/method properties */
const createRouteAccessor = (route: Route): RouteAccessor<string, string> => {
	const fn = (params?: Record<string, string | number>) => generateUrl(route.path, params)
	return Object.assign(fn, {
		path: route.path,
		method: route.method,
	}) as RouteAccessor<string, string>
}

/** Create router accessors - callable routes with path/method properties */
const createRouterAccessors = <T extends RoutesInput>(routes: T): RouterAccessors<T> => {
	const accessors = {} as RouterAccessors<T>
	for (const [name, route] of Object.entries(routes)) {
		;(accessors as Record<string, unknown>)[name] = createRouteAccessor(route)
	}
	return accessors
}

// ============================================================================
// Router
// ============================================================================

/**
 * Create a type-safe router from named routes
 *
 * Each route is accessible directly on the router and is:
 * - Callable for URL generation: `app.user({ id: 42 })` → "/users/42"
 * - Has `.path` and `.method` properties: `app.user.path` → "/users/:id"
 *
 * @example
 * ```typescript
 * // Basic usage
 * const app = router({
 *   home: get('/', () => json({ message: 'Home' })),
 *   user: get('/users/:id', (ctx) => json({ id: ctx.params.id })),
 * })
 *
 * // URL generation (callable)
 * app.home()              // "/"
 * app.user({ id: 42 })    // "/users/42"
 *
 * // Route properties
 * app.home.path           // "/"
 * app.home.method         // "GET"
 * app.user.path           // "/users/:id"
 *
 * // With prefix
 * const api = router('/api', {
 *   health: get('/health', () => json({ status: 'ok' })),
 * })
 * api.health()            // "/api/health"
 * api.health.path         // "/api/health"
 *
 * // Using prefix() helper for grouping
 * const userRoutes = prefix('/users', {
 *   list: get('/', listHandler),
 *   show: get('/:id', showHandler),
 * })
 * const app = router({ home: get('/', homeHandler), ...userRoutes })
 * ```
 */
/** Apply prefix to routes */
const applyPrefix = <T extends RoutesInput>(prefixStr: string, routes: T): T => {
	const result = {} as T
	for (const [name, route] of Object.entries(routes)) {
		;(result as Record<string, unknown>)[name] = {
			...route,
			path: `${prefixStr}${route.path}`,
		}
	}
	return result
}

/** Internal: Create router handler from flat route list */
const createHandler = (flatRouteList: Route[]): Handler<Context> => {
	let wasmRouter: WasmRouter | null = null
	const handlers: Handler<Context>[] = []

	const initRouter = () => {
		if (wasmRouter) return wasmRouter

		const wasm = getWasm()
		wasmRouter = new wasm.WasmRouter()

		for (const route of flatRouteList) {
			const handlerId = handlers.length
			handlers.push(route.handler)
			wasmRouter.insert(route.method, route.path, handlerId)

			if (route.method === '*') {
				for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
					wasmRouter.insert(method, route.path, handlerId)
				}
			}
		}

		return wasmRouter
	}

	return (ctx) => {
		const r = initRouter()
		const match = r.find(ctx.method, ctx.path)

		if (match.found) {
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
			if (!h) return notFound()
			return h(withParams(ctx, params))
		}

		match.free()
		return notFound()
	}
}

/** Internal: Create router from routes */
const createRouterFromRoutes = <T extends RoutesInput>(routes: T): Router<T> => {
	const routeList = Object.values(routes)
	const accessors = createRouterAccessors(routes)

	return Object.assign({} as Router<T>, accessors, {
		handler: createHandler(routeList),
	})
}

export function router<T extends RoutesInput>(routes: T): Router<T>
export function router<TPrefix extends string, T extends RoutesInput>(
	prefixPath: TPrefix,
	routes: T
): Router<{
	[K in keyof T]: T[K] extends Route<infer M, infer P> ? Route<M, `${TPrefix}${P}`> : never
}>
export function router<T extends RoutesInput>(
	prefixOrRoutes: string | T,
	maybeRoutes?: T
): Router<T> {
	const hasPrefix = typeof prefixOrRoutes === 'string'
	const prefixPath = hasPrefix ? prefixOrRoutes : ''
	const inputRoutes = (hasPrefix ? maybeRoutes : prefixOrRoutes) as T

	// Apply prefix if provided
	const routes = hasPrefix ? applyPrefix(prefixPath, inputRoutes) : inputRoutes

	return createRouterFromRoutes(routes)
}

// ============================================================================
// Route Composition
// ============================================================================

/** Prefix all routes with a path */
export const prefix = <TPrefix extends string, T extends Routes>(
	p: TPrefix,
	routes: T
): {
	[K in keyof T]: T[K] extends Route<infer M, infer P> ? Route<M, `${TPrefix}${P}`> : never
} => {
	const prefixed = {} as Record<string, Route>
	for (const [name, route] of Object.entries(routes)) {
		prefixed[name] = { ...route, path: `${p}${route.path}` }
	}
	return prefixed as {
		[K in keyof T]: T[K] extends Route<infer M, infer P> ? Route<M, `${TPrefix}${P}`> : never
	}
}

/** Merge multiple route objects */
export const merge = <T extends Routes[]>(...routeObjects: T): T[number] => {
	return Object.assign({}, ...routeObjects)
}

/**
 * Group routes with prefix (legacy)
 * @deprecated Use `prefix()` with named routes instead:
 * ```typescript
 * // Before (legacy)
 * const routes = group('/api', get('/users', h1), get('/posts', h2))
 * router(get('/'), ...routes)
 *
 * // After (recommended)
 * const apiRoutes = prefix('/api', { users: get('/users', h1), posts: get('/posts', h2) })
 * router(merge({ home: get('/', h) }, apiRoutes))
 * ```
 */
export const group = <TPrefix extends string>(p: TPrefix, ...routes: Route[]): Route[] =>
	routes.map((route) => ({
		...route,
		path: `${p}${route.path}`,
	}))
