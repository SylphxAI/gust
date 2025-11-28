// Bun native server benchmark (baseline)
const port = parseInt(process.env.PORT || '3000', 10)

Bun.serve({
	port,
	fetch(req) {
		const url = new URL(req.url)

		if (url.pathname === '/') {
			return Response.json({ message: 'Hello World' })
		}

		const match = url.pathname.match(/^\/user\/([^/]+)$/)
		if (match) {
			return Response.json({ id: match[1] })
		}

		return new Response('Not Found', { status: 404 })
	},
})

console.log(`Bun.serve listening on :${port}`)
