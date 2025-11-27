# @sylphx/gust

> High-performance WASM-powered HTTP server framework for Bun

[![CI](https://github.com/aspect-build/serve/actions/workflows/ci.yml/badge.svg)](https://github.com/aspect-build/serve/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@sylphx/gust)](https://www.npmjs.com/package/@sylphx/gust)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Packages

| Package | Description |
|---------|-------------|
| [@sylphx/gust](./packages/serve) | Full-featured HTTP server framework |
| [@sylphx/gust-core](./packages/core) | Core WASM runtime and response utilities |

## Features

- 🚀 **WASM-powered** - Ultra-fast HTTP parsing via WebAssembly
- 🔒 **Security** - Built-in CORS, CSRF, rate limiting, JWT auth
- 📦 **Zero config** - Sensible defaults, works out of the box
- 🎯 **Type-safe** - Full TypeScript support with strict types
- ⚡ **Streaming** - SSE, WebSocket-ready, range requests for media
- 🏥 **Production-ready** - Health checks, graceful shutdown, OpenTelemetry

## Quick Start

```bash
bun add @sylphx/gust
```

```typescript
import { serve, router, json, compose, cors, rateLimit } from '@sylphx/gust'

const app = compose(
  cors(),
  rateLimit({ max: 100, window: 60000 })
)

const routes = router()
  .get('/', () => json({ message: 'Hello World!' }))
  .get('/users/:id', (ctx) => json({ id: ctx.params.id }))

serve(app(routes.handler()), { port: 3000 })
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

# Build WASM
bun run build:wasm

# Type check
bun run typecheck

# Lint
bun run lint
```

## License

MIT © Aspect Build Systems

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
