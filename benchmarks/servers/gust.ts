// Gust - High-performance HTTP server
// Automatically selects optimal backend (io_uring on Linux, multicore otherwise)
// @ts-nocheck
import { GustServer, getCpuCount } from '../../crates/gust-napi/index.js'

const server = new GustServer()

// Pre-compute response for maximum performance
const RESPONSE = {
	status: 200,
	headers: { 'content-type': 'application/json' },
	body: '{"message":"Hello World"}',
}

// Minimal callback - just return pre-computed response
server.setFallback(async () => RESPONSE)

const port = parseInt(process.env.PORT || '3000', 10)
const workers = parseInt(process.env.WORKERS || '0', 10) || undefined

// Use optimal backend automatically
server.serve(port, workers)
console.log(`Gust (${workers || getCpuCount()} workers) listening on :${port}`)

// Keep process alive
setInterval(() => {}, 1000000)
