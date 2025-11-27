/**
 * Cluster Tests - Comprehensive edge case coverage
 */

import { describe, it, expect } from 'bun:test'
import {
  getClusterInfo,
  isCluster,
  isPrimary,
  isWorker,
  stickySession,
  ClusterManager,
} from '../src/cluster'

describe('Cluster', () => {
  describe('getClusterInfo', () => {
    it('should return cluster info object', () => {
      const info = getClusterInfo()

      expect(info).toHaveProperty('isMaster')
      expect(info).toHaveProperty('workerId')
      expect(info).toHaveProperty('workerCount')
      expect(info).toHaveProperty('pid')
      expect(typeof info.isMaster).toBe('boolean')
      expect(typeof info.workerId).toBe('number')
      expect(typeof info.workerCount).toBe('number')
      expect(typeof info.pid).toBe('number')
    })

    it('should return valid pid', () => {
      const info = getClusterInfo()
      expect(info.pid).toBeGreaterThan(0)
      expect(info.pid).toBe(process.pid)
    })

    it('should indicate primary when running as main process', () => {
      const info = getClusterInfo()
      // In test context, we're the primary process
      expect(info.isMaster).toBe(true)
      expect(info.workerId).toBe(0)
    })
  })

  describe('isCluster', () => {
    it('should return boolean', () => {
      const result = isCluster()
      expect(typeof result).toBe('boolean')
    })

    it('should return false when not in cluster mode', () => {
      // In test context, we're not in a cluster worker
      expect(isCluster()).toBe(false)
    })
  })

  describe('isPrimary', () => {
    it('should return boolean', () => {
      const result = isPrimary()
      expect(typeof result).toBe('boolean')
    })

    it('should return true for main process', () => {
      // In test context, we're the primary process
      expect(isPrimary()).toBe(true)
    })
  })

  describe('isWorker', () => {
    it('should return boolean', () => {
      const result = isWorker()
      expect(typeof result).toBe('boolean')
    })

    it('should return false for main process', () => {
      // In test context, we're not a worker
      expect(isWorker()).toBe(false)
    })

    it('should be inverse of isPrimary', () => {
      expect(isWorker()).toBe(!isPrimary())
    })
  })

  describe('stickySession', () => {
    it('should return consistent hash for same IP', () => {
      const hash1 = stickySession('192.168.1.1', 4)
      const hash2 = stickySession('192.168.1.1', 4)
      expect(hash1).toBe(hash2)
    })

    it('should return number within worker count', () => {
      const workerCount = 8
      for (let i = 0; i < 100; i++) {
        const ip = `192.168.${Math.floor(i / 256)}.${i % 256}`
        const result = stickySession(ip, workerCount)
        expect(result).toBeGreaterThanOrEqual(0)
        expect(result).toBeLessThan(workerCount)
      }
    })

    it('should distribute IPs across workers', () => {
      const workerCount = 4
      const distribution = new Map<number, number>()

      // Generate many IPs and count distribution
      for (let i = 0; i < 1000; i++) {
        const ip = `10.0.${Math.floor(i / 256)}.${i % 256}`
        const worker = stickySession(ip, workerCount)
        distribution.set(worker, (distribution.get(worker) || 0) + 1)
      }

      // All workers should get some IPs
      expect(distribution.size).toBe(workerCount)

      // Distribution should be reasonably balanced (within 50% of mean)
      const mean = 1000 / workerCount
      for (const count of distribution.values()) {
        expect(count).toBeGreaterThan(mean * 0.5)
        expect(count).toBeLessThan(mean * 1.5)
      }
    })

    it('should handle IPv6 addresses', () => {
      const result = stickySession('2001:0db8:85a3:0000:0000:8a2e:0370:7334', 4)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(4)
    })

    it('should handle localhost', () => {
      const result = stickySession('127.0.0.1', 4)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(4)
    })

    it('should handle empty IP', () => {
      const result = stickySession('', 4)
      expect(result).toBe(0) // Empty string hashes to 0
    })

    it('should handle single worker', () => {
      const result = stickySession('192.168.1.1', 1)
      expect(result).toBe(0)
    })

    it('should handle large worker count', () => {
      const result = stickySession('192.168.1.1', 1000)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(1000)
    })

    it('should produce different results for different IPs', () => {
      const results = new Set<number>()
      const workerCount = 100

      for (let i = 0; i < 100; i++) {
        results.add(stickySession(`192.168.1.${i}`, workerCount))
      }

      // Should have multiple different results (not all same worker)
      expect(results.size).toBeGreaterThan(1)
    })

    it('should handle special characters in IP string', () => {
      // Not valid IPs but should still hash without crashing
      const result1 = stickySession('abc.def.ghi.jkl', 4)
      const result2 = stickySession('!@#.$%^.&*(.)', 4)

      expect(result1).toBeGreaterThanOrEqual(0)
      expect(result2).toBeGreaterThanOrEqual(0)
    })
  })

  describe('ClusterManager', () => {
    it('should create instance with default options', () => {
      const manager = new ClusterManager()
      expect(manager).toBeInstanceOf(ClusterManager)
    })

    it('should accept custom worker count', () => {
      const manager = new ClusterManager({ workers: 2 })
      expect(manager).toBeInstanceOf(ClusterManager)
    })

    it('should accept custom options', () => {
      const manager = new ClusterManager({
        workers: 4,
        autoRestart: false,
        maxRestarts: 10,
        shutdownTimeout: 60000,
      })
      expect(manager).toBeInstanceOf(ClusterManager)
    })

    it('should register event handlers from options', () => {
      let startCalled = false
      let exitCalled = false
      let readyCalled = false

      const manager = new ClusterManager({
        onWorkerStart: () => { startCalled = true },
        onWorkerExit: () => { exitCalled = true },
        onReady: () => { readyCalled = true },
      })

      // Emit events to test handlers are registered
      manager.emit('worker:start', {})
      manager.emit('worker:exit', {}, 0, '')
      manager.emit('ready')

      expect(startCalled).toBe(true)
      expect(exitCalled).toBe(true)
      expect(readyCalled).toBe(true)
    })

    it('should be an EventEmitter', () => {
      const manager = new ClusterManager()
      let called = false

      manager.on('test', () => { called = true })
      manager.emit('test')

      expect(called).toBe(true)
    })

    it('should have info method', () => {
      const manager = new ClusterManager()
      const info = manager.info()

      expect(info).toHaveProperty('workers')
      expect(info).toHaveProperty('pids')
      expect(info.workers).toBe(0) // No workers started in test
      expect(Array.isArray(info.pids)).toBe(true)
    })

    it('should have broadcast method', () => {
      const manager = new ClusterManager()
      expect(typeof manager.broadcast).toBe('function')
      // Broadcast with no workers should not throw
      manager.broadcast({ type: 'test' })
    })

    it('should have sendTo method', () => {
      const manager = new ClusterManager()
      expect(typeof manager.sendTo).toBe('function')
      // sendTo non-existent worker should return false
      expect(manager.sendTo(999, { type: 'test' })).toBe(false)
    })

    it('should handle multiple event listeners', () => {
      const manager = new ClusterManager()
      const calls: number[] = []

      manager.on('ready', () => calls.push(1))
      manager.on('ready', () => calls.push(2))
      manager.on('ready', () => calls.push(3))

      manager.emit('ready')

      expect(calls).toEqual([1, 2, 3])
    })
  })

  describe('edge cases', () => {
    it('should handle zero worker count in stickySession', () => {
      // This would cause division by zero - implementation should handle
      // The modulo of 0 is undefined, but JavaScript returns NaN
      const result = stickySession('192.168.1.1', 0)
      expect(isNaN(result)).toBe(true)
    })

    it('should handle negative worker count in stickySession', () => {
      const result = stickySession('192.168.1.1', -4)
      // Modulo of negative number
      expect(typeof result).toBe('number')
    })

    it('should handle very long IP string', () => {
      const longIp = '1'.repeat(10000)
      const result = stickySession(longIp, 4)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(4)
    })

    it('should handle unicode in IP string', () => {
      const result = stickySession('192.168.1.1🔥', 4)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThan(4)
    })
  })

  describe('performance', () => {
    it('should hash IPs quickly', () => {
      const start = performance.now()
      const workerCount = 8

      for (let i = 0; i < 10000; i++) {
        stickySession(`192.168.${Math.floor(i / 256)}.${i % 256}`, workerCount)
      }

      const duration = performance.now() - start
      expect(duration).toBeLessThan(100) // Should complete in under 100ms
    })
  })
})
