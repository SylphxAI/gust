# @sylphx/gust-server

> High-performance Rust-powered HTTP server - 220k+ requests/second

[![npm](https://img.shields.io/npm/v/@sylphx/gust-server)](https://www.npmjs.com/package/@sylphx/gust-server)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Performance

| Runtime | Requests/sec | Latency |
|---------|-------------|---------|
| **Node.js** | **215,821** | 446μs |
| **Bun** | **232,704** | 417μs |

> Benchmarks: `bombardier -c 500 -d 10s` on Apple M3 Max

## Features

- **Native Rust** - Powered by Hyper + Tokio via napi-rs
- **Multi-core** - Automatic worker pool utilizing all CPU cores
- **io_uring** - Linux kernel async I/O for maximum throughput
- **HTTP/2** - Full HTTP/2 support with server push
- **WebSocket** - Native WebSocket with binary/text frames
- **SSE** - Server-Sent Events with backpressure handling
- **Streaming** - File streaming, range requests for media
- **Production** - Health checks, circuit breakers, OpenTelemetry

## When to Use

Use `@sylphx/gust-server` when you need:

- **Maximum performance** - Native Rust server with io_uring
- **Long-lived connections** - WebSocket, SSE, HTTP/2 streams
- **Multi-core scaling** - Automatic cluster mode
- **Production features** - Health checks, graceful shutdown, OpenTelemetry

For portable serverless apps, see [@sylphx/gust-app](../app).

## Installation

```bash
bun add @sylphx/gust-server @sylphx/gust-app
# or
npm install @sylphx/gust-server @sylphx/gust-app
```

## Quick Start

```typescript
import { createApp, get, json } from '@sylphx/gust-app'
import { serve } from '@sylphx/gust-server'

const app = createApp({
  routes: [
    get('/', () => json({ message: 'Hello World' })),
    get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
  ],
})

await serve({ app, port: 3000 })
// Server running at http://localhost:3000
// Using native Rust acceleration (215k+ req/s)
```

## API

### serve

Start the HTTP server with native acceleration.

```typescript
import { serve } from '@sylphx/gust-server'
import { createApp, get, json, cors } from '@sylphx/gust-app'

const app = createApp({
  routes: [get('/', () => json({ hello: 'world' }))],
  middleware: cors(),
})

const server = await serve({
  // App instance (recommended)
  app,

  // Or legacy options
  routes: [...],
  middleware: cors(),
  fetch: handler,

  // Server options
  port: 3000,
  hostname: '0.0.0.0',

  // TLS (HTTPS)
  tls: {
    cert: './cert.pem',
    key: './key.pem',
  },

  // Callbacks
  onListen: ({ port, hostname }) => {
    console.log(`Server running at http://${hostname}:${port}`)
  },
  onError: (error) => {
    console.error('Server error:', error)
  },
})

// Graceful shutdown
await server.close()
```

### Cluster Mode

Automatically spawn workers across all CPU cores.

```typescript
import { clusterServe, isPrimary, isWorker } from '@sylphx/gust-server'

if (isPrimary()) {
  console.log('Primary process starting workers...')
}

await clusterServe({
  app,
  port: 3000,
  workers: 4,  // or 'auto' for CPU count
  onWorkerStart: (worker) => {
    console.log(`Worker ${worker.id} started`)
  },
})
```

### HTTP/2

Full HTTP/2 support with server push.

```typescript
import { serveHttp2, pushResource, isHttp2 } from '@sylphx/gust-server'

await serveHttp2({
  app,
  port: 443,
  cert: './cert.pem',
  key: './key.pem',
})

// Server push
get('/page', ({ ctx }) => {
  if (isHttp2(ctx)) {
    pushResource(ctx, '/styles.css')
    pushResource(ctx, '/script.js')
  }
  return html('<html>...</html>')
})
```

### WebSocket

Native WebSocket support with binary frames.

```typescript
import { websocket, WebSocket } from '@sylphx/gust-server'

await serve({
  port: 3000,
  fetch: websocket({
    open: (ws) => {
      console.log('Client connected')
      ws.send('Welcome!')
    },
    message: (ws, message) => {
      if (typeof message === 'string') {
        ws.send(`Echo: ${message}`)
      } else {
        // Binary data
        ws.send(message)
      }
    },
    close: (ws, code, reason) => {
      console.log(`Client disconnected: ${code}`)
    },
  }),
})
```

### Server-Sent Events

```typescript
import { sse, nativeSSE } from '@sylphx/gust-server'

// Generator mode (pull-based)
get('/events', () =>
  sse(async function* () {
    for (let i = 0; i < 10; i++) {
      yield { data: { count: i }, id: String(i) }
      await new Promise(r => setTimeout(r, 1000))
    }
  })
)

// Handler mode (push-based)
get('/notifications', () =>
  sse(async (emit) => {
    emit({ data: 'connected' })

    const handler = (data: unknown) => emit({ data })
    pubsub.subscribe('updates', handler)

    return () => pubsub.unsubscribe('updates', handler)
  })
)

// Native SSE (for GustServer direct integration)
get('/native-sse', ({ ctx }) =>
  nativeSSE(ctx, async (writer) => {
    await writer.send({ data: 'hello' })
    await writer.send({ data: 'world', event: 'update' })
    writer.close()
  })
)
```

### Streaming

```typescript
import {
  stream,
  streamText,
  streamFile,
  ndjsonStream,
  createJsonStream,
} from '@sylphx/gust-server'

// Text streaming
get('/text', () =>
  streamText(async function* () {
    yield 'Hello '
    yield 'World!'
  })
)

