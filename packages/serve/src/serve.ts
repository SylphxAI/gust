/**
 * Serve - High performance HTTP server
 * Uses Node.js net + WASM HTTP parser
 * Runtime-agnostic: works with Bun, Node.js, Deno
 */

import { createServer, type Server as NetServer, type Socket } from 'node:net'
import type { Context } from './context'
import type { ServerResponse, Handler, WasmCore } from '@aspect/serve-core'
import { initWasm, getWasm, serverError } from '@aspect/serve-core'
import { createContext, parseHeaders } from './context'

// Default keep-alive timeout (5 seconds)
const DEFAULT_KEEP_ALIVE_TIMEOUT = 5000
// Default max requests per connection
const DEFAULT_MAX_REQUESTS = 100

export type ServeOptions = {
  readonly port?: number
  readonly hostname?: string
  readonly fetch: Handler<Context>
  readonly onListen?: (info: { port: number; hostname: string }) => void
  readonly onError?: (error: Error) => void
  readonly keepAliveTimeout?: number
  readonly maxRequestsPerConnection?: number
}

export type Server = {
  readonly port: number
  readonly hostname: string
  readonly stop: () => Promise<void>
}

/**
 * Start the HTTP server
 */
export const serve = async (options: ServeOptions): Promise<Server> => {
  // Initialize WASM
  await initWasm()
  const wasm = getWasm()

  const port = options.port ?? 3000
  const hostname = options.hostname ?? '0.0.0.0'
  const handler = options.fetch
  const keepAliveTimeout = options.keepAliveTimeout ?? DEFAULT_KEEP_ALIVE_TIMEOUT
  const maxRequests = options.maxRequestsPerConnection ?? DEFAULT_MAX_REQUESTS

  return new Promise((resolve, reject) => {
    const server: NetServer = createServer((socket: Socket) => {
      handleConnection(socket, handler, wasm, keepAliveTimeout, maxRequests, options.onError)
    })

    server.on('error', reject)

    server.listen(port, hostname, () => {
      const serverInfo: Server = {
        port,
        hostname,
        stop: () =>
          new Promise((res) => {
            server.close(() => res())
          }),
      }

      options.onListen?.({ port, hostname })
      resolve(serverInfo)
    })
  })
}

/**
 * Connection state for keep-alive
 */
type ConnectionState = {
  buffer: Buffer
  requestCount: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Handle incoming TCP connection with keep-alive support
 */
const handleConnection = (
  socket: Socket,
  handler: Handler<Context>,
  wasm: WasmCore,
  keepAliveTimeout: number,
  maxRequests: number,
  onError?: (error: Error) => void
): void => {
  const state: ConnectionState = {
    buffer: Buffer.alloc(0),
    requestCount: 0,
    idleTimer: null,
  }

  // Reset idle timer
  const resetIdleTimer = () => {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
    }
    state.idleTimer = setTimeout(() => {
      socket.end()
    }, keepAliveTimeout)
  }

  // Clear timer on close
  const clearIdleTimer = () => {
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
      state.idleTimer = null
    }
  }

  // Start idle timer
  resetIdleTimer()

  socket.on('data', async (chunk: Buffer) => {
    // Reset idle timer on data
    resetIdleTimer()

    state.buffer = Buffer.concat([state.buffer, chunk])

    // Process all complete requests in buffer (pipelining support)
    while (state.buffer.length > 0) {
      // Try to parse HTTP request
      const parsed = wasm.parse_http(new Uint8Array(state.buffer))

      if (parsed.state === 0) {
        // Incomplete - wait for more data
        parsed.free()
        return
      }

      if (parsed.state === 2) {
        // Parse error
        parsed.free()
        clearIdleTimer()
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
        socket.end()
        return
      }

      // Complete - process request
      state.requestCount++
      const requestBuffer = state.buffer

      try {
        const headers = parseHeaders(requestBuffer, parsed.header_offsets, parsed.headers_count)
        const ctx = createContext(socket, requestBuffer, parsed, headers)

        // Determine if keep-alive
        const connectionHeader = headers['connection']?.toLowerCase() || ''
        const isHttp11 = true // We assume HTTP/1.1
        const keepAlive = isHttp11
          ? connectionHeader !== 'close'
          : connectionHeader === 'keep-alive'

        // Check if we should close after this request
        const shouldClose = !keepAlive || state.requestCount >= maxRequests

        // Calculate body end position for buffer slicing
        const requestEnd = parsed.body_start + (headers['content-length'] ? parseInt(headers['content-length'], 10) : 0)

        parsed.free()

        const response = await handler(ctx)
        sendResponse(socket, response, shouldClose)

        if (shouldClose) {
          clearIdleTimer()
          socket.end()
          return
        }

        // Remove processed request from buffer
        state.buffer = state.buffer.subarray(requestEnd)
      } catch (error) {
        onError?.(error as Error)
        clearIdleTimer()
        sendResponse(socket, serverError(), true)
        socket.end()
        return
      }
    }
  })

  socket.on('close', () => {
    clearIdleTimer()
  })

  socket.on('error', (err) => {
    clearIdleTimer()
    onError?.(err)
  })
}

/**
 * Send HTTP response with optional keep-alive
 */
const sendResponse = (socket: Socket, response: ServerResponse, shouldClose: boolean): void => {
  const statusText = getStatusText(response.status)
  let head = `HTTP/1.1 ${response.status} ${statusText}\r\n`

  // Add headers
  for (const [key, value] of Object.entries(response.headers)) {
    head += `${key}: ${value}\r\n`
  }

  // Add content-length if body exists
  if (response.body !== null) {
    const bodyLen = Buffer.byteLength(response.body)
    head += `content-length: ${bodyLen}\r\n`
  } else {
    head += 'content-length: 0\r\n'
  }

  // Add Connection header
  head += `connection: ${shouldClose ? 'close' : 'keep-alive'}\r\n`

  head += '\r\n'

  // Write response
  socket.write(head)
  if (response.body !== null) {
    socket.write(response.body)
  }
}

/**
 * Get status text for HTTP status code
 */
const getStatusText = (status: number): string => {
  const texts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  }
  return texts[status] || 'Unknown'
}
