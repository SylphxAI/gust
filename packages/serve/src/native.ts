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

// ============================================================================
// Native Middleware Configuration Types
// ============================================================================

/** CORS configuration for native server */
export interface NativeCorsConfig {
	/** Allowed origins (use "*" for any, or specify domains) */
	origins?: string[]
	/** Allowed HTTP methods */
	methods?: string[]
	/** Allowed headers */
	allowedHeaders?: string[]
	/** Exposed headers */
	exposedHeaders?: string[]
	/** Allow credentials */
	credentials?: boolean
	/** Max age in seconds */
	maxAge?: number
}

/** Rate limiting configuration for native server */
export interface NativeRateLimitConfig {
	/** Maximum requests per window */
	maxRequests: number
	/** Window size in seconds */
	windowSeconds: number
	/** Key extractor: "ip", "header:X-Api-Key", etc. */
	keyBy?: string
}

/** Security headers configuration for native server */
export interface NativeSecurityConfig {
	/** Enable HSTS */
	hsts?: boolean
	/** HSTS max-age in seconds (default: 31536000 = 1 year) */
	hstsMaxAge?: number
	/** X-Frame-Options: "DENY", "SAMEORIGIN" */
	frameOptions?: string
	/** X-Content-Type-Options: nosniff */
	contentTypeOptions?: boolean
	/** X-XSS-Protection */
	xssProtection?: boolean
	/** Referrer-Policy */
	referrerPolicy?: string
}

/** Compression configuration for native server */
export interface NativeCompressionConfig {
	/** Enable gzip */
	gzip?: boolean
	/** Enable brotli */
	brotli?: boolean
	/** Minimum size to compress (bytes) */
	threshold?: number
	/** Compression level */
	level?: number
}

/** Full server configuration for native server */
export interface NativeServerConfig {
	/** Port to listen on */
	port?: number
	/** Hostname to bind to */
	hostname?: string
	/** Number of worker threads */
	workers?: number
	/** CORS configuration */
	cors?: NativeCorsConfig
	/** Rate limiting configuration */
	rateLimit?: NativeRateLimitConfig
	/** Security headers configuration */
	security?: NativeSecurityConfig
	/** Compression configuration */
	compression?: NativeCompressionConfig
}

// Native binding interface (from @sylphx/gust-napi)
export interface NativeBinding {
	GustServer: new () => NativeServer
	GustServerWithConfig: (config: NativeServerConfig) => Promise<NativeServer>
	isIoUringAvailable: () => boolean
	getCpuCount: () => number
	corsPermissive: () => NativeCorsConfig
	securityStrict: () => NativeSecurityConfig
}

export interface NativeServer {
	addStaticRoute(
		method: string,
		path: string,
		status: number,
		contentType: string,
		body: string
	): Promise<void>
	addDynamicRoute(
		method: string,
		path: string,
		callback: (ctx: {
			method: string
			path: string
			params: Record<string, string>
			query?: string
			headers: Record<string, string>
			body: string
		}) => Promise<{ status: number; headers: Record<string, string>; body: string }>
	): void
	/** Enable CORS middleware */
	enableCors(config: NativeCorsConfig): Promise<void>
	/** Enable rate limiting middleware */
	enableRateLimit(config: NativeRateLimitConfig): Promise<void>
	/** Enable security headers middleware */
	enableSecurity(config: NativeSecurityConfig): Promise<void>
	serve(port: number): Promise<void>
	shutdown(): Promise<void>
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

/**
 * Get number of CPU cores (for worker thread configuration)
 */
export const getCpuCount = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getCpuCount()
	} catch {
		return 1
	}
}

/**
 * Get permissive CORS configuration from native
 *
 * Allows all origins, methods, and headers - suitable for development
 */
export const corsPermissive = (): NativeCorsConfig => {
	const binding = loadNative()
	if (!binding) {
		// Fallback if native not available
		return {
			origins: ['*'],
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
			allowedHeaders: ['*'],
			credentials: true,
			maxAge: 86400,
		}
	}
	return binding.corsPermissive()
}

/**
 * Get strict security headers configuration from native
 *
 * Enables HSTS, X-Frame-Options: DENY, and other security headers
 */
export const securityStrict = (): NativeSecurityConfig => {
	const binding = loadNative()
	if (!binding) {
		// Fallback if native not available
		return {
			hsts: true,
			hstsMaxAge: 31536000,
			frameOptions: 'DENY',
			contentTypeOptions: true,
			xssProtection: true,
			referrerPolicy: 'strict-origin-when-cross-origin',
		}
	}
	return binding.securityStrict()
}

// ============================================================================
// Native Server with Full Configuration
// ============================================================================

export interface NativeServeWithConfigOptions {
	readonly port: number
	readonly hostname?: string
	readonly config?: NativeServerConfig
	readonly staticRoutes?: StaticRouteConfig[]
	readonly onListen?: (info: { port: number; hostname: string }) => void
	readonly onError?: (error: Error) => void
}

/**
 * Start native HTTP server with full configuration
 *
 * Supports middleware (CORS, rate limiting, security headers) and static routes.
 * All middleware runs in Rust for maximum performance.
 *
 * @example
 * ```ts
 * const server = await nativeServeWithConfig({
 *   port: 3000,
 *   config: {
 *     cors: corsPermissive(),
 *     security: securityStrict(),
 *     rateLimit: { maxRequests: 100, windowSeconds: 60 },
 *   },
 *   staticRoutes: [
 *     { method: 'GET', path: '/health', status: 200, contentType: 'application/json', body: '{"status":"ok"}' }
 *   ]
 * })
 * ```
 */
export const nativeServeWithConfig = async (
	options: NativeServeWithConfigOptions
): Promise<NativeServerHandle | null> => {
	const binding = loadNative()
	if (!binding) return null

	const { port, hostname = '0.0.0.0', config, staticRoutes = [], onListen, onError } = options

	try {
		// Create server with or without config
		const server = config ? await binding.GustServerWithConfig(config) : new binding.GustServer()

		// Register all static routes
		for (const route of staticRoutes) {
			await server.addStaticRoute(
				route.method,
				route.path,
				route.status,
				route.contentType,
				route.body
			)
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
			stop: () => {
				server.shutdown()
			},
		}
	} catch (err) {
		onError?.(err as Error)
		return null
	}
}

/**
 * Create a native server instance for manual configuration
 *
 * Use this when you need fine-grained control over server setup.
 *
 * @example
 * ```ts
 * const server = createNativeServer()
 * if (server) {
 *   await server.enableCors(corsPermissive())
 *   await server.enableSecurity(securityStrict())
 *   await server.addStaticRoute('GET', '/health', 200, 'application/json', '{"status":"ok"}')
 *   await server.serve(3000)
 * }
 * ```
 */
export const createNativeServer = (): NativeServer | null => {
	const binding = loadNative()
	if (!binding) return null
	return new binding.GustServer()
}

/**
 * Create a native server instance with pre-applied configuration
 */
export const createNativeServerWithConfig = async (
	config: NativeServerConfig
): Promise<NativeServer | null> => {
	const binding = loadNative()
	if (!binding) return null
	return binding.GustServerWithConfig(config)
}
