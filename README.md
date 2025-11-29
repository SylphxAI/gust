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
│                        @sylphx/gust                         │
├─────────────────────────────────────────────────────────────┤
│  TypeScript API: serve(), router(), middleware, Context     │
├─────────────────────────────────────────────────────────────┤
│                    Runtime Detection                        │
├──────────────────────────┬──────────────────────────────────┤
│   Native (Rust/napi-rs)  │      WASM Fallback               │
│   • io_uring on Linux    │      • Browser compatible        │
│   • Multi-core workers   │      • Universal runtime         │
│   • 215K+ req/s Node.js  │      • HTTP parser + router      │
└──────────────────────────┴──────────────────────────────────┘
```

**Two-tier architecture:**
1. **Native tier** (Rust + napi-rs): Maximum performance on Node.js with io_uring support on Linux
2. **WASM tier**: Cross-platform fallback with WASM HTTP parser and Radix Trie router

## Packages

| Package | Description | Size |
|---------|-------------|------|
| [@sylphx/gust](./packages/serve) | Full-featured HTTP server framework | ~200KB |
| [@sylphx/gust-core](./packages/core) | Core WASM runtime and response utilities | ~4KB |

## Features

- 🚀 **Native Performance** - Rust-powered with io_uring on Linux, multi-core workers
- 🌐 **Universal** - Works on Bun, Node.js, and browsers (WASM fallback)
- 🔒 **Security** - Built-in CORS, CSRF, rate limiting, JWT auth
- 📦 **Zero config** - Sensible defaults, works out of the box
- 🎯 **Type-safe** - Full TypeScript support with path param inference
- ⚡ **Streaming** - SSE, WebSocket, range requests for media
- 🏥 **Production-ready** - Health checks, graceful shutdown, OpenTelemetry

## Quick Start

```bash
bun add @sylphx/gust
# or
npm install @sylphx/gust
```

```typescript
import { serve, router, get, json, compose, cors, rateLimit } from '@sylphx/gust'

// Define routes
const home = get('/', () => json({ message: 'Hello World!' }))
const user = get('/users/:id', (ctx) => json({ id: ctx.params.id }))

// Create router with named routes
const app = router({ home, user })

// Type-safe URL generation
app.url.home()           // "/"
app.url.user({ id: 42 }) // "/users/42"

// Apply middleware and serve
const handler = compose(
  cors(),
  rateLimit({ max: 100, window: 60000 }),
  app.handler
)

serve({ port: 3000, fetch: handler })
```

## Documentation

See individual package READMEs:
- [@sylphx/gust documentation](./packages/serve/README.md)
- [@sylphx/gust-core documentation](./packages/core/README.md)

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build native bindings
cd crates/gust-napi && bun run build

# Run benchmarks
bun run benchmarks/servers/gust.ts
```

## License

MIT

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
