/**
 * Range Request Tests
 */

import { describe, expect, it } from 'bun:test'
import { acceptsRange, contentRange, getRange, isRangeSatisfiable, parseRange } from '@sylphx/gust'

// Mock context factory
const createMockContext = (headers: Record<string, string> = {}): any => ({
	method: 'GET',
	path: '/video.mp4',
	headers,
	body: Buffer.alloc(0),
	params: {},
	query: '',
	socket: {},
	raw: Buffer.alloc(0),
	json: () => ({}),
})

describe('Range Requests', () => {
	describe('parseRange', () => {
		it('should parse simple byte range', () => {
			const result = parseRange('bytes=0-499', 1000)
			expect(result).not.toBeNull()
			expect(result?.unit).toBe('bytes')
			expect(result?.ranges).toEqual([{ start: 0, end: 499 }])
		})

		it('should parse range from offset to end', () => {
			const result = parseRange('bytes=500-', 1000)
			expect(result?.ranges).toEqual([{ start: 500, end: 999 }])
		})

		it('should parse suffix range (last N bytes)', () => {
			const result = parseRange('bytes=-100', 1000)
			expect(result?.ranges).toEqual([{ start: 900, end: 999 }])
		})

		it('should clamp end to file size', () => {
			const result = parseRange('bytes=0-2000', 1000)
			expect(result?.ranges).toEqual([{ start: 0, end: 999 }])
		})

		it('should parse multiple ranges', () => {
			const result = parseRange('bytes=0-99, 200-299, 400-499', 1000)
			expect(result?.ranges).toHaveLength(3)
			expect(result?.ranges[0]).toEqual({ start: 0, end: 99 })
			expect(result?.ranges[1]).toEqual({ start: 200, end: 299 })
			expect(result?.ranges[2]).toEqual({ start: 400, end: 499 })
		})

		it('should return null for invalid format', () => {
			expect(parseRange('invalid', 1000)).toBeNull()
			expect(parseRange('', 1000)).toBeNull()
		})

		it('should return null for non-bytes unit', () => {
			expect(parseRange('chars=0-100', 1000)).toBeNull()
		})

		it('should skip invalid ranges', () => {
			// Start > end
			const result = parseRange('bytes=500-100', 1000)
			expect(result).toBeNull()
		})

		it('should skip unsatisfiable ranges', () => {
			// Start >= file size
			const result = parseRange('bytes=1000-1500', 1000)
			expect(result).toBeNull()
		})

		it('should handle suffix larger than file', () => {
			const result = parseRange('bytes=-2000', 1000)
			expect(result?.ranges).toEqual([{ start: 0, end: 999 }])
		})
	})

	describe('contentRange', () => {
		it('should format content range header', () => {
			expect(contentRange(0, 499, 1000)).toBe('bytes 0-499/1000')
			expect(contentRange(500, 999, 1000)).toBe('bytes 500-999/1000')
		})
	})

	describe('isRangeSatisfiable', () => {
		it('should return true for valid ranges', () => {
			const ranges = [
				{ start: 0, end: 499 },
				{ start: 500, end: 999 },
			]
			expect(isRangeSatisfiable(ranges, 1000)).toBe(true)
		})

		it('should return false for invalid ranges', () => {
			const ranges = [{ start: 1000, end: 1500 }]
			expect(isRangeSatisfiable(ranges, 1000)).toBe(false)
		})
	})

	describe('video seeking scenarios', () => {
		const videoSize = 10 * 1024 * 1024 // 10MB video

		it('should handle initial request (first chunk)', () => {
			const result = parseRange('bytes=0-', videoSize)
			expect(result?.ranges[0].start).toBe(0)
			expect(result?.ranges[0].end).toBe(videoSize - 1)
		})

		it('should handle seek to middle', () => {
			const result = parseRange('bytes=5242880-', videoSize) // Seek to 5MB
			expect(result?.ranges[0].start).toBe(5242880)
		})

		it('should handle seek to near end', () => {
			const result = parseRange('bytes=9961472-', videoSize) // Last ~100KB
			expect(result?.ranges[0].start).toBe(9961472)
			expect(result?.ranges[0].end).toBe(videoSize - 1)
		})

		it('should handle small chunk request', () => {
			const result = parseRange('bytes=1000000-1999999', videoSize) // 1MB chunk
			expect(result?.ranges[0].end - result?.ranges[0].start + 1).toBe(1000000)
		})
	})

	describe('acceptsRange', () => {
		it('should return true when Range header is present', () => {
			const ctx = createMockContext({ range: 'bytes=0-499' })
			expect(acceptsRange(ctx)).toBe(true)
		})

		it('should return false when Range header is absent', () => {
			const ctx = createMockContext({})
			expect(acceptsRange(ctx)).toBe(false)
		})

		it('should return true for any Range header value', () => {
			const ctx = createMockContext({ range: 'bytes=-100' })
			expect(acceptsRange(ctx)).toBe(true)
		})

		it('should handle empty Range header', () => {
			const ctx = createMockContext({ range: '' })
			// Empty string is still defined (not undefined), so returns true
			expect(acceptsRange(ctx)).toBe(true)
		})
	})

	describe('getRange', () => {
		it('should return range when valid Range header', () => {
			const ctx = createMockContext({ range: 'bytes=0-499' })
			const range = getRange(ctx, 1000)

			expect(range).not.toBeNull()
			expect(range?.start).toBe(0)
			expect(range?.end).toBe(499)
		})

		it('should return null when no Range header', () => {
			const ctx = createMockContext({})
			const range = getRange(ctx, 1000)

			expect(range).toBeNull()
		})

		it('should return null for invalid Range header', () => {
			const ctx = createMockContext({ range: 'invalid' })
			const range = getRange(ctx, 1000)

			expect(range).toBeNull()
		})

		it('should return first range for multi-range request', () => {
			const ctx = createMockContext({ range: 'bytes=0-99, 200-299' })
			const range = getRange(ctx, 1000)

			expect(range).not.toBeNull()
			expect(range?.start).toBe(0)
			expect(range?.end).toBe(99)
		})

		it('should return null for unsatisfiable range', () => {
			const ctx = createMockContext({ range: 'bytes=1000-1500' })
			const range = getRange(ctx, 500)

			expect(range).toBeNull()
		})

		it('should handle suffix range', () => {
			const ctx = createMockContext({ range: 'bytes=-100' })
			const range = getRange(ctx, 1000)

			expect(range).not.toBeNull()
			expect(range?.start).toBe(900)
			expect(range?.end).toBe(999)
		})

		it('should handle open-ended range', () => {
			const ctx = createMockContext({ range: 'bytes=500-' })
			const range = getRange(ctx, 1000)

			expect(range).not.toBeNull()
			expect(range?.start).toBe(500)
			expect(range?.end).toBe(999)
		})

		it('should clamp end to file size', () => {
			const ctx = createMockContext({ range: 'bytes=0-2000' })
			const range = getRange(ctx, 1000)

			expect(range).not.toBeNull()
			expect(range?.end).toBe(999)
		})
	})

	describe('edge cases', () => {
		it('should handle zero-byte file', () => {
			const result = parseRange('bytes=0-', 0)
			expect(result).toBeNull()
		})

		it('should handle very large file sizes', () => {
			const largeSize = 10 * 1024 * 1024 * 1024 // 10GB
			const result = parseRange('bytes=0-1048575', largeSize)
			expect(result?.ranges[0]).toEqual({ start: 0, end: 1048575 })
		})

		it('should handle range at end of large file', () => {
			const largeSize = 10 * 1024 * 1024 * 1024 // 10GB
			const result = parseRange(`bytes=${largeSize - 1000}-`, largeSize)
			expect(result?.ranges[0].start).toBe(largeSize - 1000)
			expect(result?.ranges[0].end).toBe(largeSize - 1)
		})

		it('should handle whitespace in range spec', () => {
			const result = parseRange('bytes=  0 - 499  ', 1000)
			// Implementation may or may not trim - check actual behavior
			expect(result).not.toBeNull()
		})

		it('should reject negative start', () => {
			const result = parseRange('bytes=-0-500', 1000)
			expect(result).toBeNull()
		})

		it('should handle single byte range', () => {
			const result = parseRange('bytes=0-0', 1000)
			expect(result?.ranges[0]).toEqual({ start: 0, end: 0 })
		})

		it('should handle last byte request', () => {
			const result = parseRange('bytes=-1', 1000)
			expect(result?.ranges[0]).toEqual({ start: 999, end: 999 })
		})
	})
})
