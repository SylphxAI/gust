/**
 * Server-Sent Events (SSE)
 * EventSource-compatible streaming
 *
 * Unified API: events() - works with both generators and handlers
 */

import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import type { ServerResponse } from '@sylphx/gust-core'

// =============================================================================
// Core Types
// =============================================================================

/**
 * SSE event data
 */
export type SSEEvent = {
	/** Event data (string or object to be JSON serialized) */
	readonly data: unknown
	/** Event ID for reconnection */
	readonly id?: string | number
	/** Event type (e.g., 'message', 'update') */
	readonly event?: string
	/** Reconnection interval in ms */
	readonly retry?: number
}

/**
 * SSE emit function for push-based handlers
 */
export type SSEEmit = (event: SSEEvent) => void

/**
 * Cleanup function returned by handlers
 */
export type SSECleanup = () => void

/**
 * Generator source: pull-based, yields events
 */
export type SSEGenerator = () => AsyncGenerator<SSEEvent>

/**
 * Handler source: push-based, calls emit()
 */
export type SSEHandler = (emit: SSEEmit) => Promise<void | SSECleanup>

/**
 * Source type for unified events() API
 */
export type SSESource = SSEGenerator | SSEHandler

/**
 * Options for SSE response
 */
export type SSEOptions = {
	/** HTTP status code (default: 200) */
	status?: number
	/** Additional headers */
	headers?: Record<string, string>
}

// =============================================================================
// Format Helpers
// =============================================================================

/**
 * Format SSE event to wire format
 */
export const formatSSEEvent = (event: SSEEvent): string => {
	let result = ''

	if (event.id !== undefined) {
		result += `id: ${event.id}\n`
	}

	if (event.event !== undefined) {
		result += `event: ${event.event}\n`
	}

	if (event.retry !== undefined) {
		result += `retry: ${event.retry}\n`
	}

	const data = typeof event.data === 'string' ? event.data : JSON.stringify(event.data)

	// Handle multi-line data
	for (const line of data.split('\n')) {
		result += `data: ${line}\n`
	}

	result += '\n'
	return result
}

/**
 * Simple event helper (just data, optional id)
 */
export const sseEvent = (data: unknown, id?: string | number): string => {
	return formatSSEEvent({ data, id })
}

// =============================================================================
// Async Queue for Handler → AsyncIterable conversion
// =============================================================================

/**
 * Create an async queue that converts push-based handler to pull-based iterator
 */
const createAsyncQueue = <T>(): {
	push: (value: T) => void
	done: () => void
	error: (err: Error) => void
	iterator: AsyncGenerator<T>
} => {
	const queue: T[] = []
	let resolve: ((value: IteratorResult<T>) => void) | null = null
	let finished = false
	let lastError: Error | null = null

	const push = (value: T) => {
		if (finished) return
		if (resolve) {
			resolve({ value, done: false })
			resolve = null
		} else {
			queue.push(value)
		}
	}

	const done = () => {
		finished = true
		if (resolve) {
			resolve({ value: undefined as T, done: true })
			resolve = null
		}
	}

	const error = (err: Error) => {
		lastError = err
		finished = true
		if (resolve) {
			resolve({ value: undefined as T, done: true })
			resolve = null
		}
	}

	const iterator = {
		[Symbol.asyncIterator]() {
			return this
		},
		async next(): Promise<IteratorResult<T>> {
			if (lastError) throw lastError
			if (queue.length > 0) {
				return { value: queue.shift()!, done: false }
			}
			if (finished) {
				return { value: undefined as T, done: true }
			}
			return new Promise((res) => {
				resolve = res
			})
		},
		async return(): Promise<IteratorResult<T>> {
			finished = true
			return { value: undefined as T, done: true }
		},
		async throw(err: unknown): Promise<IteratorResult<T>> {
			finished = true
			throw err
		},
	} as unknown as AsyncGenerator<T>

	return { push, done, error, iterator }
}

// =============================================================================
// Unified SSE API
// =============================================================================

/**
 * Check if source is a generator function (0 parameters) or handler (1+ parameters)
 */
const isGenerator = (source: SSESource): source is SSEGenerator => {
	return source.length === 0
}

