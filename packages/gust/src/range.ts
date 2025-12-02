/**
 * Range Requests
 * HTTP Range header support for video/audio seeking and resumable downloads
 */

import type { Stats } from 'node:fs'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { Socket } from 'node:net'
import { extname, join } from 'node:path'
import type { TLSSocket } from 'node:tls'
import type { ServerResponse } from '@sylphx/gust-core'
import { notFound, response } from '@sylphx/gust-core'
import type { Context } from './context'

export type Range = {
	/** Start byte (inclusive) */
	start: number
	/** End byte (inclusive) */
	end: number
}

export type ParsedRange = {
	/** Unit (usually 'bytes') */
	unit: string
	/** Parsed ranges */
	ranges: Range[]
}

/**
 * Parse Range header
 * Format: bytes=0-499, 500-999, -500 (last 500), 500- (from 500 to end)
 */
export const parseRange = (rangeHeader: string, fileSize: number): ParsedRange | null => {
	const match = rangeHeader.match(/^(\w+)=(.+)$/)
	if (!match) return null

	const unit = match[1]
	const rangeSpec = match[2]
	if (unit !== 'bytes' || !rangeSpec) return null

	const ranges: Range[] = []

	for (const part of rangeSpec.split(',')) {
		const trimmed = part.trim()
		const rangeParts = trimmed.split('-')

		if (rangeParts.length !== 2) continue

		const startStr = rangeParts[0] ?? ''
		const endStr = rangeParts[1] ?? ''

		let start: number
		let end: number

		if (startStr === '') {
			// Suffix range: -500 means last 500 bytes
			const suffix = parseInt(endStr, 10)
			if (Number.isNaN(suffix) || suffix <= 0) continue
			start = Math.max(0, fileSize - suffix)
			end = fileSize - 1
		} else if (endStr === '') {
			// Open-ended: 500- means from 500 to end
			start = parseInt(startStr, 10)
			if (Number.isNaN(start) || start < 0) continue
			end = fileSize - 1
		} else {
			// Full range: 0-499
			start = parseInt(startStr, 10)
			end = parseInt(endStr, 10)
			if (Number.isNaN(start) || Number.isNaN(end)) continue
		}

		// Validate range
		if (start > end || start >= fileSize) continue

		// Clamp end to file size
		end = Math.min(end, fileSize - 1)

		ranges.push({ start, end })
	}

	if (ranges.length === 0) return null

	return { unit, ranges }
}

/**
 * Check if range is satisfiable
 */
export const isRangeSatisfiable = (ranges: Range[], fileSize: number): boolean => {
	return ranges.every((r) => r.start < fileSize && r.end < fileSize)
}

/**
 * Create Content-Range header value
 */
export const contentRange = (start: number, end: number, total: number): string => {
	return `bytes ${start}-${end}/${total}`
}

/**
 * Get MIME type from extension
 */
const getMimeType = (ext: string): string => {
	const types: Record<string, string> = {
		// Video
		'.mp4': 'video/mp4',
		'.webm': 'video/webm',
		'.ogg': 'video/ogg',
		'.ogv': 'video/ogg',
		'.avi': 'video/x-msvideo',
		'.mov': 'video/quicktime',
		'.mkv': 'video/x-matroska',
		'.m4v': 'video/x-m4v',
		// Audio
		'.mp3': 'audio/mpeg',
		'.wav': 'audio/wav',
		'.flac': 'audio/flac',
		'.aac': 'audio/aac',
		'.m4a': 'audio/mp4',
		'.oga': 'audio/ogg',
		'.weba': 'audio/webm',
		// Documents
		'.pdf': 'application/pdf',
		'.zip': 'application/zip',
		'.gz': 'application/gzip',
		// Images
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.png': 'image/png',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.svg': 'image/svg+xml',
	}
	return types[ext.toLowerCase()] || 'application/octet-stream'
}

export type RangeFileOptions = {
	/** Root directory */
	root: string
	/** Max age for Cache-Control (default: 1 day) */
	maxAge?: number
	/** Allowed extensions (default: all) */
	extensions?: string[]
}

/**
 * Serve file with range support (for video/audio streaming)
 * Writes directly to socket for streaming
 */
