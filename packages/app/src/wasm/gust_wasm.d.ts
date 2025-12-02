/* tslint:disable */
/* eslint-disable */

export class ParseResult {
	private constructor()
	free(): void
	[Symbol.dispose](): void
	/**
	 * Get header offsets as a JS-compatible slice
	 * Returns only the used portion to minimize data transfer
	 */
	readonly header_offsets: Uint32Array
	/**
	 * 0 = incomplete, 1 = complete, 2 = error
	 */
	state: number
	/**
	 * Method (0=GET, 1=POST, etc.)
	 */
	method: number
	/**
	 * Path start offset in buffer
	 */
	path_start: number
	/**
	 * Path end offset in buffer
	 */
	path_end: number
	/**
	 * Query start offset (0 if no query)
	 */
	query_start: number
	/**
	 * Query end offset (0 if no query)
	 */
	query_end: number
	/**
	 * Number of headers parsed
	 */
	headers_count: number
	/**
	 * Body start offset
	 */
	body_start: number
}

export class RouteMatch {
	private constructor()
	free(): void
	[Symbol.dispose](): void
	readonly params: string[]
	found: boolean
	handler_id: number
}

export class WasmRouter {
	free(): void
	[Symbol.dispose](): void
	constructor()
	/**
	 * Find a route, returns RouteMatch
	 */
	find(method: string, path: string): RouteMatch
	/**
	 * Insert a route
	 */
	insert(method: string, path: string, handler_id: number): void
}

export class WasmSpanContext {
	private constructor()
	free(): void
	[Symbol.dispose](): void
	readonly span_id: string
	readonly trace_id: string
	trace_flags: number
}

export class WasmValidationResult {
	private constructor()
	free(): void
	[Symbol.dispose](): void
	valid: boolean
	readonly errors: string[]
}

export class WsFrameResult {
	private constructor()
	free(): void
	[Symbol.dispose](): void
	readonly close_reason: string
	readonly payload: Uint8Array
	/**
	 * Frame parsed successfully
	 */
	complete: boolean
	/**
	 * Needs more data
	 */
	incomplete: boolean
	/**
	 * Parse error occurred
	 */
	error: boolean
	/**
	 * FIN flag
	 */
	fin: boolean
	/**
	 * Opcode (0=continuation, 1=text, 2=binary, 8=close, 9=ping, 10=pong)
	 */
	opcode: number
	/**
	 * Bytes consumed from input
	 */
	bytes_consumed: number
	/**
	 * Close code (for close frames)
	 */
	close_code: number
}

/**
 * Encode a WebSocket binary frame
 */
export function encode_websocket_binary(data: Uint8Array, fin: boolean): Uint8Array

/**
 * Encode a WebSocket close frame
 */
export function encode_websocket_close(code?: number | null, reason?: string | null): Uint8Array

/**
 * Encode a WebSocket ping frame
 */
export function encode_websocket_ping(data: Uint8Array): Uint8Array

/**
 * Encode a WebSocket pong frame
 */
export function encode_websocket_pong(data: Uint8Array): Uint8Array

/**
 * Encode a WebSocket text frame
 */
export function encode_websocket_text(text: string, fin: boolean): Uint8Array

/**
 * Format W3C traceparent header
 */
export function format_traceparent(trace_id: string, span_id: string, trace_flags: number): string

/**
 * Generate a span ID (16 hex chars)
 */
export function generate_span_id(): string

/**
 * Generate a trace ID (32 hex chars)
 */
export function generate_trace_id(): string

/**
 * Generate WebSocket accept key
 */
export function generate_websocket_accept(key: string): string

/**
 * Generate a random WebSocket mask (4 bytes)
 */
export function generate_websocket_mask(): Uint8Array

/**
 * Get method string from code
 */
export function method_to_string(code: number): string

/**
 * Parse HTTP request from raw bytes
 * Single-pass parsing with zero intermediate allocations
 */
export function parse_http(buf: Uint8Array): ParseResult

/**
 * Parse W3C traceparent header
 */
export function parse_traceparent(header: string): WasmSpanContext | undefined

/**
 * Parse a WebSocket frame
 */
export function parse_websocket_frame(data: Uint8Array): WsFrameResult

/**
 * Seed the random number generator
 */
export function seed_rng(seed: bigint): void

/**
 * Validate a number value
 */
export function validate_number(
	value: number,
	min: number | null | undefined,
	max: number | null | undefined,
	is_integer: boolean
): WasmValidationResult

/**
 * Validate a string value
 */
export function validate_string(
	value: string,
	min_length?: number | null,
	max_length?: number | null,
	format?: string | null
): WasmValidationResult

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module

