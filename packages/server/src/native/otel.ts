/**
 * Native OpenTelemetry
 *
 * Trace/span ID generation, W3C traceparent parsing/formatting, and tracer /
 * metrics collector construction. Falls back to WASM where supported.
 */

import {
	wasmFormatTraceparent,
	wasmGenerateSpanId,
	wasmGenerateTraceId,
	wasmParseTraceparent,
} from '@sylphx/gust-app'
import { loadNative } from './loader'
import type { NativeMetricsCollector, NativeSpanContext, NativeTracer } from './types'

// ============================================================================
// Native OpenTelemetry
// ============================================================================

/**
 * Generate a trace ID (32 hex chars) using native Rust implementation
 * Falls back to WASM if native is not available.
 */
export const nativeGenerateTraceId = (): string | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.generateTraceId) {
		try {
			return binding.generateTraceId()
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	return wasmGenerateTraceId()
}

/**
 * Generate a span ID (16 hex chars) using native Rust implementation
 * Falls back to WASM if native is not available.
 */
export const nativeGenerateSpanId = (): string | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.generateSpanId) {
		try {
			return binding.generateSpanId()
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	return wasmGenerateSpanId()
}

/**
 * Parse W3C traceparent header
 * Falls back to WASM if native is not available.
 */
export const nativeParseTraceparent = (header: string): NativeSpanContext | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.parseTraceparent) {
		try {
			return binding.parseTraceparent(header)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	return wasmParseTraceparent(header)
}

/**
 * Format W3C traceparent header
 * Falls back to WASM if native is not available.
 */
export const nativeFormatTraceparent = (
	traceId: string,
	spanId: string,
	traceFlags: number
): string | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.formatTraceparent) {
		try {
			return binding.formatTraceparent(traceId, spanId, traceFlags)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	return wasmFormatTraceparent(traceId, spanId, traceFlags)
}

/**
 * Create a native tracer
 *
 * @example
 * ```ts
 * const tracer = createNativeTracer('my-service')
 * const span = tracer?.startSpan('handle-request')
 * span?.setAttribute('http.method', 'GET')
 * // ... do work ...
 * span?.endWithStatus('Ok')
 * ```
 */
export const createNativeTracer = (
	serviceName: string,
	sampleRate?: number
): NativeTracer | null => {
	const binding = loadNative()
	if (!binding?.Tracer) return null
	try {
		return new binding.Tracer(serviceName, sampleRate)
	} catch {
		return null
	}
}

/**
 * Create a native metrics collector
 *
 * @example
 * ```ts
 * const metrics = createNativeMetricsCollector()
 * metrics?.counterInc('http_requests_total')
 * metrics?.histogramRecord('request_duration_ms', 125)
 * console.log(metrics?.toPrometheus())
 * ```
 */
export const createNativeMetricsCollector = (): NativeMetricsCollector | null => {
	const binding = loadNative()
	if (!binding?.MetricsCollector) return null
	try {
		return new binding.MetricsCollector()
	} catch {
		return null
	}
}
