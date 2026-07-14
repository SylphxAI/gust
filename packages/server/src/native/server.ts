/**
 * Native Server Wrapper
 *
 * Thin wrappers around the native `GustServer` binding for starting and
 * constructing native HTTP servers (with or without full configuration).
 */

import { loadNative } from './loader'
import type { StaticRouteConfig } from './static-route'
import type { NativeServer, NativeServerConfig } from './types'

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
	/** Stop the server immediately */
	readonly stop: () => void
	/** Graceful shutdown - waits for connections to drain
	 *  @param timeoutMs - Maximum time to wait in ms (default: 30000)
	 *  @returns true if all connections drained, false if timeout reached
	 */
	readonly gracefulStop: (timeoutMs?: number) => Promise<boolean>
	/** Get number of active connections */
	readonly activeConnections: () => number
	/** Check if server is shutting down */
	readonly isShuttingDown: () => boolean
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

		// Start server - awaits until bind completes, then spawns accept loop
		await server.serve(port)

		onListen?.({ port, hostname })

		return {
			port,
			hostname,
			isNative: true,
			stop: () => server.shutdown(),
			gracefulStop: (timeoutMs = 30000) => server.gracefulShutdown(timeoutMs),
			activeConnections: () => server.activeConnections(),
			isShuttingDown: () => server.isShuttingDown(),
		}
	} catch (err) {
		onError?.(err as Error)
		return null
	}
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

		// Start server - await ensures port is actually bound before returning
		await server.serve(port)
		onListen?.({ port, hostname })

		return {
			port,
			hostname,
			isNative: true,
			stop: () => server.shutdown(),
			gracefulStop: (timeoutMs = 30000) => server.gracefulShutdown(timeoutMs),
			activeConnections: () => server.activeConnections(),
			isShuttingDown: () => server.isShuttingDown(),
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
