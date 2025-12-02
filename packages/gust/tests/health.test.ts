/**
 * Health Check Tests
 */

import { describe, expect, it } from 'bun:test'
import {
	customCheck,
	eventLoopCheck,
	getMetrics,
	health,
	healthCheck,
	httpCheck,
	liveness,
	memoryCheck,
	metrics,
	prometheusMetrics,
	readiness,
	runHealthChecks,
	startup,
} from '@sylphx/gust'

// Mock context
const createMockContext = (): any => ({
	method: 'GET',
	path: '/health',
	headers: {},
	body: Buffer.alloc(0),
	params: {},
	query: '',
	socket: {},
	raw: Buffer.alloc(0),
	json: () => ({}),
})

describe('Health Checks', () => {
	describe('runHealthChecks', () => {
		it('should return healthy for passing checks', async () => {
			const checks = [customCheck('always-pass', () => true), customCheck('also-pass', () => Promise.resolve(true))]

			const result = await runHealthChecks(checks)

			expect(result.status).toBe('healthy')
			expect(result.checks['always-pass'].status).toBe('pass')
			expect(result.checks['also-pass'].status).toBe('pass')
		})

		it('should return unhealthy for critical failure', async () => {
			const checks = [customCheck('pass', () => true), customCheck('fail', () => false, { critical: true })]

			const result = await runHealthChecks(checks)

			expect(result.status).toBe('unhealthy')
			expect(result.checks.fail.status).toBe('fail')
		})

		it('should return degraded for non-critical failure', async () => {
			const checks = [customCheck('pass', () => true), customCheck('fail', () => false, { critical: false })]

			const result = await runHealthChecks(checks)

			expect(result.status).toBe('degraded')
		})

		it('should handle check timeout', async () => {
			const checks = [customCheck('slow', () => new Promise((r) => setTimeout(() => r(true), 1000)), { timeout: 50 })]

			const result = await runHealthChecks(checks)

			expect(result.checks.slow.status).toBe('fail')
			expect(result.checks.slow.message).toContain('Timeout')
		})

		it('should handle check errors', async () => {
			const checks = [
				customCheck('error', () => {
					throw new Error('Check failed')
				}),
			]

			const result = await runHealthChecks(checks)

			expect(result.checks.error.status).toBe('fail')
			expect(result.checks.error.message).toBe('Check failed')
		})

		it('should include timing information', async () => {
			const checks = [customCheck('timed', () => true)]

			const result = await runHealthChecks(checks)

			expect(result.checks.timed.duration).toBeNumber()
			expect(result.checks.timed.duration).toBeGreaterThanOrEqual(0)
		})

		it('should include timestamp and uptime', async () => {
			const result = await runHealthChecks([])

			expect(result.timestamp).toBeString()
			expect(result.uptime).toBeNumber()
		})
	})

	describe('built-in checks', () => {
		describe('memoryCheck', () => {
			it('should execute memory check', async () => {
				const check = memoryCheck(99) // 99% threshold (very permissive)
				const result = await check.check()
				// Result depends on current memory usage
				expect(typeof result).toBe('boolean')
			})

			it('should have correct name', () => {
				const check = memoryCheck()
				expect(check.name).toBe('memory')
			})
		})

		describe('eventLoopCheck', () => {
			it('should pass when event loop is responsive', async () => {
				const check = eventLoopCheck(1000) // 1000ms threshold (very permissive)
				const result = await check.check()
				expect(result).toBe(true)
			})

			it('should have correct name', () => {
				const check = eventLoopCheck()
				expect(check.name).toBe('eventLoop')
			})
		})
	})

	describe('getMetrics', () => {
		it('should return memory metrics', () => {
			const m = getMetrics()

			expect(m.memory).toBeDefined()
			expect(m.memory.heapUsed).toBeNumber()
			expect(m.memory.heapTotal).toBeNumber()
			expect(m.memory.rss).toBeNumber()
		})

		it('should return CPU metrics', () => {
			const m = getMetrics()

			expect(m.cpu).toBeDefined()
			expect(m.cpu.user).toBeNumber()
			expect(m.cpu.system).toBeNumber()
		})

		it('should return uptime', () => {
			const m = getMetrics()
			expect(m.uptime).toBeNumber()
			expect(m.uptime).toBeGreaterThanOrEqual(0)
		})
	})

	describe('healthCheck handler', () => {
		it('should create handler function', () => {
			const handler = healthCheck()
			expect(typeof handler).toBe('function')
		})

		it('should return healthy status', async () => {
			const handler = healthCheck()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			const body = JSON.parse(result.body as string)
			expect(body.status).toBe('healthy')
			expect(body.timestamp).toBeDefined()
			expect(body.uptime).toBeNumber()
		})
	})

	describe('health handler', () => {
		it('should create handler function', () => {
			const handler = health()
			expect(typeof handler).toBe('function')
		})

		it('should return healthy when no checks', async () => {
			const handler = health()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})

		it('should return detailed results by default', async () => {
			const handler = health({
				checks: [customCheck('test', () => true)],
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			const body = JSON.parse(result.body as string)
			expect(body.checks).toBeDefined()
			expect(body.checks.test).toBeDefined()
		})

		it('should return simple response when detailed is false', async () => {
			const handler = health({
				checks: [customCheck('test', () => true)],
				detailed: false,
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			const body = JSON.parse(result.body as string)
			expect(body.checks).toBeUndefined()
		})

		it('should return 503 on failure', async () => {
			const handler = health({
				checks: [customCheck('fail', () => false)],
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(503)
		})

		it('should use custom onHealthy response', async () => {
			const handler = health({
				checks: [customCheck('test', () => true)],
				onHealthy: () => ({ status: 200, body: 'All good!', headers: {} }),
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.body).toBe('All good!')
		})

		it('should use custom onUnhealthy response', async () => {
			const handler = health({
				checks: [customCheck('fail', () => false)],
				onUnhealthy: () => ({ status: 500, body: 'Not good!', headers: {} }),
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(500)
			expect(result.body).toBe('Not good!')
		})
	})

	describe('liveness handler', () => {
		it('should create handler function', () => {
			const handler = liveness()
			expect(typeof handler).toBe('function')
		})

		it('should return 200 OK', async () => {
			const handler = liveness()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(result.body).toBe('OK')
			expect(result.headers?.['content-type']).toBe('text/plain')
		})
	})

	describe('readiness handler', () => {
		it('should create handler function', () => {
			const handler = readiness()
			expect(typeof handler).toBe('function')
		})

		it('should return Ready when no checks', async () => {
			const handler = readiness()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(result.body).toBe('Ready')
		})

		it('should return Ready when all checks pass', async () => {
			const handler = readiness([customCheck('test', () => true)])
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(result.body).toBe('Ready')
		})

		it('should return Not Ready when checks fail', async () => {
			const handler = readiness([customCheck('fail', () => false)])
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(503)
			expect(result.body).toBe('Not Ready')
		})
	})

	describe('startup handler', () => {
		it('should create handler function', () => {
			const handler = startup(() => true)
			expect(typeof handler).toBe('function')
		})

		it('should return Started when ready', async () => {
			const handler = startup(() => true)
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(result.body).toBe('Started')
		})

		it('should return Starting when not ready', async () => {
			const handler = startup(() => false)
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(503)
			expect(result.body).toBe('Starting')
		})

		it('should handle async check', async () => {
			const handler = startup(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return true
			})
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
		})
	})

	describe('httpCheck', () => {
		it('should create check with correct name', () => {
			const check = httpCheck('external-api', 'https://example.com')
			expect(check.name).toBe('external-api')
		})

		it('should have default timeout', () => {
			const check = httpCheck('api', 'https://example.com')
			expect(check.timeout).toBe(5000)
		})

		it('should accept custom expected status', () => {
			const check = httpCheck('api', 'https://example.com', 201)
			expect(check.name).toBe('api')
		})
	})

	describe('metrics handler', () => {
		it('should create handler function', () => {
			const handler = metrics()
			expect(typeof handler).toBe('function')
		})

		it('should return metrics as JSON', async () => {
			const handler = metrics()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			const body = JSON.parse(result.body as string)
			expect(body.uptime).toBeNumber()
			expect(body.memory).toBeDefined()
			expect(body.cpu).toBeDefined()
		})
	})

	describe('prometheusMetrics handler', () => {
		it('should create handler function', () => {
			const handler = prometheusMetrics()
			expect(typeof handler).toBe('function')
		})

		it('should return metrics in Prometheus format', async () => {
			const handler = prometheusMetrics()
			const ctx = createMockContext()
			const result = await handler(ctx)

			expect(result.status).toBe(200)
			expect(result.headers?.['content-type']).toBe('text/plain; version=0.0.4')

			const body = result.body as string
			expect(body).toContain('# HELP')
			expect(body).toContain('# TYPE')
			expect(body).toContain('uptime_seconds')
			expect(body).toContain('memory_heap_used_bytes')
			expect(body).toContain('memory_rss_bytes')
			expect(body).toContain('cpu_user_microseconds')
		})

		it('should use custom prefix', async () => {
			const handler = prometheusMetrics('myapp')
			const ctx = createMockContext()
			const result = await handler(ctx)

			const body = result.body as string
			expect(body).toContain('myapp_uptime_seconds')
			expect(body).toContain('myapp_memory_heap_used_bytes')
		})
	})

	describe('edge cases', () => {
		it('should handle empty checks array', async () => {
			const result = await runHealthChecks([])
			expect(result.status).toBe('healthy')
			expect(result.checks).toEqual({})
		})

		it('should handle multiple concurrent checks', async () => {
			const checks = [
				customCheck('check1', async () => {
					await new Promise((r) => setTimeout(r, 10))
					return true
				}),
				customCheck('check2', async () => {
					await new Promise((r) => setTimeout(r, 20))
					return true
				}),
				customCheck('check3', async () => {
					await new Promise((r) => setTimeout(r, 15))
					return true
				}),
			]

			const start = Date.now()
			const result = await runHealthChecks(checks)
			const duration = Date.now() - start

			// Should run in parallel, not series
			expect(duration).toBeLessThan(100)
			expect(result.status).toBe('healthy')
		})

		it('should handle mixed critical and non-critical failures', async () => {
			const checks = [
				customCheck('critical-pass', () => true, { critical: true }),
				customCheck('critical-fail', () => false, { critical: true }),
				customCheck('non-critical-fail', () => false, { critical: false }),
			]

			const result = await runHealthChecks(checks)

			// Critical failure takes precedence
			expect(result.status).toBe('unhealthy')
		})

		it('should handle async check that throws', async () => {
			const checks = [
				customCheck('async-error', async () => {
					throw new Error('Async error')
				}),
			]

			const result = await runHealthChecks(checks)

			expect(result.status).toBe('unhealthy')
			expect(result.checks['async-error'].message).toBe('Async error')
		})
	})
})
