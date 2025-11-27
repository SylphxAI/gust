/**
 * Health Check Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  runHealthChecks,
  memoryCheck,
  eventLoopCheck,
  customCheck,
  getMetrics,
} from '../src/health'

describe('Health Checks', () => {
  describe('runHealthChecks', () => {
    it('should return healthy for passing checks', async () => {
      const checks = [
        customCheck('always-pass', () => true),
        customCheck('also-pass', () => Promise.resolve(true)),
      ]

      const result = await runHealthChecks(checks)

      expect(result.status).toBe('healthy')
      expect(result.checks['always-pass'].status).toBe('pass')
      expect(result.checks['also-pass'].status).toBe('pass')
    })

    it('should return unhealthy for critical failure', async () => {
      const checks = [
        customCheck('pass', () => true),
        customCheck('fail', () => false, { critical: true }),
      ]

      const result = await runHealthChecks(checks)

      expect(result.status).toBe('unhealthy')
      expect(result.checks['fail'].status).toBe('fail')
    })

    it('should return degraded for non-critical failure', async () => {
      const checks = [
        customCheck('pass', () => true),
        customCheck('fail', () => false, { critical: false }),
      ]

      const result = await runHealthChecks(checks)

      expect(result.status).toBe('degraded')
    })

    it('should handle check timeout', async () => {
      const checks = [
        customCheck(
          'slow',
          () => new Promise((r) => setTimeout(() => r(true), 1000)),
          { timeout: 50 }
        ),
      ]

      const result = await runHealthChecks(checks)

      expect(result.checks['slow'].status).toBe('fail')
      expect(result.checks['slow'].message).toContain('Timeout')
    })

    it('should handle check errors', async () => {
      const checks = [
        customCheck('error', () => {
          throw new Error('Check failed')
        }),
      ]

      const result = await runHealthChecks(checks)

      expect(result.checks['error'].status).toBe('fail')
      expect(result.checks['error'].message).toBe('Check failed')
    })

    it('should include timing information', async () => {
      const checks = [customCheck('timed', () => true)]

      const result = await runHealthChecks(checks)

      expect(result.checks['timed'].duration).toBeNumber()
      expect(result.checks['timed'].duration).toBeGreaterThanOrEqual(0)
    })

    it('should include timestamp and uptime', async () => {
      const result = await runHealthChecks([])

      expect(result.timestamp).toBeString()
      expect(result.uptime).toBeNumber()
    })
  })

  describe('built-in checks', () => {
    describe('memoryCheck', () => {
      it('should pass when memory is within limits', async () => {
        const check = memoryCheck(99) // 99% threshold (very permissive)
        const result = await check.check()
        expect(result).toBe(true)
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
      const metrics = getMetrics()

      expect(metrics.memory).toBeDefined()
      expect(metrics.memory.heapUsed).toBeNumber()
      expect(metrics.memory.heapTotal).toBeNumber()
      expect(metrics.memory.rss).toBeNumber()
    })

    it('should return CPU metrics', () => {
      const metrics = getMetrics()

      expect(metrics.cpu).toBeDefined()
      expect(metrics.cpu.user).toBeNumber()
      expect(metrics.cpu.system).toBeNumber()
    })

    it('should return uptime', () => {
      const metrics = getMetrics()
      expect(metrics.uptime).toBeNumber()
      expect(metrics.uptime).toBeGreaterThanOrEqual(0)
    })
  })
})
