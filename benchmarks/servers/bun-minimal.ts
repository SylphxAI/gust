// Bun.serve minimal - fair comparison with Gust minimal
const RESPONSE = { message: 'Hello World' }

Bun.serve({
	port: parseInt(process.env.PORT || '3000', 10),
	fetch() {
		return Response.json(RESPONSE)
	},
})

console.log('Bun.serve minimal listening on :3000')
