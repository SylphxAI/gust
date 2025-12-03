/**
 * Turbo Server - Zero-overhead HTTP server for Bun
 *
 * Design principles (based on Elysia/picohttpparser research):
 * 1. Use Bun.serve directly (native SIMD HTTP parsing)
 * 2. JIT-compile routes at startup (generate specialized code)
 * 3. Zero allocations in hot path
 * 4. Monomorphic call sites (consistent object shapes)
 * 5. Response passthrough (skip conversion when possible)
 *
 * Target: EXCEED bare Bun.serve performance via JIT compilation
 */

// ============================================================================
// Types - Consistent shapes for V8/JSC optimization
// ============================================================================

/** Handler function type - returns Response directly for zero-overhead */
export type TurboHandler = (req: Request) => Response | Promise<Response>

/** Route definition with consistent shape */
interface CompiledRoute {
	readonly method: string
	readonly path: string
	readonly handler: TurboHandler
	readonly isStatic: boolean
	readonly pattern: RegExp | null
	readonly paramNames: readonly string[]
}

/** Router configuration */
export interface TurboRouterConfig {
	readonly routes: Record<string, TurboHandler>
	readonly notFound?: TurboHandler
	readonly onError?: (error: Error) => Response
}

/** Server options */
export interface TurboServeOptions {
	readonly port?: number
	readonly hostname?: string
	readonly fetch: TurboHandler
	readonly onListen?: (info: { port: number; hostname: string }) => void
	readonly onError?: (error: Error) => void
}

// ============================================================================
// Pre-allocated responses (zero allocation for common cases)
// ============================================================================

const RESPONSE_404 = new Response('Not Found', { status: 404 })
const RESPONSE_500 = new Response('Internal Server Error', { status: 500 })

// Pre-allocated JSON headers
const JSON_HEADERS = { 'content-type': 'application/json' }

// ============================================================================
// JIT Route Compiler - Generates specialized handler code
// ============================================================================

interface ParsedRoute {
	method: string
	path: string
	handler: TurboHandler
	isStatic: boolean
	paramNames: string[]
}

/**
 * Parse route definitions
 */
const parseRoutes = (routes: Record<string, TurboHandler>): ParsedRoute[] => {
	const parsed: ParsedRoute[] = []

	for (const [key, handler] of Object.entries(routes)) {
		const spaceIdx = key.indexOf(' ')
		const method = spaceIdx > 0 ? key.slice(0, spaceIdx) : 'GET'
		const path = spaceIdx > 0 ? key.slice(spaceIdx + 1) : key
		const isStatic = !path.includes(':') && !path.includes('*')

		const paramNames: string[] = []
		if (!isStatic) {
			path.replace(/:(\w+)/g, (_, name) => {
				paramNames.push(name)
				return ''
			})
		}

		parsed.push({ method, path, handler, isStatic, paramNames })
	}

	return parsed
}

/**
 * JIT-compile a specialized handler for the exact route configuration
 * This generates optimal code with zero runtime overhead
 */
