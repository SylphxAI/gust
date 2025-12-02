/**
 * Circuit Breaker
 * Fault tolerance pattern for handling failures gracefully
 *
 * Architecture:
 * - Uses native Rust implementation when available (via gust-napi)
 * - Falls back to pure TypeScript for edge/serverless environments
 */

import { EventEmitter } from 'node:events'
import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { response } from '@sylphx/gust-core'
import type { Context } from './context'
import {
	createNativeBulkhead,
	createNativeCircuitBreaker,
	type NativeBulkheadConfig,
	type NativeCircuitBreaker,
	type NativeCircuitBreakerConfig,
} from './native'

// ============================================================================
// Types
// ============================================================================

export type CircuitState = 'closed' | 'open' | 'half-open'

export type CircuitBreakerOptions = {
	/** Failure threshold to open circuit (default: 5) */
	readonly failureThreshold?: number
	/** Success threshold to close circuit (default: 2) */
	readonly successThreshold?: number
	/** Time in ms before trying again (default: 30s) */
	readonly resetTimeout?: number
	/** Time window for counting failures (default: 60s) */
	readonly failureWindow?: number
	/** Timeout for each request (default: 10s) */
	readonly timeout?: number
	/** Custom fallback response */
	readonly fallback?: (ctx: Context, error: Error) => ServerResponse | Promise<ServerResponse>
	/** Consider response a failure */
	readonly isFailure?: (res: ServerResponse) => boolean
	/** Name for this circuit (for monitoring) */
	readonly name?: string
	/** On state change callback */
	readonly onStateChange?: (state: CircuitState, name: string) => void
}

export type CircuitStats = {
	state: CircuitState
	failures: number
	successes: number
	lastFailure: number | null
	lastSuccess: number | null
	totalRequests: number
	totalFailures: number
	totalSuccesses: number
}

// ============================================================================
// Circuit Breaker Implementation
// ============================================================================

/**
 * Circuit Breaker
 *
 * Uses native Rust implementation when available for maximum performance.
 * Falls back to pure TypeScript for edge/serverless environments.
 */
export class CircuitBreaker extends EventEmitter {
	// Native implementation (when available)
	private native: NativeCircuitBreaker | null = null

	// Fallback TypeScript state
	private state: CircuitState = 'closed'
	private failures: number[] = [] // Timestamps of failures
	private successes = 0
	private lastFailure: number | null = null
	private lastSuccess: number | null = null
	private totalRequests = 0
	private totalFailures = 0
	private totalSuccesses = 0
	private nextAttempt = 0

	private readonly failureThreshold: number
	private readonly successThreshold: number
	private readonly resetTimeout: number
	private readonly failureWindow: number
	private readonly timeout: number
	private readonly name: string

	constructor(options: CircuitBreakerOptions = {}) {
		super()
		this.failureThreshold = options.failureThreshold ?? 5
		this.successThreshold = options.successThreshold ?? 2
		this.resetTimeout = options.resetTimeout ?? 30000
		this.failureWindow = options.failureWindow ?? 60000
		this.timeout = options.timeout ?? 10000
		this.name = options.name ?? 'default'

		// Try to use native implementation
		const nativeConfig: NativeCircuitBreakerConfig = {
			failureThreshold: this.failureThreshold,
			successThreshold: this.successThreshold,
			resetTimeoutMs: this.resetTimeout,
			failureWindowMs: this.failureWindow,
			timeoutMs: this.timeout,
			name: this.name,
		}
		this.native = createNativeCircuitBreaker(nativeConfig)
	}

	/** Check if using native implementation */
	get isNative(): boolean {
		return this.native !== null
	}

	/**
	 * Get current state
	 */
	getState(): CircuitState {
		if (this.native) {
			return this.native.state() as CircuitState
		}
		return this.state
	}

	/**
	 * Get statistics
	 */
	getStats(): CircuitStats {
		if (this.native) {
			const stats = this.native.stats()
			return {
				state: stats.state as CircuitState,
				failures: stats.failures,
				successes: stats.successes,
				lastFailure: this.lastFailure,
				lastSuccess: this.lastSuccess,
				totalRequests: stats.totalRequests,
				totalFailures: stats.totalFailures,
				totalSuccesses: stats.totalSuccesses,
			}
		}
		return {
			state: this.state,
			failures: this.failures.length,
			successes: this.successes,
			lastFailure: this.lastFailure,
			lastSuccess: this.lastSuccess,
			totalRequests: this.totalRequests,
			totalFailures: this.totalFailures,
			totalSuccesses: this.totalSuccesses,
		}
	}

