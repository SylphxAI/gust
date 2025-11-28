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

/** TLS/HTTPS configuration for native server */
export interface NativeTlsConfig {
	/** Path to certificate file (PEM format) */
	certPath?: string
	/** Path to private key file (PEM format) */
	keyPath?: string
	/** Certificate as PEM string */
	cert?: string
	/** Private key as PEM string */
	key?: string
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
	/** TLS/HTTPS configuration */
	tls?: NativeTlsConfig
	/** Enable HTTP/2 (requires TLS) */
	http2?: boolean
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/** Circuit breaker configuration */
export interface NativeCircuitBreakerConfig {
	/** Number of failures before opening circuit */
	failureThreshold: number
	/** Number of successes before closing circuit (from half-open) */
	successThreshold: number
	/** Time in milliseconds before attempting to recover */
	resetTimeoutMs: number
	/** Time window in milliseconds for counting failures */
	failureWindowMs: number
	/** Request timeout in milliseconds */
	timeoutMs: number
	/** Circuit breaker name */
	name?: string
}

/** Circuit breaker statistics */
export interface NativeCircuitStats {
	state: string
	failures: number
	successes: number
	totalRequests: number
	totalFailures: number
	totalSuccesses: number
}

/** Native circuit breaker instance */
export interface NativeCircuitBreaker {
	canRequest(): boolean
	recordSuccess(): void
	recordFailure(): void
	state(): string
	stats(): NativeCircuitStats
	reset(): void
}

/** Bulkhead configuration */
export interface NativeBulkheadConfig {
	/** Maximum concurrent requests */
	maxConcurrent: number
	/** Maximum queue size */
	maxQueue: number
	/** Queue timeout in milliseconds */
	queueTimeoutMs: number
}

/** Native bulkhead instance */
export interface NativeBulkhead {
	tryAcquire(): boolean
	running(): number
	queued(): number
}

// ============================================================================
// Validation Types
// ============================================================================

/** Schema type */
export type NativeSchemaType = 'String' | 'Number' | 'Boolean' | 'Object' | 'Array' | 'Any'

/** String format */
export type NativeStringFormat = 'Email' | 'Url' | 'Uuid' | 'Date' | 'DateTime'

/** Validation error */
export interface NativeValidationError {
	path: string
	message: string
	code: string
}

/** Validation result */
export interface NativeValidationResult {
	valid: boolean
	errors: NativeValidationError[]
}

// ============================================================================
// Range Request Types
// ============================================================================

/** Parsed range */
export interface NativeParsedRange {
	start: number
	end: number
}

// ============================================================================
// Proxy Types
// ============================================================================

/** Proxy trust mode */
export type NativeTrustProxy = 'None' | 'All' | 'Loopback'

/** Proxy information */
export interface NativeProxyInfo {
	ip: string
	host: string
	protocol: string
	port: number
	ips: string[]
}

// ============================================================================
// OpenTelemetry Types
// ============================================================================

/** Span context */
export interface NativeSpanContext {
	traceId: string
	spanId: string
	traceFlags: number
}

/** Span status */
export type NativeSpanStatus = 'Unset' | 'Ok' | 'Error'

/** Native span instance */
export interface NativeSpan {
	context(): NativeSpanContext | null
	setAttribute(key: string, value: string): void
	setAttributeNumber(key: string, value: number): void
	end(): void
	endWithStatus(status: NativeSpanStatus): void
	durationMs(): number | null
}

/** Native tracer instance */
export interface NativeTracer {
	startSpan(name: string): NativeSpan
	startChildSpan(name: string, parentTraceId: string, parentSpanId: string): NativeSpan
	pendingCount(): number
}

/** Native metrics collector instance */
export interface NativeMetricsCollector {
	counterInc(name: string): void
	counterAdd(name: string, value: number): void
	counterGet(name: string): number
	gaugeSet(name: string, value: number): void
	gaugeGet(name: string): number
	histogramRecord(name: string, value: number): void
	histogramCount(name: string): number
	histogramSum(name: string): number
	histogramMean(name: string): number
	histogramPercentile(name: string, percentile: number): number
	toPrometheus(): string
}

// Native binding interface (from @sylphx/gust-napi)
export interface NativeBinding {
	// Server
	GustServer: new () => NativeServer
	GustServerWithConfig: (config: NativeServerConfig) => Promise<NativeServer>
	isIoUringAvailable: () => boolean
	isTlsAvailable: () => boolean
	isHttp2Available: () => boolean
	isCompressionAvailable: () => boolean
	getCpuCount: () => number
	getPhysicalCpuCount: () => number
	getRecommendedWorkers: () => number
	corsPermissive: () => NativeCorsConfig
	securityStrict: () => NativeSecurityConfig
	// Circuit Breaker
	CircuitBreaker: new (
		config: NativeCircuitBreakerConfig
	) => NativeCircuitBreaker
	Bulkhead: new (config: NativeBulkheadConfig) => NativeBulkhead
	// Validation
	validateJson: (
		jsonStr: string,
		schemaType: NativeSchemaType,
		required: boolean,
		minLength?: number,
		maxLength?: number,
		format?: NativeStringFormat,
		min?: number,
		max?: number,
		isInteger?: boolean
	) => NativeValidationResult
	// Range Requests
	parseRangeHeader: (header: string, fileSize: number) => NativeParsedRange | null
	contentRangeHeader: (start: number, end: number, total: number) => string
	getMimeType: (extension: string) => string
	generateEtag: (mtimeMs: number, size: number) => string
	// Proxy
	extractProxyInfo: (
		trust: NativeTrustProxy,
		socketIp: string,
		forwardedFor?: string,
		forwardedHost?: string,
		forwardedProto?: string,
		forwardedPort?: string,
		hostHeader?: string
	) => NativeProxyInfo
	// OpenTelemetry
	generateTraceId: () => string
	generateSpanId: () => string
	parseTraceparent: (header: string) => NativeSpanContext | null
	formatTraceparent: (traceId: string, spanId: string, traceFlags: number) => string
	Tracer: new (serviceName: string, sampleRate?: number) => NativeTracer
	MetricsCollector: new () => NativeMetricsCollector
	// WebSocket
	isWebsocketUpgrade: (headers: Record<string, string>) => boolean
	generateWebsocketAccept: (key: string) => string
	createWebsocketUpgradeResponse: (
		key: string,
		protocol?: string
	) => { status: number; headers: Record<string, string> }
}

/** Request context passed to JS handlers */
export interface RequestContext {
	method: string
	path: string
	params: Record<string, string>
	query?: string
	headers: Record<string, string>
	body: string
}

/** Response data returned from JS handlers */
export interface ResponseData {
	status: number
	headers: Record<string, string>
	body: string
}

export interface NativeServer {
	addStaticRoute(
		method: string,
		path: string,
		status: number,
		contentType: string,
		body: string
	): Promise<void>
	/** Add a dynamic route with JS handler callback */
	addDynamicRoute(
		method: string,
		path: string,
		callback: (ctx: RequestContext) => Promise<ResponseData>
	): void
	/** Set fallback handler for unmatched routes */
	setFallback(callback: (ctx: RequestContext) => Promise<ResponseData>): void
	/** Enable CORS middleware */
	enableCors(config: NativeCorsConfig): Promise<void>
	/** Enable rate limiting middleware */
	enableRateLimit(config: NativeRateLimitConfig): Promise<void>
	/** Enable security headers middleware */
	enableSecurity(config: NativeSecurityConfig): Promise<void>
	/** Enable compression middleware */
	enableCompression(config: NativeCompressionConfig): Promise<void>
	/** Enable TLS/HTTPS */
	enableTls(config: NativeTlsConfig): Promise<void>
	/** Enable HTTP/2 */
	enableHttp2(): Promise<void>
	/** Start server on port */
	serve(port: number): Promise<void>
	/** Start server with custom hostname */
	serveWithHostname(port: number, hostname: string): Promise<void>
	/** Shutdown the server */
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
 * Get number of physical CPU cores (excluding hyperthreading)
 */
export const getPhysicalCpuCount = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getPhysicalCpuCount()
	} catch {
		return 1
	}
}

