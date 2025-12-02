/**
 * @sylphx/gust-server
 *
 * High-performance Rust-powered HTTP server
 * 220k+ requests/second with native acceleration
 *
 * @example
 * ```typescript
 * import { createApp, get, json } from '@sylphx/gust-app'
 * import { serve } from '@sylphx/gust-server'
 *
 * const app = createApp({
 *   routes: [get('/hello', () => json({ msg: 'hi' }))],
 * })
 *
 * await serve({ app, port: 3000 })
 * ```
 */

// Re-export app types needed for serve options
export type { ContextProvider, GustApp, Middleware } from '@sylphx/gust-app'
export type { Handler, ServerResponse } from '@sylphx/gust-core'

// ============================================================================
// Server
// ============================================================================

export type { ServeOptions, Server, TlsOptions } from './serve'
export { serve } from './serve'

// ============================================================================
// Cluster
// ============================================================================

export type { ClusterInfo, ClusterOptions, ClusterServeOptions } from './cluster'
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

// ============================================================================
// HTTP/2
// ============================================================================

export type {
	Http2Context,
	Http2Options,
	Http2ServerInstance,
	PushOptions,
} from './http2'
export {
	getAlpnProtocol,
	isHttp2,
	preload,
	preloadHint,
	pushResource,
	pushResources,
	serveHttp2,
} from './http2'

// ============================================================================
// Server-Sent Events
// ============================================================================

export type {
	NativeSSEResponse,
	NativeSseWriter,
	SSECleanup,
	SSEEmit,
	SSEEvent,
	SSEGenerator,
	SSEHandler,
	SSEMessage,
	SSEOptions,
	SSESource,
} from './sse'
export {
	createSSE,
	formatSSE,
	formatSSEEvent,
	isNativeSSEAvailable,
	nativeSSE,
	SSEClient,
	sse,
	sseEvent,
	sseHeaders,
	sseRaw,
	sseStream,
	textStream,
} from './sse'

// ============================================================================
// WebSocket
// ============================================================================

export type {
	WebSocketCloseInfo,
	WebSocketEvents,
	WebSocketHandler,
	WebSocketMessage,
	WebSocketSession,
	WebSocketSessionHandler,
} from './websocket'
export {
	createHandshakeResponse,
	createWebSocketSession,
	generateAcceptKey,
	isWebSocketUpgrade,
	upgradeToWebSocket,
	WebSocket,
	websocket,
	websocketSession,
} from './websocket'

// ============================================================================
// Streaming
// ============================================================================

export {
	createJsonStream,
	createStream,
	ndjsonStream,
	nodeStreamToAsyncIterable,
	pipeStream,
	StreamWriter,
	stream,
	streamFile,
	streamFrom,
	streamGenerator,
	streamText,
} from './stream'

// ============================================================================
// Static Files
// ============================================================================

export type { StaticOptions } from './static'
export { serveStatic } from './static'

// ============================================================================
// Range Requests
// ============================================================================

export type { ParsedRange, Range, RangeFileOptions, RangeOptions } from './range'
export {
	acceptsRange,
	contentRange,
	getRange,
	isRangeSatisfiable,
	parseRange,
	rangeServer,
	serveRangeFile,
} from './range'

// ============================================================================
// Health Check
// ============================================================================

export type { HealthCheck, HealthOptions, HealthResult, HealthStatus, Metrics } from './health'
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

// ============================================================================
// Circuit Breaker
// ============================================================================

export type {
	BulkheadOptions,
	CircuitBreakerOptions,
	CircuitState,
	CircuitStats,
} from './circuitBreaker'
export {
	bulkhead,
	CircuitBreaker,
	circuitBreaker,
	getCircuitBreaker,
	withCircuitBreaker,
} from './circuitBreaker'

// ============================================================================
// OpenTelemetry
// ============================================================================

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

// ============================================================================
// Native Acceleration (internal)
// ============================================================================

export {
	corsPermissive,
	getCpuCount,
	getPhysicalCpuCount,
	getRecommendedWorkers,
	isCompressionAvailable,
	isHttp2Available,
	isNativeAvailable,
	isTlsAvailable,
	securityStrict,
} from './native'

// ============================================================================
// Turbo Optimizations
// ============================================================================

export { turboServe } from './turbo'
