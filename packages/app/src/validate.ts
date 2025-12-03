/**
 * Request Validation
 * Schema-based validation for request data
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import { validationError } from '@sylphx/gust-core'
import { parseFormBody, parseJsonBody, parseQuery } from './body'
import type { Context } from './context'

// ============================================================================
// Types
// ============================================================================

export type ValidationError = {
	path: string
	message: string
	value?: unknown
}

export type ValidationResult<T> =
	| { valid: true; data: T }
	| { valid: false; errors: ValidationError[] }

export type Validator<T> = {
	validate: (data: unknown) => ValidationResult<T>
}

export type Schema = {
	type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
	required?: boolean
	nullable?: boolean
	// String
	minLength?: number
	maxLength?: number
	pattern?: RegExp | string
	format?: 'email' | 'url' | 'uuid' | 'date' | 'datetime'
	enum?: string[]
	// Number
	min?: number
	max?: number
	integer?: boolean
	// Object
	properties?: Record<string, Schema>
	additionalProperties?: boolean
	// Array
	items?: Schema
	minItems?: number
	maxItems?: number
	uniqueItems?: boolean
	// Custom
	custom?: (value: unknown) => boolean | string
}

// ============================================================================
// Format Validators
// ============================================================================

const formats: Record<string, RegExp> = {
	email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	url: /^https?:\/\/.+/,
	uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
	date: /^\d{4}-\d{2}-\d{2}$/,
	datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/,
}

// ============================================================================
// Schema Validator
// ============================================================================

/**
 * Validate value against schema
 */
export const validateSchema = (value: unknown, schema: Schema, path = ''): ValidationError[] => {
	const errors: ValidationError[] = []

	// Handle null
	if (value === null) {
		if (schema.nullable) return []
		errors.push({ path, message: 'Value cannot be null', value })
		return errors
	}

	// Handle undefined
	if (value === undefined) {
		if (!schema.required) return []
		errors.push({ path, message: 'Value is required', value })
		return errors
	}

	// Type checking
	switch (schema.type) {
		case 'string':
			if (typeof value !== 'string') {
				errors.push({ path, message: `Expected string, got ${typeof value}`, value })
				return errors
			}

			if (schema.minLength !== undefined && value.length < schema.minLength) {
				errors.push({ path, message: `Minimum length is ${schema.minLength}`, value })
			}

			if (schema.maxLength !== undefined && value.length > schema.maxLength) {
				errors.push({ path, message: `Maximum length is ${schema.maxLength}`, value })
			}

			if (schema.pattern) {
				const regex =
					typeof schema.pattern === 'string' ? new RegExp(schema.pattern) : schema.pattern
				if (!regex.test(value)) {
					errors.push({ path, message: `Does not match pattern ${regex}`, value })
				}
			}

			if (schema.format) {
				const formatRegex = formats[schema.format]
				if (formatRegex && !formatRegex.test(value)) {
					errors.push({ path, message: `Invalid ${schema.format} format`, value })
				}
			}

			if (schema.enum && !schema.enum.includes(value)) {
				errors.push({ path, message: `Must be one of: ${schema.enum.join(', ')}`, value })
			}
			break

		case 'number':
			if (typeof value !== 'number' || Number.isNaN(value)) {
				errors.push({ path, message: `Expected number, got ${typeof value}`, value })
				return errors
			}

			if (schema.integer && !Number.isInteger(value)) {
				errors.push({ path, message: 'Must be an integer', value })
			}

			if (schema.min !== undefined && value < schema.min) {
				errors.push({ path, message: `Minimum value is ${schema.min}`, value })
			}

			if (schema.max !== undefined && value > schema.max) {
				errors.push({ path, message: `Maximum value is ${schema.max}`, value })
			}
			break

		case 'boolean':
			if (typeof value !== 'boolean') {
				errors.push({ path, message: `Expected boolean, got ${typeof value}`, value })
			}
			break

		case 'object':
			if (typeof value !== 'object' || Array.isArray(value)) {
				errors.push({
					path,
					message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
					value,
				})
				return errors
			}

			if (schema.properties) {
				// Check defined properties
				for (const [key, propSchema] of Object.entries(schema.properties)) {
					const propPath = path ? `${path}.${key}` : key
					const propValue = (value as Record<string, unknown>)[key]
					errors.push(...validateSchema(propValue, propSchema, propPath))
				}

				// Check additional properties
				if (schema.additionalProperties === false) {
					const allowedKeys = new Set(Object.keys(schema.properties))
					for (const key of Object.keys(value as object)) {
						if (!allowedKeys.has(key)) {
							const propPath = path ? `${path}.${key}` : key
							errors.push({
								path: propPath,
								message: 'Additional property not allowed',
								value: key,
							})
						}
					}
				}
			}
			break

		case 'array':
			if (!Array.isArray(value)) {
				errors.push({ path, message: `Expected array, got ${typeof value}`, value })
				return errors
			}

			if (schema.minItems !== undefined && value.length < schema.minItems) {
				errors.push({ path, message: `Minimum items is ${schema.minItems}`, value })
			}

			if (schema.maxItems !== undefined && value.length > schema.maxItems) {
				errors.push({ path, message: `Maximum items is ${schema.maxItems}`, value })
			}

			if (schema.uniqueItems) {
				const seen = new Set()
				for (const item of value) {
					const key = JSON.stringify(item)
					if (seen.has(key)) {
						errors.push({ path, message: 'Array items must be unique', value })
						break
					}
					seen.add(key)
				}
			}

			if (schema.items) {
				for (let i = 0; i < value.length; i++) {
					errors.push(...validateSchema(value[i], schema.items, `${path}[${i}]`))
				}
			}
			break

		case 'any':
			// Any type is valid
			break
	}

	// Custom validation
	if (schema.custom && errors.length === 0) {
		const result = schema.custom(value)
		if (result !== true) {
			errors.push({
				path,
				message: typeof result === 'string' ? result : 'Custom validation failed',
				value,
			})
		}
	}

	return errors
}

