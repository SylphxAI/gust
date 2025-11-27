/**
 * Streaming Response
 * Chunked transfer encoding for streaming large responses
 */

import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { EventEmitter } from 'node:events'

/**
 * Streaming writer for chunked transfer encoding
 */
export class StreamWriter extends EventEmitter {
  private socket: Socket | TLSSocket
  private closed = false
  private headersSent = false

  constructor(socket: Socket | TLSSocket) {
    super()
    this.socket = socket
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
   * Send response headers
   */
  writeHead(
    status: number,
    headers: Record<string, string> = {}
  ): boolean {
    if (this.headersSent) return false
    if (this.closed) return false

    const statusText = getStatusText(status)
    let head = `HTTP/1.1 ${status} ${statusText}\r\n`

    // Add headers (without content-length)
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== 'content-length') {
        head += `${key}: ${value}\r\n`
      }
    }

    // Add transfer-encoding: chunked
    head += 'transfer-encoding: chunked\r\n'
    head += 'connection: keep-alive\r\n'
    head += '\r\n'

    this.headersSent = true
    return this.socket.write(head)
  }

  /**
   * Write a chunk of data
   */
  write(data: string | Buffer): boolean {
    if (this.closed) return false
    if (!this.headersSent) {
      this.writeHead(200, { 'content-type': 'text/plain' })
    }

    const chunk = typeof data === 'string' ? Buffer.from(data) : data
    if (chunk.length === 0) return true

    // Chunked encoding: size in hex + CRLF + data + CRLF
    const sizeHex = chunk.length.toString(16)
    this.socket.write(`${sizeHex}\r\n`)
    this.socket.write(chunk)
    return this.socket.write('\r\n')
  }

  /**
   * Write JSON data
   */
  writeJson(data: unknown): boolean {
    return this.write(JSON.stringify(data))
  }

  /**
   * End the stream
   */
  end(data?: string | Buffer): void {
    if (this.closed) return

    if (data) {
      this.write(data)
    }

    // Send terminating chunk (0 length)
    this.socket.write('0\r\n\r\n')
    this.closed = true
    this.emit('finish')
  }

  /**
   * Check if stream is open
   */
  get isOpen(): boolean {
    return !this.closed && this.socket.writable
  }

  /**
   * Check if headers have been sent
   */
  get headersWritten(): boolean {
    return this.headersSent
  }
}

/**
 * Create a streaming response
 */
export const createStream = (
  socket: Socket | TLSSocket,
  status = 200,
  headers: Record<string, string> = {}
): StreamWriter => {
  const writer = new StreamWriter(socket)
  writer.writeHead(status, headers)
  return writer
}

/**
 * Create a JSON stream (newline-delimited JSON)
 */
export const createJsonStream = (
  socket: Socket | TLSSocket
): StreamWriter => {
  const writer = new StreamWriter(socket)
  writer.writeHead(200, {
    'content-type': 'application/x-ndjson',
    'cache-control': 'no-cache',
  })
  return writer
}

/**
 * Stream helper for async iterables
 */
export const streamFrom = async <T>(
  writer: StreamWriter,
  source: AsyncIterable<T>,
  transform?: (item: T) => string | Buffer
): Promise<void> => {
  try {
    for await (const item of source) {
      if (!writer.isOpen) break

      const data = transform
        ? transform(item)
        : (typeof item === 'string' ? item : JSON.stringify(item) + '\n')

      writer.write(data)
    }
  } finally {
    writer.end()
  }
}

/**
 * Create async generator stream
 */
export const streamGenerator = async <T>(
  writer: StreamWriter,
  generator: () => AsyncGenerator<T, void, unknown>,
  transform?: (item: T) => string | Buffer
): Promise<void> => {
  return streamFrom(writer, generator(), transform)
}

/**
 * Pipe readable stream to writer
 */
export const pipeStream = (
  writer: StreamWriter,
  readable: NodeJS.ReadableStream
): Promise<void> => {
  return new Promise((resolve, reject) => {
    readable.on('data', (chunk: Buffer | string) => {
      if (!writer.isOpen) {
        readable.destroy?.()
        return
      }
      writer.write(chunk)
    })

    readable.on('end', () => {
      writer.end()
      resolve()
    })

    readable.on('error', (err) => {
      writer.end()
      reject(err)
    })

    writer.on('close', () => {
      readable.destroy?.()
      resolve()
    })
  })
}

/**
 * Get status text for HTTP status code
 */
const getStatusText = (status: number): string => {
  const texts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    206: 'Partial Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
  }
  return texts[status] || 'Unknown'
}
