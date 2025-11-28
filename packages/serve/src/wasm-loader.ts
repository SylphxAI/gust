/**
 * WASM Loader
 *
 * Loads and initializes the gust-wasm module.
 * Used as a fallback when native (napi) is not available.
 */

import type * as WasmTypes from './wasm/gust_wasm'

// WASM module state
let wasmModule: typeof WasmTypes | null = null
let wasmLoadAttempted = false
let wasmLoadError: Error | null = null

/**
 * Initialize the WASM module
 * Must be called before using any WASM functions
 */
export const initWasm = async (): Promise<boolean> => {
	if (wasmLoadAttempted) return wasmModule !== null
	wasmLoadAttempted = true

	try {
		// Dynamic import of WASM module
		const wasm = await import('./wasm/gust_wasm')

		// Initialize WASM (for web target, we need to call init)
		if (typeof wasm.default === 'function') {
			await wasm.default()
		}

		// Seed the RNG with current timestamp
		if (wasm.seed_rng) {
			wasm.seed_rng(BigInt(Date.now()))
		}

		wasmModule = wasm
		return true
	} catch (e) {
		wasmLoadError = e as Error
		return false
	}
}

/**
 * Check if WASM is available
 */
export const isWasmAvailable = (): boolean => {
	return wasmModule !== null
}

/**
 * Get WASM load error (for debugging)
 */
export const getWasmLoadError = (): Error | null => {
	return wasmLoadError
}

/**
 * Get the loaded WASM module
 */
export const getWasmModule = (): typeof WasmTypes | null => {
	return wasmModule
}

// ============================================================================
// WASM Function Wrappers
// ============================================================================

/**
 * Generate WebSocket accept key using WASM
 */
export const wasmGenerateWebSocketAccept = (key: string): string | null => {
	if (!wasmModule?.generate_websocket_accept) return null
	try {
		return wasmModule.generate_websocket_accept(key)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket text frame using WASM
 */
export const wasmEncodeWebSocketText = (text: string, fin = true): Uint8Array | null => {
	if (!wasmModule?.encode_websocket_text) return null
	try {
		return wasmModule.encode_websocket_text(text, fin)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket binary frame using WASM
 */
export const wasmEncodeWebSocketBinary = (data: Uint8Array, fin = true): Uint8Array | null => {
	if (!wasmModule?.encode_websocket_binary) return null
	try {
		return wasmModule.encode_websocket_binary(data, fin)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket ping frame using WASM
 */
export const wasmEncodeWebSocketPing = (data?: Uint8Array): Uint8Array | null => {
	if (!wasmModule?.encode_websocket_ping) return null
	try {
		return wasmModule.encode_websocket_ping(data ?? new Uint8Array(0))
	} catch {
		return null
	}
}

/**
 * Encode WebSocket pong frame using WASM
 */
export const wasmEncodeWebSocketPong = (data?: Uint8Array): Uint8Array | null => {
	if (!wasmModule?.encode_websocket_pong) return null
	try {
		return wasmModule.encode_websocket_pong(data ?? new Uint8Array(0))
	} catch {
		return null
	}
}

/**
 * Encode WebSocket close frame using WASM
 */
export const wasmEncodeWebSocketClose = (code?: number, reason?: string): Uint8Array | null => {
	if (!wasmModule?.encode_websocket_close) return null
	try {
		return wasmModule.encode_websocket_close(code, reason)
	} catch {
		return null
	}
}

/**
 * Parse WebSocket frame using WASM
 */
export const wasmParseWebSocketFrame = (data: Uint8Array): WasmTypes.WsFrameResult | null => {
	if (!wasmModule?.parse_websocket_frame) return null
	try {
		return wasmModule.parse_websocket_frame(data)
	} catch {
		return null
	}
}

/**
 * Generate trace ID using WASM
 */
export const wasmGenerateTraceId = (): string | null => {
	if (!wasmModule?.generate_trace_id) return null
	try {
		return wasmModule.generate_trace_id()
	} catch {
		return null
	}
}

/**
 * Generate span ID using WASM
 */
export const wasmGenerateSpanId = (): string | null => {
	if (!wasmModule?.generate_span_id) return null
	try {
		return wasmModule.generate_span_id()
	} catch {
		return null
	}
}

/**
 * Parse traceparent header using WASM
 */
export const wasmParseTraceparent = (
	header: string
): { traceId: string; spanId: string; traceFlags: number } | null => {
	if (!wasmModule?.parse_traceparent) return null
	try {
		const result = wasmModule.parse_traceparent(header)
		if (!result) return null
		return {
			traceId: result.trace_id,
			spanId: result.span_id,
			traceFlags: result.trace_flags,
		}
	} catch {
		return null
	}
}

/**
 * Format traceparent header using WASM
 */
export const wasmFormatTraceparent = (
	traceId: string,
	spanId: string,
	traceFlags: number
): string | null => {
	if (!wasmModule?.format_traceparent) return null
	try {
		return wasmModule.format_traceparent(traceId, spanId, traceFlags)
	} catch {
		return null
	}
}

/**
 * Validate string using WASM
 */
export const wasmValidateString = (
	value: string,
	minLength?: number,
	maxLength?: number,
	format?: string
): { valid: boolean; errors: string[] } | null => {
	if (!wasmModule?.validate_string) return null
	try {
		const result = wasmModule.validate_string(value, minLength, maxLength, format)
		return {
			valid: result.valid,
			errors: Array.from(result.errors),
		}
	} catch {
		return null
	}
}

/**
 * Validate number using WASM
 */
export const wasmValidateNumber = (
	value: number,
	min?: number,
	max?: number,
	isInteger = false
): { valid: boolean; errors: string[] } | null => {
	if (!wasmModule?.validate_number) return null
	try {
		const result = wasmModule.validate_number(value, min, max, isInteger)
		return {
			valid: result.valid,
			errors: Array.from(result.errors),
		}
	} catch {
		return null
	}
}

/**
 * Parse HTTP request using WASM
 */
export const wasmParseHttp = (data: Uint8Array): WasmTypes.ParseResult | null => {
	if (!wasmModule?.parse_http) return null
	try {
		return wasmModule.parse_http(data)
	} catch {
		return null
	}
}

/**
 * Create WASM router
 */
export const wasmCreateRouter = (): WasmTypes.WasmRouter | null => {
	if (!wasmModule?.WasmRouter) return null
	try {
		return new wasmModule.WasmRouter()
	} catch {
		return null
	}
}
