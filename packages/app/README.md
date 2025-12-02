# @sylphx/gust-app

> Stateless HTTP application framework - portable across Bun, Deno, Edge, Serverless

[![npm](https://img.shields.io/npm/v/@sylphx/gust-app)](https://www.npmjs.com/package/@sylphx/gust-app)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- **Portable** - Works on Bun, Deno, Cloudflare Workers, AWS Lambda, Vercel Edge
- **Stateless** - Pure `Request -> Response` design, no server state
- **Type-safe** - Full TypeScript with path parameter inference
- **Zero dependencies** - Only depends on `@sylphx/gust-core`
- **WASM-powered** - Radix Trie router and random generation via WebAssembly

### Built-in Middleware

| Category | Features |
|----------|----------|
| **Security** | CORS, CSRF, Security headers, Rate limiting |
| **Auth** | Basic, Bearer, API Key, HMAC, JWT, Session |
| **Performance** | Compression, Caching, Body limits |
| **Utilities** | Validation, Body parsing, Cookies, Proxy headers |
| **Observability** | Request tracing, Logging |

## When to Use

Use `@sylphx/gust-app` when you want:

- **Serverless** - AWS Lambda, Cloudflare Workers, Vercel Edge Functions
- **Portable code** - Same app code across different runtimes
- **BYO server** - Use with `Bun.serve()`, `Deno.serve()`, or any fetch-compatible runtime
- **Testing** - Easy to test without starting a server

For a full HTTP server with native acceleration, see [@sylphx/gust-server](../server) or [@sylphx/gust](../serve).

## Installation

```bash
bun add @sylphx/gust-app
# or
npm install @sylphx/gust-app
```

## Quick Start

```typescript
import { createApp, get, post, json, cors } from '@sylphx/gust-app'

const app = createApp({
  routes: [
    get('/', () => json({ message: 'Hello World' })),
    get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
    post('/users', async ({ ctx }) => {
      const body = await ctx.json()
      return json({ created: body })
    }),
  ],
  middleware: cors(),
})

// Use with any runtime
Bun.serve({ fetch: app.fetch, port: 3000 })
// or
Deno.serve({ port: 3000 }, app.fetch)
// or
export default { fetch: app.fetch }  // Cloudflare Workers
```

## API

### createApp

Creates a stateless application instance.

```typescript
import { createApp, get, json, cors, rateLimit, compose } from '@sylphx/gust-app'

const app = createApp({
  // Routes (required)
  routes: [
    get('/', () => json({ hello: 'world' })),
  ],

  // Global middleware (optional)
  middleware: compose(
    cors(),
    rateLimit({ max: 100, window: 60000 }),
  ),

  // 404 handler (optional)
  notFound: () => json({ error: 'Not Found' }, { status: 404 }),

  // Error handler (optional)
  onError: (error) => json({ error: error.message }, { status: 500 }),
})

// App instance provides:
app.fetch      // (Request) => Promise<Response>
app.handle     // (Context) => Promise<ServerResponse>
app.manifest   // RouteManifest for native registration
```

### Route Builders

```typescript
import { get, post, put, patch, del, head, options, all, routes } from '@sylphx/gust-app'

// HTTP methods
get('/path', handler)
post('/path', handler)
put('/path', handler)
patch('/path', handler)
del('/path', handler)    // 'delete' is reserved
head('/path', handler)
options('/path', handler)
all('/path', handler)    // Match any method

// Route grouping with prefix
const apiRoutes = routes('/api', [
  get('/users', listUsers),
  get('/users/:id', getUser),
  post('/users', createUser),
])

// Nested groups
const v1Routes = routes('/v1', [
  ...routes('/users', [
    get('/', list),
    get('/:id', show),
  ]),
])
```

### Handler Signature

```typescript
import { get, json, type HandlerArgs, type Context } from '@sylphx/gust-app'

// Handler receives { ctx, input }
get('/users/:id', ({ ctx, input }) => {
  // ctx properties
  ctx.method     // 'GET', 'POST', etc.
  ctx.path       // '/users/123'
  ctx.query      // '?foo=bar' query string
  ctx.headers    // Record<string, string>
  ctx.params     // { id: '123' } - typed from path!
  ctx.body       // Raw body buffer
  ctx.json<T>()  // Parse JSON body
  ctx.app        // User-defined app context
  ctx.request    // Original Request (for delegation)

  return json({ id: ctx.params.id })
})
```

### External Handler Integration

Seamlessly integrate fetch-based handlers like GraphQL Yoga, tRPC, Hono:

```typescript
import { createApp, all } from '@sylphx/gust-app'
import { createYoga, createSchema } from 'graphql-yoga'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: `type Query { hello: String }`,
    resolvers: { Query: { hello: () => 'Hello!' } },
  }),
})

const app = createApp({
  routes: [
    // Direct integration - auto-detects fetch-style handlers!
    all('/graphql', yoga.fetch),
  ],
})
```

Works with any fetch-compatible handler:

```typescript
import { Hono } from 'hono'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

// Hono
const hono = new Hono()
hono.get('/hello', (c) => c.json({ hello: 'world' }))
all('/api/*', hono.fetch)

// tRPC
all('/trpc/*', (req) => fetchRequestHandler({ req, router, endpoint: '/trpc' }))
```

Handlers can return either `ServerResponse` or standard `Response` - both work automatically.

### Response Helpers

```typescript
import {
  json,
  text,
  html,
  redirect,
  response,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
} from '@sylphx/gust-app'

json({ data: 'value' })              // application/json
json({ error: 'msg' }, { status: 400 })
text('Hello')                        // text/plain
html('<h1>Hello</h1>')               // text/html
redirect('/new-path')                // 302 redirect
redirect('/new-path', 301)           // 301 redirect
response(body, { status, headers })  // Custom response

// Error responses
notFound()         // 404
badRequest()       // 400
unauthorized()     // 401
forbidden()        // 403
serverError()      // 500
```

### Middleware

```typescript
import {
  // Composition
  compose,
  pipe,

  // Security
  cors,
  simpleCors,
  security,
  strictSecurity,
  apiSecurity,

  // Auth
  basicAuth,
  bearerAuth,
  apiKeyAuth,
  jwtAuth,
  hmacAuth,

  // Session
  session,
  csrf,

  // Performance
  compress,
  cache,
  etag,
  bodyLimit,
  rateLimit,

  // Utilities
  tracing,
  logging,
  proxy,
  validate,
} from '@sylphx/gust-app'

// Compose middleware (right-to-left)
const middleware = compose(
  cors(),
  rateLimit({ max: 100, window: 60000 }),
  jwtAuth({ secret: 'your-secret' }),
)

// Or pipe (left-to-right)
const middleware = pipe(
  handler,
  jwtAuth({ secret: 'your-secret' }),
  cors(),
)
```

### Validation

```typescript
import {
  validate,
  validateBody,
  validateQuery,
  getValidated,
  getValidatedQuery,
  object,
  string,
  number,
  boolean,
  array,
  email,
  url,
  uuid,
  optional,
  nullable,
} from '@sylphx/gust-app'

const createUser = post('/users', compose(
  validate({
    body: object({
      name: string({ minLength: 1, maxLength: 100 }),
      email: email(),
      age: optional(number({ min: 0 })),
      tags: array(string()),
    }),
  }),
  ({ ctx }) => {
    const data = getValidated(ctx)
    // data is typed: { name: string, email: string, age?: number, tags: string[] }
    return json(data)
  }
))
```

### JWT Authentication

```typescript
import { jwtAuth, optionalJwt, createJwt, verifyJwt, getJwtPayload } from '@sylphx/gust-app'

// Middleware
const protected = jwtAuth({ secret: 'your-secret' })
const optionalAuth = optionalJwt({ secret: 'your-secret' })

// Manual JWT operations
const token = await createJwt(
  { userId: '123', role: 'admin' },
  'your-secret',
  { expiresIn: '1h' }
)

const payload = await verifyJwt(token, 'your-secret')

// In handler
get('/me', compose(
  jwtAuth({ secret: 'your-secret' }),
  ({ ctx }) => {
    const payload = getJwtPayload(ctx)
    return json(payload)
  }
))
```

### Session & CSRF

```typescript
import { session, csrf, getSession, getCsrfToken, flash } from '@sylphx/gust-app'

const app = createApp({
  routes: [
    get('/form', ({ ctx }) => html(`
      <form method="POST" action="/submit">
        <input type="hidden" name="_csrf" value="${getCsrfToken(ctx)}">
        <button>Submit</button>
      </form>
    `)),

    post('/submit', ({ ctx }) => {
      const sess = getSession(ctx)
      sess.data.visits = ((sess.data.visits as number) || 0) + 1
      return json({ visits: sess.data.visits })
    }),
  ],
  middleware: compose(
    session({ secret: 'session-secret' }),
    csrf({ secret: 'csrf-secret' }),
  ),
})
```

### Rate Limiting

```typescript
import { rateLimit, rateLimitWithStore } from '@sylphx/gust-app'

// In-memory (default)
rateLimit({
  max: 100,           // Max requests
  window: 60000,      // Per window (ms)
  keyGenerator: (ctx) => ctx.headers['x-forwarded-for'] || 'anonymous',
})

// With custom store (Redis, etc.)
rateLimitWithStore(redisStore, {
  max: 100,
  window: 60000,
})
```

### Typed App Context

```typescript
import { createApp, createRouter, type Context } from '@sylphx/gust-app'

// Define your app context
type App = {
  db: Database
  user: User | null
  requestId: string
}

// Create typed route builders
const { get, post, routes } = createRouter<App>()

const app = createApp({
  routes: [
    get('/users', ({ ctx }) => {
      // ctx.app.db is typed!
      return json(ctx.app.db.getUsers())
    }),

    get('/me', ({ ctx }) => {
      // ctx.app.user is typed!
      return ctx.app.user
        ? json(ctx.app.user)
        : unauthorized()
    }),
  ],

  // Provide app context per request
  context: (baseCtx) => ({
    db: getDatabase(),
    user: getUserFromToken(baseCtx.headers.authorization),
    requestId: crypto.randomUUID(),
  }),
})
```

## Use with Different Runtimes

### Bun

```typescript
Bun.serve({
  fetch: app.fetch,
  port: 3000,
})
```

### Deno

```typescript
Deno.serve({ port: 3000 }, app.fetch)
```

### Cloudflare Workers

```typescript
export default {
  fetch: app.fetch,
}
```

### AWS Lambda

```typescript
import { createApp, get, json } from '@sylphx/gust-app'

const app = createApp({
  routes: [get('/', () => json({ hello: 'lambda' }))],
})

export const handler = async (event: APIGatewayProxyEventV2) => {
  const request = new Request(
    `https://lambda.local${event.rawPath}`,
    {
      method: event.requestContext.http.method,
      headers: event.headers as HeadersInit,
      body: event.body,
    }
  )

  const response = await app.fetch(request)

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  }
}
```

### Node.js HTTP

```typescript
import { createServer } from 'node:http'
import { createApp, get, json } from '@sylphx/gust-app'

const app = createApp({
  routes: [get('/', () => json({ hello: 'node' }))],
})

createServer(async (req, res) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const request = new Request(url, {
    method: req.method,
    headers: req.headers as HeadersInit,
  })

  const response = await app.fetch(request)

  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(await response.text())
}).listen(3000)
```

## Bundle Size

| Component | Size | Gzipped |
|-----------|------|---------|
| JavaScript | 82 KB | 18 KB |
| Type Definitions | 47 KB | 12 KB |
| WASM (router) | 27 KB | 12 KB |

Tree-shaking removes unused middleware in production builds.

## License

MIT

---

Built with [Sylphx](https://github.com/SylphxAI)
