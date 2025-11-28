/**
 * WebSocket support
 * RFC 6455 compliant WebSocket implementation
 *
 * Architecture:
 * - Uses native Rust implementation (via gust-napi)
 * - Falls back to WASM for edge/serverless environments
 * - No pure JS implementation (thin wrapper only)
 */

import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import {
	nativeEncodeWebSocketBinary,
	nativeEncodeWebSocketClose,
	nativeEncodeWebSocketPing,
	nativeEncodeWebSocketPong,
	nativeEncodeWebSocketText,
	nativeGenerateWebSocketAccept,
} from './native'

// Opcodes
const OPCODE = {
	CONTINUATION: 0x0,
	TEXT: 0x1,
	BINARY: 0x2,
	CLOSE: 0x8,
	PING: 0x9,
	PONG: 0xa,
} as const

export type WebSocketMessage = {
	readonly type: 'text' | 'binary'
	readonly data: string | Buffer
}

export type WebSocketEvents = {
	open: () => void
	message: (msg: WebSocketMessage) => void
	close: (code: number, reason: string) => void
	error: (error: Error) => void
	ping: (data: Buffer) => void
	pong: (data: Buffer) => void
}

export class WebSocket extends EventEmitter {
	private socket: Socket | TLSSocket
	private closed = false
	private fragments: Buffer[] = []
	private fragmentOpcode: number = 0

	constructor(socket: Socket | TLSSocket) {
		super()
		this.socket = socket
		this.setupSocket()
	}

	private setupSocket(): void {
		let buffer: Buffer = Buffer.alloc(0)

		this.socket.on('data', (chunk: Buffer) => {
			buffer = Buffer.concat([buffer, chunk]) as Buffer
			buffer = this.processFrames(buffer)
		})

		this.socket.on('close', () => {
			if (!this.closed) {
				this.closed = true
				this.emit('close', 1006, 'Connection closed abnormally')
			}
		})

		this.socket.on('error', (err) => {
			this.emit('error', err)
		})
	}

	private processFrames(buffer: Buffer): Buffer {
		while (buffer.length >= 2) {
			const firstByte = buffer[0] ?? 0
			const secondByte = buffer[1] ?? 0

			const fin = (firstByte & 0x80) !== 0
			const opcode = firstByte & 0x0f
			const masked = (secondByte & 0x80) !== 0
			let payloadLen = secondByte & 0x7f

			let offset = 2

			// Extended payload length
			if (payloadLen === 126) {
				if (buffer.length < 4) return buffer
				payloadLen = buffer.readUInt16BE(2)
				offset = 4
			} else if (payloadLen === 127) {
				if (buffer.length < 10) return buffer
				// JavaScript doesn't handle 64-bit integers well
				payloadLen = Number(buffer.readBigUInt64BE(2))
				offset = 10
			}

			// Masking key
			let maskKey: Buffer | null = null
			if (masked) {
				if (buffer.length < offset + 4) return buffer
				maskKey = buffer.subarray(offset, offset + 4)
				offset += 4
			}

			// Check if we have the full payload
			if (buffer.length < offset + payloadLen) return buffer

			// Extract payload
			let payload = buffer.subarray(offset, offset + payloadLen)

			// Unmask if needed
			if (maskKey) {
				payload = Buffer.from(payload)
				for (let i = 0; i < payload.length; i++) {
					const payloadByte = payload[i] ?? 0
					const maskByte = maskKey[i % 4] ?? 0
					payload[i] = payloadByte ^ maskByte
				}
			}

			// Handle frame
			this.handleFrame(fin, opcode, payload)

			// Move to next frame
			buffer = buffer.subarray(offset + payloadLen)
		}

		return buffer
	}

	private handleFrame(fin: boolean, opcode: number, payload: Buffer): void {
		switch (opcode) {
			case OPCODE.CONTINUATION:
				this.fragments.push(payload)
				if (fin) {
					const fullPayload = Buffer.concat(this.fragments)
					this.fragments = []
					if (this.fragmentOpcode === OPCODE.TEXT) {
						this.emit('message', { type: 'text', data: fullPayload.toString('utf8') })
					} else {
						this.emit('message', { type: 'binary', data: fullPayload })
					}
				}
				break

			case OPCODE.TEXT:
				if (fin) {
					this.emit('message', { type: 'text', data: payload.toString('utf8') })
				} else {
					this.fragmentOpcode = OPCODE.TEXT
					this.fragments.push(payload)
				}
				break

			case OPCODE.BINARY:
				if (fin) {
					this.emit('message', { type: 'binary', data: payload })
				} else {
					this.fragmentOpcode = OPCODE.BINARY
					this.fragments.push(payload)
				}
				break

			case OPCODE.CLOSE: {
				const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000
				const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
				this.closed = true
				this.sendFrame(OPCODE.CLOSE, payload)
				this.socket.end()
				this.emit('close', code, reason)
				break
			}

			case OPCODE.PING:
				this.emit('ping', payload)
				this.sendFrame(OPCODE.PONG, payload)
				break

			case OPCODE.PONG:
				this.emit('pong', payload)
				break
		}
	}

