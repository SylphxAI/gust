#!/usr/bin/env bun
/**
 * Benchmark runner for HTTP server frameworks
 * Usage: bun run bench.ts [--node] [--json-only]
 */

import { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const PORT = 3456
const DURATION = '10s'
const THREADS = 4
const CONNECTIONS = 100

type BenchResult = {
	name: string
	runtime: string
	reqPerSec: number
	latencyAvg: string
	latencyMax: string
	transferPerSec: string
	errors: number
}

const results: BenchResult[] = []

// Detect runtime
const isBun = typeof Bun !== 'undefined'
const runtime = isBun ? 'bun' : 'node'

// Servers to benchmark
const servers = [
	{ name: 'Bun.serve', file: 'bun-native.ts', bunOnly: true },
	{ name: 'Elysia', file: 'elysia.ts', bunOnly: true },
	{ name: 'Gust', file: 'gust.ts', bunOnly: false },
	{ name: 'Hono', file: 'hono.ts', bunOnly: false },
	{ name: 'Fastify', file: 'fastify.ts', bunOnly: false },
	{ name: 'H3', file: 'h3.ts', bunOnly: false },
	{ name: 'Express', file: 'express.ts', bunOnly: false },
]

async function runWrk(endpoint: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const wrk = spawn('wrk', [
			'-t',
			String(THREADS),
			'-c',
			String(CONNECTIONS),
			'-d',
			DURATION,
			`http://localhost:${PORT}${endpoint}`,
		])

		let output = ''
		wrk.stdout.on('data', (data) => {
			output += data.toString()
		})
		wrk.stderr.on('data', (data) => {
			output += data.toString()
		})
		wrk.on('close', () => resolve(output))
		wrk.on('error', reject)
	})
}

function parseWrkOutput(output: string): Partial<BenchResult> {
	const reqMatch = output.match(/Requests\/sec:\s+([\d.]+)/)
	const _latAvgMatch = output.match(/Latency\s+([\d.]+\w+)/)
	const _latMaxMatch = output.match(/Latency.*?([\d.]+\w+)\s*$/)
	const transferMatch = output.match(/Transfer\/sec:\s+([\d.]+\w+)/)
	const errorMatch = output.match(/Socket errors:.*?(\d+)\s+read/)

	// Better latency parsing
	const latencyLine = output.match(/Latency\s+([\d.]+\w+)\s+([\d.]+\w+)\s+([\d.]+\w+)/)

	return {
		reqPerSec: reqMatch ? parseFloat(reqMatch[1]) : 0,
		latencyAvg: latencyLine ? latencyLine[1] : 'N/A',
		latencyMax: latencyLine ? latencyLine[3] : 'N/A',
		transferPerSec: transferMatch ? transferMatch[1] : 'N/A',
		errors: errorMatch ? parseInt(errorMatch[1], 10) : 0,
	}
}

