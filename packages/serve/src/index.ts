/**
 * @sylphx/gust
 * High performance functional HTTP server powered by WASM
 */

export type {
	Handler,
	ServerResponse,
	Wrapper,
} from '@sylphx/gust-core'
// Re-export from core
export {
	badRequest,
	// Composition
	compose,
	forbidden,
	getWasm,
	html,
	// WASM (advanced)
	initWasm,
	isWasmReady,
	json,
	notFound,
	pipe,
	redirect,
	// Response helpers
	response,
	serverError,
	text,
	unauthorized,
} from '@sylphx/gust-core'
export type { ApiKeyOptions, BasicAuthOptions, BearerAuthOptions, HmacOptions } from './auth'
// Authentication
export {
	apiKeyAuth,
	basicAuth,
	bearerAuth,
	createBasicAuth,
	generateHmac,
	hmacAuth,
	parseBasicAuth,
	parseBearerToken,
	simpleApiKey,
	simpleBasicAuth,
	verifyHmac,
} from './auth'
export type { MultipartPart, ParsedBody } from './body'
// Body/Query Parsing
export {
	extractBoundary,
	getContentType,
	isFormContent,
	isJsonContent,
	isMultipartContent,
	parseFormBody,
	parseJsonBody,
	parseMultipart,
	parseQuery,
	stringifyQuery,
} from './body'
export type { BodyLimitOptions } from './bodyLimit'
// Body Size Limit
export {
	bodyLimit,
	formatSize,
	jsonLimit,
	largeUploadLimit,
	parseSize,
	uploadLimit,
} from './bodyLimit'
export type { CacheEntry, CacheOptions, CacheStore } from './cache'
// Cache
export {
	cache,
	defaultCacheKey,
	etag,
	invalidateCache,
	LRUCache,
	MemoryCache,
	noCache,
	varyingCacheKey,
} from './cache'
export type {
	BulkheadOptions,
	CircuitBreakerOptions,
	CircuitState,
	CircuitStats,
} from './circuitBreaker'
// Circuit Breaker
export {
	bulkhead,
	CircuitBreaker,
	circuitBreaker,
	getCircuitBreaker,
	withCircuitBreaker,
} from './circuitBreaker'
export type { ClusterInfo, ClusterOptions, ClusterServeOptions } from './cluster'
// Cluster
export {
	ClusterManager,
	clusterServe,
	getClusterInfo,
	isCluster,
	isPrimary,
	isWorker,
	runCluster,
	stickySession,
} from './cluster'
export type { CompressionOptions } from './compress'
// Compression
export { brotli, compress, gzip } from './compress'
export type { Context } from './context'
// Context
export { createContext, parseHeaders, withParams } from './context'
export type { Cookie, CookieOptions } from './cookie'
// Cookies
export {
	deleteCookie,
	getCookie,
	getCookies,
	parseCookies,
	serializeCookie,
	setCookie,
	setCookies,
} from './cookie'
export type { CorsOptions } from './cors'
// CORS
export { cors, simpleCors } from './cors'
export type { CsrfOptions } from './csrf'
// CSRF
export {
	csrf,
	csrfDoubleSubmit,
	csrfField,
	csrfMeta,
	generateCsrfToken,
	getCsrfToken,
	verifyCsrfToken,
} from './csrf'
export type { HealthCheck, HealthOptions, HealthResult, HealthStatus, Metrics } from './health'
// Health Check
export {
	customCheck,
	eventLoopCheck,
	getMetrics,
	health,
	healthCheck,
	httpCheck,
	liveness,
	memoryCheck,
	metrics,
	prometheusMetrics,
	readiness,
	runHealthChecks,
	startup,
} from './health'
export type {
	Http2Context,
	Http2Options,
	Http2ServerInstance,
	PushOptions,
} from './http2'
// HTTP/2
export {
	getAlpnProtocol,
	isHttp2,
	preload,
	preloadHint,
	pushResource,
	pushResources,
	serveHttp2,
} from './http2'
export type {
	JwtAuthOptions,
	JwtHeader,
	JwtOptions,
	JwtPayload,
	JwtResult,
	VerifyOptions,
} from './jwt'
// JWT
export {
	createJwt,
	decodeJwt,
	getJwtPayload,
	isJwtExpired,
	jwtAuth,
	optionalJwt,
	verifyJwt,
} from './jwt'
export type {
	Counter,
	Gauge,
	Histogram,
	OtelOptions,
	Span,
	SpanAttributes,
	SpanContext,
	SpanEvent,
	SpanExporter,
	Tracer,
} from './otel'
// OpenTelemetry
export {
	consoleExporter,
	createOtlpExporter,
	createTracer,
	formatTraceparent,
	formatTracestate,
	generateSpanId,
	generateTraceId,
	getSpan,
	MetricsCollector,
	otel,
	parseTraceparent,
	parseTracestate,
	startChildSpan,
} from './otel'
export type { ProxyInfo, ProxyOptions } from './proxy'
// Proxy Headers
export {
	getClientIp,
	getProxyInfo,
	proxy,
	trustFirstProxy,
	trustLocalProxy,
} from './proxy'
export type { ParsedRange, Range, RangeFileOptions, RangeOptions } from './range'
// Range Requests (Video/Audio)
export {
	acceptsRange,
	contentRange,
	getRange,
	isRangeSatisfiable,
	parseRange,
	rangeServer,
	serveRangeFile,
} from './range'
export type { RateLimitOptions, RateLimitStore2 } from './rateLimit'
// Rate Limiting
export { rateLimit, rateLimitWithStore } from './rateLimit'
export type { Route, Routes, Router, UrlGenerator } from './router'
// Router
export {
	all,
	del,
	get,
	head,
	merge,
	options,
	patch,
	post,
	prefix,
	put,
	router,
} from './router'
export type { SecurityOptions } from './security'
// Security Headers
export { apiSecurity, security, strictSecurity } from './security'
export type { ServeOptions, Server, TlsOptions } from './serve'
// Server
export { serve } from './serve'
export type { Session, SessionData, SessionOptions, SessionStore } from './session'
// Session
export {
	flash,
	generateSessionId,
	getSession,
	MemoryStore,
	session,
} from './session'
export type { SSEMessage } from './sse'
// Server-Sent Events
export { createSSE, formatSSE, SSEClient, sseHeaders } from './sse'
export type { StaticOptions } from './static'
// Static file serving
export { serveStatic } from './static'
// Streaming Response
export {
	createJsonStream,
	createStream,
	pipeStream,
	StreamWriter,
	streamFrom,
	streamGenerator,
} from './stream'
export type { LogFn, LoggingOptions, TracingOptions } from './tracing'
// Request ID / Tracing
export {
	generateNanoId,
	generateShortId,
	generateUUID,
	getRequestId,
	logging,
	tracing,
} from './tracing'
export type {
	Schema,
	ValidateOptions,
	ValidationError,
	ValidationResult,
	Validator,
} from './validate'
// Validation
export {
	array,
	boolean,
	createValidator,
	email,
	getValidated,
	getValidatedQuery,
	nullable,
	number,
	object,
	optional,
	// Schema builders
	string,
	url,
	uuid,
	validate,
	validateBody,
	validateQuery,
	validateSchema,
} from './validate'
export type { WebSocketEvents, WebSocketHandler, WebSocketMessage } from './websocket'
// WebSocket
export {
	createHandshakeResponse,
	generateAcceptKey,
	isWebSocketUpgrade,
	upgradeToWebSocket,
	WebSocket,
	websocket,
} from './websocket'
