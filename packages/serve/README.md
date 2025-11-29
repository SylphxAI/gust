# @sylphx/gust

High performance functional HTTP server powered by WASM.

## Features

- **Fast** - Native Rust server with WASM fallback, Radix Trie router
- **Functional** - Composable middleware with `pipe()` and `compose()`
- **Type-safe** - Full TypeScript support with path param inference
- **Zero dependencies** - Core functionality built-in
- **Bun-first** - Optimized for Bun runtime

### Built-in Middleware

| Category | Features |
|----------|----------|
| **Protocol** | HTTP/1.1, HTTP/2, WebSocket, SSE |
| **Security** | CORS, CSRF, Security headers, Rate limiting |
| **Auth** | Basic, Bearer, API Key, HMAC, JWT, Session |
| **Performance** | Compression, Caching, Circuit breaker, Cluster |
| **Observability** | Tracing, Logging, Health checks, OpenTelemetry |
| **Utilities** | Validation, Body parsing, Cookies, Static files |

## Installation

```bash
bun add @sylphx/gust
```

## Quick Start

```typescript
import { serve, get, json } from '@sylphx/gust'

const routes = [
  get('/', () => json({ message: 'Hello World' })),
  get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
]

serve({ routes, port: 3000 })
```

## Examples

### With App Context

```typescript
import { serve, createRouter, json, notFound } from '@sylphx/gust'

// Define your app context type
type App = {
  db: Database
  user: User | null
}

// Create typed route builders
const { get, post } = createRouter<App>()

const routes = [
  get('/users', ({ ctx }) => {
    const users = ctx.app.db.getUsers()
    return json(users)
  }),

  get('/users/:id', ({ ctx }) => {
    const user = ctx.app.db.getUser(ctx.params.id)
    return user ? json(user) : notFound()
  }),

  get('/profile', ({ ctx }) => {
    return ctx.app.user
      ? json(ctx.app.user)
      : notFound()
  }),
]

serve({
  routes,
  context: (baseCtx) => ({
    db: createDatabase(),
    user: getUserFromToken(baseCtx.headers.authorization),
  }),
  port: 3000,
})
```

### With Middleware

```typescript
import {
  serve,
  get,
  post,
  json,
  compose,
  cors,
  compress,
  rateLimit,
  jwtAuth,
  getJwtPayload,
  parseJsonBody,
} from '@sylphx/gust'

const routes = [
  get('/health', () => json({ status: 'ok' })),
  get('/me', ({ ctx }) => json(getJwtPayload(ctx))),
  post('/posts', async ({ ctx }) => {
    const body = await parseJsonBody(ctx)
    return json({ created: body })
  }),
]

serve({
  routes,
  middleware: compose(
    cors(),
    compress(),
    rateLimit({ max: 100, window: 60000 }),
    jwtAuth({ secret: process.env.JWT_SECRET! }),
  ),
  port: 3000,
})
```

### WebSocket

```typescript
import { serve, websocket } from '@sylphx/gust'

serve({
  port: 3000,
  fetch: websocket({
    open: (ws) => console.log('Connected'),
    message: (ws, msg) => ws.send(`Echo: ${msg}`),
    close: (ws) => console.log('Disconnected'),
  }),
})
```

### Streaming (SSE)

```typescript
import { serve, get, sse } from '@sylphx/gust'

const routes = [
  // Generator mode (pull-based) - for known sequences
  get('/countdown', () =>
    sse(async function* () {
      for (let i = 10; i >= 0; i--) {
        yield { data: { count: i } }
        await new Promise((r) => setTimeout(r, 1000))
      }
    })
  ),

  // Handler mode (push-based) - for external events
  get('/notifications', () =>
    sse(async (emit) => {
      emit({ data: 'connected' })

      const handler = (data: unknown) => emit({ data })
      pubsub.subscribe('updates', handler)

      // Return cleanup function
      return () => pubsub.unsubscribe('updates', handler)
    })
  ),
]

serve({ routes, port: 3000 })
```

### Streaming (NDJSON)

