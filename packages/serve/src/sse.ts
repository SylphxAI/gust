/**
 * Server-Sent Events (SSE)
 * EventSource-compatible streaming
 */

import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'

export type SSEMessage = {
	/** Event type (optional) */
	event?: string
	/** Message data */
	data: string | object
	/** Event ID (optional) */
	id?: string
	/** Retry interval in ms (optional) */
	retry?: number
}

/**
 * SSE client connection
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

	/**
	 * Send SSE message
	 */
	send(msg: SSEMessage): boolean {
		if (this.closed) return false

		let message = ''

		if (msg.id) {
			message += `id: ${msg.id}\n`
			this.lastEventId = msg.id
		}

		if (msg.event) {
			message += `event: ${msg.event}\n`
		}

		if (msg.retry !== undefined) {
			message += `retry: ${msg.retry}\n`
		}

		const data = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
		for (const line of data.split('\n')) {
			message += `data: ${line}\n`
		}

		message += '\n'

		return this.socket.write(message)
	}

	/**
	 * Send comment (keep-alive)
	 */
	comment(text: string): boolean {
		if (this.closed) return false
		return this.socket.write(`: ${text}\n\n`)
	}

	/**
	 * Send ping (keep-alive comment)
	 */
	ping(): boolean {
		return this.comment('ping')
	}

	/**
	 * Close connection
	 */
	close(): void {
		if (this.closed) return
		this.closed = true
		this.socket.end()
	}

	/**
	 * Check if connection is open
	 */
	get isOpen(): boolean {
		return !this.closed
	}

	/**
	 * Get last event ID
	 */
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
		'X-Accel-Buffering: no', // Disable nginx buffering
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
	// Send SSE headers
	socket.write(sseHeaders())

	// Get Last-Event-ID if reconnecting
	const lastEventId = headers['last-event-id']

	return new SSEClient(socket, lastEventId)
}

/**
 * Format SSE message string
 */
export const formatSSE = (msg: SSEMessage): string => {
	let message = ''

	if (msg.id) {
		message += `id: ${msg.id}\n`
	}

	if (msg.event) {
		message += `event: ${msg.event}\n`
	}

	if (msg.retry !== undefined) {
		message += `retry: ${msg.retry}\n`
	}

	const data = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data)
	for (const line of data.split('\n')) {
		message += `data: ${line}\n`
	}

	message += '\n'

	return message
}

// =============================================================================
// Pure AsyncIterable-based SSE helpers (for ServerResponse streaming)
// =============================================================================

import type { ServerResponse } from '@sylphx/gust-core'

/**
 * SSE event data for streaming
 */
export type SSEEvent = {
	readonly data: unknown
	readonly id?: string | number
	readonly event?: string
	readonly retry?: number
}

/**
 * Format a single SSE event
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
 * Simple SSE event helper (just data, optional id)
 */
export const sseEvent = (data: unknown, id?: string | number): string => {
	return formatSSEEvent({ data, id })
}

/**
 * Transform string generator to Uint8Array generator
 */
export async function* textStream(
	source: AsyncIterable<string> | (() => AsyncGenerator<string>)
): AsyncIterable<Uint8Array> {
	const encoder = new TextEncoder()
	const iterable = typeof source === 'function' ? source() : source

	for await (const text of iterable) {
		yield encoder.encode(text)
	}
}

/**
 * Create an SSE streaming response
 *
 * @example
 * ```ts
 * const handler = async (ctx) => {
 *   return sse(() => textStream(async function* () {
 *     yield sseEvent({ message: 'hello' }, 1)
 *     yield sseEvent({ message: 'world' }, 2)
 *   }))
 * }
 * ```
 */
export const sse = (
	source: AsyncIterable<Uint8Array> | (() => AsyncGenerator<Uint8Array>),
	init?: { status?: number; headers?: Record<string, string> }
): ServerResponse => ({
	status: init?.status ?? 200,
	headers: {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		connection: 'keep-alive',
		'x-accel-buffering': 'no', // Disable nginx buffering
		...init?.headers,
	},
	body: typeof source === 'function' ? source() : source,
})

/**
 * Create an SSE response from event generator
 *
 * @example
 * ```ts
 * const handler = async (ctx) => {
 *   return sseStream(async function* () {
 *     yield { data: 'hello' }
 *     yield { data: 'world', id: 1 }
 *     yield { data: { json: true }, event: 'update' }
 *   })
 * }
 * ```
 */
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

	return sse(generate(), init)
}
