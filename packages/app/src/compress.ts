/**
 * Response compression
 * Supports gzip, deflate, and brotli
 */

import { brotliCompressSync, constants, deflateSync, gzipSync } from 'node:zlib'
import type { Handler, ServerResponse } from '@sylphx/gust-core'
import type { Context } from './context'
import type { Middleware } from './types'

export type CompressionOptions = {
	/** Minimum size to compress (default: 1024 bytes) */
	readonly threshold?: number
	/** Compression level (1-9, default: 6) */
	readonly level?: number
	/** Encodings to support (default: ['br', 'gzip', 'deflate']) */
	readonly encodings?: Array<'br' | 'gzip' | 'deflate'>
	/** MIME types to compress */
	readonly mimeTypes?: string[]
}

// Default MIME types that should be compressed
const DEFAULT_COMPRESSIBLE_TYPES = [
	'text/html',
	'text/plain',
	'text/css',
	'text/javascript',
	'text/xml',
	'application/json',
	'application/javascript',
	'application/xml',
	'application/xhtml+xml',
	'application/rss+xml',
	'application/atom+xml',
	'image/svg+xml',
]

/**
 * Check if content type is compressible
 */
const isCompressible = (contentType: string | undefined, allowedTypes: string[]): boolean => {
	if (!contentType) return false

	// Extract MIME type without charset
	const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? ''

	return allowedTypes.some((type) => {
		if (type.endsWith('/*')) {
			// Wildcard match (e.g., text/*)
			return mimeType.startsWith(type.slice(0, -1))
		}
		return mimeType === type
	})
}

/**
 * Parse Accept-Encoding header and find best encoding
 */
const selectEncoding = (
	acceptEncoding: string,
	supportedEncodings: Array<'br' | 'gzip' | 'deflate'>
): 'br' | 'gzip' | 'deflate' | null => {
	if (!acceptEncoding) return null

	// Parse encodings with quality values
	const encodings = acceptEncoding
		.split(',')
		.map((e) => {
			const parts = e.trim().split(';q=')
			const name = parts[0]?.trim().toLowerCase() ?? ''
			const qValue = parts[1]
			return {
				name,
				q: qValue ? parseFloat(qValue) : 1,
			}
		})
		.filter((e) => e.q > 0 && e.name)
		.sort((a, b) => b.q - a.q)

	// Find first supported encoding
	for (const { name } of encodings) {
		if (name === 'br' && supportedEncodings.includes('br')) return 'br'
		if (name === 'gzip' && supportedEncodings.includes('gzip')) return 'gzip'
		if (name === 'deflate' && supportedEncodings.includes('deflate')) return 'deflate'
		if (name === '*') {
			// Wildcard - use first supported
			return supportedEncodings[0] || null
		}
	}

	return null
}

/**
 * Compress data with specified encoding
 */
const compressData = (data: Buffer, encoding: 'br' | 'gzip' | 'deflate', level: number): Buffer => {
	switch (encoding) {
		case 'br':
			return brotliCompressSync(data, {
				params: {
					[constants.BROTLI_PARAM_QUALITY]: Math.min(level, 11),
				},
			})
		case 'gzip':
			return gzipSync(data, { level })
		case 'deflate':
			return deflateSync(data, { level })
	}
}

/**
 * Create compression middleware
 *
 * Compresses responses using gzip, deflate, or brotli.
 * Works as both global middleware and route-level middleware.
 *
 * @example
 * ```typescript
 * serve({
 *   middleware: compress(),
 *   routes: [...]
 * })
 * ```
 */
export const compress = (options: CompressionOptions = {}): Middleware => {
	const {
		threshold = 1024,
		level = 6,
		encodings = ['br', 'gzip', 'deflate'],
		mimeTypes = DEFAULT_COMPRESSIBLE_TYPES,
	} = options

	return <App>(handler: Handler<Context<App>>): Handler<Context<App>> =>
		async (ctx: Context<App>): Promise<ServerResponse> => {
			// Execute handler
			const response = await handler(ctx)

			// Skip if no body
			if (response.body === null) {
				return response
			}

			// Skip if body is streaming (AsyncIterable)
			if (typeof response.body === 'object' && Symbol.asyncIterator in response.body) {
				return response
			}

			// Skip if already encoded
			if (response.headers['content-encoding']) {
				return response
			}

			// Check content type
			const contentType = response.headers['content-type']
			if (!isCompressible(contentType, mimeTypes)) {
				return response
			}

			// Get body as buffer (only for buffered responses)
			const bodyBuffer = Buffer.from(response.body as string | Buffer)

			// Skip if below threshold
			if (bodyBuffer.length < threshold) {
				return response
			}

			// Select encoding based on Accept-Encoding header
			const acceptEncoding = ctx.headers['accept-encoding'] || ''
			const encoding = selectEncoding(acceptEncoding, encodings)

			if (!encoding) {
				return response
			}

			// Compress
			try {
				const compressed = compressData(bodyBuffer, encoding, level)

				// Only use compressed if smaller
				if (compressed.length >= bodyBuffer.length) {
					return response
				}

				return {
					...response,
					body: compressed,
					headers: {
						...response.headers,
						'content-encoding': encoding,
						'content-length': compressed.length.toString(),
						vary: response.headers.vary
							? `${response.headers.vary}, Accept-Encoding`
							: 'Accept-Encoding',
					},
				}
			} catch {
				// Compression failed, return original
				return response
			}
		}
}

/**
 * Convenience wrapper for gzip-only compression
 */
export const gzip = (level = 6): Middleware => compress({ encodings: ['gzip'], level })

/**
 * Convenience wrapper for brotli-only compression
 */
export const brotli = (level = 6): Middleware => compress({ encodings: ['br'], level })