export interface InitOutput {
	readonly memory: WebAssembly.Memory
	readonly __wbg_get_parseresult_body_start: (a: number) => number
	readonly __wbg_get_parseresult_headers_count: (a: number) => number
	readonly __wbg_get_parseresult_method: (a: number) => number
	readonly __wbg_get_parseresult_path_end: (a: number) => number
	readonly __wbg_get_parseresult_path_start: (a: number) => number
	readonly __wbg_get_parseresult_query_end: (a: number) => number
	readonly __wbg_get_parseresult_query_start: (a: number) => number
	readonly __wbg_get_parseresult_state: (a: number) => number
	readonly __wbg_get_routematch_found: (a: number) => number
	readonly __wbg_get_routematch_handler_id: (a: number) => number
	readonly __wbg_get_wasmspancontext_trace_flags: (a: number) => number
	readonly __wbg_get_wasmvalidationresult_valid: (a: number) => number
	readonly __wbg_get_wsframeresult_bytes_consumed: (a: number) => number
	readonly __wbg_get_wsframeresult_close_code: (a: number) => number
	readonly __wbg_get_wsframeresult_complete: (a: number) => number
	readonly __wbg_get_wsframeresult_error: (a: number) => number
	readonly __wbg_get_wsframeresult_fin: (a: number) => number
	readonly __wbg_get_wsframeresult_incomplete: (a: number) => number
	readonly __wbg_get_wsframeresult_opcode: (a: number) => number
	readonly __wbg_parseresult_free: (a: number, b: number) => void
	readonly __wbg_routematch_free: (a: number, b: number) => void
	readonly __wbg_set_parseresult_body_start: (a: number, b: number) => void
	readonly __wbg_set_parseresult_headers_count: (a: number, b: number) => void
	readonly __wbg_set_parseresult_method: (a: number, b: number) => void
	readonly __wbg_set_parseresult_path_end: (a: number, b: number) => void
	readonly __wbg_set_parseresult_path_start: (a: number, b: number) => void
	readonly __wbg_set_parseresult_query_end: (a: number, b: number) => void
	readonly __wbg_set_parseresult_query_start: (a: number, b: number) => void
	readonly __wbg_set_parseresult_state: (a: number, b: number) => void
	readonly __wbg_set_routematch_found: (a: number, b: number) => void
	readonly __wbg_set_routematch_handler_id: (a: number, b: number) => void
	readonly __wbg_set_wasmspancontext_trace_flags: (a: number, b: number) => void
	readonly __wbg_set_wasmvalidationresult_valid: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_bytes_consumed: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_close_code: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_complete: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_error: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_fin: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_incomplete: (a: number, b: number) => void
	readonly __wbg_set_wsframeresult_opcode: (a: number, b: number) => void
	readonly __wbg_wasmrouter_free: (a: number, b: number) => void
	readonly __wbg_wasmspancontext_free: (a: number, b: number) => void
	readonly __wbg_wasmvalidationresult_free: (a: number, b: number) => void
	readonly __wbg_wsframeresult_free: (a: number, b: number) => void
	readonly encode_websocket_binary: (a: number, b: number, c: number) => [number, number]
	readonly encode_websocket_close: (a: number, b: number, c: number) => [number, number]
	readonly encode_websocket_ping: (a: number, b: number) => [number, number]
	readonly encode_websocket_pong: (a: number, b: number) => [number, number]
	readonly encode_websocket_text: (a: number, b: number, c: number) => [number, number]
	readonly format_traceparent: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number
	) => [number, number]
	readonly generate_span_id: () => [number, number]
	readonly generate_trace_id: () => [number, number]
	readonly generate_websocket_accept: (a: number, b: number) => [number, number]
	readonly generate_websocket_mask: () => [number, number]
	readonly method_to_string: (a: number) => [number, number]
	readonly parse_http: (a: number, b: number) => number
	readonly parse_traceparent: (a: number, b: number) => number
	readonly parse_websocket_frame: (a: number, b: number) => number
	readonly parseresult_header_offsets: (a: number) => [number, number]
	readonly routematch_params: (a: number) => [number, number]
	readonly seed_rng: (a: bigint) => void
	readonly validate_number: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number
	) => number
	readonly validate_string: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number
	) => number
	readonly wasmrouter_find: (a: number, b: number, c: number, d: number, e: number) => number
	readonly wasmrouter_insert: (
		a: number,
		b: number,
		c: number,
		d: number,
		e: number,
		f: number
	) => void
	readonly wasmrouter_new: () => number
	readonly wasmspancontext_span_id: (a: number) => [number, number]
	readonly wasmspancontext_trace_id: (a: number) => [number, number]
	readonly wasmvalidationresult_errors: (a: number) => [number, number]
	readonly wsframeresult_close_reason: (a: number) => [number, number]
	readonly wsframeresult_payload: (a: number) => [number, number]
	readonly __wbindgen_externrefs: WebAssembly.Table
	readonly __externref_drop_slice: (a: number, b: number) => void
	readonly __wbindgen_free: (a: number, b: number, c: number) => void
	readonly __wbindgen_malloc: (a: number, b: number) => number
	readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number
	readonly __wbindgen_start: () => void
}

export type SyncInitInput = BufferSource | WebAssembly.Module

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
	module_or_path?:
		| { module_or_path: InitInput | Promise<InitInput> }
		| InitInput
		| Promise<InitInput>
): Promise<InitOutput>
