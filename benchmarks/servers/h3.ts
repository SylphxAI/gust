// H3 server benchmark

import { createServer } from 'node:http'
import { createApp, createRouter, defineEventHandler, getRouterParam, toNodeListener } from 'h3'

const app = createApp()
const router = createRouter()

router.get(
	'/',
	defineEventHandler(() => {
		return { message: 'Hello World' }
	})
)

router.get(
	'/user/:id',
	defineEventHandler((event) => {
		const id = getRouterParam(event, 'id')
		return { id }
	})
)

app.use(router)

const port = parseInt(process.env.PORT || '3000', 10)
createServer(toNodeListener(app)).listen(port, () => {
	console.log(`H3 listening on :${port}`)
})
