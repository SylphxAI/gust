// Elysia server benchmark (Bun only)
import { Elysia } from 'elysia'

const app = new Elysia()
	.get('/', () => ({ message: 'Hello World' }))
	.get('/user/:id', ({ params }) => ({ id: params.id }))

const port = parseInt(process.env.PORT || '3000', 10)
app.listen(port)
console.log(`Elysia listening on :${port}`)
