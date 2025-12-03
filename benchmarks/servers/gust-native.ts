// Gust - Native Rust mode (maximum performance)
// @ts-nocheck
import { createApp, get, json, serve } from '../../packages/gust/dist/index.js'

const app = createApp({
	routes: [get('/', () => json({ message: 'Hello World' }))],
})

const port = parseInt(process.env.PORT || '3000', 10)

// Use native Rust server
await serve({
	app,
	port,
	onListen: ({ port }) => {
		console.log(`Gust (Native Rust) listening on :${port}`)
	},
})
