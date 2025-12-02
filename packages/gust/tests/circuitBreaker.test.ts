/**
 * Circuit Breaker Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { bulkhead, CircuitBreaker, circuitBreaker, getCircuitBreaker, withCircuitBreaker } from '../src/circuitBreaker'

// Mock context factory
const createMockContext = (): any => ({
	method: 'GET',
	path: '/',
	headers: {},
	body: Buffer.alloc(0),
	params: {},
	query: '',
	socket: {},
	raw: Buffer.alloc(0),
	json: () => ({}),
})

describe('CircuitBreaker', () => {
	let breaker: CircuitBreaker

	beforeEach(() => {
		breaker = new CircuitBreaker({
			failureThreshold: 3,
			successThreshold: 2,
			resetTimeout: 100,
			failureWindow: 1000,
		})
	})

	describe('initial state', () => {
		it('should start closed', () => {
			expect(breaker.getState()).toBe('closed')
		})

		it('should allow requests when closed', () => {
			expect(breaker.canRequest()).toBe(true)
		})
	})

	describe('failure handling', () => {
		it('should open after failure threshold', () => {
			breaker.recordFailure()
			breaker.recordFailure()
			expect(breaker.getState()).toBe('closed')

			breaker.recordFailure()
			expect(breaker.getState()).toBe('open')
		})

		it('should block requests when open', () => {
			// Trigger open state
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}

			expect(breaker.getState()).toBe('open')
			expect(breaker.canRequest()).toBe(false)
		})

		it('should transition to half-open after timeout', async () => {
			// Trigger open state
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}

			expect(breaker.getState()).toBe('open')

			// Wait for reset timeout
			await new Promise((r) => setTimeout(r, 150))

			// Next request should transition to half-open
			expect(breaker.canRequest()).toBe(true)
			expect(breaker.getState()).toBe('half-open')
		})
	})

	describe('success handling', () => {
		it('should close after success threshold in half-open', async () => {
			// Trigger open state
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}

			// Wait for reset timeout
			await new Promise((r) => setTimeout(r, 150))

			// Transition to half-open
			breaker.canRequest()
			expect(breaker.getState()).toBe('half-open')

			// Record successes
			breaker.recordSuccess()
			expect(breaker.getState()).toBe('half-open')

			breaker.recordSuccess()
			expect(breaker.getState()).toBe('closed')
		})

		it('should reopen on failure in half-open', async () => {
			// Trigger open state
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}

			// Wait for reset timeout
			await new Promise((r) => setTimeout(r, 150))

			// Transition to half-open
			breaker.canRequest()
			expect(breaker.getState()).toBe('half-open')

			// Fail in half-open
			breaker.recordFailure()
			expect(breaker.getState()).toBe('open')
		})
	})

	describe('stats', () => {
		it('should track statistics', () => {
			breaker.recordSuccess()
			breaker.recordSuccess()
			breaker.recordFailure()

			const stats = breaker.getStats()
			expect(stats.totalRequests).toBe(3)
			expect(stats.totalSuccesses).toBe(2)
			expect(stats.totalFailures).toBe(1)
		})

		it('should track timestamps', () => {
			breaker.recordSuccess()
			breaker.recordFailure()

			const stats = breaker.getStats()
			expect(stats.lastSuccess).not.toBeNull()
			expect(stats.lastFailure).not.toBeNull()
		})
	})

	describe('manual control', () => {
		it('should allow manual open', () => {
			breaker.open()
			expect(breaker.getState()).toBe('open')
		})

		it('should allow manual close', () => {
			breaker.open()
			breaker.close()
			expect(breaker.getState()).toBe('closed')
		})

		it('should allow reset', () => {
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}
			expect(breaker.getState()).toBe('open')

			breaker.reset()
			expect(breaker.getState()).toBe('closed')
			expect(breaker.getStats().failures).toBe(0)
		})
	})

	describe('events', () => {
		it('should emit on state changes', () => {
			const events: string[] = []

			breaker.on('open', () => events.push('open'))
			breaker.on('half-open', () => events.push('half-open'))
			breaker.on('close', () => events.push('close'))

			// Open
			for (let i = 0; i < 3; i++) {
				breaker.recordFailure()
			}
			expect(events).toContain('open')

			// Close
			breaker.close()
			expect(events).toContain('close')
		})
	})

	describe('failure window', () => {
		it('should only count failures within window', async () => {
			const shortWindowBreaker = new CircuitBreaker({
				failureThreshold: 3,
				failureWindow: 50, // 50ms window
			})

			shortWindowBreaker.recordFailure()
			shortWindowBreaker.recordFailure()

			// Wait for failures to expire
			await new Promise((r) => setTimeout(r, 100))

			// This failure alone shouldn't open circuit
			shortWindowBreaker.recordFailure()
			expect(shortWindowBreaker.getState()).toBe('closed')
		})
	})
})

describe('circuitBreaker middleware', () => {
	it('should create wrapper function', () => {
		const middleware = circuitBreaker({ failureThreshold: 3 })
		expect(typeof middleware).toBe('function')
	})

	it('should pass through successful requests', async () => {
		const middleware = circuitBreaker({ failureThreshold: 3 })
		const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
		const ctx = createMockContext()

		const result = await handler(ctx)

		expect(result.status).toBe(200)
	})

	it('should pass through 2xx responses', async () => {
		const middleware = circuitBreaker({ failureThreshold: 3 })
		const handler = middleware(async () => ({ status: 201, body: 'Created', headers: {} }))
		const ctx = createMockContext()

		const result = await handler(ctx)

		expect(result.status).toBe(201)
	})

	it('should pass through 4xx responses by default', async () => {
		const middleware = circuitBreaker({ failureThreshold: 3 })
		const handler = middleware(async () => ({ status: 400, body: 'Bad Request', headers: {} }))
		const ctx = createMockContext()

		const result = await handler(ctx)

		expect(result.status).toBe(400)
	})

	it('should pass through 5xx responses initially', async () => {
		const middleware = circuitBreaker({ failureThreshold: 10 })
		const handler = middleware(async () => ({ status: 500, body: 'Error', headers: {} }))
		const ctx = createMockContext()

		const result = await handler(ctx)

		expect(result.status).toBe(500)
	})

	it('should accept custom isFailure function', () => {
		const middleware = circuitBreaker({
			failureThreshold: 2,
			isFailure: (res) => res.status >= 400,
		})
		expect(typeof middleware).toBe('function')
	})

	it('should accept custom fallback function', () => {
		const middleware = circuitBreaker({
			failureThreshold: 1,
			fallback: () => ({ status: 503, body: 'Custom fallback', headers: {} }),
		})
		expect(typeof middleware).toBe('function')
	})

	it('should accept timeout option', () => {
		const middleware = circuitBreaker({
			failureThreshold: 1,
			timeout: 5000,
		})
		expect(typeof middleware).toBe('function')
	})

	it('should call onStateChange callback on failure threshold', async () => {
		const stateChanges: string[] = []
		const middleware = circuitBreaker({
			failureThreshold: 2,
			failureWindow: 60000,
			onStateChange: (state) => stateChanges.push(state),
		})
		const handler = middleware(async () => ({ status: 500, body: 'Error', headers: {} }))
		const ctx = createMockContext()

		// First failure
		await handler(ctx)
		// Second failure should trigger open
		await handler(ctx)

		expect(stateChanges).toContain('open')
	})
})

describe('getCircuitBreaker', () => {
	it('should create new breaker for new name', () => {
		const breaker1 = getCircuitBreaker('service-a')
		const breaker2 = getCircuitBreaker('service-b')

		expect(breaker1).not.toBe(breaker2)
	})

	it('should return same breaker for same name', () => {
		const name = `service-${Date.now()}`
		const breaker1 = getCircuitBreaker(name)
		const breaker2 = getCircuitBreaker(name)

		expect(breaker1).toBe(breaker2)
	})

	it('should apply options on creation', () => {
		const name = `service-options-${Date.now()}`
		const breaker = getCircuitBreaker(name, { failureThreshold: 10 })

		// Verify options were applied by checking state after failures
		for (let i = 0; i < 9; i++) {
			breaker.recordFailure()
		}
		expect(breaker.getState()).toBe('closed')

		breaker.recordFailure()
		expect(breaker.getState()).toBe('open')
	})

	it('should maintain state across calls', () => {
		const name = `service-state-${Date.now()}`
		const breaker1 = getCircuitBreaker(name)
		breaker1.open()

		const breaker2 = getCircuitBreaker(name)
		expect(breaker2.getState()).toBe('open')
	})
})

describe('withCircuitBreaker', () => {
	it('should wrap async function', async () => {
		const fn = async (x: number) => x * 2
		const wrapped = withCircuitBreaker(fn)

		const result = await wrapped(5)

		expect(result).toBe(10)
	})

	it('should throw when circuit is open', async () => {
		const fn = async () => {
			throw new Error('Service error')
		}
		const wrapped = withCircuitBreaker(fn, { failureThreshold: 1 })

		// Trigger open state
		try {
			await wrapped()
		} catch {
			// Expected
		}

		// Next call should throw circuit breaker error
		await expect(wrapped()).rejects.toThrow('Circuit breaker is open')
	})

	it('should record success and failure', async () => {
		let shouldFail = true
		const fn = async () => {
			if (shouldFail) throw new Error('fail')
			return 'success'
		}
		const wrapped = withCircuitBreaker(fn, {
			failureThreshold: 3,
			successThreshold: 2,
			resetTimeout: 50,
		})

		// Cause failures
		for (let i = 0; i < 3; i++) {
			try {
				await wrapped()
			} catch {
				// Expected
			}
		}

		// Wait for reset
		await new Promise((r) => setTimeout(r, 100))

		// Now succeed
		shouldFail = false

		// Should transition to half-open and then closed
		await wrapped()
		await wrapped()

		// Should work normally now
		const result = await wrapped()
		expect(result).toBe('success')
	})

	it('should preserve function arguments', async () => {
		const fn = async (a: string, b: number, c: boolean) => `${a}-${b}-${c}`
		const wrapped = withCircuitBreaker(fn)

		const result = await wrapped('test', 42, true)

		expect(result).toBe('test-42-true')
	})
})

describe('bulkhead middleware', () => {
	it('should create wrapper function', () => {
		const middleware = bulkhead({ maxConcurrent: 5 })
		expect(typeof middleware).toBe('function')
	})

	it('should allow requests under limit', async () => {
		const middleware = bulkhead({ maxConcurrent: 5 })
		const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))
		const ctx = createMockContext()

		const result = await handler(ctx)

		expect(result.status).toBe(200)
	})

	it('should queue requests over limit', async () => {
		const middleware = bulkhead({ maxConcurrent: 1, maxQueue: 5 })
		const handler = middleware(async () => {
			await new Promise((r) => setTimeout(r, 20))
			return { status: 200, body: 'OK', headers: {} }
		})

		const ctx1 = createMockContext()
		const ctx2 = createMockContext()

		// Start both requests
		const promise1 = handler(ctx1)
		const promise2 = handler(ctx2)

		const results = await Promise.all([promise1, promise2])

		expect(results[0].status).toBe(200)
		expect(results[1].status).toBe(200)
	})

	it('should release slot after completion', async () => {
		const middleware = bulkhead({ maxConcurrent: 1, maxQueue: 0 })
		const handler = middleware(async () => ({ status: 200, body: 'OK', headers: {} }))

		const ctx = createMockContext()

		// First request
		const result1 = await handler(ctx)
		expect(result1.status).toBe(200)

		// Second request should also succeed (slot was released)
		const result2 = await handler(ctx)
		expect(result2.status).toBe(200)
	})

	it('should release slot even on error', async () => {
		const middleware = bulkhead({ maxConcurrent: 1, maxQueue: 0 })
		let shouldError = true
		const handler = middleware(async () => {
			if (shouldError) throw new Error('Handler error')
			return { status: 200, body: 'OK', headers: {} }
		})

		const ctx = createMockContext()

		// First request errors
		try {
			await handler(ctx)
		} catch {
			// Expected
		}

		// Slot should be released
		shouldError = false
		const result = await handler(ctx)
		expect(result.status).toBe(200)
	})

	it('should handle multiple sequential requests', async () => {
		const middleware = bulkhead({ maxConcurrent: 2, maxQueue: 10 })
		const handler = middleware(async () => {
			await new Promise((r) => setTimeout(r, 10))
			return { status: 200, body: 'OK', headers: {} }
		})

		// Sequential requests should all work
		for (let i = 0; i < 5; i++) {
			const result = await handler(createMockContext())
			expect(result.status).toBe(200)
		}
	})

	it('should accept custom onReject handler', () => {
		const middleware = bulkhead({
			maxConcurrent: 1,
			maxQueue: 0,
			onReject: () => ({ status: 429, body: 'Rate limited', headers: {} }),
		})
		expect(typeof middleware).toBe('function')
	})

	it('should accept queue timeout option', () => {
		const middleware = bulkhead({
			maxConcurrent: 1,
			maxQueue: 10,
			queueTimeout: 5000,
		})
		expect(typeof middleware).toBe('function')
	})

	it('should handle concurrent requests within limit', async () => {
		const middleware = bulkhead({ maxConcurrent: 3, maxQueue: 10 })
		const handler = middleware(async () => {
			await new Promise((r) => setTimeout(r, 10))
			return { status: 200, body: 'OK', headers: {} }
		})

		const requests = Array(3)
			.fill(null)
			.map(() => handler(createMockContext()))
		const results = await Promise.all(requests)

		for (const r of results) {
			expect(r.status).toBe(200)
		}
	})
})