async function benchmarkServer(name: string, file: string): Promise<BenchResult | null> {
	console.log(`\n${'='.repeat(60)}`)
	console.log(`Benchmarking: ${name} (${runtime})`)
	console.log('='.repeat(60))

	// Start server
	const serverPath = `./servers/${file}`
	const cmd = runtime === 'bun' ? 'bun' : 'node'
	const args = runtime === 'bun' ? ['run', serverPath] : ['--experimental-strip-types', serverPath]

	const server = spawn(cmd, args, {
		env: { ...process.env, PORT: String(PORT) },
		stdio: ['ignore', 'pipe', 'pipe'],
	})

	let serverOutput = ''
	server.stdout?.on('data', (d) => {
		serverOutput += d.toString()
	})
	server.stderr?.on('data', (d) => {
		serverOutput += d.toString()
	})

	// Wait for server to start
	await setTimeout(2000)

	// Check if server is running
	try {
		const res = await fetch(`http://localhost:${PORT}/`)
		if (!res.ok) throw new Error('Server not responding')
	} catch (_e) {
		console.log(`  ❌ Server failed to start`)
		console.log(`  Output: ${serverOutput}`)
		server.kill('SIGTERM')
		return null
	}

	console.log(`  ✓ Server started`)

	// Run benchmark on / endpoint
	console.log(`\n  Testing GET /`)
	const homeOutput = await runWrk('/')
	const homeResult = parseWrkOutput(homeOutput)

	// Run benchmark on /user/:id endpoint
	console.log(`  Testing GET /user/123`)
	const userOutput = await runWrk('/user/123')
	const userResult = parseWrkOutput(userOutput)

	// Stop server
	server.kill('SIGTERM')
	await setTimeout(500)

	// Use home endpoint result (simpler, more comparable)
	const result: BenchResult = {
		name,
		runtime,
		reqPerSec: homeResult.reqPerSec ?? 0,
		latencyAvg: homeResult.latencyAvg ?? 'N/A',
		latencyMax: homeResult.latencyMax ?? 'N/A',
		transferPerSec: homeResult.transferPerSec ?? 'N/A',
		errors: homeResult.errors ?? 0,
	}

	console.log(`\n  Results (GET /):`)
	console.log(`    Requests/sec: ${result.reqPerSec.toLocaleString()}`)
	console.log(`    Latency avg:  ${result.latencyAvg}`)
	console.log(`    Latency max:  ${result.latencyMax}`)
	console.log(`    Transfer/sec: ${result.transferPerSec}`)

	console.log(`\n  Results (GET /user/123):`)
	console.log(`    Requests/sec: ${(userResult.reqPerSec ?? 0).toLocaleString()}`)
	console.log(`    Latency avg:  ${userResult.latencyAvg}`)

	return result
}

async function main() {
	console.log('╔════════════════════════════════════════════════════════════╗')
	console.log('║           HTTP Server Framework Benchmark                  ║')
	console.log('╠════════════════════════════════════════════════════════════╣')
	console.log(`║  Runtime:     ${runtime.padEnd(44)}║`)
	console.log(`║  Duration:    ${DURATION.padEnd(44)}║`)
	console.log(`║  Threads:     ${String(THREADS).padEnd(44)}║`)
	console.log(`║  Connections: ${String(CONNECTIONS).padEnd(44)}║`)
	console.log('╚════════════════════════════════════════════════════════════╝')

	for (const server of servers) {
		// Skip bun-only servers when running on Node
		if (server.bunOnly && runtime !== 'bun') {
			console.log(`\nSkipping ${server.name} (Bun only)`)
			continue
		}

		const result = await benchmarkServer(server.name, server.file)
		if (result) {
			results.push(result)
		}
	}

	// Print summary
	console.log('\n')
	console.log('╔════════════════════════════════════════════════════════════════════════╗')
	console.log('║                           BENCHMARK RESULTS                            ║')
	console.log('╠════════════════════════════════════════════════════════════════════════╣')
	console.log('║  Framework        │  Requests/sec  │  Latency Avg  │  vs Gust          ║')
	console.log('╠════════════════════════════════════════════════════════════════════════╣')

	// Sort by requests per second
	results.sort((a, b) => b.reqPerSec - a.reqPerSec)

	const gustResult = results.find((r) => r.name === 'Gust')
	const gustRps = gustResult?.reqPerSec ?? 1

	for (const r of results) {
		const ratio = r.reqPerSec / gustRps
		const comparison =
			r.name === 'Gust'
				? '(baseline)'
				: ratio > 1
					? `${ratio.toFixed(2)}x faster`
					: `${(1 / ratio).toFixed(2)}x slower`

		console.log(
			`║  ${r.name.padEnd(16)} │  ${r.reqPerSec.toLocaleString().padStart(13)} │  ${r.latencyAvg.padStart(11)} │  ${comparison.padEnd(16)} ║`
		)
	}

	console.log('╚════════════════════════════════════════════════════════════════════════╝')

	// Output JSON for CI
	if (process.argv.includes('--json')) {
		console.log('\n--- JSON Results ---')
		console.log(JSON.stringify(results, null, 2))
	}
}

main().catch(console.error)
