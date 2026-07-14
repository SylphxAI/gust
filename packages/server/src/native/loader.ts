/**
 * Native Module Loader
 *
 * Lazily loads the `@sylphx/gust-napi` native binding with graceful
 * fallback. Shared by all native integration concern modules.
 */

import type { NativeBinding } from './types'

// ============================================================================
// Native Module Loader
// ============================================================================

let nativeBinding: NativeBinding | null = null
let nativeLoadAttempted = false
let nativeLoadError: Error | null = null
let nativeWarningLogged = false

/**
 * Try to load the native binding
 * Returns null if unavailable (graceful fallback)
 */
export const loadNative = (): NativeBinding | null => {
	if (nativeLoadAttempted) return nativeBinding

	nativeLoadAttempted = true

	try {
		// Try to load from @sylphx/gust-napi
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		nativeBinding = require('@sylphx/gust-napi')
		return nativeBinding
	} catch (e) {
		// Try local path (development) - from crates directory
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			nativeBinding = require('../../../crates/gust-napi')
			return nativeBinding
		} catch {
			nativeLoadError = e as Error
			if (!nativeWarningLogged) {
				nativeWarningLogged = true
				console.warn(
					'[gust] Native binding (@sylphx/gust-napi) unavailable, using JS/WASM fallback. ' +
						'For best performance, install the native package for your platform.'
				)
			}
			return null
		}
	}
}

/**
 * Check if native server is available
 */
export const isNativeAvailable = (): boolean => {
	return loadNative() !== null
}

/**
 * Get native binding (for internal use by serve.ts)
 */
export const loadNativeBinding = (): NativeBinding | null => {
	return loadNative()
}

/**
 * Get native load error (for debugging)
 */
export const getNativeLoadError = (): Error | null => {
	loadNative() // Ensure we've tried to load
	return nativeLoadError
}
