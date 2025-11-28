// Express server benchmark
import express from 'express'

const app = express()

app.get('/', (_req, res) => {
	res.json({ message: 'Hello World' })
})

app.get('/user/:id', (req, res) => {
	res.json({ id: req.params.id })
})

const port = parseInt(process.env.PORT || '3000', 10)
app.listen(port, () => {
	console.log(`Express listening on :${port}`)
})
