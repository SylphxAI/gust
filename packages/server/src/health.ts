/**
 * Health Check
 * Kubernetes-style health, readiness, and liveness probes
 */

import type { Context } from '@sylphx/gust-app'
import type { Handler, ServerResponse } from '@sylphx/gust-core'
import { json, response } from '@sylphx/gust-core'

// ============================================================================
// Types
// ============================================================================

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded'

export type HealthCheck = {
	/** Check name */
	name: string
	/** Check function */
	check: () => boolean | Promise<boolean>
	/** Is this check critical? (default: true) */
	critical?: boolean
	/** Timeout in ms (default: 5000) */
	timeout?: number
}

export type HealthResult = {
	status: HealthStatus
	checks: Record<
		string,
		{
			status: 'pass' | 'fail'
			duration: number
			message?: string
		}
	>
	timestamp: string
	uptime: number
}

export type HealthOptions = {
	/** Health checks to run */
	readonly checks?: HealthCheck[]
	/** Include detailed check results */
	readonly detailed?: boolean
	/** Custom healthy response */
	readonly onHealthy?: (result: HealthResult) => ServerResponse
	/** Custom unhealthy response */
	readonly onUnhealthy?: (result: HealthResult) => ServerResponse
}

// ============================================================================
// Health Check Runner
// ============================================================================

const startTime = Date.now()

/**
 * Run health checks
 */
export const runHealthChecks = async (checks: HealthCheck[]): Promise<HealthResult> => {
	const results: HealthResult['checks'] = {}
	let hasCriticalFailure = false
	let hasDegradation = false

	await Promise.all(
		checks.map(async (check) => {
			const start = performance.now()
			const timeout = check.timeout ?? 5000

			try {
				const checkPromise = Promise.resolve(check.check())
				const timeoutPromise = new Promise<boolean>((_, reject) =>
					setTimeout(() => reject(new Error('Timeout')), timeout)
				)

				const passed = await Promise.race([checkPromise, timeoutPromise])
				const duration = performance.now() - start

				results[check.name] = {
					status: passed ? 'pass' : 'fail',
					duration: Math.round(duration * 100) / 100,
				}

				if (!passed) {
					if (check.critical !== false) {
						hasCriticalFailure = true
					} else {
						hasDegradation = true
					}
				}
			} catch (error) {
				const duration = performance.now() - start
				results[check.name] = {
					status: 'fail',
					duration: Math.round(duration * 100) / 100,
					message: (error as Error).message,
				}

				if (check.critical !== false) {
					hasCriticalFailure = true
				} else {
					hasDegradation = true
				}
			}
		})
	)

	return {
		status: hasCriticalFailure ? 'unhealthy' : hasDegradation ? 'degraded' : 'healthy',
		checks: results,
		timestamp: new Date().toISOString(),
		uptime: Math.floor((Date.now() - startTime) / 1000),
	}
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Simple health check handler (always returns 200)
 */
export const healthCheck = (): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		return json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			uptime: Math.floor((Date.now() - startTime) / 1000),
		})
	}
}

/**
 * Detailed health check handler
 */
export const health = (options: HealthOptions = {}): Handler<Context> => {
	const { checks = [], detailed = true, onHealthy, onUnhealthy } = options

	return async (): Promise<ServerResponse> => {
		const result = await runHealthChecks(checks)

		// Simple response without details
		if (!detailed) {
			const statusCode = result.status === 'healthy' ? 200 : 503
			return response(
				JSON.stringify({
					status: result.status,
					timestamp: result.timestamp,
				}),
				{
					status: statusCode,
					headers: { 'content-type': 'application/json' },
				}
			)
		}

		if (result.status === 'healthy') {
			if (onHealthy) return onHealthy(result)
			return json(result)
		}

		if (onUnhealthy) return onUnhealthy(result)
		return json(result, { status: 503 })
	}
}

/**
 * Kubernetes liveness probe
 * Returns 200 if the process is running
 */
export const liveness = (): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		return response('OK', { status: 200, headers: { 'content-type': 'text/plain' } })
	}
}

/**
 * Kubernetes readiness probe
 * Returns 200 if the service is ready to accept traffic
 */
export const readiness = (checks: HealthCheck[] = []): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		if (checks.length === 0) {
			return response('Ready', { status: 200, headers: { 'content-type': 'text/plain' } })
		}

		const result = await runHealthChecks(checks)
		const statusCode = result.status === 'healthy' ? 200 : 503

		return response(result.status === 'healthy' ? 'Ready' : 'Not Ready', {
			status: statusCode,
			headers: { 'content-type': 'text/plain' },
		})
	}
}

