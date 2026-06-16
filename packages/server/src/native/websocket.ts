/**
 * Native WebSocket Support
 *
 * RFC 6455 upgrade detection, accept-key generation, and frame
 * encoding/decoding/masking backed by native Rust with WASM fallbacks.
 */

import {
	wasmEncodeWebSocketBinary,
	wasmEncodeWebSocketClose,
	wasmEncodeWebSocketPing,
	wasmEncodeWebSocketPong,
	wasmEncodeWebSocketText,
	wasmGenerateWebSocketAccept,
} from '@sylphx/gust-app'
import { loadNative } from './loader'
import type { WebSocketParseResult } from './types'

// ============================================================================
// Native WebSocket Support
// ============================================================================

/**
 * Check if request headers indicate a WebSocket upgrade request
 *
 * @example
 * ```ts
 * if (nativeIsWebSocketUpgrade(ctx.headers)) {
 *   const acceptKey = nativeGenerateWebSocketAccept(ctx.headers['sec-websocket-key'])
 *   // Handle WebSocket upgrade...
 * }
 * ```
 */
export const nativeIsWebSocketUpgrade = (headers: Record<string, string>): boolean => {
	const binding = loadNative()
	if (!binding) return false
	try {
		return binding.isWebsocketUpgrade(headers)
	} catch {
		return false
	}
}

/**
 * Generate WebSocket accept key from client's Sec-WebSocket-Key header
 *
 * Implements RFC 6455 key generation algorithm
 * Falls back to WASM if native is not available.
 */
export const nativeGenerateWebSocketAccept = (key: string): string | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.generateWebsocketAccept) {
		try {
			return binding.generateWebsocketAccept(key)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	return wasmGenerateWebSocketAccept(key)
}

/**
 * Create WebSocket upgrade response headers
 *
 * @example
 * ```ts
 * const { status, headers } = nativeCreateWebSocketUpgradeResponse(
 *   ctx.headers['sec-websocket-key'],
 *   ctx.headers['sec-websocket-protocol']
 * )
 * return { status, headers, body: null }
 * ```
 */
export const nativeCreateWebSocketUpgradeResponse = (
	key: string,
	protocol?: string
): { status: number; headers: Record<string, string> } | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.createWebsocketUpgradeResponse(key, protocol)
}

// ============================================================================
// WebSocket Frame Encoding/Decoding
// ============================================================================

/**
 * Parse a WebSocket frame from raw bytes
 *
 * Handles frame decoding according to RFC 6455:
 * - Reads FIN, opcode, mask, payload length
 * - Unmasks payload data (client->server frames are always masked)
 * - Handles extended payload lengths (16-bit and 64-bit)
 *
 * @example
 * ```ts
 * const result = nativeParseWebSocketFrame(Array.from(buffer))
 * if (result.frame) {
 *   console.log('Opcode:', result.frame.opcode)
 *   console.log('Payload:', Buffer.from(result.frame.payload))
 * } else if (result.incomplete) {
 *   // Need more data
 * } else if (result.error) {
 *   console.error('Parse error:', result.error)
 * }
 * ```
 */
export const nativeParseWebSocketFrame = (data: number[] | Buffer): WebSocketParseResult | null => {
	const binding = loadNative()
	if (!binding) return null
	const arr = Array.isArray(data) ? data : Array.from(data)
	return binding.parseWebsocketFrame(arr)
}

/**
 * Encode a WebSocket text frame
 *
 * @example
 * ```ts
 * const frame = nativeEncodeWebSocketText('Hello, World!')
 * socket.write(Buffer.from(frame))
 * ```
 */
export const nativeEncodeWebSocketText = (text: string, fin = true): Buffer | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.encodeWebsocketText) {
		try {
			const arr = binding.encodeWebsocketText(text, fin)
			return Buffer.from(arr)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	const wasmResult = wasmEncodeWebSocketText(text, fin)
	if (wasmResult) return Buffer.from(wasmResult)
	return null
}

/**
 * Encode a WebSocket binary frame
 * Falls back to WASM if native is not available.
 */
export const nativeEncodeWebSocketBinary = (data: number[] | Buffer, fin = true): Buffer | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.encodeWebsocketBinary) {
		try {
			const arr = Array.isArray(data) ? data : Array.from(data)
			const result = binding.encodeWebsocketBinary(arr, fin)
			return Buffer.from(result)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	const uint8 = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data)
	const wasmResult = wasmEncodeWebSocketBinary(uint8, fin)
	if (wasmResult) return Buffer.from(wasmResult)
	return null
}

/**
 * Encode a WebSocket ping frame
 *
 * @example
 * ```ts
 * const pingFrame = nativeEncodeWebSocketPing()
 * socket.write(pingFrame)
 * ```
 */
