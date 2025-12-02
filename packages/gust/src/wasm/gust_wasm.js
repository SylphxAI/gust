let wasm;

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    }
}

let WASM_VECTOR_LEN = 0;

const ParseResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_parseresult_free(ptr >>> 0, 1));

const RouteMatchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_routematch_free(ptr >>> 0, 1));

const WasmRouterFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmrouter_free(ptr >>> 0, 1));

const WasmSpanContextFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmspancontext_free(ptr >>> 0, 1));

const WasmValidationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmvalidationresult_free(ptr >>> 0, 1));

const WsFrameResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wsframeresult_free(ptr >>> 0, 1));

/**
 * WASM-exposed HTTP parser result
 * Uses fixed-size array to avoid Vec allocation
 */
export class ParseResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ParseResult.prototype);
        obj.__wbg_ptr = ptr;
        ParseResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ParseResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_parseresult_free(ptr, 0);
    }
    /**
     * Get header offsets as a JS-compatible slice
     * Returns only the used portion to minimize data transfer
     * @returns {Uint32Array}
     */
    get header_offsets() {
        const ret = wasm.parseresult_header_offsets(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * 0 = incomplete, 1 = complete, 2 = error
     * @returns {number}
     */
    get state() {
        const ret = wasm.__wbg_get_parseresult_state(this.__wbg_ptr);
        return ret;
    }
    /**
     * 0 = incomplete, 1 = complete, 2 = error
     * @param {number} arg0
     */
    set state(arg0) {
        wasm.__wbg_set_parseresult_state(this.__wbg_ptr, arg0);
    }
    /**
     * Method (0=GET, 1=POST, etc.)
     * @returns {number}
     */
    get method() {
        const ret = wasm.__wbg_get_parseresult_method(this.__wbg_ptr);
        return ret;
    }
    /**
     * Method (0=GET, 1=POST, etc.)
     * @param {number} arg0
     */
    set method(arg0) {
        wasm.__wbg_set_parseresult_method(this.__wbg_ptr, arg0);
    }
    /**
     * Path start offset in buffer
     * @returns {number}
     */
    get path_start() {
        const ret = wasm.__wbg_get_parseresult_path_start(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Path start offset in buffer
     * @param {number} arg0
     */
    set path_start(arg0) {
        wasm.__wbg_set_parseresult_path_start(this.__wbg_ptr, arg0);
    }
    /**
     * Path end offset in buffer
     * @returns {number}
     */
    get path_end() {
        const ret = wasm.__wbg_get_parseresult_path_end(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Path end offset in buffer
     * @param {number} arg0
     */
    set path_end(arg0) {
        wasm.__wbg_set_parseresult_path_end(this.__wbg_ptr, arg0);
    }
    /**
     * Query start offset (0 if no query)
     * @returns {number}
     */
    get query_start() {
        const ret = wasm.__wbg_get_parseresult_query_start(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Query start offset (0 if no query)
     * @param {number} arg0
     */
    set query_start(arg0) {
        wasm.__wbg_set_parseresult_query_start(this.__wbg_ptr, arg0);
    }
    /**
     * Query end offset (0 if no query)
     * @returns {number}
     */
    get query_end() {
        const ret = wasm.__wbg_get_parseresult_query_end(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Query end offset (0 if no query)
     * @param {number} arg0
     */
    set query_end(arg0) {
        wasm.__wbg_set_parseresult_query_end(this.__wbg_ptr, arg0);
    }
    /**
     * Number of headers parsed
     * @returns {number}
     */
    get headers_count() {
        const ret = wasm.__wbg_get_parseresult_headers_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Number of headers parsed
     * @param {number} arg0
     */
    set headers_count(arg0) {
        wasm.__wbg_set_parseresult_headers_count(this.__wbg_ptr, arg0);
    }
    /**
     * Body start offset
     * @returns {number}
     */
    get body_start() {
        const ret = wasm.__wbg_get_parseresult_body_start(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Body start offset
     * @param {number} arg0
     */
    set body_start(arg0) {
        wasm.__wbg_set_parseresult_body_start(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) ParseResult.prototype[Symbol.dispose] = ParseResult.prototype.free;

/**
 * Route match result for WASM
 */
export class RouteMatch {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(RouteMatch.prototype);
        obj.__wbg_ptr = ptr;
        RouteMatchFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RouteMatchFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_routematch_free(ptr, 0);
    }
    /**
     * @returns {string[]}
     */
    get params() {
        const ret = wasm.routematch_params(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * @returns {boolean}
     */
    get found() {
        const ret = wasm.__wbg_get_routematch_found(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set found(arg0) {
        wasm.__wbg_set_routematch_found(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {number}
     */
    get handler_id() {
        const ret = wasm.__wbg_get_routematch_handler_id(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set handler_id(arg0) {
        wasm.__wbg_set_routematch_handler_id(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) RouteMatch.prototype[Symbol.dispose] = RouteMatch.prototype.free;

/**
 * WASM-exposed Router
 */
export class WasmRouter {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmRouterFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmrouter_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmrouter_new();
        this.__wbg_ptr = ret >>> 0;
        WasmRouterFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Find a route, returns RouteMatch
     * @param {string} method
     * @param {string} path
     * @returns {RouteMatch}
     */
    find(method, path) {
        const ptr0 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmrouter_find(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return RouteMatch.__wrap(ret);
    }
    /**
     * Insert a route
     * @param {string} method
     * @param {string} path
     * @param {number} handler_id
     */
    insert(method, path, handler_id) {
        const ptr0 = passStringToWasm0(method, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        wasm.wasmrouter_insert(this.__wbg_ptr, ptr0, len0, ptr1, len1, handler_id);
    }
}
if (Symbol.dispose) WasmRouter.prototype[Symbol.dispose] = WasmRouter.prototype.free;

/**
 * Span context for WASM
 */
export class WasmSpanContext {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmSpanContext.prototype);
        obj.__wbg_ptr = ptr;
        WasmSpanContextFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSpanContextFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmspancontext_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get span_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmspancontext_span_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get trace_id() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmspancontext_trace_id(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get trace_flags() {
        const ret = wasm.__wbg_get_wasmspancontext_trace_flags(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set trace_flags(arg0) {
        wasm.__wbg_set_wasmspancontext_trace_flags(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) WasmSpanContext.prototype[Symbol.dispose] = WasmSpanContext.prototype.free;

/**
 * Validation result for WASM
 */
export class WasmValidationResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmValidationResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmValidationResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmValidationResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmvalidationresult_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get valid() {
        const ret = wasm.__wbg_get_wasmvalidationresult_valid(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @param {boolean} arg0
     */
    set valid(arg0) {
        wasm.__wbg_set_wasmvalidationresult_valid(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string[]}
     */
    get errors() {
        const ret = wasm.wasmvalidationresult_errors(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) WasmValidationResult.prototype[Symbol.dispose] = WasmValidationResult.prototype.free;

/**
 * WebSocket frame parse result
 */
export class WsFrameResult {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WsFrameResult.prototype);
        obj.__wbg_ptr = ptr;
        WsFrameResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WsFrameResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wsframeresult_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get close_reason() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wsframeresult_close_reason(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get payload() {
        const ret = wasm.wsframeresult_payload(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Frame parsed successfully
     * @returns {boolean}
     */
    get complete() {
        const ret = wasm.__wbg_get_wsframeresult_complete(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Frame parsed successfully
     * @param {boolean} arg0
     */
    set complete(arg0) {
        wasm.__wbg_set_wsframeresult_complete(this.__wbg_ptr, arg0);
    }
    /**
     * Needs more data
     * @returns {boolean}
     */
    get incomplete() {
        const ret = wasm.__wbg_get_wsframeresult_incomplete(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Needs more data
     * @param {boolean} arg0
     */
    set incomplete(arg0) {
        wasm.__wbg_set_wsframeresult_incomplete(this.__wbg_ptr, arg0);
    }
    /**
     * Parse error occurred
     * @returns {boolean}
     */
    get error() {
        const ret = wasm.__wbg_get_wsframeresult_error(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Parse error occurred
     * @param {boolean} arg0
     */
    set error(arg0) {
        wasm.__wbg_set_wsframeresult_error(this.__wbg_ptr, arg0);
    }
    /**
     * FIN flag
     * @returns {boolean}
     */
    get fin() {
        const ret = wasm.__wbg_get_wsframeresult_fin(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * FIN flag
     * @param {boolean} arg0
     */
    set fin(arg0) {
        wasm.__wbg_set_wsframeresult_fin(this.__wbg_ptr, arg0);
    }
    /**
     * Opcode (0=continuation, 1=text, 2=binary, 8=close, 9=ping, 10=pong)
     * @returns {number}
     */
    get opcode() {
        const ret = wasm.__wbg_get_wsframeresult_opcode(this.__wbg_ptr);
        return ret;
    }
    /**
     * Opcode (0=continuation, 1=text, 2=binary, 8=close, 9=ping, 10=pong)
     * @param {number} arg0
     */
    set opcode(arg0) {
        wasm.__wbg_set_wsframeresult_opcode(this.__wbg_ptr, arg0);
    }
    /**
     * Bytes consumed from input
     * @returns {number}
     */
    get bytes_consumed() {
        const ret = wasm.__wbg_get_wsframeresult_bytes_consumed(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Bytes consumed from input
     * @param {number} arg0
     */
    set bytes_consumed(arg0) {
        wasm.__wbg_set_wsframeresult_bytes_consumed(this.__wbg_ptr, arg0);
    }
    /**
     * Close code (for close frames)
     * @returns {number}
     */
    get close_code() {
        const ret = wasm.__wbg_get_wsframeresult_close_code(this.__wbg_ptr);
        return ret;
    }
    /**
     * Close code (for close frames)
     * @param {number} arg0
     */
    set close_code(arg0) {
        wasm.__wbg_set_wsframeresult_close_code(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) WsFrameResult.prototype[Symbol.dispose] = WsFrameResult.prototype.free;

/**
 * Encode a WebSocket binary frame
 * @param {Uint8Array} data
 * @param {boolean} fin
 * @returns {Uint8Array}
 */
export function encode_websocket_binary(data, fin) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_websocket_binary(ptr0, len0, fin);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Encode a WebSocket close frame
 * @param {number | null} [code]
 * @param {string | null} [reason]
 * @returns {Uint8Array}
 */
export function encode_websocket_close(code, reason) {
    var ptr0 = isLikeNone(reason) ? 0 : passStringToWasm0(reason, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_websocket_close(isLikeNone(code) ? 0xFFFFFF : code, ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Encode a WebSocket ping frame
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function encode_websocket_ping(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_websocket_ping(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Encode a WebSocket pong frame
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function encode_websocket_pong(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_websocket_pong(ptr0, len0);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Encode a WebSocket text frame
 * @param {string} text
 * @param {boolean} fin
 * @returns {Uint8Array}
 */
export function encode_websocket_text(text, fin) {
    const ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.encode_websocket_text(ptr0, len0, fin);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Format W3C traceparent header
 * @param {string} trace_id
 * @param {string} span_id
 * @param {number} trace_flags
 * @returns {string}
 */
export function format_traceparent(trace_id, span_id, trace_flags) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(trace_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(span_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.format_traceparent(ptr0, len0, ptr1, len1, trace_flags);
        deferred3_0 = ret[0];
        deferred3_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Generate a span ID (16 hex chars)
 * @returns {string}
 */
export function generate_span_id() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.generate_span_id();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Generate a trace ID (32 hex chars)
 * @returns {string}
 */
export function generate_trace_id() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.generate_trace_id();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Generate WebSocket accept key
 * @param {string} key
 * @returns {string}
 */
export function generate_websocket_accept(key) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ptr0 = passStringToWasm0(key, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.generate_websocket_accept(ptr0, len0);
        deferred2_0 = ret[0];
        deferred2_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Generate a random WebSocket mask (4 bytes)
 * @returns {Uint8Array}
 */
export function generate_websocket_mask() {
    const ret = wasm.generate_websocket_mask();
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Get method string from code
 * @param {number} code
 * @returns {string}
 */
export function method_to_string(code) {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.method_to_string(code);
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Parse HTTP request from raw bytes
 * Single-pass parsing with zero intermediate allocations
 * @param {Uint8Array} buf
 * @returns {ParseResult}
 */
export function parse_http(buf) {
    const ptr0 = passArray8ToWasm0(buf, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parse_http(ptr0, len0);
    return ParseResult.__wrap(ret);
}

/**
 * Parse W3C traceparent header
 * @param {string} header
 * @returns {WasmSpanContext | undefined}
 */
export function parse_traceparent(header) {
    const ptr0 = passStringToWasm0(header, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parse_traceparent(ptr0, len0);
    return ret === 0 ? undefined : WasmSpanContext.__wrap(ret);
}

/**
 * Parse a WebSocket frame
 * @param {Uint8Array} data
 * @returns {WsFrameResult}
 */
export function parse_websocket_frame(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.parse_websocket_frame(ptr0, len0);
    return WsFrameResult.__wrap(ret);
}

/**
 * Seed the random number generator
 * @param {bigint} seed
 */
export function seed_rng(seed) {
    wasm.seed_rng(seed);
}

/**
 * Validate a number value
 * @param {number} value
 * @param {number | null | undefined} min
 * @param {number | null | undefined} max
 * @param {boolean} is_integer
 * @returns {WasmValidationResult}
 */
export function validate_number(value, min, max, is_integer) {
    const ret = wasm.validate_number(value, !isLikeNone(min), isLikeNone(min) ? 0 : min, !isLikeNone(max), isLikeNone(max) ? 0 : max, is_integer);
    return WasmValidationResult.__wrap(ret);
}

/**
 * Validate a string value
 * @param {string} value
 * @param {number | null} [min_length]
 * @param {number | null} [max_length]
 * @param {string | null} [format]
 * @returns {WasmValidationResult}
 */
export function validate_string(value, min_length, max_length, format) {
    const ptr0 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(format) ? 0 : passStringToWasm0(format, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.validate_string(ptr0, len0, isLikeNone(min_length) ? 0x100000001 : (min_length) >>> 0, isLikeNone(max_length) ? 0x100000001 : (max_length) >>> 0, ptr1, len1);
    return WasmValidationResult.__wrap(ret);
}

const EXPECTED_RESPONSE_TYPES = new Set(['basic', 'cors', 'default']);

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && EXPECTED_RESPONSE_TYPES.has(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };
    imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        // Cast intrinsic for `Ref(String) -> Externref`.
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_externrefs;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('gust_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