// File streaming with range support
get('/video/:name', ({ ctx }) =>
  streamFile(`./videos/${ctx.params.name}`, {
    contentType: 'video/mp4',
  })
)

// NDJSON streaming
get('/data', () =>
  ndjsonStream(async function* () {
    yield { id: 1, name: 'Alice' }
    yield { id: 2, name: 'Bob' }
  })
)

// JSON array streaming
get('/items', () =>
  createJsonStream(async function* () {
    yield { id: 1 }
    yield { id: 2 }
  })
)
```

### Range Requests

Support for video/audio seeking and resumable downloads.

```typescript
import { serveRangeFile, rangeServer } from '@sylphx/gust-server'

// Single file
get('/video/:id', ({ ctx }) =>
  serveRangeFile(ctx, `./videos/${ctx.params.id}.mp4`)
)

// Directory server
const mediaHandler = rangeServer({
  root: './media',
  maxAge: 86400,
  extensions: ['.mp4', '.webm', '.mp3'],
})
```

### Static Files

```typescript
import { serveStatic } from '@sylphx/gust-server'

await serve({
  app,
  fallback: serveStatic({
    root: './public',
    index: ['index.html'],
    maxAge: 86400,
    immutable: false,
    etag: true,
    lastModified: true,
    dotfiles: 'ignore',
  }),
})
```

### Health Checks

Kubernetes-ready health endpoints.

```typescript
import {
  health,
  liveness,
  readiness,
  startup,
  healthCheck,
  memoryCheck,
  eventLoopCheck,
  httpCheck,
  customCheck,
  metrics,
  prometheusMetrics,
} from '@sylphx/gust-server'

const routes = [
  // Simple probes
  get('/healthz', liveness()),
  get('/ready', readiness([memoryCheck(90)])),
  get('/startup', startup([httpCheck('http://db:5432')])),

  // Detailed health
  get('/health', health({
    checks: [
      memoryCheck(90),
      eventLoopCheck(100),
      customCheck('database', async () => {
        await db.ping()
        return { healthy: true }
      }),
    ],
    detailed: true,
  })),

  // Metrics
  get('/metrics', metrics()),
  get('/metrics/prometheus', prometheusMetrics()),
]
```

### Circuit Breaker

Protect against cascading failures.

```typescript
import { circuitBreaker, bulkhead, withCircuitBreaker } from '@sylphx/gust-server'

// As middleware
get('/external', compose(
  circuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenRequests: 3,
  }),
  async () => {
    const res = await fetch('https://api.example.com')
    return json(await res.json())
  }
))

// Manual usage
const breaker = withCircuitBreaker('api', {
  failureThreshold: 5,
  resetTimeout: 30000,
})

const result = await breaker.execute(async () => {
  return fetch('https://api.example.com')
})

// Bulkhead (limit concurrent requests)
get('/limited', compose(
  bulkhead({ maxConcurrent: 10, maxQueue: 100 }),
  handler
))
```

### OpenTelemetry

Distributed tracing and metrics.

```typescript
import {
  otel,
  createTracer,
  consoleExporter,
  createOtlpExporter,
  MetricsCollector,
} from '@sylphx/gust-server'

// Console exporter (development)
const tracer = createTracer(consoleExporter)

// OTLP exporter (production)
const tracer = createTracer(createOtlpExporter({
  endpoint: 'http://jaeger:4318/v1/traces',
  headers: { 'Authorization': 'Bearer token' },
}))

await serve({
  app,
  middleware: otel({
    tracer,
    serviceName: 'my-service',
    recordHeaders: true,
    recordBody: false,
  }),
})

// Manual spans
import { startChildSpan, getSpan } from '@sylphx/gust-server'

get('/process', async ({ ctx }) => {
  const parentSpan = getSpan(ctx)

  const childSpan = startChildSpan(parentSpan, 'database-query')
  try {
    const result = await db.query('SELECT * FROM users')
    childSpan.end()
    return json(result)
  } catch (error) {
    childSpan.recordError(error)
    childSpan.end()
    throw error
  }
})

// Metrics
const metrics = new MetricsCollector()
metrics.counter('requests_total').inc()
metrics.histogram('response_time').observe(0.123)
metrics.gauge('active_connections').set(42)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @sylphx/gust-server                       │
│            serve() • cluster • HTTP/2 • WebSocket            │
├─────────────────────────────────────────────────────────────┤
│                    @sylphx/gust-app                          │
│         createApp() • routes • middleware • context          │
├─────────────────────────────────────────────────────────────┤
│                   @sylphx/gust-core                          │
│              WASM Router • Response Helpers                  │
├─────────────────────────┬───────────────────────────────────┤
│     Native (Rust)       │          WASM Fallback            │
│   hyper + tokio         │       Universal runtime           │
│   napi-rs bindings      │       HTTP parser + router        │
│   io_uring on Linux     │                                   │
│   215K+ req/s           │                                   │
└─────────────────────────┴───────────────────────────────────┘
```

### Native Layer

- **Hyper** - HTTP/1.1 and HTTP/2 implementation
- **Tokio** - Async runtime with work-stealing scheduler
- **napi-rs** - Node.js native addon bindings
- **mimalloc** - Fast memory allocator
- **io_uring** - Linux kernel async I/O (when available)

## Bundle Size

| Component | Size |
|-----------|------|
| JavaScript | 73 KB |
| Type Definitions | 41 KB |
| Native Binary | 1.7 MB |

Native binaries are platform-specific. CI builds for:
- Linux (x64, arm64)
- macOS (x64, arm64)
- Windows (x64)

## License

MIT

---

Built with [Sylphx](https://github.com/SylphxAI)
