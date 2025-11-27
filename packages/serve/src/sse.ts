/**
 * Server-Sent Events (SSE)
 * EventSource-compatible streaming
 */

import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { EventEmitter } from 'node:events'

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
