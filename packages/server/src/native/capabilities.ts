/**
 * Native Capability Probes & Defaults
 *
 * Runtime feature detection (io_uring, TLS, HTTP/2, compression, CPU counts)
 * and native-backed default configurations with pure-JS fallbacks.
 */

import { isNativeAvailable, loadNative } from './loader'
import type { NativeCorsConfig, NativeSecurityConfig } from './types'

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if io_uring is available (Linux kernel 5.1+)
 */
export const isIoUringAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isIoUringAvailable()
	} catch {
		return false
	}
}

/**
 * Get the best available backend
 *
 * Returns 'native' if native server is available, otherwise 'js' for pure JS fallback
 */
export const getBestBackend = (): 'native' | 'js' => {
	return isNativeAvailable() ? 'native' : 'js'
}

/**
 * Get number of CPU cores (for worker thread configuration)
 */
export const getCpuCount = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getCpuCount()
	} catch {
		return 1
	}
}

/**
 * Get number of physical CPU cores (excluding hyperthreading)
 */
export const getPhysicalCpuCount = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getPhysicalCpuCount()
	} catch {
		return 1
	}
}

/**
 * Get recommended worker count for optimal server performance
 *
 * Returns min(cpu_count, 8) which is suitable for most web server workloads.
 * For CPU-bound workloads, consider using getPhysicalCpuCount() instead.
 */
export const getRecommendedWorkers = (): number => {
	const binding = loadNative()
	if (!binding) return 1
	try {
		return binding.getRecommendedWorkers()
	} catch {
		return 1
	}
}

/**
 * Check if TLS support is available in native server
 */
export const isTlsAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isTlsAvailable()
	} catch {
		return false
	}
}

/**
 * Check if HTTP/2 support is available in native server
 */
export const isHttp2Available = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isHttp2Available()
	} catch {
		return false
	}
}

/**
 * Check if compression support is available in native server
 */
export const isCompressionAvailable = (): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isCompressionAvailable()
	} catch {
		return false
	}
}

/**
 * Get permissive CORS configuration from native
 *
 * Allows all origins, methods, and headers - suitable for development
 */
export const corsPermissive = (): NativeCorsConfig => {
	const binding = loadNative()
	if (!binding) {
		// Fallback if native not available
		return {
			origins: ['*'],
			methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
			allowedHeaders: ['*'],
			credentials: true,
			maxAge: 86400,
		}
	}
	return binding.corsPermissive()
}

/**
 * Get strict security headers configuration from native
 *
 * Enables HSTS, X-Frame-Options: DENY, and other security headers
 */
export const securityStrict = (): NativeSecurityConfig => {
	const binding = loadNative()
	if (!binding) {
		// Fallback if native not available
		return {
			hsts: true,
			hstsMaxAge: 31536000,
			frameOptions: 'DENY',
			contentTypeOptions: true,
			xssProtection: true,
			referrerPolicy: 'strict-origin-when-cross-origin',
		}
	}
	return binding.securityStrict()
}
