/**
 * Server-Sent Events Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import {
	// Legacy API
	createSSE,
	// Formatters
	formatSSE,
	formatSSEEvent,
	isNativeSSEAvailable,
	nativeSSE,
	SSEClient,
	// Unified API
	sse,
	sseEvent,
	sseHeaders,
	sseRaw,
	sseStream,
	textStream,
} from '../src/sse'

// Mock socket for testing
class MockSocket extends EventEmitter {
	public written: string[] = []
	public ended = false
	public destroyed = false

	write(data: string): boolean {
		this.written.push(data)
		return true
	}

	end(): void {
		this.ended = true
		this.emit('close')
	}

	destroy(): void {
		this.destroyed = true
		this.emit('close')
	}
}

describe('Server-Sent Events', () => {
	describe('sseHeaders', () => {
		it('should return SSE response headers', () => {
			const headers = sseHeaders()

			expect(headers).toContain('HTTP/1.1 200 OK')
			expect(headers).toContain('Content-Type: text/event-stream')
			expect(headers).toContain('Cache-Control: no-cache')
			expect(headers).toContain('Connection: keep-alive')
		})

		it('should include nginx buffering disable header', () => {
			const headers = sseHeaders()
			expect(headers).toContain('X-Accel-Buffering: no')
		})

		it('should end with double CRLF', () => {
			const headers = sseHeaders()
			expect(headers.endsWith('\r\n\r\n')).toBe(true)
		})

		it('should use CRLF line endings', () => {
			const headers = sseHeaders()
			// Each header line should end with \r\n
			const lines = headers.split('\r\n')
			expect(lines.length).toBeGreaterThan(4)
		})
	})

	describe('formatSSE', () => {
		it('should format simple message', () => {
			const result = formatSSE({ data: 'hello' })
			expect(result).toBe('data: hello\n\n')
		})

		it('should format message with event type', () => {
			const result = formatSSE({ event: 'update', data: 'content' })
			expect(result).toContain('event: update\n')
			expect(result).toContain('data: content\n')
		})

		it('should format message with id', () => {
			const result = formatSSE({ id: '123', data: 'content' })
			expect(result).toContain('id: 123\n')
			expect(result).toContain('data: content\n')
		})

		it('should format message with retry', () => {
			const result = formatSSE({ retry: 5000, data: 'content' })
			expect(result).toContain('retry: 5000\n')
		})

		it('should format all fields', () => {
			const result = formatSSE({
				id: '42',
				event: 'message',
				retry: 3000,
				data: 'hello world',
			})

			expect(result).toContain('id: 42\n')
			expect(result).toContain('event: message\n')
			expect(result).toContain('retry: 3000\n')
			expect(result).toContain('data: hello world\n')
			expect(result.endsWith('\n\n')).toBe(true)
		})

		it('should handle object data', () => {
			const result = formatSSE({ data: { name: 'test', value: 123 } })
			expect(result).toContain('data: {"name":"test","value":123}\n')
		})

		it('should handle multiline data', () => {
			const result = formatSSE({ data: 'line1\nline2\nline3' })
			expect(result).toContain('data: line1\n')
			expect(result).toContain('data: line2\n')
			expect(result).toContain('data: line3\n')
		})

		it('should handle empty string data', () => {
			const result = formatSSE({ data: '' })
			expect(result).toBe('data: \n\n')
		})

		it('should handle array data', () => {
			const result = formatSSE({ data: [1, 2, 3] })
			expect(result).toContain('data: [1,2,3]\n')
		})

		it('should handle nested object data', () => {
			const result = formatSSE({
				data: {
					user: { name: 'john', age: 30 },
					items: ['a', 'b'],
				},
			})
			expect(result).toContain('data: ')
			expect(result).toContain('"user"')
			expect(result).toContain('"items"')
		})

		it('should handle zero retry', () => {
			const result = formatSSE({ retry: 0, data: 'test' })
			expect(result).toContain('retry: 0\n')
		})

		it('should handle numeric string id', () => {
			const result = formatSSE({ id: '0', data: 'test' })
			expect(result).toContain('id: 0\n')
		})

		it('should handle special characters in data', () => {
			const result = formatSSE({ data: 'hello: world = test' })
			expect(result).toContain('data: hello: world = test\n')
		})

		it('should handle unicode data', () => {
			const result = formatSSE({ data: '你好世界 🌍' })
			expect(result).toContain('data: 你好世界 🌍\n')
		})
	})

	describe('SSEClient', () => {
		it('should create client with socket', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			expect(client.isOpen).toBe(true)
		})

		it('should send message', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			const result = client.send({ data: 'hello' })

			expect(result).toBe(true)
			expect(socket.written.join('')).toContain('data: hello')
		})

		it('should send message with all fields', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({
				id: '42',
				event: 'update',
				retry: 5000,
				data: 'content',
			})

			const output = socket.written.join('')
			expect(output).toContain('id: 42\n')
			expect(output).toContain('event: update\n')
			expect(output).toContain('retry: 5000\n')
			expect(output).toContain('data: content\n')
		})

		it('should track last event id', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any, 'initial-id')

			expect(client.eventId).toBe('initial-id')

			client.send({ id: 'new-id', data: 'test' })
			expect(client.eventId).toBe('new-id')
		})

		it('should send comment', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			const result = client.comment('keep-alive')

			expect(result).toBe(true)
			expect(socket.written.join('')).toContain(': keep-alive\n\n')
		})

		it('should send ping', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			const result = client.ping()

			expect(result).toBe(true)
			expect(socket.written.join('')).toContain(': ping\n\n')
		})

		it('should close connection', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.close()

			expect(client.isOpen).toBe(false)
			expect(socket.ended).toBe(true)
		})

		it('should not send after close', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.close()
			const result = client.send({ data: 'test' })

			expect(result).toBe(false)
		})

		it('should not comment after close', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.close()
			const result = client.comment('test')

			expect(result).toBe(false)
		})

		it('should emit close event on socket close', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)
			let closeCalled = false

			client.on('close', () => {
				closeCalled = true
			})
			socket.emit('close')

			expect(closeCalled).toBe(true)
			expect(client.isOpen).toBe(false)
		})

		it('should emit error event on socket error', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)
			let errorReceived: Error | null = null

			client.on('error', (err) => {
				errorReceived = err
			})
			socket.emit('error', new Error('Socket error'))

			expect(errorReceived).toBeInstanceOf(Error)
			expect(errorReceived!.message).toBe('Socket error')
		})

		it('should handle multiline message data', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({ data: 'line1\nline2\nline3' })

			const output = socket.written.join('')
			expect(output).toContain('data: line1\n')
			expect(output).toContain('data: line2\n')
			expect(output).toContain('data: line3\n')
		})

		it('should handle object message data', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({ data: { key: 'value' } })

			const output = socket.written.join('')
			expect(output).toContain('data: {"key":"value"}\n')
		})

		it('should not update eventId if no id in message', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any, 'initial')

			client.send({ data: 'no id' })

			expect(client.eventId).toBe('initial')
		})

		it('should handle multiple close calls', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.close()
			client.close()
			client.close()

			expect(client.isOpen).toBe(false)
		})
	})

	describe('createSSE', () => {
		it('should create SSE client and send headers', () => {
			const socket = new MockSocket()
			const headers = {}

			const client = createSSE(socket as any, headers)

			expect(client).toBeInstanceOf(SSEClient)
			expect(socket.written.join('')).toContain('HTTP/1.1 200 OK')
			expect(socket.written.join('')).toContain('text/event-stream')
		})

		it('should use Last-Event-ID header', () => {
			const socket = new MockSocket()
			const headers = { 'last-event-id': 'previous-123' }

			const client = createSSE(socket as any, headers)

			expect(client.eventId).toBe('previous-123')
		})

		it('should handle missing Last-Event-ID', () => {
			const socket = new MockSocket()
			const headers = {}

			const client = createSSE(socket as any, headers)

			expect(client.eventId).toBeNull()
		})
	})

	describe('edge cases', () => {
		it('should handle very long message', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			const longData = 'x'.repeat(100000)
			const result = client.send({ data: longData })

			expect(result).toBe(true)
			expect(socket.written.join('')).toContain(longData)
		})

		it('should handle rapid sends', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			for (let i = 0; i < 100; i++) {
				client.send({ id: String(i), data: `message ${i}` })
			}

			expect(socket.written.length).toBe(100)
			expect(client.eventId).toBe('99')
		})

		it('should handle empty event type', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({ event: '', data: 'test' })

			// Empty event should not add event field
			const output = socket.written.join('')
			expect(output).not.toContain('event: \n')
		})

		it('should handle undefined retry', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({ data: 'test', retry: undefined })

			const output = socket.written.join('')
			expect(output).not.toContain('retry:')
		})

		it('should handle JSON with special characters', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)

			client.send({
				data: {
					message: 'Hello\nWorld',
					special: '\t\r\n"\'',
				},
			})

			expect(socket.written.length).toBeGreaterThan(0)
		})

		it('should handle numeric data', () => {
			const result = formatSSE({ data: 42 as any })
			expect(result).toContain('data: 42\n')
		})

		it('should handle boolean data', () => {
			const result = formatSSE({ data: true as any })
			expect(result).toContain('data: true\n')
		})

		it('should handle null data', () => {
			const result = formatSSE({ data: null as any })
			expect(result).toContain('data: null\n')
		})
	})

	describe('performance', () => {
		it('should format messages quickly', () => {
			const start = performance.now()

			for (let i = 0; i < 10000; i++) {
				formatSSE({
					id: String(i),
					event: 'update',
					data: { count: i },
				})
			}

			const duration = performance.now() - start
			expect(duration).toBeLessThan(500)
		})

		it('should send messages quickly', () => {
			const socket = new MockSocket()
			const client = new SSEClient(socket as any)
			const start = performance.now()

			for (let i = 0; i < 10000; i++) {
				client.send({ data: `message ${i}` })
			}

			const duration = performance.now() - start
			expect(duration).toBeLessThan(1000)
		})
	})

	describe('formatSSEEvent', () => {
		it('should format simple event', () => {
			const result = formatSSEEvent({ data: 'hello' })
			expect(result).toBe('data: hello\n\n')
		})

		it('should format event with id', () => {
			const result = formatSSEEvent({ data: 'test', id: 123 })
			expect(result).toContain('id: 123\n')
			expect(result).toContain('data: test\n')
		})

		it('should format event with string id', () => {
			const result = formatSSEEvent({ data: 'test', id: 'abc' })
			expect(result).toContain('id: abc\n')
		})

		it('should format event with event type', () => {
			const result = formatSSEEvent({ data: 'test', event: 'update' })
			expect(result).toContain('event: update\n')
		})

		it('should format event with retry', () => {
			const result = formatSSEEvent({ data: 'test', retry: 3000 })
			expect(result).toContain('retry: 3000\n')
		})

		it('should handle object data', () => {
			const result = formatSSEEvent({ data: { key: 'value' } })
			expect(result).toContain('data: {"key":"value"}\n')
		})

		it('should handle multiline string data', () => {
			const result = formatSSEEvent({ data: 'line1\nline2' })
			expect(result).toContain('data: line1\n')
			expect(result).toContain('data: line2\n')
		})

		it('should handle all fields together', () => {
			const result = formatSSEEvent({
				data: { msg: 'hello' },
				id: 42,
				event: 'message',
				retry: 5000,
			})
			expect(result).toContain('id: 42\n')
			expect(result).toContain('event: message\n')
			expect(result).toContain('retry: 5000\n')
			expect(result).toContain('data: {"msg":"hello"}\n')
			expect(result.endsWith('\n\n')).toBe(true)
		})
	})

	describe('sseEvent', () => {
		it('should create simple event', () => {
			const result = sseEvent('hello')
			expect(result).toBe('data: hello\n\n')
		})

		it('should create event with id', () => {
			const result = sseEvent('hello', 1)
			expect(result).toContain('id: 1\n')
			expect(result).toContain('data: hello\n')
		})

		it('should handle object data', () => {
			const result = sseEvent({ msg: 'test' })
			expect(result).toContain('data: {"msg":"test"}\n')
		})

		it('should handle string id', () => {
			const result = sseEvent('test', 'event-123')
			expect(result).toContain('id: event-123\n')
		})
	})

	describe('textStream', () => {
		it('should convert string generator to Uint8Array', async () => {
			async function* generate() {
				yield 'hello'
				yield 'world'
			}

			const chunks: Uint8Array[] = []
			for await (const chunk of textStream(generate)) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBe(2)
			expect(new TextDecoder().decode(chunks[0])).toBe('hello')
			expect(new TextDecoder().decode(chunks[1])).toBe('world')
		})

		it('should handle async iterable source', async () => {
			const source = {
				async *[Symbol.asyncIterator]() {
					yield 'a'
					yield 'b'
				},
			}

			const chunks: Uint8Array[] = []
			for await (const chunk of textStream(source)) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBe(2)
		})

		it('should handle unicode', async () => {
			async function* generate() {
				yield '你好'
				yield '🌍'
			}

			const chunks: Uint8Array[] = []
			for await (const chunk of textStream(generate)) {
				chunks.push(chunk)
			}

			expect(new TextDecoder().decode(chunks[0])).toBe('你好')
			expect(new TextDecoder().decode(chunks[1])).toBe('🌍')
		})
	})

	describe('sseRaw response helper', () => {
		it('should create SSE response with correct headers', () => {
			async function* generate(): AsyncGenerator<Uint8Array> {
				yield new TextEncoder().encode('data: test\n\n')
			}

			const response = sseRaw(generate())

			expect(response.status).toBe(200)
			expect(response.headers['content-type']).toBe('text/event-stream')
			expect(response.headers['cache-control']).toBe('no-cache')
			expect(response.headers['connection']).toBe('keep-alive')
			expect(response.headers['x-accel-buffering']).toBe('no')
		})

		it('should allow custom status', () => {
			async function* generate(): AsyncGenerator<Uint8Array> {
				yield new TextEncoder().encode('data: test\n\n')
			}

			const response = sseRaw(generate(), { status: 201 })
			expect(response.status).toBe(201)
		})

		it('should allow custom headers', () => {
			async function* generate(): AsyncGenerator<Uint8Array> {
				yield new TextEncoder().encode('data: test\n\n')
			}

			const response = sseRaw(generate(), {
				headers: { 'x-custom': 'value' },
			})
			expect(response.headers['x-custom']).toBe('value')
		})

		it('should accept function source', () => {
			const response = sseRaw(async function* () {
				yield new TextEncoder().encode('data: test\n\n')
			})

			expect(response.status).toBe(200)
		})
	})

	describe('sseStream response helper', () => {
		it('should create SSE response from event generator', async () => {
			async function* generate() {
				yield { data: 'hello' }
				yield { data: 'world', id: 1 }
			}

			const response = sseStream(generate())

			expect(response.status).toBe(200)
			expect(response.headers['content-type']).toBe('text/event-stream')

			// Consume the body to verify it works
			const chunks: Uint8Array[] = []
			for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
				chunks.push(chunk)
			}

			const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
			expect(output).toContain('data: hello\n')
			expect(output).toContain('data: world\n')
			expect(output).toContain('id: 1\n')
		})

		it('should handle object data in events', async () => {
			async function* generate() {
				yield { data: { count: 1 }, event: 'update' }
			}

			const response = sseStream(generate())
			const chunks: Uint8Array[] = []
			for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
				chunks.push(chunk)
			}

			const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
			expect(output).toContain('event: update\n')
			expect(output).toContain('data: {"count":1}\n')
		})

		it('should accept function source', async () => {
			const response = sseStream(async function* () {
				yield { data: 'test' }
			})

			const chunks: Uint8Array[] = []
			for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
		})
	})

	describe('nativeSSE', () => {
		// Mock GustServer for testing
		class MockGustServer {
			private writers = new Map<number, string[]>()
			private closedWriters = new Map<number, string[]>() // Keep data after close
			private nextId = 1

			createSseWriter(): number {
				const id = this.nextId++
				this.writers.set(id, [])
				return id
			}

			async sendSse(writerId: number, data: string): Promise<boolean> {
				const writer = this.writers.get(writerId)
				if (!writer) return false
				writer.push(data)
				return true
			}

			async sendSseEvent(writerId: number, data: string, id?: string, event?: string): Promise<boolean> {
				const writer = this.writers.get(writerId)
				if (!writer) return false
				let msg = ''
				if (id !== undefined) msg += `id: ${id}\n`
				if (event !== undefined) msg += `event: ${event}\n`
				msg += `data: ${data}\n\n`
				writer.push(msg)
				return true
			}

			closeSse(writerId: number): void {
				const data = this.writers.get(writerId)
				if (data) {
					this.closedWriters.set(writerId, [...data])
				}
				this.writers.delete(writerId)
			}

			getWriterData(writerId: number): string[] | undefined {
				// Check closed writers first (for tests that inspect after handler completes)
				return this.closedWriters.get(writerId) ?? this.writers.get(writerId)
			}

			isWriterClosed(writerId: number): boolean {
				return this.closedWriters.has(writerId) && !this.writers.has(writerId)
			}
		}

		it('should create SSE response with writer ID', () => {
			const server = new MockGustServer()

			const response = nativeSSE(server, async () => {
				// Handler does nothing for this test
			})

			expect(response.status).toBe(200)
			expect(response.headers['content-type']).toBe('text/event-stream')
			expect(response.sseWriterId).toBe(1)
			expect(response.body).toBe('')
		})

		it('should pass writer to handler', async () => {
			const server = new MockGustServer()
			let writerReceived = false
			let writerId = 0

			nativeSSE(server, async (writer) => {
				writerReceived = true
				writerId = writer.id
			})

			// Wait for async handler to execute
			await new Promise((r) => setTimeout(r, 10))

			expect(writerReceived).toBe(true)
			expect(writerId).toBe(1)
		})

		it('should allow sending events through writer', async () => {
			const server = new MockGustServer()

			const response = nativeSSE(server, async (writer) => {
				await writer.sendEvent('hello', '1', 'message')
				await writer.sendEvent('world', '2')
			})

			// Wait for async handler
			await new Promise((r) => setTimeout(r, 10))

			const data = server.getWriterData(response.sseWriterId)
			expect(data).toBeDefined()
			expect(data!.length).toBe(2)
			expect(data![0]).toContain('id: 1')
			expect(data![0]).toContain('event: message')
			expect(data![0]).toContain('data: hello')
		})

		it('should allow sending raw data', async () => {
			const server = new MockGustServer()

			const response = nativeSSE(server, async (writer) => {
				await writer.send('raw data')
			})

			await new Promise((r) => setTimeout(r, 10))

			const data = server.getWriterData(response.sseWriterId)
			expect(data).toBeDefined()
			expect(data![0]).toBe('raw data')
		})

		it('should close writer when handler completes', async () => {
			const server = new MockGustServer()

			const response = nativeSSE(server, async () => {
				// Handler completes immediately
			})

			await new Promise((r) => setTimeout(r, 10))

			// Writer should be closed
			expect(server.isWriterClosed(response.sseWriterId)).toBe(true)
		})

		it('should close writer on handler error', async () => {
			const server = new MockGustServer()
			const consoleSpy = { error: console.error }
			console.error = () => {} // Suppress error output

			const response = nativeSSE(server, async () => {
				throw new Error('Test error')
			})

			await new Promise((r) => setTimeout(r, 10))

			// Writer should be closed even on error
			expect(server.isWriterClosed(response.sseWriterId)).toBe(true)

			console.error = consoleSpy.error
		})

		it('should allow custom status and headers', () => {
			const server = new MockGustServer()

			const response = nativeSSE(server, async () => {}, {
				status: 201,
				headers: { 'x-custom': 'value' },
			})

			expect(response.status).toBe(201)
			expect(response.headers['x-custom']).toBe('value')
			expect(response.headers['content-type']).toBe('text/event-stream')
		})

		it('should increment writer IDs', () => {
			const server = new MockGustServer()

			const r1 = nativeSSE(server, async () => {})
			const r2 = nativeSSE(server, async () => {})
			const r3 = nativeSSE(server, async () => {})

			expect(r1.sseWriterId).toBe(1)
			expect(r2.sseWriterId).toBe(2)
			expect(r3.sseWriterId).toBe(3)
		})
	})

	describe('isNativeSSEAvailable', () => {
		it('should return true', () => {
			// After refactor, nativeSSE always works when server is provided
			expect(isNativeSSEAvailable()).toBe(true)
		})
	})

	// =========================================================================
	// Unified sse() API Tests
	// =========================================================================

	describe('sse() unified API', () => {
		describe('generator mode (pull-based)', () => {
			it('should create SSE response from generator', async () => {
				const response = sse(async function* () {
					yield { data: 'hello' }
					yield { data: 'world' }
				})

				expect(response.status).toBe(200)
				expect(response.headers['content-type']).toBe('text/event-stream')
				expect(response.headers['cache-control']).toBe('no-cache')

				// Consume body
				const chunks: Uint8Array[] = []
				for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
					chunks.push(chunk)
				}

				const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
				expect(output).toContain('data: hello\n')
				expect(output).toContain('data: world\n')
			})

			it('should handle events with all fields', async () => {
				const response = sse(async function* () {
					yield { data: { count: 1 }, id: '1', event: 'update', retry: 3000 }
				})

				const chunks: Uint8Array[] = []
				for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
					chunks.push(chunk)
				}

				const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
				expect(output).toContain('id: 1\n')
				expect(output).toContain('event: update\n')
				expect(output).toContain('retry: 3000\n')
				expect(output).toContain('data: {"count":1}\n')
			})

			it('should allow custom status and headers', () => {
				const response = sse(
					async function* () {
						yield { data: 'test' }
					},
					{ status: 201, headers: { 'x-custom': 'value' } }
				)

				expect(response.status).toBe(201)
				expect(response.headers['x-custom']).toBe('value')
			})
		})

		describe('handler mode (push-based)', () => {
			it('should create SSE response from handler', async () => {
				const response = sse(async (emit) => {
					emit({ data: 'hello' })
					emit({ data: 'world' })
				})

				expect(response.status).toBe(200)
				expect(response.headers['content-type']).toBe('text/event-stream')

				// Consume body
				const chunks: Uint8Array[] = []
				for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
					chunks.push(chunk)
					if (chunks.length >= 2) break // Handler emits 2 events
				}

				const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
				expect(output).toContain('data: hello\n')
				expect(output).toContain('data: world\n')
			})

			it('should handle async emissions', async () => {
				const response = sse(async (emit) => {
					emit({ data: 'first' })
					await new Promise((r) => setTimeout(r, 10))
					emit({ data: 'second' })
				})

				const chunks: Uint8Array[] = []
				for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
					chunks.push(chunk)
					if (chunks.length >= 2) break
				}

				expect(chunks.length).toBe(2)
			})

			it('should call cleanup on iterator close', async () => {
				let cleanupCalled = false

				const response = sse(async (emit) => {
					emit({ data: 'test' })
					return () => {
						cleanupCalled = true
					}
				})

				// Start consuming but break early
				for await (const _ of response.body as AsyncIterable<Uint8Array>) {
					break
				}

				// Wait for cleanup
				await new Promise((r) => setTimeout(r, 20))
				expect(cleanupCalled).toBe(true)
			})

			it('should handle events with all fields', async () => {
				const response = sse(async (emit) => {
					emit({ data: { msg: 'test' }, id: 42, event: 'message' })
				})

				const chunks: Uint8Array[] = []
				for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
					chunks.push(chunk)
					if (chunks.length >= 1) break
				}

				const output = chunks.map((c) => new TextDecoder().decode(c)).join('')
				expect(output).toContain('id: 42\n')
				expect(output).toContain('event: message\n')
				expect(output).toContain('data: {"msg":"test"}\n')
			})
		})

		describe('auto-detection', () => {
			it('should detect generator (0 params)', () => {
				// Generator functions have length 0
				const gen = async function* () {
					yield { data: 'test' }
				}
				expect(gen.length).toBe(0)
			})

			it('should detect handler (1+ params)', () => {
				// Handler functions have length >= 1
				const handler = async (emit: (e: unknown) => void) => {
					emit({ data: 'test' })
				}
				expect(handler.length).toBe(1)
			})
		})
	})
})
