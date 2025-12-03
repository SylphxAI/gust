// Gust - WASM-only mode (using Bun.serve or Node http)
// This tests the WASM router + JS runtime without native Rust server
// @ts-nocheck
import { createApp, get, json } from '../../packages/app/dist/index.js'

const app = createApp({
	routes: [get('/', () => json({ message: 'Hello World' }))],
})

const port = parseInt(process.env.PORT || '3000', 10)

// Use Bun.serve or Node http depending on runtime
const isBun = typeof Bun !== 'undefined'

if (isBun) {
	Bun.serve({
		port,
		fetch: app.fetch,
	})
	console.log(`Gust (WASM + Bun.serve) listening on :${port}`)
} else {
	const { createServer } = await import('node:http')
	const server = createServer(async (req, res) => {
		const url = new URL(req.url || '/', `http://localhost:${port}`)
		const response = await app.fetch(
			new Request(url.toString(), {
				method: req.method,
				headers: req.headers as HeadersInit,
			})
		)
		res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
		res.end(await response.text())
	})
	server.listen(port, () => {
		console.log(`Gust (WASM + Node http) listening on :${port}`)
	})
}
