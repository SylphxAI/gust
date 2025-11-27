/**
 * Function composition utilities
 * Pure functional approach - no middleware state
 * Generic types for maximum flexibility
 */

import type { ServerResponse } from './response'

/**
 * Generic handler type
 * Takes any context and returns a response
 */
export type Handler<Ctx = unknown> = (ctx: Ctx) => ServerResponse | Promise<ServerResponse>

/**
 * Generic wrapper type
 * Transforms a handler into another handler
 */
export type Wrapper<Ctx = unknown> = (handler: Handler<Ctx>) => Handler<Ctx>

/**
 * Compose wrappers from left to right (outer to inner)
 * compose(a, b, c)(handler) = a(b(c(handler)))
 *
 * Example:
 *   compose(withLog, withAuth, withCache)(myHandler)
 *   Request flow: withLog -> withAuth -> withCache -> myHandler
 */
export const compose = <Ctx>(...wrappers: Wrapper<Ctx>[]): Wrapper<Ctx> =>
  (handler) => wrappers.reduceRight((h, wrapper) => wrapper(h), handler)

/**
 * Pipe wrappers from left to right (inner to outer)
 * pipe(a, b, c)(handler) = c(b(a(handler)))
 */
export const pipe = <Ctx>(...wrappers: Wrapper<Ctx>[]): Wrapper<Ctx> =>
  (handler) => wrappers.reduce((h, wrapper) => wrapper(h), handler)
