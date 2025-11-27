/**
 * Cluster Mode
 * Multi-process server for utilizing all CPU cores
 */

import cluster from 'node:cluster'
import { cpus } from 'node:os'
import { EventEmitter } from 'node:events'
import type { ServeOptions, Server } from './serve'

// ============================================================================
// Types
// ============================================================================

export type ClusterOptions = {
  /** Number of workers (default: CPU count) */
  readonly workers?: number
  /** Restart workers on crash (default: true) */
  readonly autoRestart?: boolean
  /** Max restarts per worker per minute (default: 5) */
  readonly maxRestarts?: number
  /** Graceful shutdown timeout in ms (default: 30s) */
  readonly shutdownTimeout?: number
  /** On worker start */
  readonly onWorkerStart?: (worker: cluster.Worker) => void
  /** On worker exit */
  readonly onWorkerExit?: (worker: cluster.Worker, code: number, signal: string) => void
  /** On all workers ready */
  readonly onReady?: () => void
}

export type ClusterInfo = {
  /** Is this the master process? */
  readonly isMaster: boolean
  /** Worker ID (0 for master) */
  readonly workerId: number
  /** Total number of workers */
  readonly workerCount: number
  /** Process ID */
  readonly pid: number
}

// ============================================================================
// Cluster Manager
// ============================================================================

export class ClusterManager extends EventEmitter {
  private workers = new Map<number, cluster.Worker>()
  private restartCounts = new Map<number, number[]>()
  private isShuttingDown = false
  private readyWorkers = 0

  private readonly workerCount: number
  private readonly autoRestart: boolean
  private readonly maxRestarts: number
  private readonly shutdownTimeout: number

  constructor(options: ClusterOptions = {}) {
    super()
    this.workerCount = options.workers ?? cpus().length
    this.autoRestart = options.autoRestart ?? true
    this.maxRestarts = options.maxRestarts ?? 5
    this.shutdownTimeout = options.shutdownTimeout ?? 30000

    if (options.onWorkerStart) this.on('worker:start', options.onWorkerStart)
    if (options.onWorkerExit) this.on('worker:exit', options.onWorkerExit)
    if (options.onReady) this.on('ready', options.onReady)
  }

  /**
   * Start cluster
   */
  start(): void {
    if (!cluster.isPrimary) {
      throw new Error('ClusterManager.start() can only be called from the primary process')
    }

    // Fork workers
    for (let i = 0; i < this.workerCount; i++) {
      this.forkWorker()
    }

    // Handle worker messages
    cluster.on('message', (worker, message) => {
      if (message === 'ready') {
        this.readyWorkers++
        if (this.readyWorkers === this.workerCount) {
          this.emit('ready')
        }
      }
    })

    // Handle worker exit
    cluster.on('exit', (worker, code, signal) => {
      this.workers.delete(worker.id)
      this.emit('worker:exit', worker, code, signal)

      if (!this.isShuttingDown && this.autoRestart) {
        this.maybeRestart(worker.id)
      }
    })

    // Graceful shutdown on signals
    const shutdown = () => this.shutdown()
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }

  /**
   * Fork a new worker
   */
  private forkWorker(): cluster.Worker {
    const worker = cluster.fork()
    this.workers.set(worker.id, worker)
    this.emit('worker:start', worker)
    return worker
  }