```typescript
import { serve, get, ndjsonStream } from '@sylphx/gust'

const routes = [
  get('/data', () =>
    ndjsonStream(async function* () {
      yield { id: 1, name: 'Alice' }
      yield { id: 2, name: 'Bob' }
      yield { id: 3, name: 'Charlie' }
    })
  ),
]

serve({ routes, port: 3000 })
```

### Streaming (File)

```typescript
import { createReadStream } from 'node:fs'
import { serve, get, streamFile } from '@sylphx/gust'

const routes = [
  get('/download', () =>
    streamFile(createReadStream('./large-file.zip'), {
      headers: { 'content-type': 'application/zip' },
    })
  ),
]

serve({ routes, port: 3000 })
```

### Static Files

```typescript
import { serve, get, json, serveStatic } from '@sylphx/gust'

const routes = [
  get('/api/hello', () => json({ hello: 'world' })),
]

serve({
  routes,
  fallback: serveStatic({ root: './public' }),
  port: 3000,
})
```

### Health Checks (Kubernetes)

```typescript
import { serve, get, liveness, readiness, health, memoryCheck } from '@sylphx/gust'

const routes = [
  get('/healthz', liveness()),
  get('/ready', readiness([memoryCheck(90)])),
  get('/health', health({ checks: [memoryCheck(90)], detailed: true })),
]

serve({ routes, port: 3000 })
```

### Validation

```typescript
import { serve, post, json, compose, validate, object, string, email, number, getValidated } from '@sylphx/gust'

const routes = [
  post('/users', compose(
    validate({
      body: object({
        name: string({ minLength: 1 }),
        email: email(),
        age: number({ min: 0 }),
      }),
    }),
    async ({ ctx }) => {
      const data = getValidated(ctx)
      return json({ user: data })
    }
  )),
]

serve({ routes, port: 3000 })
```

### Session & CSRF

```typescript
import { serve, get, post, html, json, compose, session, csrf, getCsrfToken, getSession } from '@sylphx/gust'

const routes = [
  get('/form', ({ ctx }) => html(`
    <form method="POST" action="/submit">
      <input type="hidden" name="_csrf" value="${getCsrfToken(ctx)}">
      <button type="submit">Submit</button>
    </form>
  `)),

  post('/submit', ({ ctx }) => {
    const sess = getSession(ctx)
    sess.data.visits = ((sess.data.visits as number) || 0) + 1
    return json({ visits: sess.data.visits })
  }),
]

serve({
  routes,
  middleware: compose(
    session({ secret: 'your-secret' }),
    csrf({ secret: 'csrf-secret' }),
  ),
  port: 3000,
})
```

### Circuit Breaker

```typescript
import { serve, get, json, compose, circuitBreaker } from '@sylphx/gust'

const routes = [
  get('/external', compose(
    circuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
    }),
    async () => {
      const res = await fetch('https://api.example.com/data')
      return json(await res.json())
    }
  )),
]

serve({ routes, port: 3000 })
```

### OpenTelemetry

```typescript
import { serve, get, json, compose, otel, createTracer, consoleExporter } from '@sylphx/gust'

const tracer = createTracer(consoleExporter)

const routes = [
  get('/', () => json({ hello: 'world' })),
]

serve({
  routes,
  middleware: otel({ tracer }),
  port: 3000,
})
```

### Cluster Mode

```typescript
import { clusterServe, get, json } from '@sylphx/gust'

const routes = [
  get('/', () => json({ pid: process.pid })),
]

clusterServe({
  routes,
  port: 3000,
  workers: 4,
})
```

## API Reference

### Handler Signature

All route handlers receive `{ ctx, input }`:

```typescript
import { get, json } from '@sylphx/gust'

get('/users/:id', ({ ctx, input }) => {
  // ctx.method      - HTTP method
  // ctx.path        - Request path
  // ctx.query       - Query string
  // ctx.headers     - Request headers
  // ctx.params      - Path parameters (typed!)
  // ctx.body        - Request body (Buffer)
  // ctx.json<T>()   - Parse JSON body
  // ctx.app         - User-defined context

  return json({ id: ctx.params.id })
})
```

