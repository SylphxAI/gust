// Gust Turbo Mode - Maximum Performance (Static Routes)
// Uses Rust-side static routes with ZERO JS callback overhead
// @ts-nocheck

// Import native binding directly
const binding = await import('../../crates/gust-napi/index.js')
const { GustServer } = binding

const server = new GustServer()

// Register static route - handled ENTIRELY in Rust (no JS callback)
await server.addStaticRoute('GET', '/', 200, 'application/json', '{"message":"Hello World"}')

const port = parseInt(process.env.PORT || '3000', 10)

// Start server (non-blocking, keep process alive)
server.serveWithHostname(port, '0.0.0.0').catch(console.error)
console.log(`Gust Turbo (Static Routes) listening on :${port}`)

// Keep process alive
await new Promise(() => {})
