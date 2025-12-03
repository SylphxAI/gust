import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

const { platform, arch } = process

let nativeBinding = null
let localFileExisted = false
let loadError = null

function isMusl() {
	if (!process.report || typeof process.report.getReport !== 'function') {
		try {
			const lddPath = execSync('which ldd').toString().trim()
			return readFileSync(lddPath, 'utf8').includes('musl')
		} catch {
			return true
		}
	} else {
		const { glibcVersionRuntime } = process.report.getReport().header
		return !glibcVersionRuntime
	}
}

switch (platform) {
	case 'darwin':
		switch (arch) {
			case 'arm64':
				localFileExisted = existsSync(join(__dirname, 'gust-napi.darwin-arm64.node'))
				try {
					if (localFileExisted) {
						nativeBinding = require('./gust-napi.darwin-arm64.node')
					} else {
						nativeBinding = require('@sylphx/gust-napi-darwin-arm64')
					}
				} catch (e) {
					loadError = e
				}
				break
			case 'x64':
				localFileExisted = existsSync(join(__dirname, 'gust-napi.darwin-x64.node'))
				try {
					if (localFileExisted) {
						nativeBinding = require('./gust-napi.darwin-x64.node')
					} else {
						nativeBinding = require('@sylphx/gust-napi-darwin-x64')
					}
				} catch (e) {
					loadError = e
				}
				break
			default:
				throw new Error(`Unsupported architecture on macOS: ${arch}`)
		}
		break
	case 'linux':
		switch (arch) {
			case 'x64':
				if (isMusl()) {
					localFileExisted = existsSync(join(__dirname, 'gust-napi.linux-x64-musl.node'))
					try {
						if (localFileExisted) {
							nativeBinding = require('./gust-napi.linux-x64-musl.node')
						} else {
							nativeBinding = require('@sylphx/gust-napi-linux-x64-musl')
						}
					} catch (e) {
						loadError = e
					}
				} else {
					localFileExisted = existsSync(join(__dirname, 'gust-napi.linux-x64-gnu.node'))
					try {
						if (localFileExisted) {
							nativeBinding = require('./gust-napi.linux-x64-gnu.node')
						} else {
							nativeBinding = require('@sylphx/gust-napi-linux-x64-gnu')
						}
					} catch (e) {
						loadError = e
					}
				}
				break
			case 'arm64':
				if (isMusl()) {
					localFileExisted = existsSync(join(__dirname, 'gust-napi.linux-arm64-musl.node'))
					try {
						if (localFileExisted) {
							nativeBinding = require('./gust-napi.linux-arm64-musl.node')
						} else {
							nativeBinding = require('@sylphx/gust-napi-linux-arm64-musl')
						}
					} catch (e) {
						loadError = e
					}
				} else {
					localFileExisted = existsSync(join(__dirname, 'gust-napi.linux-arm64-gnu.node'))
					try {
						if (localFileExisted) {
							nativeBinding = require('./gust-napi.linux-arm64-gnu.node')
						} else {
							nativeBinding = require('@sylphx/gust-napi-linux-arm64-gnu')
						}
					} catch (e) {
						loadError = e
					}
				}
				break
			default:
				throw new Error(`Unsupported architecture on Linux: ${arch}`)
		}
		break
	default:
		throw new Error(`Unsupported platform: ${platform}`)
}

if (!nativeBinding) {
	if (loadError) {
		throw loadError
	}
	throw new Error(`Failed to load native binding`)
}

export const { GustServer, isIoUringAvailable, getCpuCount } = nativeBinding
