// Hono Static Response - Minimal handler
// Fair comparison for static route benchmarks

import { Hono } from 'hono'

const response = { message: 'Hello World' }

const app = new Hono()
app.get('/', (c) => c.json(response))

const port = parseInt(process.env.PORT || '3000', 10)

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
	Bun.serve({
		port,
		fetch: app.fetch,
	})
	console.log(`Hono (Static/Bun) listening on :${port}`)
} else {
	const { serve } = await import('@hono/node-server')
	serve({ fetch: app.fetch, port }, () => {
		console.log(`Hono (Static/Node) listening on :${port}`)
	})
}