const jitCompileHandler = (
	routes: ParsedRoute[],
	notFound: TurboHandler,
	_onError: (error: Error) => Response
): TurboHandler => {
	const staticRoutes = routes.filter((r) => r.isStatic)
	const dynamicRoutes = routes.filter((r) => !r.isStatic)

	// SPECIAL CASE: Single GET route to "/" - ultra-optimized path
	if (staticRoutes.length === 1 && dynamicRoutes.length === 0) {
		const route = staticRoutes[0]
		if (route && route.method === 'GET' && route.path === '/') {
			const handler = route.handler
			// Inline everything - no function calls except the handler
			return (req: Request) => {
				const url = req.url
				// Ultra-fast path check: just verify no path after host
				// For "http://localhost:3000/" the path starts at index 21-ish
				const pathStart = url.indexOf('/', 8)
				// If path is "/" (single char) or empty, it's the root
				if (
					pathStart === -1 ||
					url.length === pathStart + 1 ||
					url.charCodeAt(pathStart + 1) === 63
				) {
					return handler(req)
				}
				return notFound(req)
			}
		}
	}

	// SPECIAL CASE: Only static routes - use switch-based dispatch
	if (dynamicRoutes.length === 0 && staticRoutes.length <= 10) {
		// Pre-compute lookup table
		const handlers = new Map<string, TurboHandler>()
		for (const route of staticRoutes) {
			handlers.set(`${route.method}:${route.path}`, route.handler)
		}

		// Use Map with pre-computed keys (faster than string concat in hot path)
		return (req: Request) => {
			const method = req.method
			const url = req.url

			// Fast path extraction
			let pathStart = url.indexOf('/', 8)
			if (pathStart === -1) pathStart = url.length
			let pathEnd = url.indexOf('?', pathStart)
			if (pathEnd === -1) pathEnd = url.length
			const path = pathStart === pathEnd ? '/' : url.slice(pathStart, pathEnd)

			// Direct lookup
			const h = handlers.get(`${method}:${path}`)
			return h ? h(req) : notFound(req)
		}
	}

	// GENERAL CASE: Build optimized handler with both static and dynamic routes
	const staticHandlers = new Map<string, TurboHandler>()
	for (const route of staticRoutes) {
		staticHandlers.set(`${route.method}:${route.path}`, route.handler)
	}

	// Pre-compile dynamic route patterns
	const dynamicPatterns = dynamicRoutes.map((route) => {
		const regexPattern = route.path.replace(/:(\w+)/g, '([^/]+)').replace(/\*/g, '(.*)')
		return {
			method: route.method,
			pattern: new RegExp(`^${regexPattern}$`),
			handler: route.handler,
			paramNames: route.paramNames,
		}
	})

	return (req: Request) => {
		const method = req.method
		const url = req.url

		// Fast path extraction
		let pathStart = url.indexOf('/', 8)
		if (pathStart === -1) pathStart = url.length
		let pathEnd = url.indexOf('?', pathStart)
		if (pathEnd === -1) pathEnd = url.length
		const path = pathStart === pathEnd ? '/' : url.slice(pathStart, pathEnd)

		// Static lookup first
		const staticHandler = staticHandlers.get(`${method}:${path}`)
		if (staticHandler) return staticHandler(req)

		// Dynamic routes
		for (let i = 0; i < dynamicPatterns.length; i++) {
			const r = dynamicPatterns[i]
			if (r && r.method === method && r.pattern.test(path)) {
				return r.handler(req)
			}
		}

		return notFound(req)
	}
}

// Legacy AOT compiler for backwards compatibility
export const compileRoutes = (
	routes: Record<string, TurboHandler>
): {
	staticRoutes: Map<string, TurboHandler>
	dynamicRoutes: CompiledRoute[]
} => {
	const staticRoutes = new Map<string, TurboHandler>()
	const dynamicRoutes: CompiledRoute[] = []

	for (const [key, handler] of Object.entries(routes)) {
		const spaceIdx = key.indexOf(' ')
		const method = spaceIdx > 0 ? key.slice(0, spaceIdx) : 'GET'
		const path = spaceIdx > 0 ? key.slice(spaceIdx + 1) : key
		const isStatic = !path.includes(':') && !path.includes('*')

		if (isStatic) {
			staticRoutes.set(`${method}:${path}`, handler)
		} else {
			const paramNames: string[] = []
			const regexPattern = path
				.replace(/:(\w+)/g, (_, name) => {
					paramNames.push(name)
					return '([^/]+)'
				})
				.replace(/\*/g, '(.*)')

			dynamicRoutes.push({
				method,
				path,
				handler,
				isStatic: false,
				pattern: new RegExp(`^${regexPattern}$`),
				paramNames,
			})
		}
	}

	return { staticRoutes, dynamicRoutes }
}

// ============================================================================
// Turbo Router - JIT-compiled, zero-overhead routing
// ============================================================================

/**
 * Create a JIT-compiled router
 * Generates specialized handler code at startup for maximum performance
 */
export const turboRouter = (config: TurboRouterConfig): { handler: TurboHandler } => {
	const routes = parseRoutes(config.routes)
	const notFound = config.notFound ?? (() => RESPONSE_404)
	const onError = config.onError ?? (() => RESPONSE_500)

	// JIT compile the handler
	const handler: TurboHandler = jitCompileHandler(routes, notFound, onError)

	return { handler: handler }
}

