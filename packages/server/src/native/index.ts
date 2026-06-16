/**
 * Native Server Integration
 *
 * Transparently accelerates routes using Rust native HTTP server.
 * Falls back to WASM, then pure JS for edge/serverless environments.
 *
 * Performance: ~220k req/s consistent across all runtimes (Bun, Node.js, Deno)
 *
 * Architecture:
 * - Native (napi-rs): Primary backend, maximum performance
 * - WASM fallback: Edge/serverless environments with WASM support
 * - Pure JS fallback: Environments without native or WASM support
 *
 * This barrel re-exports the cohesive concern modules under `./native/*`,
 * preserving the exact public surface of the original `native.ts`.
 */

// ----------------------------------------------------------------------------
// Capability probes & defaults
// ----------------------------------------------------------------------------
export {
	corsPermissive,
	getBestBackend,
	getCpuCount,
	getPhysicalCpuCount,
	getRecommendedWorkers,
	isCompressionAvailable,
	isHttp2Available,
	isIoUringAvailable,
	isTlsAvailable,
	securityStrict,
} from './capabilities'

// ----------------------------------------------------------------------------
// Module loader
// ----------------------------------------------------------------------------
export { getNativeLoadError, isNativeAvailable, loadNativeBinding } from './loader'
// ----------------------------------------------------------------------------
// OpenTelemetry
// ----------------------------------------------------------------------------
export {
	createNativeMetricsCollector,
	createNativeTracer,
	nativeFormatTraceparent,
	nativeGenerateSpanId,
	nativeGenerateTraceId,
	nativeParseTraceparent,
} from './otel'
// ----------------------------------------------------------------------------
// Proxy
// ----------------------------------------------------------------------------
export { nativeExtractProxyInfo } from './proxy'
// ----------------------------------------------------------------------------
// Range requests
// ----------------------------------------------------------------------------
export {
	nativeContentRange,
	nativeGenerateEtag,
	nativeGetMimeType,
	nativeParseRange,
} from './range'

// ----------------------------------------------------------------------------
// Resilience primitives
// ----------------------------------------------------------------------------
export { createNativeBulkhead, createNativeCircuitBreaker } from './resilience'
// ----------------------------------------------------------------------------
// Native server wrappers
// ----------------------------------------------------------------------------
export {
	createNativeServer,
	createNativeServerWithConfig,
	type NativeServeOptions,
	type NativeServerHandle,
	type NativeServeWithConfigOptions,
	nativeServe,
	nativeServeWithConfig,
} from './server'
// ----------------------------------------------------------------------------
// Static route definition
// ----------------------------------------------------------------------------
export {
	canBeStatic,
	extractStaticRoute,
	type StaticRouteConfig,
	type StaticRouteResult,
	staticGet,
	staticPost,
	staticRoute,
} from './static-route'
// ----------------------------------------------------------------------------
// Shared types
// ----------------------------------------------------------------------------
export type {
	NativeBinding,
	NativeBulkhead,
	NativeBulkheadConfig,
	NativeCircuitBreaker,
	NativeCircuitBreakerConfig,
	NativeCircuitStats,
	NativeCompressionConfig,
	NativeCorsConfig,
	NativeInvokeHandlerInput,
	NativeMetricsCollector,
	NativeParsedRange,
	NativeProxyInfo,
	NativeRateLimitConfig,
	NativeRouteEntry,
	NativeRouteManifest,
	NativeSchemaType,
	NativeSecurityConfig,
	NativeServer,
	NativeServerConfig,
	NativeSpan,
	NativeSpanContext,
	NativeSpanStatus,
	NativeStringFormat,
	NativeTlsConfig,
	NativeTracer,
	NativeTrustProxy,
	NativeValidationError,
	NativeValidationResult,
	RequestContext,
	ResponseData,
	WebSocketFrame,
	WebSocketOpcode,
	WebSocketParseResult,
} from './types'
// ----------------------------------------------------------------------------
// Validation
// ----------------------------------------------------------------------------
export { nativeValidateJson } from './validation'

// ----------------------------------------------------------------------------
// WebSocket support
// ----------------------------------------------------------------------------
export {
	nativeCreateWebSocketUpgradeResponse,
	nativeEncodeWebSocketBinary,
	nativeEncodeWebSocketClose,
	nativeEncodeWebSocketContinuation,
	nativeEncodeWebSocketPing,
	nativeEncodeWebSocketPong,
	nativeEncodeWebSocketText,
	nativeGenerateWebSocketAccept,
	nativeGenerateWebSocketMask,
	nativeIsValidCloseCode,
	nativeIsWebSocketUpgrade,
	nativeMaskWebSocketPayload,
	nativeParseWebSocketFrame,
	nativeWebSocketCloseCodes,
} from './websocket'
