/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { CircuitBreaker } from '../src/circuitBreaker'

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