// ============================================================================
// Turbo Serve - Direct Bun.serve wrapper
// ============================================================================

/** Return type for turboServe */
export interface TurboServerHandle {
	readonly port: number
	readonly hostname: string
	readonly stop: () => void
}

/**
 * Start server using Bun.serve directly
 * Zero framework overhead - just routing
 */
export const turboServe = (options: TurboServeOptions): TurboServerHandle => {
	const port = options.port ?? 3000
	const hostname = options.hostname ?? '0.0.0.0'

	const server = Bun.serve({
		port,
		hostname,
		fetch: options.fetch,
		error: (error) => {
			options.onError?.(error)
			return RESPONSE_500
		},
	})

	options.onListen?.({ port, hostname })

	const serverPort: number = server.port ?? port
	const serverHostname: string = server.hostname ?? hostname
	const stop = (): void => {
		server.stop()
	}

	return {
		port: serverPort,
		hostname: serverHostname,
		stop: stop,
	}
}

// ============================================================================
// Zero-allocation response helpers
// ============================================================================

/** Pre-stringify common responses */
const stringifyCache = new Map<unknown, string>()

/**
 * JSON response with minimal allocation
 * Caches stringified objects for repeated responses
 */
export const turboJson = <T>(data: T, init?: ResponseInit): Response => {
	// Try cache for repeated data (e.g., health checks)
	let body = stringifyCache.get(data)
	if (!body) {
		body = JSON.stringify(data)
		// Only cache small objects
		if (body.length < 1000) {
			stringifyCache.set(data, body)
		}
	}

	return new Response(body, {
		status: init?.status ?? 200,
		headers: init?.headers ?? JSON_HEADERS,
	})
}

/**
 * Pre-create a response for reuse
 * Use for static responses like health checks
 */
export const createStaticResponse = (body: string, init?: ResponseInit): (() => Response) => {
	// Pre-create the response once
	const status = init?.status ?? 200
	const headers = init?.headers ?? {}

	// Return factory that creates new Response (required by spec)
	// But Response.clone() might be faster for some cases
	return () => new Response(body, { status, headers })
}

/**
 * Create a pre-computed JSON response factory
 * This is the FASTEST possible JSON response - skips JSON.stringify entirely
 * Use for static data that never changes (health checks, version endpoints, etc.)
 */
export const staticJson = <T>(data: T): (() => Response) => {
	// Pre-stringify at creation time
	const body = JSON.stringify(data)
	// Return factory that creates Response with pre-computed body
	return () => new Response(body, { headers: JSON_HEADERS })
}

// ============================================================================
// Ultra-fast router for single-route apps
// ============================================================================

/**
 * Create an ultra-optimized handler for single GET "/" route
 * This has ZERO routing overhead - just returns the response
 */
export const singleRoute = (handler: () => Response | Promise<Response>): TurboHandler => {
	return handler as TurboHandler
}

// ============================================================================
// Route helpers - type-safe, zero-overhead
// ============================================================================

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/** Route definition type */
export type TurboRoute = Record<string, TurboHandler>

/** Create a typed route */
export const route = <M extends HttpMethod>(
	method: M,
	path: string,
	handler: TurboHandler
): TurboRoute => {
	const key = `${method} ${path}`
	const result: TurboRoute = {}
	result[key] = handler
	return result
}

/** GET route */
export const get = (path: string, handler: TurboHandler): TurboRoute => route('GET', path, handler)

/** POST route */
export const post = (path: string, handler: TurboHandler): TurboRoute =>
	route('POST', path, handler)

/** PUT route */
export const put = (path: string, handler: TurboHandler): TurboRoute => route('PUT', path, handler)

/** DELETE route */
export const del = (path: string, handler: TurboHandler): TurboRoute =>
	route('DELETE', path, handler)

/** PATCH route */
export const patch = (path: string, handler: TurboHandler): TurboRoute =>
	route('PATCH', path, handler)
