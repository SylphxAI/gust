/**
 * Body Size Limit
 * Prevent oversized payloads from consuming server resources
 */

import type { Context } from './context'
import type { ServerResponse, Handler, Wrapper } from '@aspect/serve-core'
import { response } from '@aspect/serve-core'

export type BodyLimitOptions = {
  /** Max body size in bytes (default: 1MB) */
  readonly maxSize?: number
  /** Custom error response */
  readonly onLimit?: (ctx: Context, size: number) => ServerResponse
  /** Skip limit check for certain requests */
  readonly skip?: (ctx: Context) => boolean
}

// 1MB default
const DEFAULT_MAX_SIZE = 1024 * 1024

/**
 * Parse size string to bytes
 * Supports: 1kb, 1mb, 1gb, or raw number
 */
export const parseSize = (size: string | number): number => {
  if (typeof size === 'number') return size

  const match = size.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/)
  if (!match) return DEFAULT_MAX_SIZE

  const num = parseFloat(match[1])
  const unit = match[2] || 'b'

  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  }

  return Math.floor(num * multipliers[unit])
}

/**
 * Format bytes to human readable
 */
export const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
}

/**
 * Create body size limit wrapper
 */
export const bodyLimit = (options: BodyLimitOptions = {}): Wrapper<Context> => {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE
  const skip = options.skip
  const onLimit = options.onLimit ?? ((_, size) =>
    response(
      JSON.stringify({
        error: 'Payload Too Large',
        message: `Body exceeds ${formatSize(maxSize)} limit`,
        received: formatSize(size),
      }),
      {
        status: 413,
        headers: { 'content-type': 'application/json' },
      }
    )
  )

  return (handler: Handler<Context>): Handler<Context> => {
    return async (ctx: Context): Promise<ServerResponse> => {
      // Skip if configured
      if (skip?.(ctx)) {
        return handler(ctx)
      }

      // Check Content-Length header first (fast path)
      const contentLength = ctx.headers['content-length']
      if (contentLength) {
        const size = parseInt(contentLength, 10)
        if (!isNaN(size) && size > maxSize) {
          return onLimit(ctx, size)
        }
      }

      // For requests with body, check actual body size
      if (ctx.body && ctx.body.length > maxSize) {
        return onLimit(ctx, ctx.body.length)
      }

      return handler(ctx)
    }
  }
}

/**
 * Preset: 100KB limit (for JSON APIs)
 */
export const jsonLimit = (): Wrapper<Context> =>
  bodyLimit({ maxSize: 100 * 1024 })

/**
 * Preset: 10MB limit (for file uploads)
 */
export const uploadLimit = (): Wrapper<Context> =>
  bodyLimit({ maxSize: 10 * 1024 * 1024 })

/**
 * Preset: 50MB limit (for large uploads)
 */
export const largeUploadLimit = (): Wrapper<Context> =>
  bodyLimit({ maxSize: 50 * 1024 * 1024 })
