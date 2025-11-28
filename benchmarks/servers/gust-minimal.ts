// Gust Minimal - Simplest possible callback to test raw napi-rs performance
// @ts-nocheck
const binding = require('../../crates/gust-napi')

const server = new binding.GustServer()

// Pre-compute response
const RESPONSE = {
	status: 200,
	headers: { 'content-type': 'application/json' },
	body: '{"message":"Hello World"}',
}

// Minimal callback - just return pre-computed response
server.setFallback(async () => RESPONSE)

const port = parseInt(process.env.PORT || '3000', 10)
server.serve(port)
console.log(`Gust Minimal (raw napi-rs) listening on :${port}`)
