/**
 * Body and Query String Parsing
 * JSON, URL-encoded form, multipart, and query string parsing
 */

export type ParsedBody = {
	readonly json: <T = unknown>() => T
	readonly text: () => string
	readonly form: () => Record<string, string>
	readonly raw: Buffer
}

/**
 * Parse query string into object
 */
export const parseQuery = (queryString: string): Record<string, string | string[]> => {
	const params: Record<string, string | string[]> = {}

	if (!queryString) return params

	// Remove leading ? if present
	const qs = queryString.startsWith('?') ? queryString.slice(1) : queryString

	for (const pair of qs.split('&')) {
		const [rawKey, rawValue = ''] = pair.split('=')

		if (!rawKey) continue

		const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
		const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))

		// Handle array notation (key[] or key[0])
		if (key.endsWith('[]')) {
			const arrayKey = key.slice(0, -2)
			const existing = params[arrayKey]
			if (Array.isArray(existing)) {
				existing.push(value)
			} else if (existing !== undefined) {
				params[arrayKey] = [existing, value]
			} else {
				params[arrayKey] = [value]
			}
		} else if (params[key] !== undefined) {
			// Multiple values for same key
			const existing = params[key]
			if (Array.isArray(existing)) {
				existing.push(value)
			} else {
				params[key] = [existing, value]
			}
		} else {
			params[key] = value
		}
	}

	return params
}

/**
 * Stringify object to query string
 */
export const stringifyQuery = (
	params: Record<string, string | string[] | number | boolean | undefined>
): string => {
	const parts: string[] = []

	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue

		if (Array.isArray(value)) {
			for (const v of value) {
				parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(v)}`)
			}
		} else {
			parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
		}
	}

	return parts.join('&')
}

/**
 * Parse URL-encoded form body
 */
export const parseFormBody = (body: Buffer | string): Record<string, string> => {
	const str = typeof body === 'string' ? body : body.toString('utf8')
	const result: Record<string, string> = {}

	for (const pair of str.split('&')) {
		const [rawKey, rawValue = ''] = pair.split('=')

		if (!rawKey) continue

		const key = decodeURIComponent(rawKey.replace(/\+/g, ' '))
		const value = decodeURIComponent(rawValue.replace(/\+/g, ' '))

		result[key] = value
	}

	return result
}

/**
 * Parse JSON body safely
 */
export const parseJsonBody = <T = unknown>(body: Buffer | string): T => {
	const str = typeof body === 'string' ? body : body.toString('utf8')
	return JSON.parse(str) as T
}

/**
 * Multipart boundary parser
 */
export type MultipartPart = {
	readonly name: string
	readonly filename?: string
	readonly contentType?: string
	readonly data: Buffer
}

/**
 * Parse multipart form data
 */
export const parseMultipart = (body: Buffer, boundary: string): MultipartPart[] => {
	const parts: MultipartPart[] = []
	const boundaryBuf = Buffer.from(`--${boundary}`)
	const endBoundaryBuf = Buffer.from(`--${boundary}--`)

	let pos = 0

	// Skip preamble - find first boundary
	const firstBoundary = body.indexOf(boundaryBuf, pos)
	if (firstBoundary === -1) return parts

	pos = firstBoundary + boundaryBuf.length

	while (pos < body.length) {
		// Skip CRLF after boundary
		if (body[pos] === 0x0d && body[pos + 1] === 0x0a) {
			pos += 2
		}

		// Check for end boundary
		if (body.indexOf(endBoundaryBuf, pos - boundaryBuf.length - 2) !== -1) {
			break
		}

		// Parse headers
		const headersEnd = body.indexOf(Buffer.from('\r\n\r\n'), pos)
		if (headersEnd === -1) break

		const headersStr = body.subarray(pos, headersEnd).toString('utf8')
		const headers: Record<string, string> = {}

		for (const line of headersStr.split('\r\n')) {
			const colonIdx = line.indexOf(':')
			if (colonIdx > 0) {
				const key = line.substring(0, colonIdx).trim().toLowerCase()
				const value = line.substring(colonIdx + 1).trim()
				headers[key] = value
			}
		}

		pos = headersEnd + 4 // Skip \r\n\r\n

		// Find next boundary
		const nextBoundary = body.indexOf(boundaryBuf, pos)
		if (nextBoundary === -1) break

		// Extract data (remove trailing CRLF)
		let dataEnd = nextBoundary - 2
		if (body[dataEnd] !== 0x0d || body[dataEnd + 1] !== 0x0a) {
			dataEnd = nextBoundary
		}

		const data = body.subarray(pos, dataEnd)

		// Parse Content-Disposition
		const disposition = headers['content-disposition'] || ''
		const nameMatch = disposition.match(/name="([^"]*)"/)
		const filenameMatch = disposition.match(/filename="([^"]*)"/)

		if (nameMatch?.[1]) {
			parts.push({
				name: nameMatch[1],
				filename: filenameMatch?.[1],
				contentType: headers['content-type'],
				data: Buffer.from(data),
			})
		}

		pos = nextBoundary + boundaryBuf.length
	}

	return parts
}

/**
 * Extract boundary from Content-Type header
 */
export const extractBoundary = (contentType: string): string | null => {
	const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/)
	return match ? (match[1] ?? match[2] ?? null) : null
}

/**
 * Get content type without parameters
 */
export const getContentType = (contentTypeHeader: string | undefined): string => {
	if (!contentTypeHeader) return ''
	return contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? ''
}

/**
 * Check if content type is JSON
 */
export const isJsonContent = (contentType: string): boolean => {
	const ct = getContentType(contentType)
	return ct === 'application/json' || ct.endsWith('+json')
}

/**
 * Check if content type is form
 */
export const isFormContent = (contentType: string): boolean => {
	return getContentType(contentType) === 'application/x-www-form-urlencoded'
}

/**
 * Check if content type is multipart
 */
export const isMultipartContent = (contentType: string): boolean => {
	return getContentType(contentType).startsWith('multipart/')
}
