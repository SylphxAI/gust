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
export type { ErrorResponseBody, ResponseBody, ServerResponse } from './response'
// Response helpers (pure, no I/O)
export {
	badRequest,
	errorResponse,
	forbidden,
	html,
	isStreamingBody,
	json,
	notFound,
	payloadTooLarge,
	redirect,
	response,
	serverError,
	text,
	tooManyRequests,
	unauthorized,
	validationError,
} from './response'
