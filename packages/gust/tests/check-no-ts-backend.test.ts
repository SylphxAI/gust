/**
 * Gate regression: packages/server must not export or implement turboServe / Bun.serve.
 */
import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dir, '../../..')

describe('check-no-ts-backend gate', () => {
	test('scripts/check-no-ts-backend.sh exits 0', () => {
		const result = spawnSync('bash', [join(repoRoot, 'scripts/check-no-ts-backend.sh')], {
			cwd: repoRoot,
			encoding: 'utf8',
		})
		expect(result.status).toBe(0)
		expect(result.stdout).toContain('PASS:')
	})

	test('index.ts does not export turboServe', () => {
		const indexSrc = readFileSync(join(repoRoot, 'packages/server/src/index.ts'), 'utf8')
		expect(indexSrc).not.toMatch(/export\s*\{[^}]*\bturboServe\b/)
		expect(indexSrc).not.toMatch(/export\s+const\s+turboServe\b/)
	})

	test('turbo.ts has no Bun.serve call or turboServe implementation', () => {
		const turboSrc = readFileSync(join(repoRoot, 'packages/server/src/turbo.ts'), 'utf8')
		const code = turboSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
		expect(code).not.toMatch(/\bexport\s+const\s+turboServe\b/)
		expect(code).not.toMatch(/\bBun\.serve\s*\(/)
	})
})
