/**
 * Cluster Mode - Multi-process server scaling
 *
 * Uses Node.js cluster module to spawn multiple worker processes,
 * each running their own instance of the server.
 *
 * Benefits:
 * - Utilize multiple CPU cores
 * - Process isolation (crash in one worker doesn't affect others)
 * - Zero-downtime restarts (rolling restart)
 *
 * Architecture:
 * - Primary process: Manages workers, handles signals, coordinates restarts
 * - Worker processes: Handle actual HTTP requests via native server
 */

import cluster, { type Worker as ClusterWorker } from 'node:cluster'
import { EventEmitter } from 'node:events'
import { cpus } from 'node:os'
import { getRecommendedWorkers, isNativeAvailable } from './native'
import type { ServeOptions, Server } from './serve'

// ============================================================================
// Types
// ============================================================================

export type ClusterOptions = {
	/** Number of workers (default: native recommended or CPU count) */
	readonly workers?: number
	/** Restart workers on crash (default: true) */
	readonly autoRestart?: boolean
	/** Max restarts per worker per minute (default: 5) */
	readonly maxRestarts?: number
	/** Graceful shutdown timeout in ms (default: 30s) */
	readonly shutdownTimeout?: number
	/** On worker start */
	readonly onWorkerStart?: (worker: ClusterWorker) => void
	/** On worker exit */
	readonly onWorkerExit?: (worker: ClusterWorker, code: number, signal: string) => void
	/** On all workers ready */
	readonly onReady?: () => void
	/** On rolling restart complete */
	readonly onRestart?: () => void
	/** On scale change */
	readonly onScale?: (workerCount: number) => void
}

/**
 * Get optimal worker count based on native recommendation or CPU count
 */
export const getOptimalWorkerCount = (): number => {
	// Use native recommendation if available (capped at 8)
	const nativeRecommended = isNativeAvailable() ? getRecommendedWorkers() : 0
	if (nativeRecommended > 0) return nativeRecommended

	// Fallback: CPU count, capped at 8
	return Math.min(cpus().length, 8)
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
	private workers = new Map<number, ClusterWorker>()
	private restartCounts = new Map<number, number[]>()
	private isShuttingDown = false
	private readyWorkers = 0

	private readonly workerCount: number
	private readonly autoRestart: boolean
	private readonly maxRestarts: number
	private readonly shutdownTimeout: number

	constructor(options: ClusterOptions = {}) {
		super()
		this.workerCount = options.workers ?? getOptimalWorkerCount()
		this.autoRestart = options.autoRestart ?? true
		this.maxRestarts = options.maxRestarts ?? 5
		this.shutdownTimeout = options.shutdownTimeout ?? 30000

		if (options.onWorkerStart) this.on('worker:start', options.onWorkerStart)
		if (options.onWorkerExit) this.on('worker:exit', options.onWorkerExit)
		if (options.onReady) this.on('ready', options.onReady)
		if (options.onRestart) this.on('restart', options.onRestart)
		if (options.onScale) this.on('scale', options.onScale)
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
		cluster.on('message', (_worker, message) => {
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
	private forkWorker(): ClusterWorker {
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
			console.error(
				`Worker ${workerId} exceeded max restarts (${this.maxRestarts}/min), not restarting`
			)
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
			pids: Array.from(this.workers.values())
				.map((w) => w.process.pid)
				.filter((pid): pid is number => pid !== undefined),
		}
	}

	/**
	 * Send message to all workers
	 */
	broadcast(message: object | string | number | boolean): void {
		for (const worker of this.workers.values()) {
			worker.send(message)
		}
	}

	/**
	 * Send message to specific worker
	 */
	sendTo(workerId: number, message: object | string | number | boolean): boolean {
		const worker = this.workers.get(workerId)
		if (!worker) return false
		worker.send(message)
		return true
	}

	/**
	 * Rolling restart - zero-downtime restart of all workers
	 *
	 * Restarts workers one at a time, waiting for each new worker
	 * to be ready before stopping the old one.
	 */
	async rollingRestart(): Promise<void> {
		if (this.isShuttingDown) return

		console.log('Starting rolling restart...')
		const workerIds = Array.from(this.workers.keys())

		for (const workerId of workerIds) {
			const oldWorker = this.workers.get(workerId)
			if (!oldWorker) continue

			// Fork new worker
			const newWorker = cluster.fork()
			this.workers.set(newWorker.id, newWorker)

			// Wait for new worker to be ready
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('New worker failed to become ready'))
				}, 30000)

				const onMessage = (msg: unknown) => {
					if (msg === 'ready') {
						clearTimeout(timeout)
						newWorker.off('message', onMessage)
						resolve()
					}
				}
				newWorker.on('message', onMessage)
			})

			// Gracefully shutdown old worker
			oldWorker.send('shutdown')
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					oldWorker.kill('SIGKILL')
					resolve()
				}, 10000)

				oldWorker.on('exit', () => {
					clearTimeout(timeout)
					resolve()
				})
			})
			this.workers.delete(workerId)

			console.log(`Worker ${workerId} replaced with ${newWorker.id}`)
		}

		console.log('Rolling restart complete')
		this.emit('restart')
	}

	/**
	 * Scale up - add workers
	 */
	scaleUp(count = 1): void {
		for (let i = 0; i < count; i++) {
			this.forkWorker()
		}
		console.log(`Scaled up by ${count} workers (total: ${this.workers.size})`)
		this.emit('scale', this.workers.size)
	}

	/**
	 * Scale down - remove workers
	 */
	async scaleDown(count = 1): Promise<void> {
		const workerIds = Array.from(this.workers.keys()).slice(0, count)

		for (const workerId of workerIds) {
			const worker = this.workers.get(workerId)
			if (!worker) continue

			worker.send('shutdown')
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					worker.kill('SIGKILL')
					resolve()
				}, 10000)

				worker.on('exit', () => {
					clearTimeout(timeout)
					resolve()
				})
			})
			this.workers.delete(workerId)
		}

		console.log(`Scaled down by ${count} workers (total: ${this.workers.size})`)
		this.emit('scale', this.workers.size)
	}

	/**
	 * Set target worker count (scales up or down as needed)
	 */
	async setWorkerCount(count: number): Promise<void> {
		const current = this.workers.size
		if (count > current) {
			this.scaleUp(count - current)
		} else if (count < current) {
			await this.scaleDown(current - count)
		}
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
	workerId: cluster.isPrimary ? 0 : (cluster.worker?.id ?? 0),
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
 * import { clusterServe } from '@sylphx/gust'
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
	const {
		workers,
		autoRestart,
		maxRestarts,
		shutdownTimeout,
		onWorkerStart,
		onWorkerExit,
		onReady,
		...serveOptions
	} = options

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
 * import { cluster } from '@sylphx/gust'
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
