/**
 * Request Context
 *
 * Single unified context type with app always present.
 * Middleware is polymorphic over App type.
 */

import type { Socket } from 'node:net'
import type { ParseResult } from '@sylphx/gust-core'
import { type MethodCode, MethodNames } from '@sylphx/gust-core'

// =============================================================================
// Context Type
// =============================================================================

/**
 * Request context with HTTP data and user's app context
 *
 * @example
 * ```typescript
 * type App = { db: Database; user: User }
 *
 * get<App>('/users', ({ ctx }) => {
 *   ctx.method      // HTTP request data
 *   ctx.app.db      // User's app context
 *   ctx.app.user    // Per-request context
 * })
 * ```
 */
export type Context<App = Record<string, never>> = {
	readonly method: string
	readonly path: string
	readonly query: string
	readonly headers: Readonly<Record<string, string>>
	readonly params: Readonly<Record<string, string>>
	readonly body: Buffer
	readonly json: <T>() => T
	readonly raw: Buffer
	readonly socket: Socket
	readonly app: App
}

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Handler arguments with context and validated input
 */
export type HandlerArgs<App = Record<string, never>, Input = void> = {
	readonly ctx: Context<App>
	readonly input: Input
}

/**
 * Route handler function
 */
export type RouteHandler<App = Record<string, never>, Input = void> = (
	args: HandlerArgs<App, Input>
) =>
	| import('@sylphx/gust-core').ServerResponse
	| Promise<import('@sylphx/gust-core').ServerResponse>

// =============================================================================
// Internal Types (for parsing)
// =============================================================================

/**
 * Raw parsed context (internal - before app is added)
 * @internal
 */
export type RawContext = Omit<Context<never>, 'app'>

// =============================================================================
// Context Creation
// =============================================================================

/**
 * Create raw context from parsed request
 * Returns RawContext (without app) - app is added by serve()
 */
export const createRawContext = (
	socket: Socket,
	raw: Buffer,
	parsed: ParseResult,
	headers: Record<string, string>,
	params: Record<string, string> = {}
): RawContext => {
	const decoder = new TextDecoder()

	const method = MethodNames[parsed.method as MethodCode] || 'UNKNOWN'
	const path = decoder.decode(raw.subarray(parsed.path_start, parsed.path_end))
	const query =
		parsed.query_start > 0 ? decoder.decode(raw.subarray(parsed.query_start, parsed.query_end)) : ''

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
 * Add app context to raw context
 * @internal
 */
export const withApp = <App>(raw: RawContext, app: App): Context<App> =>
	({ ...raw, app }) as Context<App>

/**
 * Create context with updated params
 * @internal
 */
export const withParams = <App>(ctx: Context<App>, params: Record<string, string>): Context<App> =>
	({
		...ctx,
		params: { ...ctx.params, ...params },
	}) as Context<App>

/**
 * Parse headers from raw buffer using WASM offsets
 * @internal
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

// =============================================================================
// Legacy Compatibility
// =============================================================================

/**
 * BaseContext - alias for Context with empty app
 * @deprecated Use Context<App> directly
 */
export type BaseContext = Context<Record<string, never>>

/**
 * Legacy alias for createRawContext
 * @deprecated Use createRawContext instead
 */
export const createContext = createRawContext
