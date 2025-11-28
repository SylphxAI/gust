/**
 * Native Server Integration
 *
 * Transparently accelerates routes using Rust native HTTP server.
 * Falls back to pure JS (node:net + WASM) for edge/serverless environments.
 *
 * Performance: ~220k req/s consistent across all runtimes (Bun, Node.js, Deno)
 *
 * Architecture:
 * - Native (napi-rs): Primary backend, maximum performance
 * - Pure JS fallback: Edge/serverless environments (Cloudflare Workers, Vercel Edge, etc.)
 */

import type { ServerResponse } from '@sylphx/gust-core'

// Native binding interface (from @sylphx/gust-napi)
export interface NativeBinding {
	GustServer: new () => NativeServer
	isIoUringAvailable: () => boolean
}

export interface NativeServer {
	addStaticRoute(
		method: string,
		path: string,
		status: number,
		contentType: string,
		body: string
	): void
	addDynamicRoute(
		method: string,
		path: string,
		callback: (ctx: {
			method: string
			path: string
			params: Record<string, string>
			query?: string
		}) => Promise<{ status: number; headers: Record<string, string>; body: string }>
	): void
	serve(port: number): Promise<void>
	serveRaw(port: number): Promise<void>
	shutdown(): void
}

// ============================================================================
// Native Module Loader
// ============================================================================

let nativeBinding: NativeBinding | null = null
let nativeLoadAttempted = false
let nativeLoadError: Error | null = null

/**
 * Try to load the native binding
 * Returns null if unavailable (graceful fallback)
 */
const loadNative = (): NativeBinding | null => {
	if (nativeLoadAttempted) return nativeBinding

	nativeLoadAttempted = true

	try {
		// Try to load from @sylphx/gust-napi
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		nativeBinding = require('@sylphx/gust-napi')
		return nativeBinding
	} catch (e) {
		// Try local path (development) - from crates directory
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			nativeBinding = require('../../../crates/gust-napi')
			return nativeBinding
		} catch {
			nativeLoadError = e as Error
			return null
		}
	}
}

/**
 * Check if native server is available
 */
export const isNativeAvailable = (): boolean => {
	return loadNative() !== null
}

/**
 * Get native binding (for internal use by serve.ts)
 */
export const loadNativeBinding = (): NativeBinding | null => {
	return loadNative()
}

/**
 * Get native load error (for debugging)
 */
export const getNativeLoadError = (): Error | null => {
	loadNative() // Ensure we've tried to load
	return nativeLoadError
}

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

/**
 * Static GET route helper
 */
export const staticGet = <TPath extends string>(path: TPath, response: ServerResponse) =>
	staticRoute('GET', path, response)

/**
 * Static POST route helper
 */
export const staticPost = <TPath extends string>(path: TPath, response: ServerResponse) =>
	staticRoute('POST', path, response)

// ============================================================================
// Native Server Wrapper
// ============================================================================

export interface NativeServeOptions {
	readonly port: number
	readonly hostname?: string
	readonly staticRoutes: StaticRouteConfig[]
	readonly onListen?: (info: { port: number; hostname: string }) => void
	readonly onError?: (error: Error) => void
}

export interface NativeServerHandle {
	readonly port: number
	readonly hostname: string
	readonly stop: () => void
	readonly isNative: true
}

/**
 * Start native HTTP server
 *
 * Only serves static routes - returns null if native unavailable.
 * For dynamic routes, use serve() which will automatically use native
 * for static routes when available.
 */
export const nativeServe = async (
	options: NativeServeOptions
): Promise<NativeServerHandle | null> => {
	const binding = loadNative()
	if (!binding) return null

	const { port, hostname = '0.0.0.0', staticRoutes, onListen, onError } = options

	try {
		const server = new binding.GustServer()

		// Register all static routes
		for (const route of staticRoutes) {
			server.addStaticRoute(route.method, route.path, route.status, route.contentType, route.body)
		}

		// Start server (non-blocking)
		server.serve(port).catch((err) => {
			onError?.(err as Error)
		})

		onListen?.({ port, hostname })

		return {
			port,
			hostname,
			isNative: true,
			stop: () => server.shutdown(),
		}
	} catch (err) {
		onError?.(err as Error)
		return null
	}
}

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

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if io_uring is available (Linux kernel 5.1+)
 */
export const isIoUringAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isIoUringAvailable()
	} catch {
		return false
	}
}

/**
 * Get the best available backend
 *
 * Returns 'native' if native server is available, otherwise 'js' for pure JS fallback
 */
export const getBestBackend = (): 'native' | 'js' => {
	return isNativeAvailable() ? 'native' : 'js'
}
