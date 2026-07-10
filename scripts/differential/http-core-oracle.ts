#!/usr/bin/env bun
/**
 * TS contract oracle for Gust HTTP core differential parity (rej-010).
 * Foundation repo: no historical TS HTTP backend — oracle encodes the
 * consumer-facing contract that WASM/native consumers must match (router,
 * Method parse, W3C traceparent).
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '../..')
const corpusPath =
	process.env.GUST_CORPUS_JSON ??
	join(repoRoot, 'scripts/differential/fixtures/http-core-corpus.json')
const paritySlicePath = join(repoRoot, 'docs/specs/http-core-parity-slice.json')

type RouteDef = { method: string; path: string; handlerId: number }
type CorpusCase = {
	id: string
	domain: string
	input: Record<string, unknown>
}
type Corpus = {
	corpusVersion: number
	slice: string
	cases: CorpusCase[]
}

const METHODS: Record<string, number> = {
	GET: 0,
	POST: 1,
	PUT: 2,
	DELETE: 3,
	PATCH: 4,
	HEAD: 5,
	OPTIONS: 6,
	CONNECT: 7,
	TRACE: 8,
}

const METHOD_NAMES = Object.fromEntries(
	Object.entries(METHODS).map(([name, code]) => [code, name])
) as Record<number, string>

function sha256File(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sha256Concat(paths: string[]): string {
	const digest = paths.map((path) => sha256File(path)).join('')
	return createHash('sha256').update(digest).digest('hex')
}

// --- Router (mirrors gust-router radix priority: static > param > wildcard) ---

type Node = {
	children: Map<string, Node>
	paramChild: { name: string; node: Node } | null
	wildcardChild: { name: string; handlerId: number } | null
	handlerId: number | null
}

function emptyNode(): Node {
	return {
		children: new Map(),
		paramChild: null,
		wildcardChild: null,
		handlerId: null,
	}
}

function insertNode(node: Node, segments: string[], handlerId: number): void {
	if (segments.length === 0) {
		node.handlerId = handlerId
		return
	}
	const segment = segments[0]
	const rest = segments.slice(1)
	if (segment.startsWith(':')) {
		const name = segment.slice(1)
		if (!node.paramChild) {
			node.paramChild = { name, node: emptyNode() }
		}
		insertNode(node.paramChild.node, rest, handlerId)
	} else if (segment.startsWith('*')) {
		const name = segment.slice(1) || '*'
		node.wildcardChild = { name, handlerId }
	} else {
		let child = node.children.get(segment)
		if (!child) {
			child = emptyNode()
			node.children.set(segment, child)
		}
		insertNode(child, rest, handlerId)
	}
}

function findNode(
	node: Node,
	segments: string[],
	params: [string, string][]
): { handlerId: number; params: [string, string][] } | null {
	if (segments.length === 0) {
		if (node.handlerId == null) return null
		return { handlerId: node.handlerId, params: [...params] }
	}
	const segment = segments[0]
	const rest = segments.slice(1)

	const staticChild = node.children.get(segment)
	if (staticChild) {
		const m = findNode(staticChild, rest, params)
		if (m) return m
	}

	if (node.paramChild) {
		params.push([node.paramChild.name, segment])
		const m = findNode(node.paramChild.node, rest, params)
		if (m) return m
		params.pop()
	}

	if (node.wildcardChild) {
		const restPath = segments.join('/')
		params.push([node.wildcardChild.name, restPath])
		return {
			handlerId: node.wildcardChild.handlerId,
			params: [...params],
		}
	}

	return null
}

function routerLookup(routes: RouteDef[], method: string, path: string): Record<string, unknown> {
	const trees = new Map<string, Node>()
	for (const route of routes) {
		const key = route.method.toUpperCase()
		let tree = trees.get(key)
		if (!tree) {
			tree = emptyNode()
			trees.set(key, tree)
		}
		const segments = route.path.split('/').filter(Boolean)
		insertNode(tree, segments, route.handlerId)
	}
	const tree = trees.get(method.toUpperCase())
	if (!tree) return { found: false }
	const segments = path.split('/').filter(Boolean)
	const match = findNode(tree, segments, [])
	if (!match) return { found: false }
	return {
		found: true,
		handlerId: match.handlerId,
		params: match.params.map(([name, value]) => ({ name, value })),
	}
}

// --- Method parse SSOT ---

function parseMethodBytes(bytes: string): Record<string, unknown> {
	const code = METHODS[bytes]
	if (code === undefined) return { ok: false }
	return { ok: true, code, name: METHOD_NAMES[code] }
}

function parseMethodFromStr(value: string): Record<string, unknown> {
	const upper = value.toUpperCase()
	const code = METHODS[upper]
	if (code === undefined) return { ok: false }
	return { ok: true, code, name: METHOD_NAMES[code] }
}

function parseMethodFromU8(code: number): Record<string, unknown> {
	const name = METHOD_NAMES[code]
	if (name === undefined) return { ok: false }
	return { ok: true, code, name }
}

function methodAsStr(code: number): Record<string, unknown> {
	const name = METHOD_NAMES[code]
	if (name === undefined) return { ok: false }
	return { ok: true, name }
}

// --- W3C traceparent ---

function isHex(s: string): boolean {
	return /^[0-9a-fA-F]+$/.test(s)
}

function parseTraceparent(header: string): Record<string, unknown> {
	const parts = header.split('-')
	if (parts.length !== 4) return { ok: false }
	const [version, traceId, spanId, flags] = parts
	if (version !== '00') return { ok: false }
	if (traceId.length !== 32 || !isHex(traceId)) return { ok: false }
	if ([...traceId].every((c) => c === '0')) return { ok: false }
	if (spanId.length !== 16 || !isHex(spanId)) return { ok: false }
	if (flags.length !== 2 || !isHex(flags)) return { ok: false }
	const traceFlags = Number.parseInt(flags, 16)
	if (Number.isNaN(traceFlags)) return { ok: false }
	return {
		ok: true,
		traceId,
		spanId,
		traceFlags,
	}
}

function formatTraceparent(
	traceId: string,
	spanId: string,
	traceFlags: number
): Record<string, unknown> {
	const flags = traceFlags.toString(16).padStart(2, '0')
	return {
		header: `00-${traceId}-${spanId}-${flags}`,
	}
}

function evaluateCase(c: CorpusCase): Record<string, unknown> {
	switch (c.domain) {
		case 'http-core.router': {
			const routes = c.input.routes as RouteDef[]
			const lookup = c.input.lookup as { method: string; path: string }
			return routerLookup(routes, lookup.method, lookup.path)
		}
		case 'http-core.parse': {
			const kind = c.input.kind as string
			if (kind === 'methodBytes') {
				return parseMethodBytes(c.input.bytes as string)
			}
			if (kind === 'methodFromStr') {
				return parseMethodFromStr(c.input.value as string)
			}
			if (kind === 'methodFromU8') {
				return parseMethodFromU8(c.input.code as number)
			}
			if (kind === 'methodAsStr') {
				return methodAsStr(c.input.code as number)
			}
			throw new Error(`unknown parse kind ${kind} in case ${c.id}`)
		}
		case 'trace.w3c': {
			const kind = c.input.kind as string
			if (kind === 'parse') {
				return parseTraceparent(c.input.header as string)
			}
			if (kind === 'format') {
				return formatTraceparent(
					c.input.traceId as string,
					c.input.spanId as string,
					c.input.traceFlags as number
				)
			}
			throw new Error(`unknown trace kind ${kind} in case ${c.id}`)
		}
		default:
			throw new Error(`unknown domain ${c.domain} in case ${c.id}`)
	}
}

const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus
const cases = corpus.cases.map((c) => ({
	...c,
	output: evaluateCase(c),
}))

const fixtureCorpusHash = sha256File(corpusPath)
const behaviorSpecHash = sha256Concat([corpusPath, paritySlicePath])

const result = {
	corpusVersion: corpus.corpusVersion,
	slice: corpus.slice,
	fixtureCorpusHash,
	behaviorSpecHash,
	caseCount: cases.length,
	cases,
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
