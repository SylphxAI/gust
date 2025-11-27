/**
 * Static file serving example
 */

import { join } from 'node:path'
import {
  serve,
  router,
  get,
  head,
  json,
  serveStatic,
} from '../src'

// Static file handler
const staticHandler = serveStatic({
  root: join(import.meta.dir, 'public'),
  index: ['index.html'],
  maxAge: 3600,
  etag: true,
  lastModified: true,
})

// Start server
const server = await serve({
  port: 4001,
  fetch: router(
    // API routes
    get('/api/health', () => json({ status: 'ok' })),

    // Serve static files (root and wildcard, GET + HEAD)
    get('/', staticHandler),
    head('/', staticHandler),
    get('/*', staticHandler),
    head('/*', staticHandler),
  ),
  onListen: ({ port }) => {
    console.log(`Static server running at http://localhost:${port}`)
  },
})

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...')
  server.stop()
  process.exit(0)
})
