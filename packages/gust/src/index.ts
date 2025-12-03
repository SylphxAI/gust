/**
 * @sylphx/gust
 * High-performance HTTP server framework with native Rust bindings
 *
 * This is the main package that re-exports from:
 * - @sylphx/gust-app: Stateless HTTP application framework (portable)
 * - @sylphx/gust-server: High-performance Rust-powered HTTP server (NAPI)
 *
 * @example
 * ```typescript
 * import { createApp, get, json, serve } from '@sylphx/gust'
 *
 * const app = createApp({
 *   routes: [
 *     get('/users', () => json({ users: [] })),
 *     get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
 *   ],
 * })
 *
 * // Start server with native Rust acceleration
 * serve({ app, port: 3000 })
 * ```
 */

// ============================================================================
// Re-export everything from @sylphx/gust-app
// Stateless HTTP application framework - portable across runtimes
// ============================================================================

export * from '@sylphx/gust-app'

// ============================================================================
// Re-export everything from @sylphx/gust-server
// High-performance Rust-powered HTTP server
// ============================================================================

export * from '@sylphx/gust-server'
