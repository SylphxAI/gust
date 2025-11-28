// Hono server benchmark
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.json({ message: 'Hello World' }))
app.get('/user/:id', (c) => c.json({ id: c.req.param('id') }))

const port = parseInt(process.env.PORT || '3000', 10)

// Detect runtime
declare const Bun:
	| {
			serve: (options: {
				port: number
				fetch: (req: Request) => Response | Promise<Response>
			}) => void
	  }
	| undefined
const isBun = typeof Bun !== 'undefined'

if (isBun) {
	// Bun native
	Bun.serve({
		port,
		fetch: app.fetch,
	})
	console.log(`Hono (Bun) listening on :${port}`)
} else {
	// Node.js
	const { serve } = await import('@hono/node-server')
	serve({ fetch: app.fetch, port }, () => {
		console.log(`Hono (Node) listening on :${port}`)
	})
}
