/**
 * @aspect/serve
 * High performance functional HTTP server powered by WASM
 */

// Re-export from core
export {
  // Response helpers
  response,
  json,
  text,
  html,
  redirect,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
  // Composition
  compose,
  pipe,
  // WASM (advanced)
  initWasm,
  getWasm,
  isWasmReady,
} from '@aspect/serve-core'

export type {
  ServerResponse,
  Handler,
  Wrapper,
} from '@aspect/serve-core'

// Server
export { serve } from './serve'
export type { ServeOptions, Server, TlsOptions } from './serve'

// Router
export {
  router,
  get,
  post,
  put,
  patch,
  del,
  head,
  options,
  all,
  group,
} from './router'
export type { Route } from './router'

// Context
export { createContext, withParams, parseHeaders } from './context'
export type { Context } from './context'

// Static file serving
export { serveStatic } from './static'
export type { StaticOptions } from './static'

// CORS
export { cors, simpleCors } from './cors'
export type { CorsOptions } from './cors'

// Cookies
export {
  parseCookies,
  serializeCookie,
  deleteCookie,
  getCookies,
  getCookie,
  setCookie,
  setCookies,
} from './cookie'
export type { CookieOptions, Cookie } from './cookie'

// Compression
export { compress, gzip, brotli } from './compress'
export type { CompressionOptions } from './compress'

// WebSocket
export {
  WebSocket,
  isWebSocketUpgrade,
  upgradeToWebSocket,
  generateAcceptKey,
  createHandshakeResponse,
  websocket,
} from './websocket'
export type { WebSocketMessage, WebSocketEvents, WebSocketHandler } from './websocket'

// Body/Query Parsing
export {
  parseQuery,
  stringifyQuery,
  parseFormBody,
  parseJsonBody,
  parseMultipart,
  extractBoundary,
  getContentType,
  isJsonContent,
  isFormContent,
  isMultipartContent,
} from './body'
export type { ParsedBody, MultipartPart } from './body'

// Rate Limiting
export { rateLimit, rateLimitWithStore } from './rateLimit'
export type { RateLimitOptions, RateLimitStore2 } from './rateLimit'

// Security Headers
export { security, strictSecurity, apiSecurity } from './security'
export type { SecurityOptions } from './security'

// Server-Sent Events
export { SSEClient, createSSE, sseHeaders, formatSSE } from './sse'
export type { SSEMessage } from './sse'

// Request ID / Tracing
export {
  tracing,
  logging,
  getRequestId,
  generateUUID,
  generateShortId,
  generateNanoId,
} from './tracing'
export type { TracingOptions, LoggingOptions, LogFn } from './tracing'

// Proxy Headers
export {
  proxy,
  trustLocalProxy,
  trustFirstProxy,
  getProxyInfo,
  getClientIp,
} from './proxy'
export type { ProxyOptions, ProxyInfo } from './proxy'

// Streaming Response
export {
  StreamWriter,
  createStream,
  createJsonStream,
  streamFrom,
  streamGenerator,
  pipeStream,
} from './stream'

// Range Requests (Video/Audio)
export {
  parseRange,
  isRangeSatisfiable,
  contentRange,
  serveRangeFile,
  rangeServer,
  acceptsRange,
  getRange,
} from './range'
export type { Range, ParsedRange, RangeOptions, RangeFileOptions } from './range'

// Body Size Limit
export { bodyLimit, jsonLimit, uploadLimit, largeUploadLimit, parseSize, formatSize } from './bodyLimit'
export type { BodyLimitOptions } from './bodyLimit'

// Authentication
export {
  basicAuth,
  simpleBasicAuth,
  parseBasicAuth,
  createBasicAuth,
  bearerAuth,
  parseBearerToken,
  apiKeyAuth,
  simpleApiKey,
  hmacAuth,
  generateHmac,
  verifyHmac,
} from './auth'
export type { BasicAuthOptions, BearerAuthOptions, ApiKeyOptions, HmacOptions } from './auth'

// JWT
export {
  createJwt,
  verifyJwt,
  decodeJwt,
  isJwtExpired,
  jwtAuth,
  optionalJwt,
  getJwtPayload,
} from './jwt'
export type { JwtHeader, JwtPayload, JwtOptions, VerifyOptions, JwtResult, JwtAuthOptions } from './jwt'

// Session
export {
  session,
  getSession,
  MemoryStore,
  generateSessionId,
  flash,
} from './session'
export type { Session, SessionData, SessionStore, SessionOptions } from './session'

// CSRF
export {
  csrf,
  csrfDoubleSubmit,
  getCsrfToken,
  generateCsrfToken,
  verifyCsrfToken,
  csrfField,
  csrfMeta,
} from './csrf'
export type { CsrfOptions } from './csrf'

// Cache
export {
  cache,
  noCache,
  etag,
  invalidateCache,
  MemoryCache,
  LRUCache,
  defaultCacheKey,
  varyingCacheKey,
} from './cache'
export type { CacheOptions, CacheStore, CacheEntry } from './cache'

// Circuit Breaker
export {
  CircuitBreaker,
  circuitBreaker,
  getCircuitBreaker,
  withCircuitBreaker,
  bulkhead,
} from './circuitBreaker'
export type { CircuitState, CircuitBreakerOptions, CircuitStats, BulkheadOptions } from './circuitBreaker'

// Health Check
export {
  health,
  healthCheck,
  liveness,
  readiness,
  startup,
  runHealthChecks,
  memoryCheck,
  eventLoopCheck,
  httpCheck,
  customCheck,
  metrics,
  prometheusMetrics,
  getMetrics,
} from './health'
export type { HealthStatus, HealthCheck, HealthResult, HealthOptions, Metrics } from './health'

// Validation
export {
  validate,
  validateBody,
  validateQuery,
  validateSchema,
  createValidator,
  getValidated,
  getValidatedQuery,
  // Schema builders
  string,
  number,
  boolean,
  object,
  array,
  email,
  url,
  uuid,
  optional,
  nullable,
} from './validate'
export type { Schema, Validator, ValidationError, ValidationResult, ValidateOptions } from './validate'

// Cluster
export {
  ClusterManager,
  clusterServe,
  runCluster,
  getClusterInfo,
  isCluster,
  isPrimary,
  isWorker,
  stickySession,
} from './cluster'
export type { ClusterOptions, ClusterInfo, ClusterServeOptions } from './cluster'

// OpenTelemetry
export {
  otel,
  createTracer,
  consoleExporter,
  createOtlpExporter,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  formatTraceparent,
  parseTracestate,
  formatTracestate,
  getSpan,
  startChildSpan,
  MetricsCollector,
} from './otel'
export type {
  Span,
  SpanContext,
  SpanAttributes,
  SpanEvent,
  Tracer,
  SpanExporter,
  OtelOptions,
  Counter,
  Histogram,
  Gauge,
} from './otel'

// HTTP/2
export {
  serveHttp2,
  pushResource,
  pushResources,
  getAlpnProtocol,
  isHttp2,
  preloadHint,
  preload,
} from './http2'
export type {
  Http2Context,
  Http2Options,
  Http2ServerInstance,
  PushOptions,
} from './http2'
