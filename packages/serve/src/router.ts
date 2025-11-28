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

export type UrlGenerator<T extends Routes> = {
	[K in keyof T]: T[K] extends Route<string, infer P> ? UrlFn<P> : never
}

export type Router<T extends Routes> = {
	readonly handler: Handler<Context>
	readonly routes: T
	readonly url: UrlGenerator<T>
}

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

const createUrlGenerators = <T extends Routes>(routes: T): UrlGenerator<T> => {
	const generators = {} as UrlGenerator<T>
	for (const [name, route] of Object.entries(routes)) {
		;(generators as Record<string, (params?: Record<string, string | number>) => string>)[name] = (
			params?: Record<string, string | number>
		) => generateUrl(route.path, params)
	}
	return generators
}

// ============================================================================
// Router
// ============================================================================

/**
 * Create a type-safe router from named routes
 *
 * @example
 * ```typescript
 * const home = get('/', () => json({ message: 'Home' }))
 * const user = get('/users/:id', (ctx) => {
 *   ctx.params.id  // ✅ string (type-safe!)
 *   return json({ id: ctx.params.id })
 * })
 *
 * const app = router({ home, user })
 *
 * app.url.home()              // ✅ () => string
 * app.url.user({ id: 42 })    // ✅ (params: { id: string | number }) => string
 * app.url.user()              // ❌ Error: Expected 1 argument
 * app.url.user({ foo: 1 })    // ❌ Error: 'foo' does not exist, expected 'id'
 * ```
 */
export const router = <T extends Routes>(routes: T): Router<T> => {
	let wasmRouter: WasmRouter | null = null
	const handlers: Handler<Context>[] = []
	const routeList = Object.values(routes)

	const initRouter = () => {
		if (wasmRouter) return wasmRouter

		const wasm = getWasm()
		wasmRouter = new wasm.WasmRouter()

		for (const route of routeList) {
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