/**
 * Create an SSE streaming response
 *
 * Unified API that works with both generators (pull-based) and handlers (push-based).
 * The library automatically detects which type based on the function signature.
 *
 * @example Generator (pull-based) - for known sequences
 * ```ts
 * app.get('/countdown', () =>
 *   sse(async function* () {
 *     for (let i = 10; i >= 0; i--) {
 *       yield { data: { count: i } }
 *       await sleep(1000)
 *     }
 *   })
 * )
 * ```
 *
 * @example Handler (push-based) - for external events
 * ```ts
 * app.get('/notifications', () =>
 *   sse(async (emit) => {
 *     emit({ data: 'connected' })
 *
 *     const handler = (data) => emit({ data })
 *     pubsub.subscribe('updates', handler)
 *
 *     // Return cleanup function
 *     return () => pubsub.unsubscribe('updates', handler)
 *   })
 * )
 * ```
 */
export const sse = (source: SSESource, options?: SSEOptions): ServerResponse => {
	const headers = {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		connection: 'keep-alive',
		'x-accel-buffering': 'no',
		...options?.headers,
	}

	if (isGenerator(source)) {
		// Pull-based: directly use generator
		const generator = source()

		async function* encode(): AsyncGenerator<Uint8Array> {
			const encoder = new TextEncoder()
			for await (const event of generator) {
				yield encoder.encode(formatSSEEvent(event))
			}
		}

		return {
			status: options?.status ?? 200,
			headers,
			body: encode(),
		}
	} else {
		// Push-based: convert handler to async iterator using queue
		const { push, done, error, iterator } = createAsyncQueue<SSEEvent>()
		let cleanup: SSECleanup | void

		// Start handler in background
		;(async () => {
			try {
				cleanup = await source(push)
			} catch (err) {
				error(err instanceof Error ? err : new Error(String(err)))
			}
		})()

		async function* encode(): AsyncGenerator<Uint8Array> {
			const encoder = new TextEncoder()
			try {
				for await (const event of iterator) {
					yield encoder.encode(formatSSEEvent(event))
				}
			} finally {
				done()
				cleanup?.()
			}
		}

		return {
			status: options?.status ?? 200,
			headers,
			body: encode(),
		}
	}
}

// =============================================================================
// Legacy API (deprecated, use sse() instead)
// =============================================================================

/** @deprecated Use sse() instead */
export type SSEMessage = {
	event?: string
	data: string | object
	id?: string
	retry?: number
}

/** @deprecated Use sse() instead */
export const formatSSE = (msg: SSEMessage): string => {
	let message = ''
	if (msg.id) message += `id: ${msg.id}\n`
	if (msg.event) message += `event: ${msg.event}\n`
	if (msg.retry !== undefined) message += `retry: ${msg.retry}\n`
	const data = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
	for (const line of data.split('\n')) {
		message += `data: ${line}\n`
	}
	message += '\n'
	return message
}

/** @deprecated Use sse() instead */
export const sseRaw = (
	source: AsyncIterable<Uint8Array> | (() => AsyncGenerator<Uint8Array>),
	init?: { status?: number; headers?: Record<string, string> }
): ServerResponse => ({
	status: init?.status ?? 200,
	headers: {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		connection: 'keep-alive',
		'x-accel-buffering': 'no',
		...init?.headers,
	},
	body: typeof source === 'function' ? source() : source,
})

/** @deprecated Use sse() instead */
export const sseStream = (
	source: AsyncIterable<SSEEvent> | (() => AsyncGenerator<SSEEvent>),
	init?: { status?: number; headers?: Record<string, string> }
): ServerResponse => {
	const iterable = typeof source === 'function' ? source() : source

	async function* generate(): AsyncGenerator<Uint8Array> {
		const encoder = new TextEncoder()
		for await (const event of iterable) {
			yield encoder.encode(formatSSEEvent(event))
		}
	}

	return sseRaw(generate(), init)
}

/** @deprecated Use sse() instead */
export async function* textStream(
	source: AsyncIterable<string> | (() => AsyncGenerator<string>)
): AsyncIterable<Uint8Array> {
	const encoder = new TextEncoder()
	const iterable = typeof source === 'function' ? source() : source
	for await (const text of iterable) {
		yield encoder.encode(text)
	}
}

// =============================================================================
// Native SSE (for GustServer direct integration)
// =============================================================================

/**
 * Native SSE Writer interface
 */
