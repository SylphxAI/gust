/**
 * Static file serving
 * Efficient file serving with MIME type detection and caching headers
 */

import type { Stats } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import type { Context } from '@sylphx/gust-app'
import type { Handler, ServerResponse } from '@sylphx/gust-core'
import { notFound, response } from '@sylphx/gust-core'

export type StaticOptions = {
	readonly root: string
	readonly index?: string | string[]
	readonly maxAge?: number
	readonly immutable?: boolean
	readonly dotfiles?: 'allow' | 'deny' | 'ignore'
	readonly etag?: boolean
	readonly lastModified?: boolean
}

// MIME types for common file extensions
const MIME_TYPES: Record<string, string> = {
	// Text
	'.html': 'text/html; charset=utf-8',
	'.htm': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
	'.csv': 'text/csv; charset=utf-8',

	// Images
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.webp': 'image/webp',
	'.avif': 'image/avif',

	// Fonts
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.eot': 'application/vnd.ms-fontobject',

	// Audio/Video
	'.mp3': 'audio/mpeg',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.ogg': 'audio/ogg',
	'.wav': 'audio/wav',

	// Documents
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.gz': 'application/gzip',
	'.tar': 'application/x-tar',

	// WebAssembly
	'.wasm': 'application/wasm',

	// Source maps
	'.map': 'application/json',
}

/**
 * Get MIME type for file extension
 */
const getMimeType = (path: string): string => {
	const ext = extname(path).toLowerCase()
	return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * Generate simple ETag from file stats
 */
const generateEtag = (size: number, mtime: number): string => {
	return `"${size.toString(16)}-${mtime.toString(16)}"`
}

/**
 * Check if path is safe (no directory traversal)
 */
const isSafePath = (requestPath: string, root: string): string | null => {
	// Normalize and resolve path
	const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, '')
	const fullPath = join(root, normalizedPath)

	// Ensure path is within root
	if (!fullPath.startsWith(root)) {
		return null
	}

	return fullPath
}

/**
 * Create static file serving handler
 */
export const serveStatic = (options: StaticOptions): Handler<Context> => {
	const {
		root,
		index = ['index.html'],
		maxAge = 0,
		immutable = false,
		dotfiles = 'ignore',
		etag = true,
		lastModified = true,
	} = options

	const indexFiles = Array.isArray(index) ? index : [index]

	return async (ctx: Context): Promise<ServerResponse> => {
		// Only handle GET and HEAD
		if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
			return notFound()
		}

		const requestPath = ctx.path

		// Check for dotfiles
		const pathParts = requestPath.split('/')
		const hasDotfile = pathParts.some(
			(part) => part.startsWith('.') && part !== '.' && part !== '..'
		)

		if (hasDotfile) {
			if (dotfiles === 'deny') {
				return response(null, { status: 403, headers: {} })
			}
			if (dotfiles === 'ignore') {
				return notFound()
			}
		}

		// Resolve safe path
		const safePath = isSafePath(requestPath, root)
		if (!safePath) {
			return response(null, { status: 403, headers: {} })
		}

		// Try to stat the path
		let filePath = safePath
		let stats: Stats

		try {
			stats = await stat(filePath)

			// If directory, try index files
			if (stats.isDirectory()) {
				let found = false
				for (const indexFile of indexFiles) {
					const indexPath = join(filePath, indexFile)
					try {
						stats = await stat(indexPath)
						if (stats.isFile()) {
							filePath = indexPath
							found = true
							break
						}
					} catch {
						// Try next index file
					}
				}
				if (!found) {
					return notFound()
				}
			}
		} catch {
			return notFound()
		}

		// Check if file
		if (!stats.isFile()) {
			return notFound()
		}

		// Build headers
		const headers: Record<string, string> = {
			'content-type': getMimeType(filePath),
		}

		// Cache control
		if (maxAge > 0 || immutable) {
			const parts = []
			if (maxAge > 0) {
				parts.push(`max-age=${maxAge}`)
			}
			if (immutable) {
				parts.push('immutable')
			}
			headers['cache-control'] = parts.join(', ')
		}

		// ETag
		if (etag) {
			headers.etag = generateEtag(stats.size, stats.mtimeMs)
		}

		// Last-Modified
		if (lastModified) {
			headers['last-modified'] = stats.mtime.toUTCString()
		}

		// Check conditional requests
		const ifNoneMatch = ctx.headers['if-none-match']
		const ifModifiedSince = ctx.headers['if-modified-since']

		if (etag && ifNoneMatch) {
			const currentEtag = headers.etag
			if (ifNoneMatch === currentEtag || ifNoneMatch === `W/${currentEtag}`) {
				return response(null, { status: 304, headers })
			}
		}

		if (lastModified && ifModifiedSince) {
			const modifiedDate = new Date(ifModifiedSince)
			if (stats.mtime <= modifiedDate) {
				return response(null, { status: 304, headers })
			}
		}

		// HEAD request - no body
		if (ctx.method === 'HEAD') {
			headers['content-length'] = stats.size.toString()
			return response(null, { status: 200, headers })
		}

		// Read and return file
		const content = await readFile(filePath)
		return response(content.toString(), { status: 200, headers })
	}
}