### Context Types

```typescript
import { serve, createRouter, type Context, type BaseContext } from '@sylphx/gust'

// BaseContext - HTTP request data (library-provided)
type BaseContext = {
  readonly method: string
  readonly path: string
  readonly query: string
  readonly headers: Record<string, string>
  readonly params: Record<string, string>
  readonly body: Buffer
  readonly json: <T>() => T
}

// Context<App> - BaseContext + user's app context
type Context<App> = BaseContext & { readonly app: App }

// Define your app type
type App = { db: Database; user: User | null }

// Create typed routes
const { get, post } = createRouter<App>()

// ctx.app.db and ctx.app.user are fully typed
const route = get('/users', ({ ctx }) => json(ctx.app.db.getUsers()))
```

### Response Helpers

```typescript
import { json, text, html, redirect, notFound, badRequest, unauthorized, forbidden, serverError } from '@sylphx/gust'

json({ data: 'value' })           // application/json
text('Hello')                      // text/plain
html('<h1>Hello</h1>')            // text/html
redirect('/new-path')              // 302 redirect
redirect('/new-path', 301)         // 301 redirect
notFound()                         // 404
badRequest()                       // 400
unauthorized()                     // 401
forbidden()                        // 403
serverError()                      // 500
```

### Streaming Helpers

```typescript
import { sse, streamText, ndjsonStream, streamFile } from '@sylphx/gust'

// Server-Sent Events (unified API)
sse(async function* () {
  yield { data: 'hello', id: '1' }
  yield { data: { json: true }, event: 'update' }
})

// Or with push-based handler
sse(async (emit) => {
  emit({ data: 'connected' })
  return () => cleanup()
})

// Plain text streaming
streamText(async function* () {
  yield 'Hello '
  yield 'World!'
})

// Newline-delimited JSON
ndjsonStream(async function* () {
  yield { id: 1, name: 'Alice' }
  yield { id: 2, name: 'Bob' }
})

// File streaming
streamFile(createReadStream('./file.zip'))
```

### Composition

```typescript
import { compose, pipe } from '@sylphx/gust'

// compose: right-to-left (outer to inner)
const middleware = compose(cors(), compress(), handler)

// pipe: left-to-right (first to last)
const middleware = pipe(handler, compress(), cors())
```

### Route Grouping

```typescript
import { get, post, routes, json, text } from '@sylphx/gust'

// Prefix routes with a path segment
const memberRoutes = routes('/members', [
  get('/', () => json(getAll())),
  get('/:id', ({ ctx }) => json(getOne(ctx.params.id))),
  post('/', () => json(create())),
])

// Nested routes
const adminRoutes = routes('/admin', [
  get('/dashboard', () => text('dashboard')),
  ...routes('/users', [
    get('/', () => text('list')),       // /admin/users
    get('/:id', () => text('show')),    // /admin/users/:id
  ]),
])

serve({
  routes: [
    get('/', () => json({ home: true })),
    ...memberRoutes,
    ...adminRoutes,
  ],
  port: 3000,
})
```

### Type-Safe Routes

```typescript
import { get, createRouter, json } from '@sylphx/gust'

// Simple routes (no app context)
const user = get('/users/:id', ({ ctx }) => {
  ctx.params.id  // string (type-safe!)
  return json({ id: ctx.params.id })
})

// With app context (explicit type)
type App = { db: Database }
const users = get<App>('/users', ({ ctx }) => {
  ctx.app.db  // Database (typed!)
  return json(ctx.app.db.getUsers())
})

// Or use createRouter factory (type currying)
const { get: typedGet, routes: typedRoutes } = createRouter<App>()

const memberRoutes = typedRoutes('/members', [
  typedGet('/', ({ ctx }) => json(ctx.app.db.getMembers())),
  typedGet('/:id', ({ ctx }) => json(ctx.app.db.getMember(ctx.params.id))),
])
```

## License

MIT

---

Built with [Sylphx](https://github.com/SylphxAI)
