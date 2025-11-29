/* tslint:disable */
/* eslint-disable */

export class ParseResult {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Get header offsets as a JS-compatible slice
   * Returns only the used portion to minimize data transfer
   */
  readonly header_offsets: Uint32Array;
  /**
   * 0 = incomplete, 1 = complete, 2 = error
   */
  state: number;
  /**
   * Method (0=GET, 1=POST, etc.)
   */
  method: number;
  /**
   * Path start offset in buffer
   */
  path_start: number;
  /**
   * Path end offset in buffer
   */
  path_end: number;
  /**
   * Query start offset (0 if no query)
   */
  query_start: number;
  /**
   * Query end offset (0 if no query)
   */
  query_end: number;
  /**
   * Number of headers parsed
   */
  headers_count: number;
  /**
   * Body start offset
   */
  body_start: number;
}

export class RouteMatch {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly params: string[];
  found: boolean;
  handler_id: number;
}

export class WasmRouter {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  /**
   * Find a route, returns RouteMatch
   */
  find(method: string, path: string): RouteMatch;
  /**
   * Insert a route
   */
  insert(method: string, path: string, handler_id: number): void;
}

/**
 * Get method string from code
 */
export function method_to_string(code: number): string;

/**
 * Parse HTTP request from raw bytes
 * Single-pass parsing with zero intermediate allocations
 */
export function parse_http(buf: Uint8Array): ParseResult;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_get_parseresult_body_start: (a: number) => number;
  readonly __wbg_get_parseresult_headers_count: (a: number) => number;
  readonly __wbg_get_parseresult_method: (a: number) => number;
  readonly __wbg_get_parseresult_path_end: (a: number) => number;
  readonly __wbg_get_parseresult_path_start: (a: number) => number;
  readonly __wbg_get_parseresult_query_end: (a: number) => number;
  readonly __wbg_get_parseresult_query_start: (a: number) => number;
  readonly __wbg_get_parseresult_state: (a: number) => number;
  readonly __wbg_get_routematch_found: (a: number) => number;
  readonly __wbg_get_routematch_handler_id: (a: number) => number;
  readonly __wbg_parseresult_free: (a: number, b: number) => void;
  readonly __wbg_routematch_free: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_body_start: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_headers_count: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_method: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_path_end: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_path_start: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_query_end: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_query_start: (a: number, b: number) => void;
  readonly __wbg_set_parseresult_state: (a: number, b: number) => void;
  readonly __wbg_set_routematch_found: (a: number, b: number) => void;
  readonly __wbg_set_routematch_handler_id: (a: number, b: number) => void;
  readonly __wbg_wasmrouter_free: (a: number, b: number) => void;
  readonly method_to_string: (a: number) => [number, number];
  readonly parse_http: (a: number, b: number) => number;
  readonly parseresult_header_offsets: (a: number) => [number, number];
  readonly routematch_params: (a: number) => [number, number];
  readonly wasmrouter_find: (a: number, b: number, c: number, d: number, e: number) => number;
  readonly wasmrouter_insert: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly wasmrouter_new: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
