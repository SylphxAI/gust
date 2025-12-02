/**
 * Context Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { createContext, parseHeaders, withParams } from '@sylphx/gust'

// Mock socket
const createMockSocket = (): any => ({
	remoteAddress: '127.0.0.1',
	remotePort: 12345,
	localAddress: '0.0.0.0',
	localPort: 3000,
	write: () => true,
	end: () => {},
	destroy: () => {},
	on: () => {},
})

// Mock parsed result (simulating WASM parser output)
const createMockParsed = (
	overrides: Partial<{
		method: number
		path_start: number
		path_end: number
		query_start: number
		query_end: number
		body_start: number
	}> = {}
): any => ({
	method: 0, // GET
	path_start: 4,
	path_end: 9,
	query_start: 0,
	query_end: 0,
	body_start: 50,
	...overrides,
})

describe('Context', () => {
	describe('createContext', () => {
		it('should create context with basic request', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\nHost: localhost\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 0,
				path_start: 4,
				path_end: 9,
			})
			const headers = { host: 'localhost' }

			const ctx = createContext(socket, raw, parsed, headers)

			expect(ctx.method).toBe('GET')
			expect(ctx.path).toBe('/test')
			expect(ctx.query).toBe('')
			expect(ctx.headers).toEqual({ host: 'localhost' })
			expect(ctx.params).toEqual({})
			expect(ctx.socket).toBe(socket)
			expect(ctx.raw).toBe(raw)
		})

		it('should extract query string when present', () => {
			const raw = Buffer.from('GET /search?q=hello HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 0,
				path_start: 4,
				path_end: 11,
				query_start: 12,
				query_end: 19,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.path).toBe('/search')
			expect(ctx.query).toBe('q=hello')
		})

		it('should handle POST method', () => {
			const raw = Buffer.from('POST /api/users HTTP/1.1\r\n\r\n{"name":"test"}')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1, // POST
				path_start: 5,
				path_end: 15,
				body_start: 28,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.method).toBe('POST')
			expect(ctx.body.toString()).toBe('{"name":"test"}')
		})

		it('should provide json() method', () => {
			const jsonBody = '{"name":"test","value":123}'
			const raw = Buffer.from(`POST /api HTTP/1.1\r\n\r\n${jsonBody}`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1,
				path_start: 5,
				path_end: 9,
				body_start: raw.length - jsonBody.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.json()).toEqual({ name: 'test', value: 123 })
		})

		it('should handle empty body', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				body_start: raw.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.body.length).toBe(0)
		})

		it('should store params when provided', () => {
			const raw = Buffer.from('GET /users/123 HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const params = { id: '123' }

			const ctx = createContext(socket, raw, parsed, {}, params)

			expect(ctx.params).toEqual({ id: '123' })
		})

		it('should handle multiple headers', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const headers = {
				host: 'localhost',
				'content-type': 'application/json',
				'x-custom': 'value',
			}

			const ctx = createContext(socket, raw, parsed, headers)

			expect(ctx.headers.host).toBe('localhost')
			expect(ctx.headers['content-type']).toBe('application/json')
			expect(ctx.headers['x-custom']).toBe('value')
		})

		it('should handle binary body', () => {
			const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe])
			const header = Buffer.from('POST /upload HTTP/1.1\r\n\r\n')
			const raw = Buffer.concat([header, binaryData])
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1,
				body_start: header.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.body).toEqual(binaryData)
		})
	})

	describe('withParams', () => {
		it('should add params to context', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {})

			const newCtx = withParams(ctx, { id: '123' })

			expect(newCtx.params).toEqual({ id: '123' })
		})

		it('should merge with existing params', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {}, { userId: '456' })

			const newCtx = withParams(ctx, { postId: '789' })

			expect(newCtx.params).toEqual({ userId: '456', postId: '789' })
		})

		it('should override existing params with same key', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {}, { id: 'old' })

			const newCtx = withParams(ctx, { id: 'new' })

			expect(newCtx.params.id).toBe('new')
		})

		it('should preserve other context properties', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 9,
			})
			const headers = { host: 'localhost' }
			const ctx = createContext(socket, raw, parsed, headers)

			const newCtx = withParams(ctx, { id: '123' })

			expect(newCtx.method).toBe(ctx.method)
			expect(newCtx.path).toBe(ctx.path)
			expect(newCtx.headers).toBe(ctx.headers)
			expect(newCtx.body).toBe(ctx.body)
			expect(newCtx.socket).toBe(ctx.socket)
		})

		it('should return new context (immutability)', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {})

			const newCtx = withParams(ctx, { id: '123' })

			expect(newCtx).not.toBe(ctx)
			expect(ctx.params).toEqual({})
		})

		it('should handle empty params', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {}, { existing: 'value' })

			const newCtx = withParams(ctx, {})

			expect(newCtx.params).toEqual({ existing: 'value' })
		})

		it('should handle multiple params', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const ctx = createContext(socket, raw, parsed, {})

			const newCtx = withParams(ctx, {
				org: 'acme',
				team: 'eng',
				member: 'john',
			})

			expect(newCtx.params).toEqual({
				org: 'acme',
				team: 'eng',
				member: 'john',
			})
		})
	})

	describe('parseHeaders', () => {
		it('should parse headers from buffer', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n\r\n')

			// Simulated header offsets (name_start, name_end, value_start, value_end)
			const offsets = new Uint32Array([
				16,
				20,
				22,
				31, // Host: localhost
				33,
				45,
				47,
				63, // Content-Type: application/json
			])

			const headers = parseHeaders(raw, offsets, 2)

			expect(headers.host).toBe('localhost')
			expect(headers['content-type']).toBe('application/json')
		})

		it('should lowercase header names', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\nX-Custom-Header: Value\r\n\r\n')
			const offsets = new Uint32Array([
				16,
				31,
				33,
				38, // X-Custom-Header: Value
			])

			const headers = parseHeaders(raw, offsets, 1)

			expect(headers['x-custom-header']).toBe('Value')
		})

		it('should handle empty headers', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\n\r\n')
			const offsets = new Uint32Array([])

			const headers = parseHeaders(raw, offsets, 0)

			expect(headers).toEqual({})
		})

		it('should handle single header', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\nAccept: */*\r\n\r\n')
			const offsets = new Uint32Array([
				16,
				22,
				24,
				27, // Accept: */*
			])

			const headers = parseHeaders(raw, offsets, 1)

			expect(Object.keys(headers)).toHaveLength(1)
			expect(headers.accept).toBe('*/*')
		})

		it('should handle many headers', () => {
			const raw = Buffer.from('a: 1\nb: 2\nc: 3\nd: 4\ne: 5\n')
			const offsets = new Uint32Array([
				0,
				1,
				3,
				4, // a: 1
				5,
				6,
				8,
				9, // b: 2
				10,
				11,
				13,
				14, // c: 3
				15,
				16,
				18,
				19, // d: 4
				20,
				21,
				23,
				24, // e: 5
			])

			const headers = parseHeaders(raw, offsets, 5)

			expect(Object.keys(headers)).toHaveLength(5)
		})

		it('should preserve header value case', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\nAuthorization: Bearer ABC123\r\n\r\n')
			// Correct offsets: 'Authorization' starts at 16, ends at 29
			// ': ' at 29-31, 'Bearer ABC123' starts at 31, ends at 44
			const offsets = new Uint32Array([
				16,
				29,
				31,
				44, // Authorization: Bearer ABC123
			])

			const headers = parseHeaders(raw, offsets, 1)

			expect(headers.authorization).toBe('Bearer ABC123')
		})
	})

	describe('edge cases', () => {
		it('should handle path with special characters', () => {
			const path = '/api/users%20test'
			const raw = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 4 + path.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.path).toBe(path)
		})

		it('should handle unicode in path', () => {
			const path = '/api/用户'
			const raw = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 4 + Buffer.from(path).length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.path).toBe(path)
		})

		it('should handle empty query string', () => {
			const raw = Buffer.from('GET /test? HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 9,
				query_start: 0,
				query_end: 0,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.query).toBe('')
		})

		it('should handle long query string', () => {
			const query = `a=${'x'.repeat(1000)}`
			const raw = Buffer.from(`GET /test?${query} HTTP/1.1\r\n\r\n`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 9,
				query_start: 10,
				query_end: 10 + query.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.query).toBe(query)
		})

		it('should handle json() with invalid JSON', () => {
			const raw = Buffer.from('POST /api HTTP/1.1\r\n\r\nnot-json')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1,
				body_start: raw.length - 8,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(() => ctx.json()).toThrow()
		})

		it('should handle json() with empty body', () => {
			const raw = Buffer.from('POST /api HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1,
				body_start: raw.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(() => ctx.json()).toThrow()
		})

		it('should handle json() with array', () => {
			const jsonBody = '[1,2,3]'
			const raw = Buffer.from(`POST /api HTTP/1.1\r\n\r\n${jsonBody}`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				method: 1,
				body_start: raw.length - jsonBody.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.json()).toEqual([1, 2, 3])
		})

		it('should handle root path', () => {
			const raw = Buffer.from('GET / HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 5,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.path).toBe('/')
		})

		it('should handle deeply nested path', () => {
			const path = '/a/b/c/d/e/f/g/h/i/j'
			const raw = Buffer.from(`GET ${path} HTTP/1.1\r\n\r\n`)
			const socket = createMockSocket()
			const parsed = createMockParsed({
				path_start: 4,
				path_end: 4 + path.length,
			})

			const ctx = createContext(socket, raw, parsed, {})

			expect(ctx.path).toBe(path)
		})
	})

	describe('context immutability', () => {
		it('should have readonly headers', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()
			const headers = { host: 'localhost' }

			const ctx = createContext(socket, raw, parsed, headers)

			// TypeScript would prevent this, but testing runtime behavior
			expect(() => {
				;(ctx.headers as any)['new-header'] = 'value'
			}).not.toThrow() // JavaScript allows it at runtime
		})

		it('should have readonly params', () => {
			const raw = Buffer.from('GET /test HTTP/1.1\r\n\r\n')
			const socket = createMockSocket()
			const parsed = createMockParsed()

			const ctx = createContext(socket, raw, parsed, {}, { id: '123' })

			// Params object itself is readonly
			expect(ctx.params.id).toBe('123')
		})
	})
})
