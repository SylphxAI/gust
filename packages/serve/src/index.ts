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
