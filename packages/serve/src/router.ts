/**
 * Router - WASM-powered Radix Trie routing
 * Pure functional design with O(k) lookup
 */

import type { Context } from './context'
import type { ServerResponse, Handler, WasmRouter } from '@aspect/serve-core'
import { getWasm, notFound } from '@aspect/serve-core'
import { withParams } from './context'

export type Route = {
  readonly method: string
  readonly path: string
  readonly handler: Handler<Context>
}

// HTTP method helpers
export const get = (path: string, handler: Handler<Context>): Route => ({
  method: 'GET',
  path,
  handler,
})

export const post = (path: string, handler: Handler<Context>): Route => ({
  method: 'POST',
  path,
  handler,
})

export const put = (path: string, handler: Handler<Context>): Route => ({
  method: 'PUT',
  path,
  handler,
})

export const patch = (path: string, handler: Handler<Context>): Route => ({
  method: 'PATCH',
  path,
  handler,
})

export const del = (path: string, handler: Handler<Context>): Route => ({
  method: 'DELETE',
  path,
  handler,
})

export const head = (path: string, handler: Handler<Context>): Route => ({
  method: 'HEAD',
  path,
  handler,
})

export const options = (path: string, handler: Handler<Context>): Route => ({
  method: 'OPTIONS',
  path,
  handler,
})

// Match any method
export const all = (path: string, handler: Handler<Context>): Route => ({
  method: '*',
  path,
  handler,
})

/**
 * Create a router from routes
 * Routes are compiled into WASM Radix Trie lazily on first request
 */
export const router = (...routes: Route[]): Handler<Context> => {
  let wasmRouter: WasmRouter | null = null
  const handlers: Handler<Context>[] = []

  // Lazy initialization of WASM router
  const initRouter = () => {
    if (wasmRouter) return wasmRouter

    const wasm = getWasm()
    wasmRouter = new wasm.WasmRouter()

    // Build WASM trie
    for (const route of routes) {
      const handlerId = handlers.length
      handlers.push(route.handler)
      wasmRouter.insert(route.method, route.path, handlerId)

      // Also insert wildcard routes for all common methods
      if (route.method === '*') {
        for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
          wasmRouter.insert(method, route.path, handlerId)
        }
      }
    }

    return wasmRouter
  }

  return (ctx: Context): ServerResponse | Promise<ServerResponse> => {
    const r = initRouter()
    const match = r.find(ctx.method, ctx.path)

    if (match.found) {
      const handler = handlers[match.handler_id]
      const params: Record<string, string> = {}

      // Convert params array [key, value, key, value, ...] to object
      const paramArray = match.params
      for (let i = 0; i < paramArray.length; i += 2) {
        params[paramArray[i]] = paramArray[i + 1]
      }

      match.free() // Free WASM memory
      return handler(withParams(ctx, params))
    }

    match.free()
    return notFound()
  }
}

/**
 * Group routes with a prefix
 */
export const group = (prefix: string, ...routes: Route[]): Route[] =>
  routes.map((route) => ({
    ...route,
    path: `${prefix}${route.path}`,
  }))
