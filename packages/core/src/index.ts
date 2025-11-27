/**
 * @sylphx/gust-core
 * High performance WASM HTTP parser and Radix Trie router
 * Works in Browser and Server
 */

export type { Handler, Wrapper } from './compose'
// Composition utilities (pure functions)
export { compose, pipe } from './compose'
export type {
	MethodCode,
	ParseResult,
	RouteMatch,
	WasmCore,
	WasmRouter,
} from './core'
// WASM Core
export {
	getWasm,
	initWasm,
	isWasmReady,
	MethodNames,
	Methods,
} from './core'
export type { ServerResponse } from './response'
// Response helpers (pure, no I/O)
export {
	badRequest,
	forbidden,
	html,
	json,
	notFound,
	redirect,
	response,
	serverError,
	text,
	unauthorized,
} from './response'
