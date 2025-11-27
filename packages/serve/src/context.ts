/**
 * Request Context - immutable request wrapper
 * Provides convenient access to request data
 */

import type { Socket } from 'node:net'
import type { ParseResult } from '@aspect/serve-core'
import { MethodNames, type MethodCode } from '@aspect/serve-core'

export type Context = {
  readonly method: string
  readonly path: string
  readonly query: string
  readonly headers: Readonly<Record<string, string>>
  readonly params: Readonly<Record<string, string>>
  readonly body: Buffer
  readonly json: <T>() => T
  readonly raw: Buffer
  readonly socket: Socket
}

/**
 * Create context from parsed request
 */
export const createContext = (
  socket: Socket,
  raw: Buffer,
  parsed: ParseResult,
  headers: Record<string, string>,
  params: Record<string, string> = {}
): Context => {
  const decoder = new TextDecoder()

  const method = MethodNames[parsed.method as MethodCode] || 'UNKNOWN'
  const path = decoder.decode(raw.subarray(parsed.path_start, parsed.path_end))
  const query = parsed.query_start > 0
    ? decoder.decode(raw.subarray(parsed.query_start, parsed.query_end))
    : ''

  const body = raw.subarray(parsed.body_start)

  return {
    method,
    path,
    query,
    headers,
    params,
    body,
    json: <T>() => JSON.parse(body.toString()) as T,
    raw,
    socket,
  }
}

/**
 * Create context with updated params (for router)
 */
export const withParams = (
  ctx: Context,
  params: Record<string, string>
): Context => ({
  ...ctx,
  params: { ...ctx.params, ...params },
})

/**
 * Parse headers from raw buffer using WASM offsets
 */
export const parseHeaders = (
  raw: Buffer,
  offsets: Uint32Array,
  count: number
): Record<string, string> => {
  const headers: Record<string, string> = {}
  const decoder = new TextDecoder()

  for (let i = 0; i < count; i++) {
    const nameStart = offsets[i * 4]
    const nameEnd = offsets[i * 4 + 1]
    const valueStart = offsets[i * 4 + 2]
    const valueEnd = offsets[i * 4 + 3]

    const name = decoder.decode(raw.subarray(nameStart, nameEnd)).toLowerCase()
    const value = decoder.decode(raw.subarray(valueStart, valueEnd))
    headers[name] = value
  }

  return headers
}
