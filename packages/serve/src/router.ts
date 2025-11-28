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

/** URL generator - preserves nested structure */
export type UrlGenerator<T> = {
	[K in keyof T]: T[K] extends Route<string, infer P>
		? UrlFn<P>
		: T[K] extends Router<infer R>
			? UrlGenerator<R>
			: never
}

export type Router<T> = {
	readonly handler: Handler<Context>
	readonly routes: T
	readonly url: UrlGenerator<T>
	readonly _isRouter: true // marker for detection
}

/** Input to router() - can be Route or nested Router */
export type RoutesInput = Record<string, Route<string, string> | Router<Routes>>

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

/** Check if value is a Router */
const isRouter = (value: unknown): value is Router<RoutesInput> =>
	typeof value === 'object' && value !== null && '_isRouter' in value && value._isRouter === true

const generateUrl = (path: string, params?: Record<string, string | number>): string => {
	if (!params) return path
	return path.replace(/:([^/]+)/g, (_, key) => {
		const value = params[key]
		if (value === undefined) throw new Error(`Missing param: ${key}`)
		return String(value)
	})
}

/** Create URL generators preserving nested structure */
const createUrlGenerators = <T extends RoutesInput>(routes: T): UrlGenerator<T> => {
	const generators = {} as UrlGenerator<T>
	for (const [name, value] of Object.entries(routes)) {
		if (isRouter(value)) {
			// Nested router - use its URL generators directly (preserves structure)
			;(generators as Record<string, unknown>)[name] = value.url
		} else {
			// Regular route
			;(generators as Record<string, (params?: Record<string, string | number>) => string>)[name] =
				(params?: Record<string, string | number>) => generateUrl(value.path, params)
		}
	}
	return generators
}

/** Recursively flatten routes for WASM router registration */
const flattenRoutesForWasm = (input: RoutesInput): Route[] => {
	const result: Route[] = []
	for (const value of Object.values(input)) {
		if (isRouter(value)) {
			// Nested router - recursively flatten
			result.push(...flattenRoutesForWasm(value.routes as RoutesInput))
		} else {
			result.push(value)
		}
	}
	return result
}

// ============================================================================
// Router
// ============================================================================

/**
 * Create a type-safe router from named routes
 *
 * @example
 * ```typescript
 * // Basic usage
 * const app = router({
 *   home: get('/', () => json({ message: 'Home' })),
 *   user: get('/users/:id', (ctx) => json({ id: ctx.params.id })),
 * })
 *
 * // With prefix - creates a sub-router
 * const api = router('/api', {
 *   health: get('/health', () => json({ status: 'ok' })),
 *   users: get('/users', () => json([])),
 * })
 * // api.routes.health.path === '/api/health'
 *
 * // Compose routers by spreading
 * const app = router({
 *   home: get('/', handler),
 *   ...api.routes,
 * })
 *
 * // Type-safe URL generation
 * app.url.home()              // "/"
 * app.url.health()            // "/api/health"
 * app.url.user({ id: 42 })    // "/users/42"
 * ```
 */
/** Apply prefix to routes (including nested routers) */
const applyPrefix = <T extends RoutesInput>(prefix: string, routes: T): T => {
	const result = {} as T
	for (const [name, value] of Object.entries(routes)) {
		if (isRouter(value)) {
			// Nested router - apply prefix to its routes recursively
			const prefixedNestedRoutes = applyPrefix(prefix, value.routes as RoutesInput)
			;(result as Record<string, unknown>)[name] = {
				...value,
				routes: prefixedNestedRoutes,
				url: createUrlGenerators(prefixedNestedRoutes),
			}
		} else {
			// Regular route - apply prefix to path
			;(result as Record<string, unknown>)[name] = {
				...value,
				path: `${prefix}${value.path}`,
			}
		}
	}
	return result
}

export function router<T extends RoutesInput>(routes: T): Router<T>
export function router<TPrefix extends string, T extends RoutesInput>(
	prefixPath: TPrefix,
	routes: T
): Router<{
	[K in keyof T]: T[K] extends Route<infer M, infer P>
		? Route<M, `${TPrefix}${P}`>
		: T[K] extends Router<infer R>
			? Router<{
					[RK in keyof R]: R[RK] extends Route<infer RM, infer RP>
						? Route<RM, `${TPrefix}${RP}`>
						: R[RK]
				}>
			: never
}>
export function router<T extends RoutesInput>(
	prefixOrRoutes: string | T,
	maybeRoutes?: T
): Router<T> {
	const hasPrefix = typeof prefixOrRoutes === 'string'
	const prefixPath = hasPrefix ? prefixOrRoutes : ''
	const inputRoutes = (hasPrefix ? maybeRoutes : prefixOrRoutes) as T

	// Apply prefix if provided (preserves structure)
	const routes = hasPrefix ? applyPrefix(prefixPath, inputRoutes) : inputRoutes

	// Flatten for WASM router registration only
	const flatRouteList = flattenRoutesForWasm(routes)

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

	const handler: Handler<Context> = (ctx) => {
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

	return {
		handler,
		routes,
		url: createUrlGenerators(routes),
		_isRouter: true as const,
	}
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
