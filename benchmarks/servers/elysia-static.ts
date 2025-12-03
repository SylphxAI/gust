// Elysia Static Response - Minimal handler
// Fair comparison for static route benchmarks

import { Elysia } from 'elysia'

const response = { message: 'Hello World' }

const app = new Elysia().get('/', () => response)

const port = parseInt(process.env.PORT || '3000', 10)
app.listen(port)
console.log(`Elysia (Static) listening on :${port}`)
