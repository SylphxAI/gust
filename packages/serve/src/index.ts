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
