/**
 * Native Proxy
 *
 * Forwarded-header proxy information extraction backed by the native Rust
 * implementation.
 */

import { loadNative } from './loader'
import type { NativeProxyInfo, NativeTrustProxy } from './types'

// ============================================================================
// Native Proxy
// ============================================================================

/**
 * Extract proxy information from headers using native Rust implementation
 */
export const nativeExtractProxyInfo = (
	trust: NativeTrustProxy,
	socketIp: string,
	headers?: {
		forwardedFor?: string
		forwardedHost?: string
		forwardedProto?: string
		forwardedPort?: string
		host?: string
	}
): NativeProxyInfo | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.extractProxyInfo(
		trust,
		socketIp,
		headers?.forwardedFor,
		headers?.forwardedHost,
		headers?.forwardedProto,
		headers?.forwardedPort,
		headers?.host
	)
}
