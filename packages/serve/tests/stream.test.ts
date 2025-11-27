/**
 * Streaming Tests - Comprehensive edge case coverage
 */

import { describe, it, expect } from 'bun:test'
import {
  StreamWriter,
  createStream,
  createJsonStream,
  streamFrom,
} from '../src/stream'
import { EventEmitter } from 'node:events'

// Mock socket for testing
class MockSocket extends EventEmitter {
  public written: (string | Buffer)[] = []
  public ended = false
  public writable = true

  write(data: string | Buffer): boolean {
    if (!this.writable) return false
    this.written.push(data)
    return true
  }

  end(): void {
    this.ended = true
    this.writable = false
    this.emit('close')
  }

  destroy(): void {
    this.writable = false
    this.emit('close')
  }
}

describe('Streaming', () => {
  describe('StreamWriter', () => {
    it('should create stream writer', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      expect(writer.isOpen).toBe(true)
      expect(writer.headersWritten).toBe(false)
    })

    it('should write headers', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      const result = writer.writeHead(200, { 'content-type': 'text/plain' })

      expect(result).toBe(true)
      expect(writer.headersWritten).toBe(true)

      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 200 OK')
      expect(output).toContain('content-type: text/plain')
      expect(output).toContain('transfer-encoding: chunked')
    })

    it('should write custom status code', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(201, {})

      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 201 Created')
    })

    it('should not include content-length in headers', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200, { 'content-length': '100' })

      const output = socket.written.join('')
      expect(output).not.toContain('content-length: 100')
    })

    it('should write chunk', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('Hello, World!')

      const output = socket.written.join('')
      // Chunked encoding: size in hex
      expect(output).toContain('d\r\n') // 13 in hex
      expect(output).toContain('Hello, World!')
    })

    it('should auto-write headers on first write', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.write('Data')

      expect(writer.headersWritten).toBe(true)
      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 200 OK')
    })

    it('should write Buffer chunk', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write(Buffer.from([0x48, 0x69])) // "Hi"

      const output = socket.written.join('')
      expect(output).toContain('2\r\n') // 2 bytes in hex
    })

    it('should write JSON', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200, { 'content-type': 'application/json' })
      writer.writeJson({ key: 'value' })

      const output = socket.written.join('')
      expect(output).toContain('{"key":"value"}')
    })

    it('should end stream', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('Data')
      writer.end()

      const output = socket.written.join('')
      // Terminating chunk
      expect(output).toContain('0\r\n\r\n')
      expect(writer.isOpen).toBe(false)
    })

    it('should end with final data', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.end('Final')

      const output = socket.written.join('')
      expect(output).toContain('Final')
      expect(output).toContain('0\r\n\r\n')
    })

    it('should emit finish event', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      let finished = false

      writer.on('finish', () => { finished = true })
      writer.writeHead(200)
      writer.end()

      expect(finished).toBe(true)
    })

    it('should emit close event on socket close', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      let closed = false

      writer.on('close', () => { closed = true })
      socket.emit('close')

      expect(closed).toBe(true)
      expect(writer.isOpen).toBe(false)
    })

    it('should emit error event on socket error', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      let errorReceived: Error | null = null

      writer.on('error', (err) => { errorReceived = err })
      socket.emit('error', new Error('Socket error'))

      expect(errorReceived).toBeInstanceOf(Error)
    })

    it('should not write after close', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.end()

      const countBefore = socket.written.length
      writer.write('After close')

      expect(socket.written.length).toBe(countBefore)
    })

    it('should not write headers twice', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      const result = writer.writeHead(201)

      expect(result).toBe(false)

      const output = socket.written.join('')
      expect(output).not.toContain('201')
    })

    it('should handle empty write', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      const countBefore = socket.written.length
      writer.write('')

      // Empty write should be ignored
      expect(socket.written.length).toBe(countBefore)
    })

    it('should handle empty buffer write', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      const countBefore = socket.written.length
      writer.write(Buffer.alloc(0))

      expect(socket.written.length).toBe(countBefore)
    })
  })

  describe('createStream', () => {
    it('should create stream with default options', () => {
      const socket = new MockSocket()
      const writer = createStream(socket as any)

      expect(writer).toBeInstanceOf(StreamWriter)
      expect(writer.headersWritten).toBe(true)

      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 200 OK')
    })

    it('should create stream with custom status', () => {
      const socket = new MockSocket()
      const writer = createStream(socket as any, 201)

      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 201 Created')
    })

    it('should create stream with custom headers', () => {
      const socket = new MockSocket()
      const writer = createStream(socket as any, 200, {
        'x-custom': 'value',
      })

      const output = socket.written.join('')
      expect(output).toContain('x-custom: value')
    })
  })

  describe('createJsonStream', () => {
    it('should create NDJSON stream', () => {
      const socket = new MockSocket()
      const writer = createJsonStream(socket as any)

      expect(writer).toBeInstanceOf(StreamWriter)

      const output = socket.written.join('')
      expect(output).toContain('application/x-ndjson')
      expect(output).toContain('cache-control: no-cache')
    })
  })

  describe('streamFrom', () => {
    it('should stream from async iterable', async () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      writer.writeHead(200)

      async function* generateData() {
        yield 'item1'
        yield 'item2'
        yield 'item3'
      }

      await streamFrom(writer, generateData())

      const output = socket.written.join('')
      expect(output).toContain('item1')
      expect(output).toContain('item2')
      expect(output).toContain('item3')
      expect(output).toContain('0\r\n\r\n') // Stream ended
    })

    it('should apply transform function', async () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      writer.writeHead(200)

      async function* generateNumbers() {
        yield 1
        yield 2
        yield 3
      }

      await streamFrom(writer, generateNumbers(), (n) => `Number: ${n}\n`)

      const output = socket.written.join('')
      expect(output).toContain('Number: 1')
      expect(output).toContain('Number: 2')
      expect(output).toContain('Number: 3')
    })

    it('should default to JSON+newline for objects', async () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      writer.writeHead(200)

      async function* generateObjects() {
        yield { id: 1 }
        yield { id: 2 }
      }

      await streamFrom(writer, generateObjects())

      const output = socket.written.join('')
      expect(output).toContain('{"id":1}')
      expect(output).toContain('{"id":2}')
    })

    it('should stop streaming when writer closes', async () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)
      writer.writeHead(200)

      let count = 0

      async function* infiniteGenerator() {
        while (true) {
          yield `item${++count}`
          if (count >= 3) {
            // Simulate close
            socket.writable = false
            socket.emit('close')
          }
        }
      }

      await streamFrom(writer, infiniteGenerator())

      // Should have stopped shortly after writer closed
      // May process one more item before detecting close
      expect(count).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(4)
    })
  })

  describe('chunked encoding', () => {
    it('should format chunks correctly', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('Hello')

      // Check chunked format: size\r\ndata\r\n
      const written = socket.written.slice(1) // Skip headers
      expect(written.join('')).toMatch(/5\r\nHello\r\n/)
    })

    it('should handle large chunks', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      const largeData = 'x'.repeat(65536)
      writer.write(largeData)

      const output = socket.written.join('')
      expect(output).toContain('10000\r\n') // 65536 in hex
    })

    it('should handle multiple chunks', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('Chunk1')
      writer.write('Chunk2')
      writer.write('Chunk3')

      const output = socket.written.join('')
      expect(output).toContain('Chunk1')
      expect(output).toContain('Chunk2')
      expect(output).toContain('Chunk3')
    })
  })

  describe('status text', () => {
    const statusTests = [
      { code: 200, text: 'OK' },
      { code: 201, text: 'Created' },
      { code: 204, text: 'No Content' },
      { code: 301, text: 'Moved Permanently' },
      { code: 302, text: 'Found' },
      { code: 304, text: 'Not Modified' },
      { code: 400, text: 'Bad Request' },
      { code: 401, text: 'Unauthorized' },
      { code: 403, text: 'Forbidden' },
      { code: 404, text: 'Not Found' },
      { code: 500, text: 'Internal Server Error' },
    ]

    for (const { code, text } of statusTests) {
      it(`should use correct status text for ${code}`, () => {
        const socket = new MockSocket()
        const writer = new StreamWriter(socket as any)

        writer.writeHead(code)

        const output = socket.written.join('')
        expect(output).toContain(`HTTP/1.1 ${code} ${text}`)
      })
    }

    it('should handle unknown status code', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(418)

      const output = socket.written.join('')
      expect(output).toContain('HTTP/1.1 418')
    })
  })

  describe('edge cases', () => {
    it('should handle unicode data', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('你好世界')

      const output = socket.written.join('')
      expect(output).toContain('你好世界')
    })

    it('should handle binary data', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      const binary = Buffer.from([0x00, 0xff, 0xfe, 0x01])
      writer.write(binary)

      expect(socket.written.length).toBeGreaterThan(1)
    })

    it('should handle very small chunks', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('a')

      const output = socket.written.join('')
      expect(output).toContain('1\r\na\r\n')
    })

    it('should handle rapid writes', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      for (let i = 0; i < 100; i++) {
        writer.write(`Item ${i}`)
      }
      writer.end()

      const output = socket.written.join('')
      expect(output).toContain('Item 0')
      expect(output).toContain('Item 99')
      expect(output).toContain('0\r\n\r\n')
    })

    it('should handle newlines in data', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)
      writer.write('Line1\nLine2\r\nLine3')

      const output = socket.written.join('')
      expect(output).toContain('Line1\nLine2\r\nLine3')
    })
  })

  describe('performance', () => {
    it('should handle many chunks efficiently', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)

      const start = performance.now()
      for (let i = 0; i < 10000; i++) {
        writer.write(`chunk${i}`)
      }
      writer.end()

      const duration = performance.now() - start
      expect(duration).toBeLessThan(1000)
    })

    it('should handle large data efficiently', () => {
      const socket = new MockSocket()
      const writer = new StreamWriter(socket as any)

      writer.writeHead(200)

      const start = performance.now()
      const largeChunk = 'x'.repeat(1024 * 1024) // 1MB
      writer.write(largeChunk)
      writer.end()

      const duration = performance.now() - start
      expect(duration).toBeLessThan(1000)
    })
  })
})
