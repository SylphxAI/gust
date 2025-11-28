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
import { serve, router, get, json } from '@sylphx/gust'

const home = get('/', () => json({ message: 'Hello World' }))
const user = get('/users/:id', (ctx) => json({ id: ctx.params.id }))

const app = router({ home, user })

// Type-safe URL generation (routes are callable)
app.home()           // "/"
app.user({ id: 42 }) // "/users/42"

// Route properties
app.home.path        // "/"
app.home.method      // "GET"
app.user.path        // "/users/:id"

serve({ port: 3000, fetch: app.handler })
```

## Examples

### With Middleware

```typescript
import {
  serve,
  router,
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

// Public routes
const health = get('/health', () => json({ status: 'ok' }))

// Protected routes
const me = get('/me', (ctx) => json(getJwtPayload(ctx)))
const createPost = post('/posts', async (ctx) => {
  const body = await parseJsonBody(ctx)
  return json({ created: body })
})

const protectedRoutes = compose(
  jwtAuth({ secret: process.env.JWT_SECRET! }),
  router({ me, createPost }).handler
)

const publicRoutes = router({ health }).handler

const app = compose(
  cors(),
  compress(),
  rateLimit({ max: 100, window: 60000 }),
  (ctx) => ctx.path.startsWith('/me') || ctx.path.startsWith('/posts')
    ? protectedRoutes(ctx)
    : publicRoutes(ctx)
)

serve({ port: 3000, fetch: app })
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
import { serve, router, get, sseStream } from '@sylphx/gust'

const events = get('/events', () =>
  sseStream(async function* () {
    for (let i = 1; i <= 5; i++) {
      yield { data: { count: i }, id: i }
      await new Promise((r) => setTimeout(r, 1000))
    }
  })
)

const app = router({ events })

serve({ port: 3000, fetch: app.handler })
```

### Streaming (NDJSON)

```typescript
import { serve, router, get, ndjsonStream } from '@sylphx/gust'

const stream = get('/data', () =>
  ndjsonStream(async function* () {
    yield { id: 1, name: 'Alice' }
    yield { id: 2, name: 'Bob' }
    yield { id: 3, name: 'Charlie' }
  })
)

const app = router({ stream })

serve({ port: 3000, fetch: app.handler })
```

### Streaming (File)

```typescript
import { createReadStream } from 'node:fs'
import { serve, router, get, streamFile } from '@sylphx/gust'

const download = get('/download', () =>
  streamFile(createReadStream('./large-file.zip'), {
    headers: { 'content-type': 'application/zip' },
  })
)

const app = router({ download })

serve({ port: 3000, fetch: app.handler })
```

### Static Files

```typescript
import { serve, serveStatic, router, get, json } from '@sylphx/gust'

const api = get('/api/hello', () => json({ hello: 'world' }))
const app = router({ api })

serve({
  port: 3000,
  fetch: (ctx) => {
    if (ctx.path.startsWith('/api')) {
      return app.handler(ctx)
    }
    return serveStatic({ root: './public' })(ctx)
  },
})
```

### Health Checks (Kubernetes)

```typescript
import { serve, router, get, liveness, readiness, health, memoryCheck } from '@sylphx/gust'

const live = get('/healthz', liveness())
const ready = get('/ready', readiness([memoryCheck(90)]))
const detailed = get('/health', health({ checks: [memoryCheck(90)], detailed: true }))

const app = router({ live, ready, detailed })

serve({ port: 3000, fetch: app.handler })
```

### Validation

```typescript
import { serve, router, post, json, compose, validate, object, string, email, number, getValidated } from '@sylphx/gust'

const createUser = post('/users', compose(
  validate({
    body: object({
      name: string({ minLength: 1 }),
      email: email(),
      age: number({ min: 0 }),
    }),
  }),
  async (ctx) => {
    const data = getValidated(ctx)
    return json({ user: data })
  }
))

const app = router({ createUser })

serve({ port: 3000, fetch: app.handler })
```

### Session & CSRF

```typescript
import { serve, router, get, post, html, json, compose, session, csrf, getCsrfToken, getSession } from '@sylphx/gust'

const form = get('/form', (ctx) => html(`
  <form method="POST" action="/submit">
    <input type="hidden" name="_csrf" value="${getCsrfToken(ctx)}">
    <button type="submit">Submit</button>
  </form>
`))

const submit = post('/submit', (ctx) => {
  const sess = getSession(ctx)
  sess.data.visits = ((sess.data.visits as number) || 0) + 1
  return json({ visits: sess.data.visits })
})

const app = compose(
  session({ secret: 'your-secret' }),
  csrf({ secret: 'csrf-secret' }),
  router({ form, submit }).handler
)

serve({ port: 3000, fetch: app })
```

### Circuit Breaker

```typescript
import { serve, router, get, json, compose, circuitBreaker } from '@sylphx/gust'

const external = get('/external', compose(
  circuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000,
  }),
  async () => {
    const res = await fetch('https://api.example.com/data')
    return json(await res.json())
  }
))

const app = router({ external })

serve({ port: 3000, fetch: app.handler })
```

### OpenTelemetry

```typescript
import { serve, router, get, json, compose, otel, createTracer, consoleExporter } from '@sylphx/gust'

const tracer = createTracer(consoleExporter)

const hello = get('/', () => json({ hello: 'world' }))
const app = router({ hello })

serve({
  port: 3000,
  fetch: compose(otel({ tracer }), app.handler),
})
```

### Cluster Mode

```typescript
import { clusterServe, router, get, json } from '@sylphx/gust'

const index = get('/', () => json({ pid: process.pid }))
const app = router({ index })

clusterServe({
  port: 3000,
  fetch: app.handler,
  workers: 4,
})
```

## API Reference

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
import { sseStream, streamText, ndjsonStream, streamFile } from '@sylphx/gust'

// Server-Sent Events
sseStream(async function* () {
  yield { data: 'hello', id: 1 }
  yield { data: { json: true }, event: 'update' }
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
const app = compose(cors(), compress(), handler)

// pipe: left-to-right (first to last)
const app = pipe(handler, compress(), cors())
```

### Type-Safe Routes

```typescript
import { router, get, post, prefix, merge } from '@sylphx/gust'

// Routes with typed params
const user = get('/users/:id', (ctx) => {
  ctx.params.id  // string (type-safe!)
  return json({ id: ctx.params.id })
})

const postRoute = get('/users/:userId/posts/:postId', (ctx) => {
  ctx.params.userId  // string
  ctx.params.postId  // string
  return json(ctx.params)
})

// Named routes with URL generation
const app = router({ user, post: postRoute })
app.user({ id: 42 })                    // "/users/42"
app.post({ userId: 1, postId: 99 })     // "/users/1/posts/99"

// Route properties
app.user.path                           // "/users/:id"
app.user.method                         // "GET"

// Nested routers
const member = router({
  home: get('/', () => text('member home')),
  profile: get('/profile', () => text('profile')),
})
const mainApp = router({
  login: get('/login', () => text('login')),
  member,
})
mainApp.login()             // "/login"
mainApp.member.home()       // "/"
mainApp.member.profile()    // "/profile"

// Route composition
const apiRoutes = prefix('/api', { user, post: postRoute })
const allRoutes = merge(apiRoutes, otherRoutes)
```

## License

MIT

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