	private sendFrame(opcode: number, payload: Buffer): void {
		if (this.closed) return

		// Try native encoding first
		let nativeFrame: Buffer | null = null
		switch (opcode) {
			case OPCODE.TEXT:
				nativeFrame = nativeEncodeWebSocketText(payload.toString('utf8'), true)
				break
			case OPCODE.BINARY:
				nativeFrame = nativeEncodeWebSocketBinary(payload, true)
				break
			case OPCODE.PING:
				nativeFrame = nativeEncodeWebSocketPing(payload)
				break
			case OPCODE.PONG:
				nativeFrame = nativeEncodeWebSocketPong(payload)
				break
			case OPCODE.CLOSE:
				if (payload.length >= 2) {
					const code = payload.readUInt16BE(0)
					const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : undefined
					nativeFrame = nativeEncodeWebSocketClose(code, reason)
				} else {
					nativeFrame = nativeEncodeWebSocketClose()
				}
				break
		}

		if (!nativeFrame) {
			throw new Error('WebSocket frame encoding unavailable (native/WASM not loaded)')
		}

		this.socket.write(nativeFrame)
	}

	/**
	 * Send text message
	 */
	send(data: string | Buffer): void {
		if (typeof data === 'string') {
			this.sendFrame(OPCODE.TEXT, Buffer.from(data, 'utf8'))
		} else {
			this.sendFrame(OPCODE.BINARY, data)
		}
	}

	/**
	 * Send ping
	 */
	ping(data?: Buffer): void {
		this.sendFrame(OPCODE.PING, data || Buffer.alloc(0))
	}

	/**
	 * Close connection
	 */
	close(code = 1000, reason = ''): void {
		if (this.closed) return
		this.closed = true

		const reasonBuf = Buffer.from(reason, 'utf8')
		const payload = Buffer.alloc(2 + reasonBuf.length)
		payload.writeUInt16BE(code, 0)
		reasonBuf.copy(payload, 2)

		this.sendFrame(OPCODE.CLOSE, payload)
		this.socket.end()
	}

	/**
	 * Check if connection is open
	 */
	get isOpen(): boolean {
		return !this.closed
	}
}

/**
 * Generate WebSocket accept key
 * Uses native Rust/WASM implementation.
 */
export const generateAcceptKey = (key: string): string => {
	const native = nativeGenerateWebSocketAccept(key)
	if (!native) {
		throw new Error('WebSocket accept key generation unavailable (native/WASM not loaded)')
	}
	return native
}

/**
 * Check if request is a WebSocket upgrade request
 */
export const isWebSocketUpgrade = (headers: Record<string, string>): boolean => {
	const upgrade = headers.upgrade?.toLowerCase()
	const connection = headers.connection?.toLowerCase()
	return upgrade === 'websocket' && (connection?.includes('upgrade') ?? false)
}

/**
 * Create WebSocket handshake response
 */
export const createHandshakeResponse = (key: string): string => {
	const acceptKey = generateAcceptKey(key)
	return [
		'HTTP/1.1 101 Switching Protocols',
		'Upgrade: websocket',
		'Connection: Upgrade',
		`Sec-WebSocket-Accept: ${acceptKey}`,
		'',
		'',
	].join('\r\n')
}

/**
 * Upgrade HTTP connection to WebSocket
 */
export const upgradeToWebSocket = (
	socket: Socket | TLSSocket,
	headers: Record<string, string>
): WebSocket | null => {
	const key = headers['sec-websocket-key']

	if (!key) {
		return null
	}

	// Send handshake response
	socket.write(createHandshakeResponse(key))

	// Create WebSocket instance
	return new WebSocket(socket)
}

export type WebSocketHandler = (ws: WebSocket, headers: Record<string, string>) => void

/**
 * Create a WebSocket route handler
 */
export const websocket = (
	handler: WebSocketHandler
): { isWebSocket: true; handler: WebSocketHandler } => {
	return {
		isWebSocket: true as const,
		handler: handler,
	}
}