/**
 * Create validator from schema
 */
export const createValidator = <T>(schema: Schema): Validator<T> => ({
	validate: (data: unknown): ValidationResult<T> => {
		const errors = validateSchema(data, schema)
		if (errors.length === 0) {
			return { valid: true, data: data as T }
		}
		return { valid: false, errors }
	},
})

// ============================================================================
// Common Validators
// ============================================================================

/**
 * String validator
 */
export const string = (options: Partial<Schema> = {}): Schema => ({
	type: 'string',
	required: true,
	...options,
})

/**
 * Number validator
 */
export const number = (options: Partial<Schema> = {}): Schema => ({
	type: 'number',
	required: true,
	...options,
})

/**
 * Boolean validator
 */
export const boolean = (options: Partial<Schema> = {}): Schema => ({
	type: 'boolean',
	required: true,
	...options,
})

/**
 * Object validator
 */
export const object = (
	properties: Record<string, Schema>,
	options: Partial<Schema> = {}
): Schema => ({
	type: 'object',
	required: true,
	properties,
	...options,
})

/**
 * Array validator
 */
export const array = (items: Schema, options: Partial<Schema> = {}): Schema => ({
	type: 'array',
	required: true,
	items,
	...options,
})

/**
 * Email validator
 */
export const email = (options: Partial<Schema> = {}): Schema =>
	string({ format: 'email', ...options })

/**
 * URL validator
 */
export const url = (options: Partial<Schema> = {}): Schema => string({ format: 'url', ...options })

/**
 * UUID validator
 */
export const uuid = (options: Partial<Schema> = {}): Schema =>
	string({ format: 'uuid', ...options })

/**
 * Optional modifier
 */
export const optional = (schema: Schema): Schema => ({
	...schema,
	required: false,
})

/**
 * Nullable modifier
 */
export const nullable = (schema: Schema): Schema => ({
	...schema,
	nullable: true,
})

// ============================================================================
// Middleware
// ============================================================================

export type ValidateOptions = {
	/** Schema for body */
	readonly body?: Schema
	/** Schema for query parameters */
	readonly query?: Schema
	/** Schema for path parameters (from router) */
	readonly params?: Schema
	/** Custom error response */
	readonly onError?: (errors: ValidationError[]) => ServerResponse
}

// Store validated data in context
const validatedDataMap = new WeakMap<
	Context,
	{ body?: unknown; query?: unknown; params?: unknown }
>()

/**
 * Get validated data from context
 */
export const getValidated = <T = unknown>(ctx: Context): T | undefined => {
	const data = validatedDataMap.get(ctx)
	return data?.body as T
}

/**
 * Get validated query from context
 */
export const getValidatedQuery = <T = Record<string, string>>(ctx: Context): T | undefined => {
	const data = validatedDataMap.get(ctx)
	return data?.query as T
}

/**
 * Validation middleware
 */
export const validate = (options: ValidateOptions): Wrapper<Context> => {
	const { body: bodySchema, query: querySchema, params: paramsSchema, onError } = options

	const errorHandler = onError ?? ((errors) => validationError('Validation Error', errors))

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			const allErrors: ValidationError[] = []
			const validated: { body?: unknown; query?: unknown; params?: unknown } = {}

			// Validate body
			if (bodySchema && ctx.body?.length > 0) {
				const contentType = ctx.headers['content-type'] || ''
				let bodyData: unknown

				try {
					if (contentType.includes('application/json')) {
						bodyData = parseJsonBody(ctx.body)
					} else if (contentType.includes('application/x-www-form-urlencoded')) {
						bodyData = parseFormBody(ctx.body)
					} else {
						bodyData = ctx.body.toString()
					}
				} catch {
					allErrors.push({ path: 'body', message: 'Invalid body format' })
				}

				if (bodyData !== undefined) {
					const errors = validateSchema(bodyData, bodySchema, 'body')
					if (errors.length > 0) {
						allErrors.push(...errors)
					} else {
						validated.body = bodyData
					}
				}
			}

			// Validate query
			if (querySchema && ctx.query) {
				const queryData = parseQuery(ctx.query.slice(1)) // Remove leading ?
				const errors = validateSchema(queryData, querySchema, 'query')
				if (errors.length > 0) {
					allErrors.push(...errors)
				} else {
					validated.query = queryData
				}
			}

			// Validate params
			if (paramsSchema && ctx.params) {
				const errors = validateSchema(ctx.params, paramsSchema, 'params')
				if (errors.length > 0) {
					allErrors.push(...errors)
				} else {
					validated.params = ctx.params
				}
			}

			// Return errors if any
			if (allErrors.length > 0) {
				return errorHandler(allErrors)
			}

			// Store validated data
			validatedDataMap.set(ctx, validated)

			return handler(ctx)
		}
	}
}

/**
 * Shorthand for body-only validation
 */
export const validateBody = (schema: Schema): Wrapper<Context> => validate({ body: schema })

/**
 * Shorthand for query-only validation
 */
export const validateQuery = (schema: Schema): Wrapper<Context> => validate({ query: schema })
