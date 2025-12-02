/**
 * @sylphx/gust-app
 *
 * Stateless HTTP application framework
 * Portable across Bun, Deno, Edge Workers, Serverless
 *
 * @example
 * ```typescript
 * import { createApp, get, json, cors } from '@sylphx/gust-app'
 *
 * const app = createApp({
 *   routes: [
 *     get('/users', () => json({ users: [] })),
 *     get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
 *   ],
 *   middleware: cors(),
 * })
 *
 * // Use with any runtime
 * Bun.serve({ fetch: app.fetch })
 * Deno.serve(app.fetch)
 * export default { fetch: app.fetch }
 * ```
 */

// ============================================================================
// Core Types (from gust-core)
// ============================================================================

export type {
	Handler,
	ResponseBody,
	ServerResponse,
	Wrapper,
} from '@sylphx/gust-core'

export {
	badRequest,
	compose,
	forbidden,
	getWasm,
	html,
	initWasm,
	isStreamingBody,
	isWasmReady,
	json,
	notFound,
	pipe,
	redirect,
	response,
	serverError,
	text,
	unauthorized,
} from '@sylphx/gust-core'

// ============================================================================
// App Builder
// ============================================================================

export type {
	AppConfig,
	GustApp,
	InvokeHandlerInput,
	NativeHandlerContext,
	RouteEntry,
	RouteManifest,
} from './app'

export { createApp } from './app'

// ============================================================================
// Shared Types
// ============================================================================

export type { ContextProvider, Middleware } from './types'
export { WILDCARD_METHODS } from './types'

// ============================================================================
// Router DSL
// ============================================================================

export type { FetchHandler, Route, RouteHandlerFn, Routes, TypedRouteBuilders } from './router'

export {
	all,
	createRouter,
	del,
	FETCH_HANDLER_MARKER,
	fetchHandler,
	get,
	head,
	isFetchHandler,
	options,
	patch,
	post,
	put,
	routes,
} from './router'

// ============================================================================
// Context
// ============================================================================

export type { BaseContext, Context, HandlerArgs, RawContext, RouteHandler } from './context'

export {
	createContext,
	createRawContext,
	parseHeaders,
	requestToRawContext,
	responseToServerResponse,
	serverResponseToResponse,
	withApp,
	withParams,
} from './context'

// ============================================================================
// Middleware
// ============================================================================

// Authentication
export type { ApiKeyOptions, BasicAuthOptions, BearerAuthOptions, HmacOptions } from './auth'
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

// Body/Query Parsing
export type { MultipartPart, ParsedBody } from './body'
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

// Body Size Limit
export type { BodyLimitOptions } from './bodyLimit'
export {
	bodyLimit,
	formatSize,
	jsonLimit,
	largeUploadLimit,
	parseSize,
	uploadLimit,
} from './bodyLimit'

// Cache
export type { CacheEntry, CacheOptions, CacheStore } from './cache'
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

// Compression
export type { CompressionOptions } from './compress'
export { brotli, compress, gzip } from './compress'

// Cookies
export type { Cookie, CookieOptions } from './cookie'
export {
	deleteCookie,
	getCookie,
	getCookies,
	parseCookies,
	serializeCookie,
	setCookie,
	setCookies,
} from './cookie'

// CORS
export type { CorsOptions } from './cors'
export { cors, simpleCors } from './cors'

// CSRF
export type { CsrfOptions } from './csrf'
export {
	csrf,
	csrfDoubleSubmit,
	csrfField,
	csrfMeta,
	generateCsrfToken,
	getCsrfToken,
	verifyCsrfToken,
} from './csrf'

// JWT
export type {
	JwtAuthOptions,
	JwtHeader,
	JwtOptions,
	JwtPayload,
	JwtResult,
	VerifyOptions,
} from './jwt'
export {
	createJwt,
	decodeJwt,
	getJwtPayload,
	isJwtExpired,
	jwtAuth,
	optionalJwt,
	verifyJwt,
} from './jwt'

// Proxy Headers
export type { ProxyInfo, ProxyOptions } from './proxy'
export {
	getClientIp,
	getProxyInfo,
	proxy,
	trustFirstProxy,
	trustLocalProxy,
} from './proxy'

// Rate Limiting
export type { RateLimitOptions, RateLimitStore2 } from './rateLimit'
export { rateLimit, rateLimitWithStore } from './rateLimit'

// Security Headers
export type { SecurityOptions } from './security'
export { apiSecurity, security, strictSecurity } from './security'

// Session
export type { Session, SessionData, SessionOptions, SessionStore } from './session'
export {
	flash,
	generateSessionId,
	getSession,
	MemoryStore,
	session,
} from './session'

// Request ID / Tracing
export type { LogFn, LoggingOptions, TracingOptions } from './tracing'
export {
	generateNanoId,
	generateShortId,
	generateUUID,
	getRequestId,
	logging,
	tracing,
} from './tracing'

// Validation
export type {
	Schema,
	ValidateOptions,
	ValidationError,
	ValidationResult,
	Validator,
} from './validate'
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
	string,
	url,
	uuid,
	validate,
	validateBody,
	validateQuery,
	validateSchema,
} from './validate'

// ============================================================================
// WASM Utilities
// ============================================================================

export {
	initWasm as initAppWasm,
	isWasmAvailable as isAppWasmAvailable,
	// WebSocket WASM helpers
	wasmEncodeWebSocketBinary,
	wasmEncodeWebSocketClose,
	wasmEncodeWebSocketPing,
	wasmEncodeWebSocketPong,
	wasmEncodeWebSocketText,
	// Tracing WASM helpers
	wasmFormatTraceparent,
	wasmGenerateSpanId,
	wasmGenerateTraceId,
	wasmGenerateWebSocketAccept,
	wasmParseTraceparent,
} from './wasm-loader'
