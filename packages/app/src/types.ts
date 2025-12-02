/**
 * Shared Types
 *
 * Core types used across the app framework.
 * Extracted to avoid circular dependencies between app.ts and middleware files.
 */

import type { Handler } from '@sylphx/gust-core'
import type { Context, RawContext } from './context'

// ============================================================================
// Context Provider
// ============================================================================

/**
 * Context provider function - creates app context for each request
 * Can be sync (static context) or async (per-request context)
 *
 * @example
 * ```typescript
 * // Static context
 * const context: ContextProvider<App> = () => ({ db: getDb() })
 *
 * // Per-request context
 * const context: ContextProvider<App> = async (raw) => ({
 *   db: getDb(),
 *   user: await getUserFromHeaders(raw.headers),
 * })
 * ```
 */
export type ContextProvider<App> = (raw: RawContext) => App | Promise<App>

// ============================================================================
// Middleware
// ============================================================================

/**
 * Middleware with bounded polymorphism
 *
 * - `Middleware` = `Middleware<unknown>` = universal, works with any App
 * - `Middleware<R>` = bounded, requires App extends R
 *
 * Middleware transforms handlers, adding cross-cutting concerns like
 * CORS, authentication, rate limiting, etc.
 *
 * @example
 * ```typescript
 * // Universal middleware - no App requirements
 * const cors = (): Middleware => <App>(handler: Handler<Context<App>>) =>
 *   async (ctx: Context<App>) => {
 *     const res = await handler(ctx)
 *     return { ...res, headers: { ...res.headers, ...corsHeaders } }
 *   }
 *
 * // Bounded middleware - requires App with userId
 * const rateLimit = (): Middleware<{ userId: string }> =>
 *   <App extends { userId: string }>(handler: Handler<Context<App>>) =>
 *     async (ctx: Context<App>) => {
 *       const key = ctx.app.userId  // Type-safe access
 *       // ... rate limit logic
 *       return handler(ctx)
 *     }
 * ```
 */
export type Middleware<RequiredApp = unknown> = <App extends RequiredApp>(
	handler: Handler<Context<App>>
) => Handler<Context<App>>

// ============================================================================
// Constants
// ============================================================================

/**
 * HTTP methods to register for wildcard (*) routes
 */
export const WILDCARD_METHODS = [
	'GET',
	'POST',
	'PUT',
	'DELETE',
	'PATCH',
	'HEAD',
	'OPTIONS',
] as const