  /**
   * Maybe restart a worker (with rate limiting)
   */
  private maybeRestart(workerId: number): void {
    const now = Date.now()
    const minute = 60000

    // Get restart history
    let restarts = this.restartCounts.get(workerId) || []

    // Remove old restarts (older than 1 minute)
    restarts = restarts.filter((t) => t > now - minute)

    if (restarts.length >= this.maxRestarts) {
      console.error(`Worker ${workerId} exceeded max restarts (${this.maxRestarts}/min), not restarting`)
      return
    }

    // Add current restart
    restarts.push(now)
    this.restartCounts.set(workerId, restarts)

    // Fork new worker
    console.log(`Restarting worker ${workerId}...`)
    this.forkWorker()
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true

    console.log('Shutting down cluster...')

    // Send shutdown signal to all workers
    for (const worker of this.workers.values()) {
      worker.send('shutdown')
    }

    // Wait for workers to exit
    const deadline = Date.now() + this.shutdownTimeout
    while (this.workers.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100))
    }

    // Force kill remaining workers
    for (const worker of this.workers.values()) {
      worker.kill('SIGKILL')
    }

    this.emit('shutdown')
    process.exit(0)
  }

  /**
   * Get cluster info
   */
  info(): { workers: number; pids: number[] } {
    return {
      workers: this.workers.size,
      pids: Array.from(this.workers.values()).map((w) => w.process.pid!),
    }
  }

  /**
   * Send message to all workers
   */
  broadcast(message: unknown): void {
    for (const worker of this.workers.values()) {
      worker.send(message)
    }
  }

  /**
   * Send message to specific worker
   */
  sendTo(workerId: number, message: unknown): boolean {
    const worker = this.workers.get(workerId)
    if (!worker) return false
    worker.send(message)
    return true
  }
}

// ============================================================================
// Cluster Utilities
// ============================================================================

/**
 * Get cluster info for current process
 */
export const getClusterInfo = (): ClusterInfo => ({
  isMaster: cluster.isPrimary,
  workerId: cluster.isPrimary ? 0 : cluster.worker!.id,
  workerCount: cluster.isPrimary ? Object.keys(cluster.workers || {}).length : 0,
  pid: process.pid,
})

/**
 * Check if running in cluster mode
 */
export const isCluster = (): boolean => !!cluster.worker

/**
 * Check if this is the primary process
 */
export const isPrimary = (): boolean => cluster.isPrimary

/**
 * Check if this is a worker process
 */
export const isWorker = (): boolean => !!cluster.worker

// ============================================================================
// Cluster Server
// ============================================================================

export type ClusterServeOptions = ServeOptions & ClusterOptions

/**
 * Start server in cluster mode
 *
 * Usage:
 * ```ts
 * import { clusterServe } from '@aspect/serve'
 *
 * clusterServe({
 *   port: 3000,
 *   fetch: (ctx) => json({ hello: 'world' }),
 *   workers: 4,
 * })
 * ```
 */
export const clusterServe = async (
  options: ClusterServeOptions,
  serverFn?: () => Promise<Server>
): Promise<ClusterManager | Server> => {
  const { workers, autoRestart, maxRestarts, shutdownTimeout, onWorkerStart, onWorkerExit, onReady, ...serveOptions } = options

  if (cluster.isPrimary) {
    // Master process - manage workers
    const manager = new ClusterManager({
      workers,
      autoRestart,
      maxRestarts,
      shutdownTimeout,
      onWorkerStart,
      onWorkerExit,
      onReady,
    })

    manager.start()
    return manager
  } else {
    // Worker process - run server
    const { serve } = await import('./serve')
    const server = serverFn ? await serverFn() : await serve(serveOptions)

    // Notify master we're ready
    process.send?.('ready')

    // Handle shutdown message from master
    process.on('message', async (msg) => {
      if (msg === 'shutdown') {
        await server.shutdown()
        process.exit(0)
      }
    })

    return server
  }
}

/**
 * Simple cluster wrapper
 *
 * Usage:
 * ```ts
 * import { cluster } from '@aspect/serve'
 *
 * cluster(() => {
 *   // Your server code here
 *   serve({ ... })
 * })
 * ```
 */
export const runCluster = (
  workerFn: () => void | Promise<void>,
  options: ClusterOptions = {}
): void => {
  if (cluster.isPrimary) {
    const manager = new ClusterManager(options)
    manager.start()
  } else {
    Promise.resolve(workerFn()).catch((err) => {
      console.error('Worker error:', err)
      process.exit(1)
    })
  }
}

/**
 * Sticky sessions for WebSocket (based on IP)
 * Note: Requires custom load balancer setup
 */
export const stickySession = (ip: string, workerCount: number): number => {
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash + ip.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % workerCount
}
