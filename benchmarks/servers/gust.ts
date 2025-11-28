// Gust server benchmark
import { get, json, router, serve } from '../../packages/serve/dist/index.js'

const hello = get('/', () => json({ message: 'Hello World' }))
const user = get('/user/:id', (ctx) => json({ id: ctx.params.id }))

const app = router({ hello, user })

const port = parseInt(process.env.PORT || '3000', 10)
serve({ port, fetch: app.handler })
console.log(`Gust listening on :${port}`)
