/**
 * WebSocket support
 * RFC 6455 compliant WebSocket implementation
 */

import { createHash } from 'node:crypto'
import type { Socket } from 'node:net'
import type { TLSSocket } from 'node:tls'
import { EventEmitter } from 'node:events'

// WebSocket magic GUID for handshake
const WS_MAGIC_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

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
    let buffer = Buffer.alloc(0)

    this.socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
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
      const firstByte = buffer[0]
      const secondByte = buffer[1]

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
          payload[i] ^= maskKey[i % 4]
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

      case OPCODE.CLOSE:
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000
        const reason = payload.length > 2 ? payload.subarray(2).toString('utf8') : ''
        this.closed = true
        this.sendFrame(OPCODE.CLOSE, payload)
        this.socket.end()
        this.emit('close', code, reason)
        break

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

    const payloadLen = payload.length
    let header: Buffer

    if (payloadLen < 126) {
      header = Buffer.alloc(2)
      header[0] = 0x80 | opcode // FIN + opcode
      header[1] = payloadLen
    } else if (payloadLen < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 126
      header.writeUInt16BE(payloadLen, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 127
      header.writeBigUInt64BE(BigInt(payloadLen), 2)
    }

    this.socket.write(header)
    this.socket.write(payload)
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
 */
export const generateAcceptKey = (key: string): string => {
  return createHash('sha1')
    .update(key + WS_MAGIC_GUID)
    .digest('base64')
}

/**
 * Check if request is a WebSocket upgrade request
 */
export const isWebSocketUpgrade = (headers: Record<string, string>): boolean => {
  const upgrade = headers['upgrade']?.toLowerCase()
  const connection = headers['connection']?.toLowerCase()
  return upgrade === 'websocket' && connection?.includes('upgrade')
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
export const websocket = (handler: WebSocketHandler) => {
  return {
    isWebSocket: true as const,
    handler,
  }
}