	/**
	 * Check if request can proceed
	 */
	canRequest(): boolean {
		if (this.native) {
			return this.native.canRequest()
		}

		if (this.state === 'closed') return true
		if (this.state === 'open') {
			// Check if we can try again
			if (Date.now() >= this.nextAttempt) {
				this.toHalfOpen()
				return true
			}
			return false
		}
		// Half-open: allow one request
		return true
	}

	/**
	 * Record success
	 */
	recordSuccess(): void {
		if (this.native) {
			this.native.recordSuccess()
			this.lastSuccess = Date.now()
			return
		}

		this.totalRequests++
		this.totalSuccesses++
		this.lastSuccess = Date.now()

		if (this.state === 'half-open') {
			this.successes++
			if (this.successes >= this.successThreshold) {
				this.toClosed()
			}
		}
	}

	/**
	 * Record failure
	 */
	recordFailure(): void {
		if (this.native) {
			this.native.recordFailure()
			this.lastFailure = Date.now()
			return
		}

		this.totalRequests++
		this.totalFailures++
		this.lastFailure = Date.now()

		if (this.state === 'half-open') {
			this.toOpen()
			return
		}

		if (this.state === 'closed') {
			// Add failure timestamp
			this.failures.push(Date.now())

			// Remove old failures outside window
			const windowStart = Date.now() - this.failureWindow
			this.failures = this.failures.filter((t) => t > windowStart)

			if (this.failures.length >= this.failureThreshold) {
				this.toOpen()
			}
		}
	}

	/**
	 * Force open the circuit
	 */
	open(): void {
		this.toOpen()
	}

	/**
	 * Force close the circuit
	 */
	close(): void {
		this.toClosed()
	}

	/**
	 * Reset the circuit
	 */
	reset(): void {
		if (this.native) {
			this.native.reset()
			this.emit('reset', this.name)
			return
		}

		this.state = 'closed'
		this.failures = []
		this.successes = 0
		this.nextAttempt = 0
		this.emit('reset', this.name)
	}

	private toOpen(): void {
		if (this.state !== 'open') {
			this.state = 'open'
			this.nextAttempt = Date.now() + this.resetTimeout
			this.successes = 0
			this.emit('open', this.name)
		}
	}

	private toHalfOpen(): void {
		if (this.state !== 'half-open') {
			this.state = 'half-open'
			this.successes = 0
			this.emit('half-open', this.name)
		}
	}

	private toClosed(): void {
		if (this.state !== 'closed') {
			this.state = 'closed'
			this.failures = []
			this.successes = 0
			this.emit('close', this.name)
		}
	}
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Circuit breaker middleware
 */
export const circuitBreaker = (options: CircuitBreakerOptions = {}): Wrapper<Context> => {
	const {
		timeout = 10000,
		fallback,
		isFailure = (res) => res.status >= 500,
		onStateChange,
	} = options

	const breaker = new CircuitBreaker(options)

	// Set up state change listener
	if (onStateChange) {
		breaker.on('open', (name) => onStateChange('open', name))
		breaker.on('half-open', (name) => onStateChange('half-open', name))
		breaker.on('close', (name) => onStateChange('closed', name))
	}

	const defaultFallback = (): ServerResponse =>
		response(
			JSON.stringify({
				error: 'Service Unavailable',
				message: 'Circuit breaker is open',
			}),
			{
				status: 503,
				headers: {
					'content-type': 'application/json',
					'retry-after': String(Math.ceil((options.resetTimeout ?? 30000) / 1000)),
				},
			}
		)

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Check if circuit allows request
			if (!breaker.canRequest()) {
				if (fallback) {
					return fallback(ctx, new Error('Circuit breaker is open'))
				}
				return defaultFallback()
			}

			try {
				// Execute with timeout
				const result = await Promise.race([
					handler(ctx),
					new Promise<ServerResponse>((_, reject) =>
						setTimeout(() => reject(new Error('Request timeout')), timeout)
					),
				])

				// Check if response indicates failure
				if (isFailure(result)) {
					breaker.recordFailure()
				} else {
					breaker.recordSuccess()
				}

				return result
			} catch (error) {
				breaker.recordFailure()

				if (fallback) {
					return fallback(ctx, error as Error)
				}

				return response(
					JSON.stringify({
						error: 'Service Unavailable',
						message: (error as Error).message,
					}),
					{
						status: 503,
						headers: { 'content-type': 'application/json' },
					}
				)
			}
		}
	}
}

