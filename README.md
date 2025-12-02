# @sylphx/gust

> High-performance HTTP server framework for Bun and Node.js

[![CI](https://github.com/SylphxAI/gust/actions/workflows/ci.yml/badge.svg)](https://github.com/SylphxAI/gust/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sylphx/gust)](https://www.npmjs.com/package/@sylphx/gust)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Performance

### Bun Runtime

| Framework | Requests/sec | Relative |
|-----------|-------------|----------|
| **Gust** | **232,704** | **1.00x** |
| Elysia | 192,386 | 0.83x |
| Bun.serve | 183,716 | 0.79x |
| Hono | 157,729 | 0.68x |
| Express | 47,343 | 0.20x |

### Node.js Runtime

| Framework | Requests/sec | Relative |
|-----------|-------------|----------|
| **Gust (Native)** | **215,821** | **1.00x** |
| Fastify | 123,456 | 0.57x |
| Express | 18,234 | 0.08x |

> Benchmarks: `bombardier -c 500 -d 10s http://localhost:3000` on Apple M3 Max

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        @sylphx/gust                          │
│                    (main package)                            │
├─────────────────────────┬───────────────────────────────────┤
│    @sylphx/gust-app     │       @sylphx/gust-server         │
│   Stateless framework   │      Rust HTTP server             │
│   • createApp()         │      • serve()                    │
│   • Routes, middleware  │      • Cluster, HTTP/2            │
│   • WASM router         │      • WebSocket, SSE             │
│   • Portable            │      • Native acceleration        │
├─────────────────────────┴───────────────────────────────────┤
│                    @sylphx/gust-core                         │
│              WASM Router • Response Helpers                  │
├─────────────────────────┬───────────────────────────────────┤
│     Native (Rust)       │          WASM Fallback            │
│   hyper + tokio         │       Universal runtime           │
│   napi-rs bindings      │       HTTP parser + router        │
│   io_uring on Linux     │                                   │
│   215K+ req/s           │                                   │
└─────────────────────────┴───────────────────────────────────┘
```

**Modular design:**
- **@sylphx/gust** - Main package, re-exports everything
- **@sylphx/gust-app** - Portable app framework (serverless, edge, any runtime)
- **@sylphx/gust-server** - Native Rust server (maximum performance)
- **@sylphx/gust-core** - Core WASM runtime and utilities

## Packages

| Package | Description | Size |
|---------|-------------|------|
| [@sylphx/gust](./packages/gust) | Main package (re-exports both) | ~87 B |
| [@sylphx/gust-app](./packages/app) | Stateless app framework | 82 KB |
| [@sylphx/gust-server](./packages/server) | Rust-powered HTTP server | 73 KB |
| [@sylphx/gust-core](./packages/core) | Core WASM runtime | ~4 KB |

## Features

- **Native Performance** - Rust-powered with io_uring on Linux, multi-core workers
- **Portable Apps** - Same code on Bun, Deno, Cloudflare Workers, AWS Lambda
- **Type-safe** - Full TypeScript support with path param inference
- **Batteries included** - 20+ middleware (auth, validation, rate limiting, etc.)
- **Streaming** - SSE, WebSocket, range requests for media
- **Production-ready** - Health checks, graceful shutdown, OpenTelemetry
- **Ecosystem Compatible** - Direct integration with GraphQL Yoga, tRPC, Hono, etc.

## Quick Start

```bash
bun add @sylphx/gust
# or
npm install @sylphx/gust
```

```typescript
import { createApp, serve, get, json, cors, rateLimit, compose } from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/', () => json({ message: 'Hello World!' })),
    get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
  ],
  middleware: compose(
    cors(),
    rateLimit({ max: 100, window: 60000 }),
  ),
})

await serve({ app, port: 3000 })
```

## Usage Patterns

### Full Server (recommended)

```typescript
import { createApp, serve, get, json } from '@sylphx/gust'

const app = createApp({
  routes: [get('/', () => json({ hello: 'world' }))],
})

await serve({ app, port: 3000 })
```

### Portable App Only

For serverless/edge deployments:

```typescript
import { createApp, get, json } from '@sylphx/gust-app'

const app = createApp({
  routes: [get('/', () => json({ hello: 'world' }))],
})

// Use with any runtime
Bun.serve({ fetch: app.fetch })
Deno.serve(app.fetch)
export default { fetch: app.fetch }  // Cloudflare Workers
```

### Server Features Only

```typescript
import { serve, websocket, clusterServe } from '@sylphx/gust-server'

// WebSocket
serve({ port: 3000, fetch: websocket({ ... }) })

// Cluster mode
clusterServe({ app, workers: 4 })
```

### External Handler Integration

Seamlessly integrate GraphQL Yoga, tRPC, Hono, or any fetch-based handler:

```typescript
import { createApp, serve, all } from '@sylphx/gust'
import { createYoga } from 'graphql-yoga'

const yoga = createYoga({ schema })

const app = createApp({
  routes: [
    // Direct integration - just pass the handler!
    all('/graphql', yoga.fetch),
  ],
})

await serve({ app, port: 3000 })
```

## Documentation

See individual package READMEs for detailed API:

- [@sylphx/gust documentation](./packages/gust/README.md)
- [@sylphx/gust-app documentation](./packages/app/README.md) - Routes, middleware, validation
- [@sylphx/gust-server documentation](./packages/server/README.md) - Server, WebSocket, SSE, streaming
- [@sylphx/gust-core documentation](./packages/core/README.md)

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build all packages
bun run build

# Build native bindings
cd crates/gust-napi && bun run build

# Run benchmarks
bun run benchmarks/servers/gust.ts
```

## License

MIT

---

Built with [Sylphx](https://github.com/SylphxAI) | [@sylphx/biome-config](https://github.com/SylphxAI/biome-config) | [@sylphx/bump](https://github.com/SylphxAI/bump) | [@sylphx/doctor](https://github.com/SylphxAI/doctor)
