/**
 * Proxy Headers
 * Trust and parse proxy headers (X-Forwarded-*, etc.)
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import type { Context } from './context'

export type ProxyInfo = {
	/** Client IP address */
	readonly ip: string
	/** Original host */
	readonly host: string
	/** Original protocol (http/https) */
	readonly protocol: 'http' | 'https'
	/** Original port */
	readonly port: number
	/** Full original URL */
	readonly url: string
	/** Forwarded IPs chain */
	readonly ips: string[]
}

// Store proxy info in context
const proxyInfoMap = new WeakMap<Context, ProxyInfo>()

/**
 * Get proxy info from context
 */
export const getProxyInfo = (ctx: Context): ProxyInfo | undefined => {
	return proxyInfoMap.get(ctx)
}

/**
 * Get client IP (considering proxies)
 */
export const getClientIp = (ctx: Context): string => {
	const proxyInfo = proxyInfoMap.get(ctx)
	if (proxyInfo) return proxyInfo.ip
	return ctx.socket?.remoteAddress || 'unknown'
}

export type ProxyOptions = {
	/** Trust proxy (true = trust all, number = trust N proxies, string[] = trusted IPs) */
	readonly trust?: boolean | number | string[]
	/** Custom header for IP (default: x-forwarded-for) */
	readonly ipHeader?: string
	/** Custom header for host (default: x-forwarded-host) */
	readonly hostHeader?: string
	/** Custom header for protocol (default: x-forwarded-proto) */
	readonly protoHeader?: string
	/** Custom header for port (default: x-forwarded-port) */
	readonly portHeader?: string
}

/**
 * Check if IP should be trusted
 */
const isTrusted = (ip: string, trust: boolean | number | string[]): boolean => {
	if (trust === true) return true
	if (trust === false) return false

	if (typeof trust === 'number') {
		// Trust first N proxies
		return true // Will be handled in chain processing
	}

	if (Array.isArray(trust)) {
		// Check if IP is in trusted list
		return trust.some((trusted) => {
			if (trusted.includes('/')) {
				// CIDR notation - simplified check
				const parts = trusted.split('/')
				const subnet = parts[0]
				const bits = parts[1]
				if (!subnet || !bits) return false

				const subnetParts = subnet.split('.').map(Number)
				const ipParts = ip.split('.').map(Number)
				const mask = parseInt(bits, 10)

				if (subnetParts.length !== 4 || ipParts.length !== 4) return false

				const s0 = subnetParts[0] ?? 0
				const s1 = subnetParts[1] ?? 0
				const s2 = subnetParts[2] ?? 0
				const s3 = subnetParts[3] ?? 0
				const i0 = ipParts[0] ?? 0
				const i1 = ipParts[1] ?? 0
				const i2 = ipParts[2] ?? 0
				const i3 = ipParts[3] ?? 0

				const subnetNum = (s0 << 24) | (s1 << 16) | (s2 << 8) | s3
				const ipNum = (i0 << 24) | (i1 << 16) | (i2 << 8) | i3
				const maskNum = ~((1 << (32 - mask)) - 1)

				return (subnetNum & maskNum) === (ipNum & maskNum)
			}

			return trusted === ip
		})
	}

	return false
}

/**
 * Parse forwarded IPs
 */
const parseForwardedFor = (header: string | undefined): string[] => {
	if (!header) return []
	return header
		.split(',')
		.map((ip) => ip.trim())
		.filter(Boolean)
}

/**
 * Create proxy headers wrapper
 */
export const proxy = (options: ProxyOptions = {}): Wrapper<Context> => {
	const {
		trust = false,
		ipHeader = 'x-forwarded-for',
		hostHeader = 'x-forwarded-host',
		protoHeader = 'x-forwarded-proto',
		portHeader = 'x-forwarded-port',
	} = options

	const ipHeaderLower = ipHeader.toLowerCase()
	const hostHeaderLower = hostHeader.toLowerCase()
	const protoHeaderLower = protoHeader.toLowerCase()
	const portHeaderLower = portHeader.toLowerCase()

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			const socketIp = ctx.socket?.remoteAddress || 'unknown'

			// Check if we should trust proxy headers
			if (!trust || !isTrusted(socketIp, trust)) {
				// Don't trust - use socket info
				const info: ProxyInfo = {
					ip: socketIp,
					host: ctx.headers.host || 'localhost',
					protocol: 'http',
					port: 80,
					url: `http://${ctx.headers.host || 'localhost'}${ctx.path}`,
					ips: [socketIp],
				}
				proxyInfoMap.set(ctx, info)
				return handler(ctx)
			}

			// Parse forwarded IPs
			const forwardedIps = parseForwardedFor(ctx.headers[ipHeaderLower])
			const allIps = [...forwardedIps, socketIp]

			// Determine client IP
			let clientIp: string
			if (typeof trust === 'number') {
				// Trust first N proxies - get IP from (N+1)th position from end
				const index = Math.max(0, allIps.length - trust - 1)
				clientIp = allIps[index] || socketIp
			} else {
				// Trust all - use first forwarded IP
				clientIp = forwardedIps[0] || socketIp
			}

			// Parse other headers
			const host = ctx.headers[hostHeaderLower] || ctx.headers.host || 'localhost'
			const protocol = (ctx.headers[protoHeaderLower] || 'http') as 'http' | 'https'
			const port = parseInt(
				ctx.headers[portHeaderLower] || (protocol === 'https' ? '443' : '80'),
				10
			)

			const info: ProxyInfo = {
				ip: clientIp,
				host,
				protocol,
				port,
				url: `${protocol}://${host}${ctx.path}`,
				ips: allIps,
			}

			proxyInfoMap.set(ctx, info)
			return handler(ctx)
		}
	}
}

/**
 * Trust localhost/loopback proxies
 */
export const trustLocalProxy = (): Wrapper<Context> =>
	proxy({
		trust: ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
	})

/**
 * Trust first proxy (for single reverse proxy setups)
 */
export const trustFirstProxy = (): Wrapper<Context> => proxy({ trust: 1 })
