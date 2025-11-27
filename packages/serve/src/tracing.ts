/**
 * Request ID and Tracing
 * Generate unique request IDs for logging and tracing
 */

import { randomBytes } from 'node:crypto'
import type { Context } from './context'
import type { ServerResponse, Handler, Wrapper } from '@aspect/serve-core'

export type TracingOptions = {
  /** Header name for request ID (default: x-request-id) */
  readonly header?: string
  /** Generate custom request ID */
  readonly generator?: () => string
  /** Trust incoming request ID header */
  readonly trustIncoming?: boolean
  /** Add request ID to response */
  readonly setResponse?: boolean
}

/**
 * Generate default request ID (16 bytes hex)
 */
const defaultGenerator = (): string => {
  return randomBytes(16).toString('hex')
}

/**
 * Generate UUID v4
 */
export const generateUUID = (): string => {
  const bytes = randomBytes(16)
  // Set version 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // Set variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

/**
 * Generate short ID (8 chars)
 */
export const generateShortId = (): string => {
  return randomBytes(4).toString('hex')
}

/**
 * Generate nanoid-style ID
 */
export const generateNanoId = (size = 21): string => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const bytes = randomBytes(size)
  let id = ''
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i] % alphabet.length]
  }
  return id
}

// Store request ID in context (using WeakMap to avoid memory leaks)
const requestIdMap = new WeakMap<Context, string>()

/**
 * Get request ID from context
 */
export const getRequestId = (ctx: Context): string | undefined => {
  return requestIdMap.get(ctx)
}

/**
 * Create request ID/tracing wrapper
 */
export const tracing = (options: TracingOptions = {}): Wrapper<Context> => {
  const {
    header = 'x-request-id',
    generator = defaultGenerator,
    trustIncoming = true,
    setResponse = true,
  } = options

  const headerLower = header.toLowerCase()

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      // Get or generate request ID
      let requestId = trustIncoming ? ctx.headers[headerLower] : undefined

      if (!requestId) {
        requestId = generator()
      }

      // Store request ID
      requestIdMap.set(ctx, requestId)

      // Execute handler
      const res = await handler(ctx)

      // Add request ID to response
      if (setResponse) {
        return {
          ...res,
          headers: {
            ...res.headers,
            [header]: requestId,
          },
        }
      }

      return res
    }
  }
}

/**
 * Logging wrapper with request ID
 */
export type LogFn = (msg: string, data?: Record<string, unknown>) => void

export type LoggingOptions = {
  /** Log function */
  readonly log?: LogFn
  /** Include request timing */
  readonly timing?: boolean
  /** Skip logging for certain requests */
  readonly skip?: (ctx: Context) => boolean
}

export const logging = (options: LoggingOptions = {}): Wrapper<Context> => {
  const {
    log = console.log,
    timing = true,
    skip,
  } = options

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      if (skip?.(ctx)) {
        return handler(ctx)
      }

      const start = timing ? performance.now() : 0
      const requestId = getRequestId(ctx)

      try {
        const res = await handler(ctx)

        const duration = timing ? performance.now() - start : undefined

        log(`${ctx.method} ${ctx.path}`, {
          status: res.status,
          duration: duration ? `${duration.toFixed(2)}ms` : undefined,
          requestId,
        })

        return res
      } catch (error) {
        const duration = timing ? performance.now() - start : undefined

        log(`${ctx.method} ${ctx.path} ERROR`, {
          error: error instanceof Error ? error.message : String(error),
          duration: duration ? `${duration.toFixed(2)}ms` : undefined,
          requestId,
        })

        throw error
      }
    }
  }
}
