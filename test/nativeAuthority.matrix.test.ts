import { describe, expect, it } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

describe('gust native authority matrix', () => {
	it('ledger all ts_deleted', () => {
		const ledger = JSON.parse(readFileSync(join(root, 'docs/specs/migration-ledger.json'), 'utf8'))
		for (const c of ledger.capabilities) expect(c.state).toBe('ts_deleted')
		expect(ledger.summary.ts_deleted).toBe(ledger.capabilities.length)
	})

	it('check-no-ts-backend gate passes', () => {
		const r = spawnSync('bash', ['scripts/check-no-ts-backend.sh'], { cwd: root, encoding: 'utf8' })
		expect(r.status).toBe(0)
		expect(r.stdout).toContain('PASS')
	})

	it('napi binding loads GustServer', () => {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const m = require(join(root, 'crates/gust-napi/index.js'))
		expect(m.GustServer).toBeDefined()
	})
})
