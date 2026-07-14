/**
 * Native Resilience Primitives
 *
 * Constructors for the native circuit breaker and bulkhead (concurrency
 * limiter), each returning null when the native binding is unavailable.
 */

import { loadNative } from './loader'
import type {
	NativeBulkhead,
	NativeBulkheadConfig,
	NativeCircuitBreaker,
	NativeCircuitBreakerConfig,
} from './types'

// ============================================================================
// Native Circuit Breaker
// ============================================================================

/**
 * Create a native circuit breaker
 *
 * @example
 * ```ts
 * const breaker = createNativeCircuitBreaker({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   resetTimeoutMs: 30000,
 *   failureWindowMs: 60000,
 *   timeoutMs: 10000,
 *   name: 'api'
 * })
 * if (breaker?.canRequest()) {
 *   try {
 *     await fetch(...)
 *     breaker.recordSuccess()
 *   } catch {
 *     breaker.recordFailure()
 *   }
 * }
 * ```
 */
export const createNativeCircuitBreaker = (
	config: NativeCircuitBreakerConfig
): NativeCircuitBreaker | null => {
	const binding = loadNative()
	if (!binding?.CircuitBreaker) return null
	try {
		return new binding.CircuitBreaker(config)
	} catch {
		return null
	}
}

/**
 * Create a native bulkhead (concurrency limiter)
 */
export const createNativeBulkhead = (config: NativeBulkheadConfig): NativeBulkhead | null => {
	const binding = loadNative()
	if (!binding?.Bulkhead) return null
	try {
		return new binding.Bulkhead(config)
	} catch {
		return null
	}
}
