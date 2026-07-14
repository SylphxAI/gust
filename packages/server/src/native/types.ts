/**
 * Native Server Integration — Shared Types
 *
 * Type and interface declarations shared across the native integration
 * concern modules. Pure declarations; no runtime logic.
 */

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
	/** Request timeout in milliseconds (default: 30000) */
	requestTimeoutMs?: number
	/** Maximum body size in bytes (default: 1MB) */
	maxBodySize?: number
	/** Keep-alive timeout in milliseconds (default: 5000) */
	keepAliveTimeoutMs?: number
	/** Maximum header size in bytes (default: 8KB) */
	maxHeaderSize?: number
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

// ============================================================================
// WebSocket Frame Types
// ============================================================================

/** WebSocket frame opcode */
export type WebSocketOpcode = 'continuation' | 'text' | 'binary' | 'close' | 'ping' | 'pong'

/** Parsed WebSocket frame */
export interface WebSocketFrame {
	/** Frame opcode */
	opcode: string
	/** Is this the final frame in a message? */
	fin: boolean
	/** Payload data (unmasked) */
	payload: number[]
	/** Total bytes consumed from input buffer */
	bytesConsumed: number
	/** For close frames: the close code (if present) */
	closeCode?: number
	/** For close frames: the close reason (if present) */
	closeReason?: string
}

/** Result of parsing WebSocket frame */
export interface WebSocketParseResult {
	/** The parsed frame (if complete) */
	frame?: WebSocketFrame
	/** Error message (if parse failed) */
	error?: string
	/** Needs more data? */
	incomplete: boolean
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
	// WebSocket Frame Encoding/Decoding
	parseWebsocketFrame: (data: number[]) => WebSocketParseResult
	encodeWebsocketText: (text: string, fin?: boolean) => number[]
	encodeWebsocketBinary: (data: number[], fin?: boolean) => number[]
	encodeWebsocketPing: (data?: number[]) => number[]
	encodeWebsocketPong: (data?: number[]) => number[]
	encodeWebsocketClose: (code?: number, reason?: string) => number[]
	encodeWebsocketContinuation: (data: number[], fin: boolean) => number[]
	maskWebsocketPayload: (data: number[], maskKey: number[]) => number[]
	generateWebsocketMask: () => number[]
	websocketCloseCodes: () => Record<string, number>
	isValidCloseCode: (code: number) => boolean
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

/** Route entry for Rust router registration (napi-rs auto-converts to camelCase) */
export interface NativeRouteEntry {
	method: string
	path: string
	handlerId: number
	hasParams: boolean
	hasWildcard: boolean
}

/** Route manifest for Rust router registration (napi-rs auto-converts to camelCase) */
export interface NativeRouteManifest {
	routes: NativeRouteEntry[]
	handlerCount: number
}

/** Input for invoke handler callback from Rust (napi-rs auto-converts to camelCase) */
export interface NativeInvokeHandlerInput {
	handlerId: number
	ctx: {
		method: string
		path: string
		query: string
		headers: Record<string, string>
		params: Record<string, string>
		body: Uint8Array
	}
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
	/** Register routes from GustApp manifest (new route registration pattern) */
	registerRoutes(manifest: NativeRouteManifest): Promise<void>
	/** Set invoke handler callback (new route registration pattern) */
	setInvokeHandler(callback: (input: NativeInvokeHandlerInput) => Promise<ResponseData>): void
	/** Check if app routes pattern is configured */
	hasAppRoutes(): boolean
	/** Clear all app routes (for hot reload) */
	clearAppRoutes(): Promise<void>
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
	/** Set request timeout in milliseconds */
	setRequestTimeout(timeoutMs: number): Promise<void>
	/** Set maximum body size in bytes */
	setMaxBodySize(maxBytes: number): Promise<void>
	/** Set keep-alive timeout in milliseconds */
	setKeepAliveTimeout(timeoutMs: number): Promise<void>
	/** Set maximum header size in bytes */
	setMaxHeaderSize(maxBytes: number): Promise<void>
	/** Start server on port */
	serve(port: number): Promise<void>
	/** Start server with custom hostname */
	serveWithHostname(port: number, hostname: string): Promise<void>
	/** Shutdown the server immediately */
	shutdown(): Promise<void>
	/** Graceful shutdown - waits for connections to drain
	 *  @param timeoutMs - Maximum time to wait (0 = no timeout)
	 *  @returns true if all connections drained, false if timeout reached
	 */
	gracefulShutdown(timeoutMs: number): Promise<boolean>
	/** Get number of active connections */
	activeConnections(): number
	/** Check if server is shutting down */
	isShuttingDown(): boolean
}
