# @sylphx/gust-core

> Core WASM runtime and response utilities for @sylphx/gust

## Installation

```bash
bun add @sylphx/gust-core
```

## Usage

```typescript
import { createWasmServer, response, json, notFound } from '@sylphx/gust-core'

// Create WASM server
const server = createWasmServer({
  port: 3000,
  handler: async (ctx) => {
    if (ctx.path === '/') {
      return json({ message: 'Hello World!' })
    }
    return notFound()
  }
})

await server.start()
```

## API

### Response Utilities

```typescript
// Basic response
response('Hello', { status: 200, headers: { 'content-type': 'text/plain' } })

// JSON response
json({ data: 'value' })

// Status helpers
ok('Success')
created({ id: 1 })
noContent()
badRequest('Invalid input')
unauthorized()
forbidden()
notFound()
serverError('Something went wrong')

// Redirect
redirect('/new-path')
redirect('/external', 301)
```

### Server Response Type

```typescript
type ServerResponse = {
  status: number
  headers: Record<string, string>
  body: string | Buffer | null
}
```

### Handler Type

```typescript
type Handler<T = unknown> = (ctx: T) => ServerResponse | Promise<ServerResponse>
```

### Wrapper (Middleware) Type

```typescript
type Wrapper<T = unknown> = (handler: Handler<T>) => Handler<T>
```

## License

MIT © Aspect Build Systems
