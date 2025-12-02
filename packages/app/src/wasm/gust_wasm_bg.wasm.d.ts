/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory
export const __wbg_get_parseresult_body_start: (a: number) => number
export const __wbg_get_parseresult_headers_count: (a: number) => number
export const __wbg_get_parseresult_method: (a: number) => number
export const __wbg_get_parseresult_path_end: (a: number) => number
export const __wbg_get_parseresult_path_start: (a: number) => number
export const __wbg_get_parseresult_query_end: (a: number) => number
export const __wbg_get_parseresult_query_start: (a: number) => number
export const __wbg_get_parseresult_state: (a: number) => number
export const __wbg_get_routematch_found: (a: number) => number
export const __wbg_get_routematch_handler_id: (a: number) => number
export const __wbg_get_wasmspancontext_trace_flags: (a: number) => number
export const __wbg_get_wasmvalidationresult_valid: (a: number) => number
export const __wbg_get_wsframeresult_bytes_consumed: (a: number) => number
export const __wbg_get_wsframeresult_close_code: (a: number) => number
export const __wbg_get_wsframeresult_complete: (a: number) => number
export const __wbg_get_wsframeresult_error: (a: number) => number
export const __wbg_get_wsframeresult_fin: (a: number) => number
export const __wbg_get_wsframeresult_incomplete: (a: number) => number
export const __wbg_get_wsframeresult_opcode: (a: number) => number
export const __wbg_parseresult_free: (a: number, b: number) => void
export const __wbg_routematch_free: (a: number, b: number) => void
export const __wbg_set_parseresult_body_start: (a: number, b: number) => void
export const __wbg_set_parseresult_headers_count: (a: number, b: number) => void
export const __wbg_set_parseresult_method: (a: number, b: number) => void
export const __wbg_set_parseresult_path_end: (a: number, b: number) => void
export const __wbg_set_parseresult_path_start: (a: number, b: number) => void
export const __wbg_set_parseresult_query_end: (a: number, b: number) => void
export const __wbg_set_parseresult_query_start: (a: number, b: number) => void
export const __wbg_set_parseresult_state: (a: number, b: number) => void
export const __wbg_set_routematch_found: (a: number, b: number) => void
export const __wbg_set_routematch_handler_id: (a: number, b: number) => void
export const __wbg_set_wasmspancontext_trace_flags: (a: number, b: number) => void
export const __wbg_set_wasmvalidationresult_valid: (a: number, b: number) => void
export const __wbg_set_wsframeresult_bytes_consumed: (a: number, b: number) => void
export const __wbg_set_wsframeresult_close_code: (a: number, b: number) => void
export const __wbg_set_wsframeresult_complete: (a: number, b: number) => void
export const __wbg_set_wsframeresult_error: (a: number, b: number) => void
export const __wbg_set_wsframeresult_fin: (a: number, b: number) => void
export const __wbg_set_wsframeresult_incomplete: (a: number, b: number) => void
export const __wbg_set_wsframeresult_opcode: (a: number, b: number) => void
export const __wbg_wasmrouter_free: (a: number, b: number) => void
export const __wbg_wasmspancontext_free: (a: number, b: number) => void
export const __wbg_wasmvalidationresult_free: (a: number, b: number) => void
export const __wbg_wsframeresult_free: (a: number, b: number) => void
export const encode_websocket_binary: (a: number, b: number, c: number) => [number, number]
export const encode_websocket_close: (a: number, b: number, c: number) => [number, number]
export const encode_websocket_ping: (a: number, b: number) => [number, number]
export const encode_websocket_pong: (a: number, b: number) => [number, number]
export const encode_websocket_text: (a: number, b: number, c: number) => [number, number]
export const format_traceparent: (
	a: number,
	b: number,
	c: number,
	d: number,
	e: number
) => [number, number]
export const generate_span_id: () => [number, number]
export const generate_trace_id: () => [number, number]
export const generate_websocket_accept: (a: number, b: number) => [number, number]
export const generate_websocket_mask: () => [number, number]
export const method_to_string: (a: number) => [number, number]
export const parse_http: (a: number, b: number) => number
export const parse_traceparent: (a: number, b: number) => number
export const parse_websocket_frame: (a: number, b: number) => number
export const parseresult_header_offsets: (a: number) => [number, number]
export const routematch_params: (a: number) => [number, number]
export const seed_rng: (a: bigint) => void
export const validate_number: (
	a: number,
	b: number,
	c: number,
	d: number,
	e: number,
	f: number
) => number
export const validate_string: (
	a: number,
	b: number,
	c: number,
	d: number,
	e: number,
	f: number
) => number
export const wasmrouter_find: (a: number, b: number, c: number, d: number, e: number) => number
export const wasmrouter_insert: (
	a: number,
	b: number,
	c: number,
	d: number,
	e: number,
	f: number
) => void
export const wasmrouter_new: () => number
export const wasmspancontext_span_id: (a: number) => [number, number]
export const wasmspancontext_trace_id: (a: number) => [number, number]
export const wasmvalidationresult_errors: (a: number) => [number, number]
export const wsframeresult_close_reason: (a: number) => [number, number]
export const wsframeresult_payload: (a: number) => [number, number]
export const __wbindgen_externrefs: WebAssembly.Table
export const __externref_drop_slice: (a: number, b: number) => void
export const __wbindgen_free: (a: number, b: number, c: number) => void
export const __wbindgen_malloc: (a: number, b: number) => number
export const __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number
export const __wbindgen_start: () => void
