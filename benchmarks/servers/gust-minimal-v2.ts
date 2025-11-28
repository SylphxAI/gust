// Gust Minimal V2 - Direct dynamic route, skip middleware
// @ts-nocheck
const { GustServer } = require('../../crates/gust-napi')

const server = new GustServer()

// Pre-compute response
const RESPONSE = {
	status: 200,
	headers: { 'content-type': 'application/json' },
	body: '{"message":"Hello World"}',
}

// Use addDynamicRoute instead of setFallback
// This might have less overhead than fallback path
server.addDynamicRoute('GET', '/', () => RESPONSE)

const port = parseInt(process.env.PORT || '3000', 10)
await server.serve(port)
console.log(`Gust Minimal V2 listening on :${port}`)

setInterval(() => {}, 1000000)