/**
 * Get recommended worker count for optimal server performance
 *
 * Returns min(cpu_count, 8) which is suitable for most web server workloads.
 * For CPU-bound workloads, consider using getPhysicalCpuCount() instead.
 */
export const getRecommendedWorkers = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getRecommendedWorkers()
	} catch {
		return 1
	}
}

/**
 * Check if TLS support is available in native server
 */
export const isTlsAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isTlsAvailable()
	} catch {
		return false
	}
}

/**
 * Check if HTTP/2 support is available in native server
 */
export const isHttp2Available = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isHttp2Available()
	} catch {
		return false
	}
}

/**
 * Check if compression support is available in native server
 */
export const isCompressionAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isCompressionAvailable()
	} catch {
		return false
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

// ============================================================================
// Native Circuit Breaker
// ============================================================================

/**
 * Create a native circuit breaker
 *
 * @example
 * ```ts
 * const breaker = createNativeCircuitBreaker({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeoutMs: 30000,
 *   failureWindowMs: 60000,
 *   timeoutMs: 10000,
 *   name: 'api'
 * })
 * if (breaker?.canRequest()) {
 *   try {
 *     await fetch(...)
 *     breaker.recordSuccess()
 *   } catch {
 *     breaker.recordFailure()
 *   }
 * }
 * ```
 */
export const createNativeCircuitBreaker = (
	config: NativeCircuitBreakerConfig
): NativeCircuitBreaker | null => {
	const binding = loadNative()
	if (!binding) return null
	return new binding.CircuitBreaker(config)
}

/**
 * Create a native bulkhead (concurrency limiter)
 */
export const createNativeBulkhead = (config: NativeBulkheadConfig): NativeBulkhead | null => {
	const binding = loadNative()
	if (!binding) return null
	return new binding.Bulkhead(config)
}

// ============================================================================
// Native Validation
// ============================================================================

/**
 * Validate JSON string against schema using native Rust implementation
 */
export const nativeValidateJson = (
	jsonStr: string,
	schemaType: NativeSchemaType,
	options?: {
		required?: boolean
		minLength?: number
		maxLength?: number
		format?: NativeStringFormat
		min?: number
		max?: number
		isInteger?: boolean
	}
): NativeValidationResult | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.validateJson(
		jsonStr,
		schemaType,
		options?.required ?? true,
		options?.minLength,
		options?.maxLength,
		options?.format,
		options?.min,
		options?.max,
		options?.isInteger
	)
}

