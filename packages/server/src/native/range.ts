/**
 * Native Range Requests
 *
 * HTTP range parsing, Content-Range formatting, MIME type lookup and ETag
 * generation backed by the native Rust implementation.
 */

import { loadNative } from './loader'
import type { NativeParsedRange } from './types'

// ============================================================================
// Native Range Requests
// ============================================================================

/**
 * Parse HTTP Range header using native Rust implementation
 */
export const nativeParseRange = (header: string, fileSize: number): NativeParsedRange | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.parseRangeHeader(header, fileSize)
}

/**
 * Generate Content-Range header value
 */
export const nativeContentRange = (start: number, end: number, total: number): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.contentRangeHeader(start, end, total)
}

/**
 * Get MIME type from file extension
 */
export const nativeGetMimeType = (extension: string): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.getMimeType(extension)
}

/**
 * Generate ETag from file metadata
 */
export const nativeGenerateEtag = (mtimeMs: number, size: number): string | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateEtag(mtimeMs, size)
}
