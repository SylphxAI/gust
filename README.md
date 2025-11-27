# @sylphx/gust

> High-performance WASM-powered HTTP server framework for Bun

[![CI](https://github.com/SylphxAI/gust/actions/workflows/ci.yml/badge.svg)](https://github.com/SylphxAI/gust/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sylphx/gust)](https://www.npmjs.com/package/@sylphx/gust)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Packages

| Package | Description |
|---------|-------------|
| [@sylphx/gust](./packages/serve) | Full-featured HTTP server framework |
| [@sylphx/gust-core](./packages/core) | Core WASM runtime and response utilities |

## Features

- 🚀 **WASM-powered** - Ultra-fast HTTP parsing and Radix Trie routing
- 🔒 **Security** - Built-in CORS, CSRF, rate limiting, JWT auth
- 📦 **Zero config** - Sensible defaults, works out of the box
- 🎯 **Type-safe** - Full TypeScript support with path param inference
- ⚡ **Streaming** - SSE, WebSocket, range requests for media
- 🏥 **Production-ready** - Health checks, graceful shutdown, OpenTelemetry

## Quick Start

```bash
bun add @sylphx/gust
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

# Type check
bun run typecheck

# Lint
bun run lint
```

## License

MIT

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