/**
 * Startup probe
 * Returns 200 once initial startup is complete
 */
export const startup = (isReady: () => boolean | Promise<boolean>): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		const ready = await isReady()
		return response(ready ? 'Started' : 'Starting', {
			status: ready ? 200 : 503,
			headers: { 'content-type': 'text/plain' },
		})
	}
}

// ============================================================================
// Common Health Checks
// ============================================================================

/**
 * Memory usage check
 */
export const memoryCheck = (maxHeapPercent = 90): HealthCheck => ({
	name: 'memory',
	check: () => {
		const used = process.memoryUsage()
		const heapPercent = (used.heapUsed / used.heapTotal) * 100
		return heapPercent < maxHeapPercent
	},
})

/**
 * Event loop lag check
 */
export const eventLoopCheck = (maxLagMs = 100): HealthCheck => ({
	name: 'eventLoop',
	check: () =>
		new Promise((resolve) => {
			const start = Date.now()
			setImmediate(() => {
				const lag = Date.now() - start
				resolve(lag < maxLagMs)
			})
		}),
})

/**
 * External service check (HTTP)
 */
export const httpCheck = (name: string, url: string, expectedStatus = 200): HealthCheck => ({
	name,
	check: async () => {
		try {
			const res = await fetch(url)
			return res.status === expectedStatus
		} catch {
			return false
		}
	},
	timeout: 5000,
})

/**
 * Custom check factory
 */
export const customCheck = (
	name: string,
	check: () => boolean | Promise<boolean>,
	options: Partial<Omit<HealthCheck, 'name' | 'check'>> = {}
): HealthCheck => ({
	name,
	check,
	...options,
})

// ============================================================================
// Metrics
// ============================================================================

export type Metrics = {
	uptime: number
	memory: {
		heapUsed: number
		heapTotal: number
		external: number
		rss: number
	}
	cpu: {
		user: number
		system: number
	}
}

/**
 * Get current metrics
 */
export const getMetrics = (): Metrics => {
	const memory = process.memoryUsage()
	const cpu = process.cpuUsage()

	return {
		uptime: Math.floor((Date.now() - startTime) / 1000),
		memory: {
			heapUsed: memory.heapUsed,
			heapTotal: memory.heapTotal,
			external: memory.external,
			rss: memory.rss,
		},
		cpu: {
			user: cpu.user,
			system: cpu.system,
		},
	}
}

/**
 * Metrics endpoint handler
 */
export const metrics = (): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		return json(getMetrics())
	}
}

/**
 * Prometheus-format metrics
 */
export const prometheusMetrics = (prefix = 'app'): Handler<Context> => {
	return async (): Promise<ServerResponse> => {
		const m = getMetrics()
		const lines: string[] = [
			`# HELP ${prefix}_uptime_seconds Server uptime in seconds`,
			`# TYPE ${prefix}_uptime_seconds gauge`,
			`${prefix}_uptime_seconds ${m.uptime}`,
			'',
			`# HELP ${prefix}_memory_heap_used_bytes Heap memory used`,
			`# TYPE ${prefix}_memory_heap_used_bytes gauge`,
			`${prefix}_memory_heap_used_bytes ${m.memory.heapUsed}`,
			'',
			`# HELP ${prefix}_memory_heap_total_bytes Total heap memory`,
			`# TYPE ${prefix}_memory_heap_total_bytes gauge`,
			`${prefix}_memory_heap_total_bytes ${m.memory.heapTotal}`,
			'',
			`# HELP ${prefix}_memory_rss_bytes Resident set size`,
			`# TYPE ${prefix}_memory_rss_bytes gauge`,
			`${prefix}_memory_rss_bytes ${m.memory.rss}`,
			'',
			`# HELP ${prefix}_cpu_user_microseconds CPU user time`,
			`# TYPE ${prefix}_cpu_user_microseconds counter`,
			`${prefix}_cpu_user_microseconds ${m.cpu.user}`,
			'',
			`# HELP ${prefix}_cpu_system_microseconds CPU system time`,
			`# TYPE ${prefix}_cpu_system_microseconds counter`,
			`${prefix}_cpu_system_microseconds ${m.cpu.system}`,
		]

		return response(lines.join('\n'), {
			status: 200,
			headers: { 'content-type': 'text/plain; version=0.0.4' },
		})
	}
}
