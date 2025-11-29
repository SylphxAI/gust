/**
 * Request Context - immutable request wrapper
 * Provides convenient access to request data
 *
 * Two-layer design:
 * - BaseContext: HTTP request data (library-provided)
 * - Context<App>: BaseContext + user's app context
 */

import type { Socket } from 'node:net'
import type { ParseResult } from '@sylphx/gust-core'
import { type MethodCode, MethodNames } from '@sylphx/gust-core'

// =============================================================================
// Base Context (library-provided HTTP request data)
// =============================================================================

/**
 * Base context with HTTP request data
 * These fields are provided by the library and won't collide with user context
 */
export type BaseContext = {
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

// =============================================================================
// Full Context (BaseContext + user's App context)
// =============================================================================

/**
 * Full context with user's app context namespaced under 'app'
 *
 * @example
 * ```typescript
 * type AppContext = { db: Database; user: User }
 *
 * get<AppContext>('/users', ({ ctx }) => {
 *   ctx.method      // Library (HTTP request)
 *   ctx.app.db      // User (static)
 *   ctx.app.user    // User (per-request)
 * })
 * ```
 */
export type Context<App = Record<string, never>> = BaseContext & {
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
// Legacy Context (for backward compatibility)
// =============================================================================

/**
 * Legacy context type (deprecated, use Context<App> instead)
 * @deprecated Use Context<App> for new code
 */
export type LegacyContext = BaseContext

/**
 * Create context from parsed request
 * Returns BaseContext (without app) - app is added by serve()
 */
export const createContext = (
	socket: Socket,
	raw: Buffer,
	parsed: ParseResult,
	headers: Record<string, string>,
	params: Record<string, string> = {}
): BaseContext => {
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
 * Create context with updated params (for router)
 */
export const withParams = <T extends BaseContext>(ctx: T, params: Record<string, string>): T => ({
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