export const nativeEncodeWebSocketPing = (data?: number[] | Buffer): Buffer | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.encodeWebsocketPing) {
		try {
			const arr = data ? (Array.isArray(data) ? data : Array.from(data)) : undefined
			const result = binding.encodeWebsocketPing(arr)
			return Buffer.from(result)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	const uint8 = data
		? data instanceof Buffer
			? new Uint8Array(data)
			: new Uint8Array(data)
		: undefined
	const wasmResult = wasmEncodeWebSocketPing(uint8)
	if (wasmResult) return Buffer.from(wasmResult)
	return null
}

/**
 * Encode a WebSocket pong frame (response to ping)
 * Falls back to WASM if native is not available.
 *
 * @example
 * ```ts
 * // Echo back ping payload in pong
 * const pongFrame = nativeEncodeWebSocketPong(pingFrame.payload)
 * socket.write(pongFrame)
 * ```
 */
export const nativeEncodeWebSocketPong = (data?: number[] | Buffer): Buffer | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.encodeWebsocketPong) {
		try {
			const arr = data ? (Array.isArray(data) ? data : Array.from(data)) : undefined
			const result = binding.encodeWebsocketPong(arr)
			return Buffer.from(result)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	const uint8 = data
		? data instanceof Buffer
			? new Uint8Array(data)
			: new Uint8Array(data)
		: undefined
	const wasmResult = wasmEncodeWebSocketPong(uint8)
	if (wasmResult) return Buffer.from(wasmResult)
	return null
}

/**
 * Encode a WebSocket close frame
 * Falls back to WASM if native is not available.
 *
 * @param code - Close status code (1000 = normal, 1001 = going away, etc.)
 * @param reason - Optional UTF-8 close reason string
 *
 * @example
 * ```ts
 * const closeFrame = nativeEncodeWebSocketClose(1000, 'Goodbye')
 * socket.write(closeFrame)
 * ```
 */
export const nativeEncodeWebSocketClose = (code?: number, reason?: string): Buffer | null => {
	// Try native first
	const binding = loadNative()
	if (binding?.encodeWebsocketClose) {
		try {
			const result = binding.encodeWebsocketClose(code, reason)
			return Buffer.from(result)
		} catch {
			// Fall through to WASM
		}
	}

	// Try WASM fallback
	const wasmResult = wasmEncodeWebSocketClose(code, reason)
	if (wasmResult) return Buffer.from(wasmResult)
	return null
}

/**
 * Encode a WebSocket continuation frame (for fragmented messages)
 */
export const nativeEncodeWebSocketContinuation = (
	data: number[] | Buffer,
	fin: boolean
): Buffer | null => {
	const binding = loadNative()
	if (!binding) return null
	const arr = Array.isArray(data) ? data : Array.from(data)
	const result = binding.encodeWebsocketContinuation(arr, fin)
	return Buffer.from(result)
}

/**
 * Mask/unmask WebSocket payload data
 *
 * The same XOR operation is used for both masking and unmasking.
 * Client->server frames must be masked, server->client must not be.
 */
export const nativeMaskWebSocketPayload = (
	data: number[] | Buffer,
	maskKey: number[]
): Buffer | null => {
	const binding = loadNative()
	if (!binding) return null
	const arr = Array.isArray(data) ? data : Array.from(data)
	const result = binding.maskWebsocketPayload(arr, maskKey)
	return Buffer.from(result)
}

/**
 * Generate a random 4-byte mask key for client->server frames
 */
export const nativeGenerateWebSocketMask = (): number[] | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.generateWebsocketMask()
}

/**
 * Get standard WebSocket close codes (RFC 6455)
 *
 * @returns Object with close code names and values:
 * - NORMAL (1000): Normal closure
 * - GOING_AWAY (1001): Endpoint going away
 * - PROTOCOL_ERROR (1002): Protocol error
 * - UNSUPPORTED_DATA (1003): Unsupported data type
 * - NO_STATUS (1005): No status code present
 * - ABNORMAL (1006): Abnormal closure
 * - INVALID_PAYLOAD (1007): Invalid payload data
 * - POLICY_VIOLATION (1008): Policy violation
 * - MESSAGE_TOO_BIG (1009): Message too big
 * - EXTENSION_REQUIRED (1010): Extension required
 * - INTERNAL_ERROR (1011): Internal server error
 * - TLS_HANDSHAKE (1015): TLS handshake failure
 */
export const nativeWebSocketCloseCodes = (): Record<string, number> | null => {
	const binding = loadNative()
	if (!binding) return null
	return binding.websocketCloseCodes()
}

/**
 * Validate a WebSocket close code
 *
 * Valid codes are:
 * - 1000-1003, 1007-1011: Standard RFC 6455 codes
 * - 3000-3999: Reserved for libraries/frameworks
 * - 4000-4999: Reserved for applications
 */
export const nativeIsValidCloseCode = (code: number): boolean => {
	const binding = loadNative()
	if (!binding) return false
	return binding.isValidCloseCode(code)
}
