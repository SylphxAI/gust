/**
 * Static Route Definition
 *
 * Helpers for declaring routes that can be served entirely in Rust with
 * zero JS overhead, plus analysis utilities for static-eligibility.
 */

import type { ServerResponse } from '@sylphx/gust-core'

// ============================================================================
// Static Route Definition
// ============================================================================

export interface StaticRouteConfig {
	readonly method: string
	readonly path: string
	readonly status: number
	readonly contentType: string
	readonly body: string
}

/**
 * Define a static route that can be served by native server
 *
 * Static routes are handled entirely in Rust with zero JS overhead.
 * Use for endpoints that always return the same response.
 *
 * @example
 * ```ts
 * const healthRoute = staticRoute('GET', '/health', json({ status: 'ok' }))
 * const app = router({ health: healthRoute })
 * await serve({ port: 3000, fetch: app.handler, staticRoutes: [healthRoute.static] })
 * ```
 */
export const staticRoute = <TPath extends string>(
	method: string,
	path: TPath,
	response: ServerResponse
): {
	method: string
	path: TPath
	handler: () => ServerResponse
	static: StaticRouteConfig
} => {
	const contentType = (response.headers as Record<string, string>)['content-type'] ?? 'text/plain'
	const body = typeof response.body === 'string' ? response.body : String(response.body ?? '')

	return {
		method,
		path,
		handler: () => response,
		static: {
			method,
			path,
			status: response.status,
			contentType,
			body,
		},
	}
}

/** Return type for static route helpers */
export type StaticRouteResult<TPath extends string> = {
	method: string
	path: TPath
	handler: () => ServerResponse
	static: StaticRouteConfig
}

/**
 * Static GET route helper
 */
export const staticGet = <TPath extends string>(
	path: TPath,
	response: ServerResponse
): StaticRouteResult<TPath> => staticRoute('GET', path, response)

/**
 * Static POST route helper
 */
export const staticPost = <TPath extends string>(
	path: TPath,
	response: ServerResponse
): StaticRouteResult<TPath> => staticRoute('POST', path, response)

// ============================================================================
// Hybrid Server (Static + Dynamic)
// ============================================================================

/**
 * Analyze a route to determine if it can be served statically
 *
 * A route can be static if:
 * 1. Handler takes no parameters (no ctx usage)
 * 2. Returns consistent response (no side effects)
 * 3. Path has no dynamic segments (:param, *)
 */
export const canBeStatic = (path: string, handler: () => unknown): boolean => {
	// Path must not have dynamic segments
	if (path.includes(':') || path.includes('*')) return false

	// Handler must be a pure function (no args)
	if (handler.length > 0) return false

	return true
}

/**
 * Extract static route config by running handler once
 *
 * WARNING: This runs the handler at startup. Only use for handlers
 * that don't have side effects.
 */
export const extractStaticRoute = (
	method: string,
	path: string,
	handler: () => ServerResponse
): StaticRouteConfig | null => {
	try {
		const response = handler()

		// Must be a ServerResponse object
		if (!response || typeof response !== 'object') return null
		if (!('status' in response) || !('body' in response)) return null

		const contentType =
			(response.headers as Record<string, string>)?.['content-type'] ?? 'text/plain'
		const body = typeof response.body === 'string' ? response.body : String(response.body ?? '')

		return {
			method,
			path,
			status: response.status,
			contentType,
			body,
		}
	} catch {
		return null
	}
}
