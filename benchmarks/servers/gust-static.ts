// Gust Static - Pure Rust, zero JS callback
// @ts-nocheck
const { GustServer } = require('../../crates/gust-napi')

const server = new GustServer()

// Static route - 100% Rust, no JS callback
await server.addStaticRoute('GET', '/', 200, 'application/json', '{"message":"Hello World"}')

const port = parseInt(process.env.PORT || '3000', 10)
await server.serve(port)
console.log(`Gust Static (pure Rust) listening on :${port}`)

// Keep process alive
setInterval(() => {}, 1000000)
