// Fastify server benchmark
import Fastify from 'fastify'

const app = Fastify({ logger: false })

app.get('/', async () => {
	return { message: 'Hello World' }
})

app.get('/user/:id', async (request) => {
	const { id } = request.params as { id: string }
	return { id }
})

const port = parseInt(process.env.PORT || '3000', 10)
app.listen({ port, host: '0.0.0.0' }).then(() => {
	console.log(`Fastify listening on :${port}`)
})