export const serveRangeFile = async (
	ctx: Context,
	filePath: string,
	options: Partial<RangeFileOptions> = {}
): Promise<ServerResponse | null> => {
	const { maxAge = 86400 } = options

	// Get file stats
	let stats: Stats
	try {
		stats = await stat(filePath)
	} catch {
		return notFound()
	}

	if (!stats.isFile()) {
		return notFound()
	}

	const fileSize = stats.size
	const ext = extname(filePath)
	const mimeType = getMimeType(ext)
	const lastModified = stats.mtime.toUTCString()
	const etag = `"${stats.mtime.getTime().toString(16)}-${fileSize.toString(16)}"`

	// Check conditional headers
	const ifNoneMatch = ctx.headers['if-none-match']
	if (ifNoneMatch === etag) {
		return response('', {
			status: 304,
			headers: { etag, 'last-modified': lastModified },
		})
	}

	const ifModifiedSince = ctx.headers['if-modified-since']
	if (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime) {
		return response('', {
			status: 304,
			headers: { etag, 'last-modified': lastModified },
		})
	}

	// Check for Range header
	const rangeHeader = ctx.headers.range

	// No range - stream entire file
	if (!rangeHeader) {
		return streamFile(ctx.socket, filePath, {
			status: 200,
			headers: {
				'content-type': mimeType,
				'content-length': String(fileSize),
				'accept-ranges': 'bytes',
				'cache-control': `public, max-age=${maxAge}`,
				'last-modified': lastModified,
				etag,
			},
		})
	}

	// Parse range
	const parsed = parseRange(rangeHeader, fileSize)

	if (!parsed || parsed.ranges.length === 0) {
		// Invalid range
		return response('Range Not Satisfiable', {
			status: 416,
			headers: { 'content-range': `bytes */${fileSize}` },
		})
	}

	// We only support single ranges for simplicity
	// Multi-part ranges require multipart/byteranges response
	const range = parsed.ranges[0]
	if (!range) {
		return response('Range Not Satisfiable', {
			status: 416,
			headers: { 'content-range': `bytes */${fileSize}` },
		})
	}
	const contentLength = range.end - range.start + 1

	return streamFile(ctx.socket, filePath, {
		status: 206,
		headers: {
			'content-type': mimeType,
			'content-length': String(contentLength),
			'content-range': contentRange(range.start, range.end, fileSize),
			'accept-ranges': 'bytes',
			'cache-control': `public, max-age=${maxAge}`,
			'last-modified': lastModified,
			etag,
		},
		start: range.start,
		end: range.end,
	})
}

type StreamOptions = {
	status: number
	headers: Record<string, string>
	start?: number
	end?: number
}

/**
 * Stream file to socket (bypasses normal response flow)
 */
const streamFile = (
	socket: Socket | TLSSocket,
	filePath: string,
	options: StreamOptions
): Promise<ServerResponse | null> => {
	return new Promise((resolve, reject) => {
		const { status, headers, start, end } = options

		// Build HTTP response head
		const statusText = status === 200 ? 'OK' : 'Partial Content'
		let head = `HTTP/1.1 ${status} ${statusText}\r\n`
		for (const [key, value] of Object.entries(headers)) {
			head += `${key}: ${value}\r\n`
		}
		head += 'connection: keep-alive\r\n'
		head += '\r\n'

		// Write headers
		socket.write(head)

		// Create read stream with optional range
		const streamOptions: { start?: number; end?: number } = {}
		if (start !== undefined) streamOptions.start = start
		if (end !== undefined) streamOptions.end = end

		const readStream = createReadStream(filePath, streamOptions)

		readStream.on('error', (err) => {
			socket.end()
			reject(err)
		})

		readStream.on('end', () => {
			// Return null to signal response was already sent
			resolve(null)
		})

		// Pipe file to socket
		readStream.pipe(socket, { end: false })
	})
}

export type RangeOptions = {
	/** Root directory for files */
	root: string
	/** URL prefix to strip (default: /) */
	prefix?: string
	/** Max age for caching (default: 1 day) */
	maxAge?: number
	/** Allowed extensions */
	extensions?: string[]
}

/**
 * Create range-supporting file server middleware
 * Use for video/audio streaming endpoints
 */
export const rangeServer = (options: RangeOptions) => {
	const {
		root,
		prefix = '/',
		maxAge = 86400,
		extensions = ['.mp4', '.webm', '.mp3', '.wav', '.pdf'],
	} = options

	return async (ctx: Context): Promise<ServerResponse | null> => {
		// Only handle GET/HEAD
		if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
			return null
		}

		// Strip prefix
		let path = ctx.path
		if (prefix !== '/' && path.startsWith(prefix)) {
			path = path.slice(prefix.length) || '/'
		}

		// Security: prevent directory traversal
		if (path.includes('..')) {
			return response('Bad Request', { status: 400 })
		}

		// Check extension
		const ext = extname(path).toLowerCase()
		if (extensions.length > 0 && !extensions.includes(ext)) {
			return null
		}

		const filePath = join(root, path)
		return serveRangeFile(ctx, filePath, { maxAge })
	}
}

/**
 * Check if request accepts range
 */
export const acceptsRange = (ctx: Context): boolean => {
	return ctx.headers.range !== undefined
}

/**
 * Get requested range info
 */
export const getRange = (ctx: Context, fileSize: number): Range | null => {
	const rangeHeader = ctx.headers.range
	if (!rangeHeader) return null

	const parsed = parseRange(rangeHeader, fileSize)
	if (!parsed || parsed.ranges.length === 0) return null

	return parsed.ranges[0] ?? null
}
