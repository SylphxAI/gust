/**
 * Native Validation
 *
 * JSON schema validation backed by the native Rust implementation.
 */

import { loadNative } from './loader'
import type { NativeSchemaType, NativeStringFormat, NativeValidationResult } from './types'

// ============================================================================
// Native Validation
// ============================================================================

/**
 * Validate JSON string against schema using native Rust implementation
 */
export const nativeValidateJson = (
	jsonStr: string,
	schemaType: NativeSchemaType,
	options?: {
		required?: boolean
		minLength?: number
		maxLength?: number
		format?: NativeStringFormat
		min?: number
		max?: number
		isInteger?: boolean
	}
): NativeValidationResult | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.validateJson(
		jsonStr,
		schemaType,
		options?.required ?? true,
		options?.minLength,
		options?.maxLength,
		options?.format,
		options?.min,
		options?.max,
		options?.isInteger
	)
}