/**
 * Get circuit breaker for named service
 */
const breakers = new Map<string, CircuitBreaker>()

export const getCircuitBreaker = (
	name: string,
	options?: CircuitBreakerOptions
): CircuitBreaker => {
	let breaker = breakers.get(name)
	if (!breaker) {
		breaker = new CircuitBreaker({ ...options, name })
		breakers.set(name, breaker)
	}
	return breaker
}

/**
 * Wrap async function with circuit breaker
 */
export const withCircuitBreaker = <T extends (...args: unknown[]) => Promise<unknown>>(
	fn: T,
	options: CircuitBreakerOptions = {}
): T => {
	const breaker = new CircuitBreaker(options)

	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		if (!breaker.canRequest()) {
			throw new Error('Circuit breaker is open')
		}

		try {
			const result = await fn(...args)
			breaker.recordSuccess()
			return result as ReturnType<T>
		} catch (error) {
			breaker.recordFailure()
			throw error
		}
	}) as T
}

// ============================================================================
// Bulkhead (Concurrency Limiter)
// ============================================================================

export type BulkheadOptions = {
	/** Max concurrent requests (default: 10) */
	readonly maxConcurrent?: number
	/** Max queue size (default: 100) */
	readonly maxQueue?: number
	/** Queue timeout in ms (default: 30s) */
	readonly queueTimeout?: number
	/** Custom rejection response */
	readonly onReject?: (ctx: Context) => ServerResponse
}

/**
 * Bulkhead middleware (limit concurrency)
 *
 * Uses native Rust implementation when available for maximum performance.
 * Falls back to pure TypeScript for edge/serverless environments.
 */
export const bulkhead = (options: BulkheadOptions = {}): Wrapper<Context> => {
	const { maxConcurrent = 10, maxQueue = 100, queueTimeout = 30000, onReject } = options

	// Try to use native bulkhead
	const nativeConfig: NativeBulkheadConfig = {
		maxConcurrent,
		maxQueue,
		queueTimeoutMs: queueTimeout,
	}
	const nativeBulkhead = createNativeBulkhead(nativeConfig)

	// Fallback TypeScript state
	let running = 0
	const queue: Array<{
		resolve: () => void
		reject: (err: Error) => void
		timer: ReturnType<typeof setTimeout>
	}> = []

	const rejectResponse =
		onReject ??
		(() =>
			response(
				JSON.stringify({
					error: 'Service Unavailable',
					message: 'Too many concurrent requests',
				}),
				{
					status: 503,
					headers: {
						'content-type': 'application/json',
						'retry-after': '5',
					},
				}
			))

	const acquire = (): Promise<void> => {
		// Use native if available
		if (nativeBulkhead) {
			if (nativeBulkhead.tryAcquire()) {
				return Promise.resolve()
			}
			return Promise.reject(new Error('Queue full'))
		}

		// Fallback TypeScript implementation
		if (running < maxConcurrent) {
			running++
			return Promise.resolve()
		}

		if (queue.length >= maxQueue) {
			return Promise.reject(new Error('Queue full'))
		}

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				const idx = queue.findIndex((q) => q.resolve === resolve)
				if (idx !== -1) queue.splice(idx, 1)
				reject(new Error('Queue timeout'))
			}, queueTimeout)

			queue.push({ resolve, reject, timer })
		})
	}

	const release = (): void => {
		// Native bulkhead handles release internally via RAII
		if (nativeBulkhead) return

		running--
		const next = queue.shift()
		if (next) {
			clearTimeout(next.timer)
			running++
			next.resolve()
		}
	}

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			try {
				await acquire()
			} catch {
				return rejectResponse(ctx)
			}

			try {
				return await handler(ctx)
			} finally {
				release()
			}
		}
	}
}
