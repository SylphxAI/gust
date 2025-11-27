/**
 * Server-Sent Events Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { createSSE, formatSSE, SSEClient, sseHeaders } from '../src/sse'

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
})