// =============================================================================
// Pure WebSocketSession API (AsyncIterable-based)
// =============================================================================

/**
 * WebSocket close info
 */
export type WebSocketCloseInfo = {
	readonly code: number
	readonly reason: string
}

/**
 * Pure WebSocket session with AsyncIterable messages
 * - messages: AsyncIterable for incoming messages
 * - send: Function to send messages
 * - close: Function to close connection
 * - closed: Promise that resolves when connection closes
 */
export type WebSocketSession = {
	readonly messages: AsyncIterable<WebSocketMessage>
	readonly send: (data: string | Buffer) => void
	readonly ping: (data?: Buffer) => void
	readonly close: (code?: number, reason?: string) => void
	readonly closed: Promise<WebSocketCloseInfo>
	readonly isOpen: boolean
}

/**
 * Session-based WebSocket handler
 */
export type WebSocketSessionHandler = (
	session: WebSocketSession,
	headers: Record<string, string>
) => Promise<void>

/**
 * Create AsyncIterable from WebSocket messages
 */
const createMessageIterable = (ws: WebSocket): AsyncIterable<WebSocketMessage> => {
	return {
		[Symbol.asyncIterator](): AsyncIterator<WebSocketMessage> {
			const queue: WebSocketMessage[] = []
			const waiters: Array<{
				resolve: (result: IteratorResult<WebSocketMessage>) => void
				reject: (error: Error) => void
			}> = []
			let closed = false
			let closeError: Error | null = null

			// Handle incoming messages
			ws.on('message', (msg: WebSocketMessage) => {
				const waiter = waiters.shift()
				if (waiter) {
					waiter.resolve({ value: msg, done: false })
				} else {
					queue.push(msg)
				}
			})

			// Handle close
			ws.on('close', () => {
				closed = true
				// Resolve all waiting iterators
				for (const waiter of waiters) {
					waiter.resolve({ value: undefined as unknown as WebSocketMessage, done: true })
				}
				waiters.length = 0
			})

			// Handle error
			ws.on('error', (err: Error) => {
				closed = true
				closeError = err
				// Reject all waiting iterators
				for (const waiter of waiters) {
					waiter.reject(err)
				}
				waiters.length = 0
			})

			return {
				next(): Promise<IteratorResult<WebSocketMessage>> {
					// If there are queued messages, return immediately
					const queued = queue.shift()
					if (queued !== undefined) {
						return Promise.resolve({ value: queued, done: false })
					}

					// If closed, return done
					if (closed) {
						if (closeError) {
							return Promise.reject(closeError)
						}
						return Promise.resolve({ value: undefined as unknown as WebSocketMessage, done: true })
					}

					// Wait for next message
					return new Promise((resolve, reject) => {
						waiters.push({ resolve, reject })
					})
				},
			}
		},
	}
}

/**
 * Create a WebSocket session from raw WebSocket
 */
export const createWebSocketSession = (ws: WebSocket): WebSocketSession => {
	let closeResolve: ((info: WebSocketCloseInfo) => void) | null = null

	const closedPromise = new Promise<WebSocketCloseInfo>((resolve) => {
		closeResolve = resolve
	})

	ws.on('close', (code: number, reason: string) => {
		closeResolve?.({ code, reason })
	})

	return {
		messages: createMessageIterable(ws),
		send: (data: string | Buffer) => ws.send(data),
		ping: (data?: Buffer) => ws.ping(data),
		close: (code?: number, reason?: string) => ws.close(code, reason),
		closed: closedPromise,
		get isOpen() {
			return ws.isOpen
		},
	}
}

/**
 * Create a session-based WebSocket route handler
 *
 * @example
 * ```ts
 * const echo = websocketSession(async (session) => {
 *   for await (const msg of session.messages) {
 *     session.send(`Echo: ${msg.data}`)
 *   }
 *   // Loop exits when connection closes
 *   const { code, reason } = await session.closed
 *   console.log(`Closed: ${code} ${reason}`)
 * })
 * ```
 */
export const websocketSession = (
	handler: WebSocketSessionHandler
): { isWebSocket: true; handler: WebSocketHandler } => {
	return {
		isWebSocket: true as const,
		handler: (ws: WebSocket, headers: Record<string, string>) => {
			const session = createWebSocketSession(ws)
			// Fire and forget - handler runs asynchronously
			handler(session, headers).catch((err) => {
				console.error('WebSocket session error:', err)
				ws.close(1011, 'Internal Error')
			})
		},
	}
}
