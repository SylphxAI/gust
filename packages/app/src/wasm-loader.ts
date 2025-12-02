/**
 * WASM Loader
 *
 * Loads and initializes the gust-wasm module.
 * Used as a fallback when native (napi) is not available.
 * Auto-initializes synchronously on first use.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as WasmTypes from './wasm/gust_wasm'

// WASM module state
let wasmModule: typeof WasmTypes | null = null
let wasmLoadAttempted = false
let wasmLoadError: Error | null = null
let wasmWarningLogged = false

/**
 * Get the directory of this module
 */
const getModuleDir = (): string => {
	try {
		// ESM
		return dirname(fileURLToPath(import.meta.url))
	} catch {
		// CJS fallback
		return __dirname
	}
}

/**
 * Initialize WASM synchronously (for use in sync functions)
 * This is called automatically on first use.
 */
const initWasmSync = (): boolean => {
	if (wasmLoadAttempted) return wasmModule !== null
	wasmLoadAttempted = true

	try {
		// Load WASM module synchronously
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const wasm = require('./wasm/gust_wasm') as typeof WasmTypes & {
			initSync?: (input: { module: ArrayBuffer | ArrayBufferView }) => void
		}

		// Try to initialize synchronously if available
		if (typeof wasm.initSync === 'function') {
			try {
				const wasmPath = join(getModuleDir(), 'wasm', 'gust_wasm_bg.wasm')
				const wasmBytes = readFileSync(wasmPath)
				wasm.initSync({ module: wasmBytes })
			} catch {
				// initSync may already be called or not needed
			}
		}

		// Seed the RNG with current timestamp
		if (wasm.seed_rng) {
			wasm.seed_rng(BigInt(Date.now()))
		}

		wasmModule = wasm
		return true
	} catch (e) {
		wasmLoadError = e as Error
		if (!wasmWarningLogged) {
			wasmWarningLogged = true
			console.warn(
				'[gust] WASM module unavailable, using Node.js crypto fallback. ' +
					'Performance may be reduced. Error:',
				(e as Error).message
			)
		}
		return false
	}
}

/**
 * Initialize the WASM module (async version)
 * For explicit initialization before use.
 */
export const initWasm = async (): Promise<boolean> => {
	if (wasmLoadAttempted) return wasmModule !== null

	// Try sync init first
	if (initWasmSync()) return true

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
		if (!wasmWarningLogged) {
			wasmWarningLogged = true
			console.warn(
				'[gust] WASM module unavailable, using Node.js crypto fallback. ' +
					'Performance may be reduced. Error:',
				(e as Error).message
			)
		}
		return false
	}
}

/**
 * Ensure WASM is initialized (lazy sync init)
 */
const ensureWasm = (): typeof WasmTypes | null => {
	if (!wasmModule && !wasmLoadAttempted) {
		initWasmSync()
	}
	return wasmModule
}

/**
 * Check if WASM is available
 */
export const isWasmAvailable = (): boolean => {
	return ensureWasm() !== null
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
	return ensureWasm()
}

// ============================================================================
// WASM Function Wrappers (auto-initialize on first use)
// ============================================================================

/**
 * Generate WebSocket accept key using WASM
 */
export const wasmGenerateWebSocketAccept = (key: string): string | null => {
	const wasm = ensureWasm()
	if (!wasm?.generate_websocket_accept) return null
	try {
		return wasm.generate_websocket_accept(key)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket text frame using WASM
 */
export const wasmEncodeWebSocketText = (text: string, fin = true): Uint8Array | null => {
	const wasm = ensureWasm()
	if (!wasm?.encode_websocket_text) return null
	try {
		return wasm.encode_websocket_text(text, fin)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket binary frame using WASM
 */
export const wasmEncodeWebSocketBinary = (data: Uint8Array, fin = true): Uint8Array | null => {
	const wasm = ensureWasm()
	if (!wasm?.encode_websocket_binary) return null
	try {
		return wasm.encode_websocket_binary(data, fin)
	} catch {
		return null
	}
}

/**
 * Encode WebSocket ping frame using WASM
 */
export const wasmEncodeWebSocketPing = (data?: Uint8Array): Uint8Array | null => {
	const wasm = ensureWasm()
	if (!wasm?.encode_websocket_ping) return null
	try {
		return wasm.encode_websocket_ping(data ?? new Uint8Array(0))
	} catch {
		return null
	}
}

/**
 * Encode WebSocket pong frame using WASM
 */
export const wasmEncodeWebSocketPong = (data?: Uint8Array): Uint8Array | null => {
	const wasm = ensureWasm()
	if (!wasm?.encode_websocket_pong) return null
	try {
		return wasm.encode_websocket_pong(data ?? new Uint8Array(0))
	} catch {
		return null
	}
}

/**
 * Encode WebSocket close frame using WASM
 */
export const wasmEncodeWebSocketClose = (code?: number, reason?: string): Uint8Array | null => {
	const wasm = ensureWasm()
	if (!wasm?.encode_websocket_close) return null
	try {
		return wasm.encode_websocket_close(code, reason)
	} catch {
		return null
	}
}

/**
 * Parse WebSocket frame using WASM
 */
export const wasmParseWebSocketFrame = (data: Uint8Array): WasmTypes.WsFrameResult | null => {
	const wasm = ensureWasm()
	if (!wasm?.parse_websocket_frame) return null
	try {
		return wasm.parse_websocket_frame(data)
	} catch {
		return null
	}
}

/**
 * Generate trace ID using WASM
 */
export const wasmGenerateTraceId = (): string | null => {
	const wasm = ensureWasm()
	if (!wasm?.generate_trace_id) return null
	try {
		return wasm.generate_trace_id()
	} catch {
		return null
	}
}

/**
 * Generate span ID using WASM
 */
export const wasmGenerateSpanId = (): string | null => {
	const wasm = ensureWasm()
	if (!wasm?.generate_span_id) return null
	try {
		return wasm.generate_span_id()
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
	const wasm = ensureWasm()
	if (!wasm?.parse_traceparent) return null
	try {
		const result = wasm.parse_traceparent(header)
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
	const wasm = ensureWasm()
	if (!wasm?.format_traceparent) return null
	try {
		return wasm.format_traceparent(traceId, spanId, traceFlags)
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
	const wasm = ensureWasm()
	if (!wasm?.validate_string) return null
	try {
		const result = wasm.validate_string(value, minLength, maxLength, format)
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
	const wasm = ensureWasm()
	if (!wasm?.validate_number) return null
	try {
		const result = wasm.validate_number(value, min, max, isInteger)
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
	const wasm = ensureWasm()
	if (!wasm?.parse_http) return null
	try {
		return wasm.parse_http(data)
	} catch {
		return null
	}
}

/**
 * Create WASM router
 */
export const wasmCreateRouter = (): WasmTypes.WasmRouter | null => {
	const wasm = ensureWasm()
	if (!wasm?.WasmRouter) return null
	try {
		return new wasm.WasmRouter()
	} catch {
		return null
	}
}
