# @sylphx/gust

High performance functional HTTP server powered by WASM.

## Features

- **Fast** - WASM-powered HTTP parser and Radix Trie router
- **Functional** - Composable middleware with `pipe()` and `compose()`
- **Type-safe** - Full TypeScript support
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

const app = router([
  get('/', () => json({ message: 'Hello World' })),
  get('/users/:id', (ctx) => json({ id: ctx.params.id })),
])

serve({ port: 3000, fetch: app })
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
} from '@sylphx/gust'

const app = compose(
  cors(),
  compress(),
  rateLimit({ max: 100, window: 60000 }),
  router([
    get('/health', () => json({ status: 'ok' })),

    // Protected routes
    compose(
      jwtAuth({ secret: process.env.JWT_SECRET }),
      router([
        get('/me', (ctx) => json(getJwtPayload(ctx))),
        post('/posts', async (ctx) => {
          const body = await parseJsonBody(ctx)
          return json({ created: body })
        }),
      ])
    ),
  ])
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

### Static Files

```typescript
import { serve, serveStatic, router, get } from '@sylphx/gust'

const app = router([
  get('/api/*', apiHandler),
  serveStatic({ root: './public' }),
])

serve({ port: 3000, fetch: app })
```

### Health Checks (Kubernetes)

```typescript
import { serve, router, get, liveness, readiness, health, memoryCheck } from '@sylphx/gust'

const app = router([
  get('/healthz', liveness()),
  get('/ready', readiness([memoryCheck(90)])),
  get('/health', health({
    checks: [memoryCheck(90)],
    detailed: true,
  })),
])

serve({ port: 3000, fetch: app })
```

### Validation

```typescript
import { serve, router, post, validate, object, string, email, number } from '@sylphx/gust'

const createUser = compose(
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
)

const app = router([
  post('/users', createUser),
])

serve({ port: 3000, fetch: app })
```

### Session & CSRF

```typescript
import { serve, router, get, post, session, csrf, getCsrfToken, getSession } from '@sylphx/gust'

const app = compose(
  session({ secret: 'your-secret' }),
  csrf({ secret: 'csrf-secret' }),
  router([
    get('/form', (ctx) => html(`
      <form method="POST" action="/submit">
        <input type="hidden" name="_csrf" value="${getCsrfToken(ctx)}">
        <button type="submit">Submit</button>
      </form>
    `)),
    post('/submit', (ctx) => {
      const sess = getSession(ctx)
      sess.visits = (sess.visits || 0) + 1
      return json({ visits: sess.visits })
    }),
  ])
)

serve({ port: 3000, fetch: app })
```

### Circuit Breaker

```typescript
import { serve, circuitBreaker, router, get } from '@sylphx/gust'

const app = router([
  get('/external', compose(
    circuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
    }),
    async () => {
      const res = await fetch('https://external-api.com/data')
      return json(await res.json())
    }
  )),
])

serve({ port: 3000, fetch: app })
```

### OpenTelemetry

```typescript
import { serve, otel, createTracer, consoleExporter } from '@sylphx/gust'

const tracer = createTracer({
  serviceName: 'my-service',
  exporter: consoleExporter(),
})

const app = compose(
  otel({ tracer }),
  router([...])
)

serve({ port: 3000, fetch: app })
```

### Cluster Mode

```typescript
import { clusterServe, router, get, json } from '@sylphx/gust'

const app = router([
  get('/', () => json({ pid: process.pid })),
])

clusterServe({
  port: 3000,
  fetch: app,
  workers: 4, // or 'auto' for CPU count
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
notFound('Not found')              // 404
badRequest('Invalid input')        // 400
unauthorized('Login required')     // 401
forbidden('Access denied')         // 403
serverError('Something broke')     // 500
```

### Composition

```typescript
import { compose, pipe } from '@sylphx/gust'

// compose: right-to-left (outer to inner)
const app = compose(cors(), compress(), router([...]))

// pipe: left-to-right (first to last)
const app = pipe(router([...]), compress(), cors())
```

## License

MIT

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
