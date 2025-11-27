/**
 * Validation Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  validateSchema,
  createValidator,
  validate,
  validateBody,
  validateQuery,
  getValidated,
  getValidatedQuery,
  string,
  number,
  boolean,
  object,
  array,
  email,
  url,
  uuid,
  optional,
  nullable,
} from '../src/validate'
import type { Context } from '../src/context'
import type { ServerResponse } from '@aspect/serve-core'

// Mock context helper
const createMockContext = (overrides?: Partial<Context>): Context => ({
  req: {} as any,
  url: new URL('http://localhost/'),
  method: 'GET',
  headers: {},
  pathname: '/',
  query: '',
  body: Buffer.from(''),
  params: {},
  ...overrides,
})

describe('Validation', () => {
  describe('string', () => {
    it('should validate string type', () => {
      const schema = string()
      expect(validateSchema('hello', schema)).toEqual([])
      expect(validateSchema(123, schema).length).toBeGreaterThan(0)
    })

    it('should validate minLength', () => {
      const schema = string({ minLength: 3 })
      expect(validateSchema('abc', schema)).toEqual([])
      expect(validateSchema('ab', schema).length).toBeGreaterThan(0)
    })

    it('should validate maxLength', () => {
      const schema = string({ maxLength: 5 })
      expect(validateSchema('hello', schema)).toEqual([])
      expect(validateSchema('hello!', schema).length).toBeGreaterThan(0)
    })

    it('should validate pattern', () => {
      const schema = string({ pattern: /^[a-z]+$/ })
      expect(validateSchema('abc', schema)).toEqual([])
      expect(validateSchema('ABC', schema).length).toBeGreaterThan(0)
    })

    it('should validate enum', () => {
      const schema = string({ enum: ['a', 'b', 'c'] })
      expect(validateSchema('a', schema)).toEqual([])
      expect(validateSchema('d', schema).length).toBeGreaterThan(0)
    })
  })

  describe('number', () => {
    it('should validate number type', () => {
      const schema = number()
      expect(validateSchema(123, schema)).toEqual([])
      expect(validateSchema('123', schema).length).toBeGreaterThan(0)
    })

    it('should validate min', () => {
      const schema = number({ min: 10 })
      expect(validateSchema(10, schema)).toEqual([])
      expect(validateSchema(9, schema).length).toBeGreaterThan(0)
    })

    it('should validate max', () => {
      const schema = number({ max: 100 })
      expect(validateSchema(100, schema)).toEqual([])
      expect(validateSchema(101, schema).length).toBeGreaterThan(0)
    })

    it('should validate integer', () => {
      const schema = number({ integer: true })
      expect(validateSchema(10, schema)).toEqual([])
      expect(validateSchema(10.5, schema).length).toBeGreaterThan(0)
    })

    it('should reject NaN', () => {
      const schema = number()
      expect(validateSchema(NaN, schema).length).toBeGreaterThan(0)
    })
  })

  describe('boolean', () => {
    it('should validate boolean type', () => {
      const schema = boolean()
      expect(validateSchema(true, schema)).toEqual([])
      expect(validateSchema(false, schema)).toEqual([])
      expect(validateSchema('true', schema).length).toBeGreaterThan(0)
      expect(validateSchema(1, schema).length).toBeGreaterThan(0)
    })
  })

  describe('object', () => {
    it('should validate object type', () => {
      const schema = object({
        name: string(),
        age: number(),
      })
      expect(validateSchema({ name: 'John', age: 30 }, schema)).toEqual([])
    })

    it('should validate nested objects', () => {
      const schema = object({
        user: object({
          name: string(),
        }),
      })
      expect(validateSchema({ user: { name: 'John' } }, schema)).toEqual([])
    })

    it('should reject missing required fields', () => {
      const schema = object({
        name: string(),
        age: number(),
      })
      expect(validateSchema({ name: 'John' }, schema).length).toBeGreaterThan(0)
    })

    it('should reject additional properties when configured', () => {
      const schema = object({ name: string() }, { additionalProperties: false })
      expect(validateSchema({ name: 'John', extra: 'field' }, schema).length).toBeGreaterThan(0)
    })

    it('should allow additional properties by default', () => {
      const schema = object({ name: string() })
      expect(validateSchema({ name: 'John', extra: 'field' }, schema)).toEqual([])
    })
  })

  describe('array', () => {
    it('should validate array type', () => {
      const schema = array(number())
      expect(validateSchema([1, 2, 3], schema)).toEqual([])
      expect(validateSchema('not array', schema).length).toBeGreaterThan(0)
    })

    it('should validate array items', () => {
      const schema = array(number())
      expect(validateSchema([1, 2, 3], schema)).toEqual([])
      expect(validateSchema([1, 'two', 3], schema).length).toBeGreaterThan(0)
    })

    it('should validate minItems', () => {
      const schema = array(number(), { minItems: 2 })
      expect(validateSchema([1, 2], schema)).toEqual([])
      expect(validateSchema([1], schema).length).toBeGreaterThan(0)
    })

    it('should validate maxItems', () => {
      const schema = array(number(), { maxItems: 3 })
      expect(validateSchema([1, 2, 3], schema)).toEqual([])
      expect(validateSchema([1, 2, 3, 4], schema).length).toBeGreaterThan(0)
    })

    it('should validate uniqueItems', () => {
      const schema = array(number(), { uniqueItems: true })
      expect(validateSchema([1, 2, 3], schema)).toEqual([])
      expect(validateSchema([1, 2, 2], schema).length).toBeGreaterThan(0)
    })
  })

  describe('formats', () => {
    it('should validate email format', () => {
      const schema = email()
      expect(validateSchema('test@example.com', schema)).toEqual([])
      expect(validateSchema('invalid-email', schema).length).toBeGreaterThan(0)
    })

    it('should validate url format', () => {
      const schema = url()
      expect(validateSchema('https://example.com', schema)).toEqual([])
      expect(validateSchema('not-a-url', schema).length).toBeGreaterThan(0)
    })

    it('should validate uuid format', () => {
      const schema = uuid()
      expect(validateSchema('550e8400-e29b-41d4-a716-446655440000', schema)).toEqual([])
      expect(validateSchema('not-a-uuid', schema).length).toBeGreaterThan(0)
    })
  })

  describe('modifiers', () => {
    it('should make field optional', () => {
      const schema = object({
        name: string(),
        nickname: optional(string()),
      })
      expect(validateSchema({ name: 'John' }, schema)).toEqual([])
      expect(validateSchema({ name: 'John', nickname: 'Johnny' }, schema)).toEqual([])
    })

    it('should allow null with nullable', () => {
      const schema = nullable(string())
      expect(validateSchema(null, schema)).toEqual([])
      expect(validateSchema('hello', schema)).toEqual([])
    })
  })

  describe('custom validation', () => {
    it('should run custom validator', () => {
      const schema = string({
        custom: (value) => (value as string).startsWith('prefix_'),
      })
      expect(validateSchema('prefix_test', schema)).toEqual([])
      expect(validateSchema('test', schema).length).toBeGreaterThan(0)
    })

    it('should use custom error message', () => {
      const schema = string({
        custom: (value) =>
          (value as string).startsWith('prefix_') || 'Must start with prefix_',
      })
      const errors = validateSchema('test', schema)
      expect(errors[0].message).toBe('Must start with prefix_')
    })
  })

  describe('error paths', () => {
    it('should include path in nested errors', () => {
      const schema = object({
        user: object({
          profile: object({
            age: number(),
          }),
        }),
      })
      const errors = validateSchema({ user: { profile: { age: 'not a number' } } }, schema)
      expect(errors[0].path).toBe('user.profile.age')
    })

    it('should include array index in path', () => {
      const schema = array(object({ name: string() }))
      const errors = validateSchema([{ name: 'John' }, { name: 123 }], schema)
      expect(errors[0].path).toBe('[1].name')
    })
  })

  describe('createValidator', () => {
    it('should create validator with valid result', () => {
      const validator = createValidator<{ name: string }>(object({ name: string() }))
      const result = validator.validate({ name: 'John' })
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.data).toEqual({ name: 'John' })
      }
    })

    it('should create validator with invalid result', () => {
      const validator = createValidator<{ name: string }>(object({ name: string() }))
      const result = validator.validate({ name: 123 })
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors[0].path).toBe('name')
      }
    })

    it('should preserve type information', () => {
      interface User {
        name: string
        age: number
      }
      const validator = createValidator<User>(object({
        name: string(),
        age: number(),
      }))
      const result = validator.validate({ name: 'John', age: 30 })
      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.data.name).toBe('John')
        expect(result.data.age).toBe(30)
      }
    })
  })

  describe('validate middleware', () => {
    it('should validate JSON body', async () => {
      const schema = object({ name: string(), age: number() })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        const data = getValidated<{ name: string; age: number }>(ctx)
        expect(data).toEqual({ name: 'John', age: 30 })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 'John', age: 30 })),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should validate form body', async () => {
      const schema = object({ name: string(), age: string() })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        const data = getValidated<{ name: string; age: string }>(ctx)
        expect(data).toEqual({ name: 'John', age: '30' })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from('name=John&age=30'),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should validate query parameters', async () => {
      const schema = object({ page: string(), limit: string() })
      const middleware = validate({ query: schema })
      const handler = middleware((ctx: Context) => {
        const data = getValidatedQuery<{ page: string; limit: string }>(ctx)
        expect(data).toEqual({ page: '1', limit: '10' })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        query: '?page=1&limit=10',
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should validate path parameters', async () => {
      const schema = object({ id: string() })
      const middleware = validate({ params: schema })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        params: { id: '123' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should return 400 on validation error', async () => {
      const schema = object({ name: string(), age: number() })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 'John', age: 'invalid' })),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(400)
      expect(response.headers['content-type']).toBe('application/json')
      const body = JSON.parse(response.body as string)
      expect(body.error).toBe('Validation Error')
      expect(body.details.length).toBeGreaterThan(0)
    })

    it('should use custom error handler', async () => {
      const schema = object({ name: string() })
      const middleware = validate({
        body: schema,
        onError: (errors) => ({
          status: 422,
          headers: { 'content-type': 'text/plain' },
          body: `Custom error: ${errors.length} validation errors`,
        }),
      })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 123 })),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(422)
      expect(response.body).toContain('Custom error')
    })

    it('should validate all sources together', async () => {
      const middleware = validate({
        body: object({ name: string() }),
        query: object({ page: string() }),
        params: object({ id: string() }),
      })
      const handler = middleware((ctx: Context) => {
        const bodyData = getValidated<{ name: string }>(ctx)
        const queryData = getValidatedQuery<{ page: string }>(ctx)
        expect(bodyData).toEqual({ name: 'John' })
        expect(queryData).toEqual({ page: '1' })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 'John' })),
        headers: { 'content-type': 'application/json' },
        query: '?page=1',
        params: { id: '123' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should handle invalid JSON body', async () => {
      const schema = object({ name: string() })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from('invalid json'),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(400)
      const body = JSON.parse(response.body as string)
      expect(body.details.some((e: any) => e.message.includes('Invalid body format'))).toBe(true)
    })

    it('should handle empty body gracefully', async () => {
      const schema = object({ name: string() })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(''),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      // Empty body should pass through without validation
      expect(response.status).toBe(200)
    })

    it('should validate text body when content-type is not json or form', async () => {
      const schema = string({ minLength: 5 })
      const middleware = validate({ body: schema })
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from('Hello World'),
        headers: { 'content-type': 'text/plain' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })
  })

  describe('validateBody', () => {
    it('should be shorthand for body-only validation', async () => {
      const schema = object({ name: string() })
      const middleware = validateBody(schema)
      const handler = middleware((ctx: Context) => {
        const data = getValidated<{ name: string }>(ctx)
        expect(data).toEqual({ name: 'John' })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 'John' })),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should return error on invalid body', async () => {
      const schema = object({ age: number() })
      const middleware = validateBody(schema)
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ age: 'invalid' })),
        headers: { 'content-type': 'application/json' },
      })

      const response = await handler(ctx)
      expect(response.status).toBe(400)
    })
  })

  describe('validateQuery', () => {
    it('should be shorthand for query-only validation', async () => {
      const schema = object({ search: string() })
      const middleware = validateQuery(schema)
      const handler = middleware((ctx: Context) => {
        const data = getValidatedQuery<{ search: string }>(ctx)
        expect(data).toEqual({ search: 'test' })
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        query: '?search=test',
      })

      const response = await handler(ctx)
      expect(response.status).toBe(200)
    })

    it('should return error on invalid query', async () => {
      const schema = object({ page: number() })
      const middleware = validateQuery(schema)
      const handler = middleware((ctx: Context) => {
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        query: '?page=invalid',
      })

      const response = await handler(ctx)
      expect(response.status).toBe(400)
    })
  })

  describe('getValidated', () => {
    it('should return undefined when no validation ran', () => {
      const ctx = createMockContext()
      const data = getValidated(ctx)
      expect(data).toBeUndefined()
    })

    it('should return validated body data', async () => {
      const schema = object({ name: string() })
      const middleware = validateBody(schema)
      let capturedData: any
      const handler = middleware((ctx: Context) => {
        capturedData = getValidated(ctx)
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        body: Buffer.from(JSON.stringify({ name: 'John' })),
        headers: { 'content-type': 'application/json' },
      })

      await handler(ctx)
      expect(capturedData).toEqual({ name: 'John' })
    })
  })

  describe('getValidatedQuery', () => {
    it('should return undefined when no validation ran', () => {
      const ctx = createMockContext()
      const data = getValidatedQuery(ctx)
      expect(data).toBeUndefined()
    })

    it('should return validated query data', async () => {
      const schema = object({ search: string() })
      const middleware = validateQuery(schema)
      let capturedData: any
      const handler = middleware((ctx: Context) => {
        capturedData = getValidatedQuery(ctx)
        return { status: 200, headers: {}, body: 'OK' }
      })

      const ctx = createMockContext({
        query: '?search=test',
      })

      await handler(ctx)
      expect(capturedData).toEqual({ search: 'test' })
    })
  })

  describe('string edge cases', () => {
    it('should validate empty string', () => {
      const schema = string()
      expect(validateSchema('', schema)).toEqual([])
    })

    it('should validate empty string with minLength', () => {
      const schema = string({ minLength: 1 })
      expect(validateSchema('', schema).length).toBeGreaterThan(0)
    })

    it('should validate string pattern as string', () => {
      const schema = string({ pattern: '^[a-z]+$' })
      expect(validateSchema('abc', schema)).toEqual([])
      expect(validateSchema('ABC', schema).length).toBeGreaterThan(0)
    })

    it('should validate exact length with min and max', () => {
      const schema = string({ minLength: 5, maxLength: 5 })
      expect(validateSchema('hello', schema)).toEqual([])
      expect(validateSchema('hi', schema).length).toBeGreaterThan(0)
      expect(validateSchema('hello world', schema).length).toBeGreaterThan(0)
    })

    it('should handle undefined value', () => {
      const schema = string()
      const errors = validateSchema(undefined, schema)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('required')
    })

    it('should handle null value', () => {
      const schema = string()
      const errors = validateSchema(null, schema)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('cannot be null')
    })

    it('should validate date format', () => {
      const schema = string({ format: 'date' })
      expect(validateSchema('2023-12-25', schema)).toEqual([])
      expect(validateSchema('12/25/2023', schema).length).toBeGreaterThan(0)
      // Note: The regex pattern validates format, not actual date validity
      expect(validateSchema('2023-13-01', schema)).toEqual([]) // Pattern matches even with invalid month
    })

    it('should validate datetime format', () => {
      const schema = string({ format: 'datetime' })
      expect(validateSchema('2023-12-25T10:30:00Z', schema)).toEqual([])
      expect(validateSchema('2023-12-25T10:30:00.123Z', schema)).toEqual([])
      expect(validateSchema('2023-12-25T10:30:00+05:30', schema)).toEqual([])
      expect(validateSchema('2023-12-25', schema).length).toBeGreaterThan(0)
    })

    it('should validate multiple constraints together', () => {
      const schema = string({
        minLength: 3,
        maxLength: 10,
        pattern: /^[a-z]+$/,
      })
      expect(validateSchema('hello', schema)).toEqual([])
      expect(validateSchema('hi', schema).length).toBeGreaterThan(0) // Too short
      expect(validateSchema('verylongstring', schema).length).toBeGreaterThan(0) // Too long
      expect(validateSchema('Hello', schema).length).toBeGreaterThan(0) // Pattern mismatch
    })
  })

  describe('number edge cases', () => {
    it('should validate zero', () => {
      const schema = number()
      expect(validateSchema(0, schema)).toEqual([])
    })

    it('should validate negative numbers', () => {
      const schema = number()
      expect(validateSchema(-5, schema)).toEqual([])
    })

    it('should validate min with zero', () => {
      const schema = number({ min: 0 })
      expect(validateSchema(0, schema)).toEqual([])
      expect(validateSchema(-1, schema).length).toBeGreaterThan(0)
    })

    it('should validate max with zero', () => {
      const schema = number({ max: 0 })
      expect(validateSchema(0, schema)).toEqual([])
      expect(validateSchema(1, schema).length).toBeGreaterThan(0)
    })

    it('should validate range', () => {
      const schema = number({ min: 1, max: 10 })
      expect(validateSchema(5, schema)).toEqual([])
      expect(validateSchema(1, schema)).toEqual([])
      expect(validateSchema(10, schema)).toEqual([])
      expect(validateSchema(0, schema).length).toBeGreaterThan(0)
      expect(validateSchema(11, schema).length).toBeGreaterThan(0)
    })

    it('should validate integer with negative numbers', () => {
      const schema = number({ integer: true })
      expect(validateSchema(-5, schema)).toEqual([])
      expect(validateSchema(-5.5, schema).length).toBeGreaterThan(0)
    })

    it('should validate Infinity', () => {
      const schema = number()
      expect(validateSchema(Infinity, schema)).toEqual([])
      expect(validateSchema(-Infinity, schema)).toEqual([])
    })

    it('should reject NaN explicitly', () => {
      const schema = number()
      const errors = validateSchema(NaN, schema)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('object edge cases', () => {
    it('should validate empty object', () => {
      const schema = object({})
      expect(validateSchema({}, schema)).toEqual([])
    })

    it('should reject array as object', () => {
      const schema = object({ name: string() })
      const errors = validateSchema([{ name: 'John' }], schema)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('array')
    })

    it('should handle deeply nested objects', () => {
      const schema = object({
        level1: object({
          level2: object({
            level3: object({
              value: string(),
            }),
          }),
        }),
      })
      expect(validateSchema({
        level1: { level2: { level3: { value: 'deep' } } },
      }, schema)).toEqual([])
    })

    it('should validate optional nested properties', () => {
      const schema = object({
        user: optional(object({ name: string() })),
      })
      expect(validateSchema({}, schema)).toEqual([])
      expect(validateSchema({ user: { name: 'John' } }, schema)).toEqual([])
    })

    it('should collect multiple errors from object', () => {
      const schema = object({
        name: string(),
        age: number(),
        email: email(),
      })
      const errors = validateSchema({
        name: 123,
        age: 'invalid',
        email: 'not-an-email',
      }, schema)
      expect(errors.length).toBeGreaterThan(2)
    })
  })

  describe('array edge cases', () => {
    it('should validate empty array', () => {
      const schema = array(string())
      expect(validateSchema([], schema)).toEqual([])
    })

    it('should validate empty array with minItems', () => {
      const schema = array(string(), { minItems: 1 })
      expect(validateSchema([], schema).length).toBeGreaterThan(0)
    })

    it('should validate nested arrays', () => {
      const schema = array(array(number()))
      expect(validateSchema([[1, 2], [3, 4]], schema)).toEqual([])
      expect(validateSchema([[1, 2], ['invalid']], schema).length).toBeGreaterThan(0)
    })

    it('should validate array of objects', () => {
      const schema = array(object({ id: number(), name: string() }))
      expect(validateSchema([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ], schema)).toEqual([])
    })

    it('should detect duplicate primitives with uniqueItems', () => {
      const schema = array(string(), { uniqueItems: true })
      expect(validateSchema(['a', 'b', 'c'], schema)).toEqual([])
      expect(validateSchema(['a', 'b', 'a'], schema).length).toBeGreaterThan(0)
    })

    it('should detect duplicate objects with uniqueItems', () => {
      const schema = array(object({ id: number() }), { uniqueItems: true })
      expect(validateSchema([{ id: 1 }, { id: 2 }], schema)).toEqual([])
      expect(validateSchema([{ id: 1 }, { id: 1 }], schema).length).toBeGreaterThan(0)
    })

    it('should collect errors from multiple array items', () => {
      const schema = array(number())
      const errors = validateSchema([1, 'invalid', 3, 'another'], schema)
      expect(errors.length).toBe(2)
      expect(errors[0].path).toBe('[1]')
      expect(errors[1].path).toBe('[3]')
    })
  })

  describe('format validators edge cases', () => {
    it('should validate various email formats', () => {
      const schema = email()
      expect(validateSchema('simple@example.com', schema)).toEqual([])
      expect(validateSchema('user+tag@example.com', schema)).toEqual([])
      expect(validateSchema('user.name@example.co.uk', schema)).toEqual([])
      expect(validateSchema('@example.com', schema).length).toBeGreaterThan(0)
      expect(validateSchema('user@', schema).length).toBeGreaterThan(0)
      expect(validateSchema('user example.com', schema).length).toBeGreaterThan(0)
      expect(validateSchema('user@example', schema).length).toBeGreaterThan(0) // No TLD
    })

    it('should validate various URL formats', () => {
      const schema = url()
      expect(validateSchema('https://example.com', schema)).toEqual([])
      expect(validateSchema('http://example.com', schema)).toEqual([])
      expect(validateSchema('https://example.com/path?query=value', schema)).toEqual([])
      expect(validateSchema('ftp://example.com', schema).length).toBeGreaterThan(0)
      expect(validateSchema('example.com', schema).length).toBeGreaterThan(0)
      expect(validateSchema('//example.com', schema).length).toBeGreaterThan(0)
    })

    it('should validate various UUID formats', () => {
      const schema = uuid()
      expect(validateSchema('550e8400-e29b-41d4-a716-446655440000', schema)).toEqual([])
      expect(validateSchema('6ba7b810-9dad-11d1-80b4-00c04fd430c8', schema)).toEqual([])
      expect(validateSchema('550E8400-E29B-41D4-A716-446655440000', schema)).toEqual([]) // uppercase
      expect(validateSchema('550e8400-e29b-11d4-a716-446655440000', schema)).toEqual([]) // version 1
      expect(validateSchema('550e8400-e29b-21d4-a716-446655440000', schema)).toEqual([]) // version 2
      expect(validateSchema('550e8400-e29b-31d4-a716-446655440000', schema)).toEqual([]) // version 3
      expect(validateSchema('550e8400-e29b-51d4-a716-446655440000', schema)).toEqual([]) // version 5
      expect(validateSchema('not-a-uuid', schema).length).toBeGreaterThan(0)
      expect(validateSchema('550e8400-e29b-41d4-a716', schema).length).toBeGreaterThan(0) // too short
    })

    it('should validate email with optional', () => {
      const schema = optional(email())
      expect(validateSchema(undefined, schema)).toEqual([])
      expect(validateSchema('test@example.com', schema)).toEqual([])
      expect(validateSchema('invalid', schema).length).toBeGreaterThan(0)
    })
  })

  describe('nullable and optional edge cases', () => {
    it('should handle nullable and required together', () => {
      const schema = nullable(string({ required: true }))
      expect(validateSchema(null, schema)).toEqual([])
      expect(validateSchema('hello', schema)).toEqual([])
      expect(validateSchema(undefined, schema).length).toBeGreaterThan(0)
    })

    it('should handle optional and nullable together', () => {
      const schema = nullable(optional(string()))
      expect(validateSchema(null, schema)).toEqual([])
      expect(validateSchema(undefined, schema)).toEqual([])
      expect(validateSchema('hello', schema)).toEqual([])
    })

    it('should validate optional in object', () => {
      const schema = object({
        required: string(),
        optional: optional(string()),
      })
      expect(validateSchema({ required: 'yes' }, schema)).toEqual([])
      expect(validateSchema({ required: 'yes', optional: 'maybe' }, schema)).toEqual([])
      expect(validateSchema({}, schema).length).toBeGreaterThan(0)
    })

    it('should validate nullable in object', () => {
      const schema = object({
        value: nullable(string()),
      })
      expect(validateSchema({ value: null }, schema)).toEqual([])
      expect(validateSchema({ value: 'hello' }, schema)).toEqual([])
    })
  })

  describe('custom validation edge cases', () => {
    it('should run custom validation after type validation', () => {
      const schema = string({
        custom: () => false,
      })
      // Type error should come first
      const errors = validateSchema(123, schema)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('Expected string')
    })

    it('should skip custom validation when type check fails', () => {
      let customCalled = false
      const schema = string({
        custom: () => {
          customCalled = true
          return false
        },
      })
      validateSchema(123, schema)
      expect(customCalled).toBe(false)
    })

    it('should run custom validation for object', () => {
      const schema = object(
        { name: string() },
        {
          custom: (value) => {
            const obj = value as { name: string }
            return obj.name !== 'forbidden' || 'Name is forbidden'
          },
        }
      )
      expect(validateSchema({ name: 'John' }, schema)).toEqual([])
      const errors = validateSchema({ name: 'forbidden' }, schema)
      expect(errors[0].message).toBe('Name is forbidden')
    })

    it('should run custom validation for array', () => {
      const schema = array(number(), {
        custom: (value) => {
          const arr = value as number[]
          return arr.every(n => n > 0) || 'All numbers must be positive'
        },
      })
      expect(validateSchema([1, 2, 3], schema)).toEqual([])
      const errors = validateSchema([1, -2, 3], schema)
      expect(errors[0].message).toBe('All numbers must be positive')
    })
  })

  describe('any type', () => {
    it('should accept any value', () => {
      const schema = { type: 'any' as const, nullable: true }
      expect(validateSchema('string', schema)).toEqual([])
      expect(validateSchema(123, schema)).toEqual([])
      expect(validateSchema(true, schema)).toEqual([])
      expect(validateSchema({}, schema)).toEqual([])
      expect(validateSchema([], schema)).toEqual([])
      expect(validateSchema(null, schema)).toEqual([])
    })

    it('should respect required flag', () => {
      const schema = { type: 'any' as const, required: true }
      expect(validateSchema('anything', schema)).toEqual([])
      expect(validateSchema(undefined, schema).length).toBeGreaterThan(0)
    })

    it('should respect nullable flag', () => {
      const schema = { type: 'any' as const, nullable: true }
      expect(validateSchema(null, schema)).toEqual([])
    })
  })

  describe('complex nested validation', () => {
    it('should validate complex nested structure', () => {
      const schema = object({
        users: array(object({
          id: number({ integer: true, min: 1 }),
          name: string({ minLength: 1, maxLength: 100 }),
          email: email(),
          profile: object({
            age: optional(number({ min: 0, max: 150 })),
            tags: array(string(), { uniqueItems: true }),
          }),
        })),
      })

      const validData = {
        users: [
          {
            id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            profile: {
              age: 30,
              tags: ['admin', 'user'],
            },
          },
          {
            id: 2,
            name: 'Bob',
            email: 'bob@example.com',
            profile: {
              tags: ['user'],
            },
          },
        ],
      }

      expect(validateSchema(validData, schema)).toEqual([])
    })

    it('should collect errors from deeply nested structure', () => {
      const schema = object({
        users: array(object({
          id: number(),
          email: email(),
        })),
      })

      const invalidData = {
        users: [
          { id: 'invalid', email: 'invalid-email' },
        ],
      }

      const errors = validateSchema(invalidData, schema)
      expect(errors.length).toBe(2)
      expect(errors.some(e => e.path === 'users[0].id')).toBe(true)
      expect(errors.some(e => e.path === 'users[0].email')).toBe(true)
    })
  })
})
