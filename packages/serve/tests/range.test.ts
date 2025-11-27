/**
 * Range Request Tests
 */

import { describe, it, expect } from 'bun:test'
import { parseRange, contentRange, isRangeSatisfiable } from '../src/range'

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
})
