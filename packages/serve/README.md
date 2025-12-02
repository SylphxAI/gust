# @sylphx/gust

> High-performance HTTP server framework for Bun and Node.js

[![CI](https://github.com/SylphxAI/gust/actions/workflows/ci.yml/badge.svg)](https://github.com/SylphxAI/gust/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sylphx/gust)](https://www.npmjs.com/package/@sylphx/gust)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Performance

| Runtime | Requests/sec | Latency |
|---------|-------------|---------|
| **Bun** | **232,704** | 417μs |
| **Node.js** | **215,821** | 446μs |

> Benchmarks: `bombardier -c 500 -d 10s` on Apple M3 Max

## Features

- **Native Rust** - 220k+ req/s with Hyper + Tokio via napi-rs
- **Portable Apps** - Same code on Bun, Deno, Cloudflare Workers, AWS Lambda
- **Type-safe** - Full TypeScript with path parameter inference
- **Batteries included** - 20+ middleware (auth, validation, rate limiting, etc.)
- **Production ready** - Health checks, circuit breakers, OpenTelemetry

## Architecture

This is the main package that re-exports from two sub-packages:

| Package | Description | Use Case |
|---------|-------------|----------|
| [@sylphx/gust-app](../app) | Stateless app framework | Serverless, Edge, portable code |
| [@sylphx/gust-server](../server) | Rust-powered HTTP server | Maximum performance, long-lived connections |

```
┌─────────────────────────────────────────────────────────────┐
│                        @sylphx/gust                          │
│                    (re-exports both)                         │
├─────────────────────────┬───────────────────────────────────┤
│    @sylphx/gust-app     │       @sylphx/gust-server         │
│   Stateless framework   │      Rust HTTP server             │
│   • createApp()         │      • serve()                    │
│   • Routes, middleware  │      • Cluster, HTTP/2            │
│   • WASM router         │      • WebSocket, SSE             │
│   • Portable            │      • Native acceleration        │
└─────────────────────────┴───────────────────────────────────┘
```

## Installation

```bash
bun add @sylphx/gust
# or
npm install @sylphx/gust
```

## Quick Start

```typescript
import { createApp, serve, get, json, cors, rateLimit, compose } from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/', () => json({ message: 'Hello World' })),
    get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
  ],
  middleware: compose(
    cors(),
    rateLimit({ max: 100, window: 60000 }),
  ),
})

// Start with native Rust acceleration
await serve({ app, port: 3000 })
```

## Usage Patterns

### Full Server (this package)

For maximum performance with native Rust server:

```typescript
import { createApp, serve, get, json } from '@sylphx/gust'

const app = createApp({
  routes: [get('/', () => json({ hello: 'world' }))],
})

await serve({ app, port: 3000 })
```

### Portable App Only

For serverless/edge, import just the app framework:

```typescript
import { createApp, get, json } from '@sylphx/gust-app'

const app = createApp({
  routes: [get('/', () => json({ hello: 'world' }))],
})

// Use with any runtime
Bun.serve({ fetch: app.fetch })
Deno.serve(app.fetch)
export default { fetch: app.fetch }  // Workers
```

### Server Features Only

For advanced server features without the app:

```typescript
import { serve, websocket, sse, clusterServe } from '@sylphx/gust-server'

// WebSocket
serve({ port: 3000, fetch: websocket({ ... }) })

// Cluster mode
clusterServe({ app, workers: 4 })
```

## Examples

### With Middleware

```typescript
import {
  createApp,
  serve,
  get,
  post,
  json,
  compose,
  cors,
  compress,
  rateLimit,
  jwtAuth,
  validate,
  object,
  string,
  getValidated,
} from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/health', () => json({ status: 'ok' })),

    get('/me', compose(
      jwtAuth({ secret: process.env.JWT_SECRET! }),
      ({ ctx }) => json(ctx.jwt)
    )),

    post('/users', compose(
      validate({
        body: object({
          name: string({ minLength: 1 }),
          email: string(),
        }),
      }),
      ({ ctx }) => json(getValidated(ctx))
    )),
  ],

  middleware: compose(
    cors(),
    compress(),
    rateLimit({ max: 100, window: 60000 }),
  ),
})

await serve({ app, port: 3000 })
```

### WebSocket

```typescript
import { serve, websocket } from '@sylphx/gust'

await serve({
  port: 3000,
  fetch: websocket({
    open: (ws) => ws.send('Welcome!'),
    message: (ws, msg) => ws.send(`Echo: ${msg}`),
    close: (ws) => console.log('Disconnected'),
  }),
})
```

### Server-Sent Events

```typescript
import { createApp, serve, get, sse } from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/events', () =>
      sse(async function* () {
        for (let i = 0; i < 10; i++) {
          yield { data: { count: i } }
          await new Promise(r => setTimeout(r, 1000))
        }
      })
    ),
  ],
})

await serve({ app, port: 3000 })
```

### Health Checks

```typescript
import { createApp, serve, get, liveness, readiness, memoryCheck } from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/healthz', liveness()),
    get('/ready', readiness([memoryCheck(90)])),
  ],
})

await serve({ app, port: 3000 })
```

### Cluster Mode

```typescript
import { createApp, clusterServe, get, json } from '@sylphx/gust'

const app = createApp({
  routes: [get('/', () => json({ pid: process.pid }))],
})

await clusterServe({ app, port: 3000, workers: 4 })
```

## API Reference

See the sub-package documentation for detailed API:

- [@sylphx/gust-app](../app/README.md) - App framework, routes, middleware
- [@sylphx/gust-server](../server/README.md) - Server, WebSocket, SSE, streaming

## Bundle Size

| Package | JS Size | Types | Native |
|---------|---------|-------|--------|
| @sylphx/gust-app | 82 KB | 47 KB | - |
| @sylphx/gust-server | 73 KB | 41 KB | 1.7 MB |
| @sylphx/gust (combined) | ~87 B | ~71 B | - |

The main package is just re-exports (~87 bytes). Tree-shaking removes unused code.

## License

MIT

---

Built with [Sylphx](https://github.com/SylphxAI) | [@sylphx/biome-config](https://github.com/SylphxAI/biome-config) | [@sylphx/bump](https://github.com/SylphxAI/bump) | [@sylphx/doctor](https://github.com/SylphxAI/doctor)
