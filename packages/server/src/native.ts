/**
 * Native Server Integration
 *
 * Transparently accelerates routes using Rust native HTTP server.
 * Falls back to WASM, then pure JS for edge/serverless environments.
 *
 * Performance: ~220k req/s consistent across all runtimes (Bun, Node.js, Deno)
 *
 * Architecture:
 * - Native (napi-rs): Primary backend, maximum performance
 * - WASM fallback: Edge/serverless environments with WASM support
 * - Pure JS fallback: Environments without native or WASM support
 *
 * This module is a thin barrel over the cohesive concern modules in
 * `./native/*`. The public surface is identical to the previous
 * single-file implementation; see `./native/index` for the re-exports.
 */

export * from './native/index'
