# @sylphx/gust-core

> WASM HTTP parser and Radix Trie router - core runtime for @sylphx/gust

## Installation

```bash
bun add @sylphx/gust-core
```

## Usage

```typescript
import { initWasm, getWasm, json, notFound, compose } from '@sylphx/gust-core'

// Initialize WASM (auto-initialized on first use)
await initWasm()

// Use WASM router
const wasm = getWasm()
const router = new wasm.WasmRouter()
router.insert('GET', '/users/:id', 0)

const match = router.find('GET', '/users/42')
console.log(match.found)  // true
console.log(match.params) // ['id', '42']
```

## API

### Response Helpers

```typescript
import { response, json, text, html, redirect, notFound, badRequest, unauthorized, forbidden, serverError } from '@sylphx/gust-core'

// Basic response
response('Hello', { status: 200, headers: { 'content-type': 'text/plain' } })

// JSON response
json({ data: 'value' })

// Text/HTML
text('Hello World')
html('<h1>Hello</h1>')

// Redirects
redirect('/new-path')
redirect('/external', 301)

// Error responses
notFound()
badRequest()
unauthorized()
forbidden()
serverError()
```

### Composition

```typescript
import { compose, pipe } from '@sylphx/gust-core'

// compose: outer to inner (right-to-left)
const app = compose(middleware1, middleware2, handler)

// pipe: first to last (left-to-right)
const app = pipe(handler, middleware2, middleware1)
```

### Types

```typescript
// Server response
type ServerResponse = {
  status: number
  headers: Record<string, string>
  body: string | Uint8Array | null
}

// Handler function
type Handler<T = unknown> = (ctx: T) => ServerResponse | Promise<ServerResponse>

// Middleware wrapper
type Wrapper<T = unknown> = (handler: Handler<T>) => Handler<T>
```

### WASM Functions

```typescript
import { initWasm, isWasmReady, getWasm } from '@sylphx/gust-core'

// Initialize WASM module
await initWasm()

// Check if ready
if (isWasmReady()) {
  const wasm = getWasm()
  // Use wasm.WasmRouter, wasm.WasmHttpParser, etc.
}
```

## License

MIT

---

✨ Powered by [Sylphx](https://github.com/SylphxAI)
