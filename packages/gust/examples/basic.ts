/**
 * Basic usage example
 */

import {
	type Context,
	compose,
	get,
	group,
	json,
	post,
	router,
	serve,
	text,
	type Wrapper,
} from '../src'

// Wrapper: logging
const withLog: Wrapper<Context> = (handler) => async (ctx) => {
	const start = performance.now()
	const result = await handler(ctx)
	const ms = (performance.now() - start).toFixed(2)
	console.log(`${ctx.method} ${ctx.path} - ${result.status} (${ms}ms)`)
	return result
}

// Wrapper: error handling
const withErrorHandler: Wrapper<Context> = (handler) => async (ctx) => {
	try {
		return await handler(ctx)
	} catch (error) {
		console.error('Error:', error)
		return json({ error: 'Internal Server Error' }, { status: 500 })
	}
}

// Routes
const apiRoutes = group(
	'/api',
	get('/users', () =>
		json([
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		])
	),

	get('/users/:id', (ctx) =>
		json({
			id: ctx.params.id,
			name: `User ${ctx.params.id}`,
		})
	),

	post('/users', (ctx) => {
		const body = ctx.json<{ name: string }>()
		return json({ id: Date.now(), name: body.name }, { status: 201 })
	})
)

// Start server
const server = await serve({
	port: 4000,
	fetch: compose<Context>(
		withLog,
		withErrorHandler
	)(
		router(
			get('/', () => text('Hello from Serve!')),
			get('/health', () => json({ status: 'ok' })),
			...apiRoutes
		)
	),
	onListen: ({ port }) => {
		console.log(`Server running at http://localhost:${port}`)
	},
})

// Handle shutdown
process.on('SIGINT', () => {
	console.log('\nShutting down...')
	server.stop()
	process.exit(0)
})
