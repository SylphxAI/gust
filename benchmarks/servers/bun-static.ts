// Bun.serve Static Response - No handler logic, just return static response
// This is the fair comparison for Gust Turbo mode

const port = parseInt(process.env.PORT || '3000', 10)
const staticResponse = new Response(JSON.stringify({ message: 'Hello World' }), {
	headers: { 'content-type': 'application/json' },
})

Bun.serve({
	port,
	fetch() {
		// Static response - no URL parsing, no logic
		return staticResponse.clone()
	},
})

console.log(`Bun.serve (Static) listening on :${port}`)
