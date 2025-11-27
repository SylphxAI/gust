/**
 * Validation Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  validateSchema,
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
})
