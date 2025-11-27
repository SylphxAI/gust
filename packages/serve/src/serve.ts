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

export type ServeOptions = {
  readonly port?: number
  readonly hostname?: string
  readonly fetch: Handler<Context>
  readonly onListen?: (info: { port: number; hostname: string }) => void
  readonly onError?: (error: Error) => void
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

  return new Promise((resolve, reject) => {
    const server: NetServer = createServer((socket: Socket) => {
      handleConnection(socket, handler, wasm, options.onError)
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
 * Handle incoming TCP connection
 */
const handleConnection = (
  socket: Socket,
  handler: Handler<Context>,
  wasm: WasmCore,
  onError?: (error: Error) => void
): void => {
  let buffer = Buffer.alloc(0)

  socket.on('data', async (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    // Try to parse HTTP request
    const parsed = wasm.parse_http(new Uint8Array(buffer))

    if (parsed.state === 0) {
      // Incomplete - wait for more data
      parsed.free()
      return
    }

    if (parsed.state === 2) {
      // Parse error
      parsed.free()
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
      socket.end()
      return
    }

    // Complete - process request
    try {
      const headers = parseHeaders(buffer, parsed.header_offsets, parsed.headers_count)
      const ctx = createContext(socket, buffer, parsed, headers)
      parsed.free()

      const response = await handler(ctx)
      sendResponse(socket, response)
    } catch (error) {
      onError?.(error as Error)
      sendResponse(socket, serverError())
    }

    // Reset buffer for keep-alive
    buffer = Buffer.alloc(0)
  })

  socket.on('error', (err) => {
    onError?.(err)
  })
}

/**
 * Send HTTP response
 */
const sendResponse = (socket: Socket, response: ServerResponse): void => {
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
  }

  head += '\r\n'

  // Write response
  socket.write(head)
  if (response.body !== null) {
    socket.write(response.body)
  }

  // For now, close connection (no keep-alive)
  socket.end()
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
