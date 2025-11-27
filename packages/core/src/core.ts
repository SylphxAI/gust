/**
 * WASM Core - Loads and initializes the WASM module
 * Universal: works in Browser, Bun, Node.js, Deno
 */

// WASM module types
export interface ParseResult {
	state: number // 0=incomplete, 1=complete, 2=error
	method: number
	path_start: number
	path_end: number
	query_start: number
	query_end: number
	headers_count: number
	body_start: number
	header_offsets: Uint32Array
	free(): void
}

export interface RouteMatch {
	found: boolean
	handler_id: number
	params: string[]
	free(): void
}

export interface WasmRouter {
	insert(method: string, path: string, handler_id: number): void
	find(method: string, path: string): RouteMatch
	free(): void
}

export interface WasmCore {
	parse_http(buf: Uint8Array): ParseResult
	method_to_string(code: number): string
	WasmRouter: new () => WasmRouter
}

let wasmCore: WasmCore | null = null

/**
 * Detect runtime environment
 */
const isBrowser = typeof globalThis !== 'undefined' && 'window' in globalThis
const _isNode = typeof process !== 'undefined' && process.versions?.node

/**
 * Initialize WASM module for server (Node.js/Bun/Deno)
 */
async function initWasmServer(): Promise<WasmCore> {
	const { readFile } = await import('node:fs/promises')
	const { fileURLToPath } = await import('node:url')
	const { dirname, join } = await import('node:path')

	const __filename = fileURLToPath(import.meta.url)
	const __dirname = dirname(__filename)
	const wasmPath = join(__dirname, 'wasm', 'serve_core_bg.wasm')

	const wasmBuffer = await readFile(wasmPath)
	const wasmModule = await import('./wasm/serve_core.js')
	wasmModule.initSync(wasmBuffer)

	return {
		parse_http: wasmModule.parse_http,
		method_to_string: wasmModule.method_to_string,
		WasmRouter: wasmModule.WasmRouter,
	}
}

/**
 * Initialize WASM module for browser
 */
async function initWasmBrowser(wasmUrl?: string): Promise<WasmCore> {
	const wasmModule = await import('./wasm/serve_core.js')

	// Use default URL or provided URL
	const url = wasmUrl || new URL('./wasm/serve_core_bg.wasm', import.meta.url).href

	// Use streaming instantiation for better performance
	await wasmModule.default(url)

	return {
		parse_http: wasmModule.parse_http,
		method_to_string: wasmModule.method_to_string,
		WasmRouter: wasmModule.WasmRouter,
	}
}

/**
 * Initialize WASM module (auto-detects environment)
 * @param wasmUrl - Optional URL to WASM file (browser only)
 */
export async function initWasm(wasmUrl?: string): Promise<WasmCore> {
	if (wasmCore) return wasmCore

	wasmCore = isBrowser ? await initWasmBrowser(wasmUrl) : await initWasmServer()

	return wasmCore
}

/**
 * Get initialized WASM core (throws if not initialized)
 */
export function getWasm(): WasmCore {
	if (!wasmCore) {
		throw new Error('WASM not initialized. Call initWasm() first.')
	}
	return wasmCore
}

/**
 * Check if WASM is initialized
 */
export function isWasmReady(): boolean {
	return wasmCore !== null
}

// HTTP Methods
export const Methods = {
	GET: 0,
	POST: 1,
	PUT: 2,
	DELETE: 3,
	PATCH: 4,
	HEAD: 5,
	OPTIONS: 6,
	CONNECT: 7,
	TRACE: 8,
} as const

export type MethodCode = (typeof Methods)[keyof typeof Methods]

export const MethodNames: Record<MethodCode, string> = {
	0: 'GET',
	1: 'POST',
	2: 'PUT',
	3: 'DELETE',
	4: 'PATCH',
	5: 'HEAD',
	6: 'OPTIONS',
	7: 'CONNECT',
	8: 'TRACE',
}
