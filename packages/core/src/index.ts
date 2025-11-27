/**
 * @aspect/serve-core
 * High performance WASM HTTP parser and Radix Trie router
 * Works in Browser and Server
 */

// WASM Core
export {
  initWasm,
  getWasm,
  isWasmReady,
  Methods,
  MethodNames,
} from './core'

export type {
  WasmCore,
  WasmRouter,
  ParseResult,
  RouteMatch,
  MethodCode,
} from './core'

// Response helpers (pure, no I/O)
export {
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
} from './response'

export type { ServerResponse } from './response'

// Composition utilities (pure functions)
export { compose, pipe } from './compose'

export type { Handler, Wrapper } from './compose'