export interface NativeSseWriter {
	readonly id: number
	send(data: string): Promise<boolean>
	sendEvent(data: string, id?: string, event?: string): Promise<boolean>
	close(): void
}

/**
 * Native response with SSE streaming support
 */
export type NativeSSEResponse = {
	status: number
	headers: Record<string, string>
	body: string
	sseWriterId: number
}

/**
 * GustServer interface for SSE methods
 */
interface GustServerSSE {
	createSseWriter(): number
	sendSse(writerId: number, data: string): Promise<boolean>
	sendSseEvent(writerId: number, data: string, id?: string, event?: string): Promise<boolean>
	closeSse(writerId: number): void
}

/**
 * Create native SSE response (for GustServer direct integration)
 *
 * This uses channel-based streaming for true push-based SSE with backpressure.
 * Use this when you need the lowest latency and are using GustServer directly.
 *
 * @example
 * ```ts
 * server.setFallback(async (ctx) => {
 *   if (ctx.path === '/events') {
 *     return nativeSSE(server, async (writer) => {
 *       await writer.sendEvent(JSON.stringify({ type: 'connected' }))
 *       // Stream events...
 *     })
 *   }
 * })
 * ```
 */
export const nativeSSE = (
	server: GustServerSSE,
	handler: (writer: NativeSseWriter) => Promise<void>,
	options?: SSEOptions
): NativeSSEResponse => {
	const writerId = server.createSseWriter()

	const writer: NativeSseWriter = {
		id: writerId,
		send: (data: string) => server.sendSse(writerId, data),
		sendEvent: (data: string, id?: string, event?: string) =>
			server.sendSseEvent(writerId, data, id, event),
		close: () => server.closeSse(writerId),
	}

	;(async () => {
		try {
			await handler(writer)
		} catch (err) {
			console.error('SSE handler error:', err)
		} finally {
			writer.close()
		}
	})()

	return {
		status: options?.status ?? 200,
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive',
			'x-accel-buffering': 'no',
			...options?.headers,
		},
		body: '',
		sseWriterId: writerId,
	}
}

/** Check if native SSE is available */
export const isNativeSSEAvailable = (): boolean => true

// =============================================================================
// Socket-based SSE (for raw socket connections)
// =============================================================================

/**
 * SSE client connection (socket-based)
 */
export class SSEClient extends EventEmitter {
	private socket: Socket | TLSSocket
	private closed = false
	private lastEventId: string | null = null

	constructor(socket: Socket | TLSSocket, lastEventId?: string) {
		super()
		this.socket = socket
		this.lastEventId = lastEventId || null
		this.setupSocket()
	}

	private setupSocket(): void {
		this.socket.on('close', () => {
			this.closed = true
			this.emit('close')
		})
		this.socket.on('error', (err) => {
			this.emit('error', err)
		})
	}

	send(msg: SSEMessage): boolean {
		if (this.closed) return false
		let message = ''
		if (msg.id) {
			message += `id: ${msg.id}\n`
			this.lastEventId = msg.id
		}
		if (msg.event) message += `event: ${msg.event}\n`
		if (msg.retry !== undefined) message += `retry: ${msg.retry}\n`
		const data = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
		for (const line of data.split('\n')) {
			message += `data: ${line}\n`
		}
		message += '\n'
		return this.socket.write(message)
	}

	comment(text: string): boolean {
		if (this.closed) return false
		return this.socket.write(`: ${text}\n\n`)
	}

	ping(): boolean {
		return this.comment('ping')
	}

	close(): void {
		if (this.closed) return
		this.closed = true
		this.socket.end()
	}

	get isOpen(): boolean {
		return !this.closed
	}

	get eventId(): string | null {
		return this.lastEventId
	}
}

/**
 * Create SSE response headers
 */
export const sseHeaders = (): string => {
	return [
		'HTTP/1.1 200 OK',
		'Content-Type: text/event-stream',
		'Cache-Control: no-cache',
		'Connection: keep-alive',
		'X-Accel-Buffering: no',
		'',
		'',
	].join('\r\n')
}

/**
 * Upgrade connection to SSE
 */
export const createSSE = (
	socket: Socket | TLSSocket,
	headers: Record<string, string>
): SSEClient => {
	socket.write(sseHeaders())
	const lastEventId = headers['last-event-id']
	return new SSEClient(socket, lastEventId)
}