// ============================================================================
// Native Range Requests
// ============================================================================

/**
 * Parse HTTP Range header using native Rust implementation
 */
export const nativeParseRange = (header: string, fileSize: number): NativeParsedRange | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.parseRangeHeader(header, fileSize)
}

/**
 * Generate Content-Range header value
 */
export const nativeContentRange = (start: number, end: number, total: number): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.contentRangeHeader(start, end, total)
}

/**
 * Get MIME type from file extension
 */
export const nativeGetMimeType = (extension: string): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.getMimeType(extension)
}

/**
 * Generate ETag from file metadata
 */
export const nativeGenerateEtag = (mtimeMs: number, size: number): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateEtag(mtimeMs, size)
}

// ============================================================================
// Native Proxy
// ============================================================================

/**
 * Extract proxy information from headers using native Rust implementation
 */
export const nativeExtractProxyInfo = (
	trust: NativeTrustProxy,
	socketIp: string,
	headers?: {
		forwardedFor?: string
		forwardedHost?: string
		forwardedProto?: string
		forwardedPort?: string
		host?: string
	}
): NativeProxyInfo | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.extractProxyInfo(
		trust,
		socketIp,
		headers?.forwardedFor,
		headers?.forwardedHost,
		headers?.forwardedProto,
		headers?.forwardedPort,
		headers?.host
	)
}

// ============================================================================
// Native OpenTelemetry
// ============================================================================

/**
 * Generate a trace ID (32 hex chars) using native Rust implementation
 */
export const nativeGenerateTraceId = (): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateTraceId()
}

/**
 * Generate a span ID (16 hex chars) using native Rust implementation
 */
export const nativeGenerateSpanId = (): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateSpanId()
}

/**
 * Parse W3C traceparent header
 */
export const nativeParseTraceparent = (header: string): NativeSpanContext | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.parseTraceparent(header)
}

/**
 * Format W3C traceparent header
 */
export const nativeFormatTraceparent = (
	traceId: string,
	spanId: string,
	traceFlags: number
): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.formatTraceparent(traceId, spanId, traceFlags)
}

/**
 * Create a native tracer
 *
 * @example
 * ```ts
 * const tracer = createNativeTracer('my-service')
 * const span = tracer?.startSpan('handle-request')
 * span?.setAttribute('http.method', 'GET')
 * // ... do work ...
 * span?.endWithStatus('Ok')
 * ```
 */
export const createNativeTracer = (
	serviceName: string,
	sampleRate?: number
): NativeTracer | null => {
	const binding = loadNative()
	if (!binding) return null
	return new binding.Tracer(serviceName, sampleRate)
}

/**
 * Create a native metrics collector
 *
 * @example
 * ```ts
 * const metrics = createNativeMetricsCollector()
 * metrics?.counterInc('http_requests_total')
 * metrics?.histogramRecord('request_duration_ms', 125)
 * console.log(metrics?.toPrometheus())
 * ```
 */
export const createNativeMetricsCollector = (): NativeMetricsCollector | null => {
	const binding = loadNative()
	if (!binding) return null
	return new binding.MetricsCollector()
}

// ============================================================================
// Native WebSocket Support
// ============================================================================

/**
 * Check if request headers indicate a WebSocket upgrade request
 *
 * @example
 * ```ts
 * if (nativeIsWebSocketUpgrade(ctx.headers)) {
 *   const acceptKey = nativeGenerateWebSocketAccept(ctx.headers['sec-websocket-key'])
 *   // Handle WebSocket upgrade...
 * }
 * ```
 */
export const nativeIsWebSocketUpgrade = (headers: Record<string, string>): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isWebsocketUpgrade(headers)
	} catch {
		return false
	}
}

/**
 * Generate WebSocket accept key from client's Sec-WebSocket-Key header
 *
 * Implements RFC 6455 key generation algorithm
 */
export const nativeGenerateWebSocketAccept = (key: string): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateWebsocketAccept(key)
}

/**
 * Create WebSocket upgrade response headers
 *
 * @example
 * ```ts
 * const { status, headers } = nativeCreateWebSocketUpgradeResponse(
 *   ctx.headers['sec-websocket-key'],
 *   ctx.headers['sec-websocket-protocol']
 * )
 * return { status, headers, body: null }
 * ```
 */
export const nativeCreateWebSocketUpgradeResponse = (
	key: string,
	protocol?: string
): { status: number; headers: Record<string, string> } | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.createWebsocketUpgradeResponse(key, protocol)
}
