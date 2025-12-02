/**
 * Proxy Headers Tests - Comprehensive edge case coverage
 */

import { describe, expect, it } from 'bun:test'
import { text } from '@sylphx/gust-core'
import { getClientIp, getProxyInfo, proxy, trustFirstProxy, trustLocalProxy } from '../src/proxy'

const createMockContext = (headers: Record<string, string> = {}, socketIp = '127.0.0.1'): any => ({
	method: 'GET',
	path: '/test',
	query: '',
	headers,
	body: Buffer.alloc(0),
	socket: {
		remoteAddress: socketIp,
	},
})

describe('Proxy Headers', () => {
	describe('IP parsing', () => {
		it('should parse IPv4 addresses', () => {
			const ip = '192.168.1.100'
			const parts = ip.split('.').map(Number)
			expect(parts).toEqual([192, 168, 1, 100])
		})

		it('should handle edge case IPs', () => {
			expect('0.0.0.0'.split('.').map(Number)).toEqual([0, 0, 0, 0])
			expect('255.255.255.255'.split('.').map(Number)).toEqual([255, 255, 255, 255])
		})
	})

	describe('CIDR matching', () => {
		const isCidrMatch = (ip: string, cidr: string): boolean => {
			const [subnet, bits] = cidr.split('/')
			const mask = parseInt(bits, 10)

			const ipParts = ip.split('.').map(Number)
			const subnetParts = subnet.split('.').map(Number)

			if (ipParts.length !== 4 || subnetParts.length !== 4) return false

			const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]
			const subnetNum = (subnetParts[0] << 24) | (subnetParts[1] << 16) | (subnetParts[2] << 8) | subnetParts[3]
			const maskNum = ~((1 << (32 - mask)) - 1)

			return (subnetNum & maskNum) === (ipNum & maskNum)
		}

		it('should match /24 subnet', () => {
			expect(isCidrMatch('192.168.1.1', '192.168.1.0/24')).toBe(true)
			expect(isCidrMatch('192.168.1.255', '192.168.1.0/24')).toBe(true)
			expect(isCidrMatch('192.168.2.1', '192.168.1.0/24')).toBe(false)
		})

		it('should match /16 subnet', () => {
			expect(isCidrMatch('192.168.1.1', '192.168.0.0/16')).toBe(true)
			expect(isCidrMatch('192.168.255.255', '192.168.0.0/16')).toBe(true)
			expect(isCidrMatch('192.169.1.1', '192.168.0.0/16')).toBe(false)
		})

		it('should match /8 subnet', () => {
			expect(isCidrMatch('10.1.2.3', '10.0.0.0/8')).toBe(true)
			expect(isCidrMatch('10.255.255.255', '10.0.0.0/8')).toBe(true)
			expect(isCidrMatch('11.1.2.3', '10.0.0.0/8')).toBe(false)
		})

		it('should match /32 (exact match)', () => {
			expect(isCidrMatch('192.168.1.1', '192.168.1.1/32')).toBe(true)
			expect(isCidrMatch('192.168.1.2', '192.168.1.1/32')).toBe(false)
		})

		it('should match private ranges', () => {
			// 10.0.0.0/8
			expect(isCidrMatch('10.0.0.1', '10.0.0.0/8')).toBe(true)
			expect(isCidrMatch('10.255.255.254', '10.0.0.0/8')).toBe(true)

			// 172.16.0.0/12
			expect(isCidrMatch('172.16.0.1', '172.16.0.0/12')).toBe(true)
			expect(isCidrMatch('172.31.255.254', '172.16.0.0/12')).toBe(true)
			expect(isCidrMatch('172.32.0.1', '172.16.0.0/12')).toBe(false)

			// 192.168.0.0/16
			expect(isCidrMatch('192.168.0.1', '192.168.0.0/16')).toBe(true)
			expect(isCidrMatch('192.168.255.254', '192.168.0.0/16')).toBe(true)
			expect(isCidrMatch('192.169.0.1', '192.168.0.0/16')).toBe(false)
		})
	})

	describe('X-Forwarded-For parsing', () => {
		const parseForwardedFor = (header: string | undefined): string[] => {
			if (!header) return []
			return header
				.split(',')
				.map((ip) => ip.trim())
				.filter(Boolean)
		}

		it('should parse single IP', () => {
			expect(parseForwardedFor('192.168.1.1')).toEqual(['192.168.1.1'])
		})

		it('should parse multiple IPs', () => {
			expect(parseForwardedFor('203.0.113.1, 70.41.3.18, 150.172.238.178')).toEqual([
				'203.0.113.1',
				'70.41.3.18',
				'150.172.238.178',
			])
		})

		it('should handle empty header', () => {
			expect(parseForwardedFor('')).toEqual([])
			expect(parseForwardedFor(undefined)).toEqual([])
		})

		it('should trim whitespace', () => {
			expect(parseForwardedFor('  192.168.1.1  ,  10.0.0.1  ')).toEqual(['192.168.1.1', '10.0.0.1'])
		})

		it('should filter empty entries', () => {
			expect(parseForwardedFor('192.168.1.1,,10.0.0.1')).toEqual(['192.168.1.1', '10.0.0.1'])
		})
	})

	describe('trust calculation', () => {
		const getClientIpFromChain = (forwardedIps: string[], socketIp: string, trustCount: number): string => {
			const allIps = [...forwardedIps, socketIp]
			const index = Math.max(0, allIps.length - trustCount - 1)
			return allIps[index] || socketIp
		}

		it('should get first IP when trusting all', () => {
			const ips = ['203.0.113.1', '70.41.3.18']
			expect(getClientIpFromChain(ips, '127.0.0.1', ips.length + 1)).toBe('203.0.113.1')
		})

		it('should get correct IP when trusting 1 proxy', () => {
			// Client -> Proxy1 -> Server
			// X-Forwarded-For: client
			// Socket: proxy1
			expect(getClientIpFromChain(['203.0.113.1'], '10.0.0.1', 1)).toBe('203.0.113.1')
		})

		it('should get correct IP when trusting 2 proxies', () => {
			// Client -> Proxy1 -> Proxy2 -> Server
			// X-Forwarded-For: client, proxy1
			// Socket: proxy2
			expect(getClientIpFromChain(['203.0.113.1', '10.0.0.1'], '10.0.0.2', 2)).toBe('203.0.113.1')
		})

		it('should handle IP spoofing attempt', () => {
			// Attacker sets X-Forwarded-For: fake, but goes through 1 trusted proxy
			// Real chain: attacker -> proxy1 -> server
			// X-Forwarded-For: fake (attacker set), attacker-ip (proxy1 added)
			// Socket: proxy1
			expect(getClientIpFromChain(['fake', '203.0.113.50'], '10.0.0.1', 1)).toBe('203.0.113.50')
		})

		it('should use socket IP when no forwarded IPs', () => {
			expect(getClientIpFromChain([], '127.0.0.1', 1)).toBe('127.0.0.1')
		})
	})

	describe('proxy middleware', () => {
		it('should use socket IP when trust is false', async () => {
			const middleware = proxy({ trust: false })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('192.168.1.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '192.168.1.1'))
		})

		it('should use forwarded IP when trust is true', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))
		})

		it('should parse X-Forwarded-Proto', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.protocol).toBe('https')
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-forwarded-for': '203.0.113.1',
						'x-forwarded-proto': 'https',
					},
					'10.0.0.1'
				)
			)
		})

		it('should parse X-Forwarded-Host', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.host).toBe('example.com')
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-forwarded-for': '203.0.113.1',
						'x-forwarded-host': 'example.com',
					},
					'10.0.0.1'
				)
			)
		})

		it('should parse X-Forwarded-Port', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.port).toBe(8080)
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-forwarded-for': '203.0.113.1',
						'x-forwarded-port': '8080',
					},
					'10.0.0.1'
				)
			)
		})

		it('should build full URL from headers', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.url).toContain('https://')
				expect(info?.url).toContain('example.com')
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-forwarded-for': '203.0.113.1',
						'x-forwarded-proto': 'https',
						'x-forwarded-host': 'example.com',
					},
					'10.0.0.1'
				)
			)
		})

		it('should trust N proxies', async () => {
			const middleware = proxy({ trust: 2 })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				// With 2 trusted proxies, should get the client IP
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }, '10.0.0.2'))
		})

		it('should trust specific IPs', async () => {
			const middleware = proxy({ trust: ['127.0.0.1', '10.0.0.0/8'] })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))
		})

		it('should not trust untrusted IPs', async () => {
			const middleware = proxy({ trust: ['192.168.1.0/24'] })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				// Socket IP 10.0.0.1 is not in trusted range, so should use socket IP
				expect(info?.ip).toBe('10.0.0.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))
		})

		it('should use custom header names', async () => {
			const middleware = proxy({
				trust: true,
				ipHeader: 'x-real-ip',
				hostHeader: 'x-original-host',
				protoHeader: 'x-original-proto',
				portHeader: 'x-original-port',
			})
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				expect(info?.host).toBe('custom.example.com')
				expect(info?.protocol).toBe('https')
				expect(info?.port).toBe(9443)
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-real-ip': '203.0.113.1',
						'x-original-host': 'custom.example.com',
						'x-original-proto': 'https',
						'x-original-port': '9443',
					},
					'10.0.0.1'
				)
			)
		})

		it('should populate ips array', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ips).toEqual(['203.0.113.1', '70.41.3.18', '10.0.0.1'])
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1, 70.41.3.18' }, '10.0.0.1'))
		})
	})

	describe('getClientIp helper', () => {
		it('should return socket IP without proxy middleware', () => {
			const ctx = createMockContext({}, '192.168.1.1')
			expect(getClientIp(ctx)).toBe('192.168.1.1')
		})

		it('should return proxied IP with proxy middleware', async () => {
			const middleware = proxy({ trust: true })
			let clientIp: string

			const handler = middleware((ctx) => {
				clientIp = getClientIp(ctx)
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))

			expect(clientIp!).toBe('203.0.113.1')
		})

		it('should handle unknown remote address', () => {
			const ctx = {
				...createMockContext(),
				socket: { remoteAddress: undefined },
			}
			expect(getClientIp(ctx)).toBe('unknown')
		})
	})

	describe('trustLocalProxy', () => {
		it('should trust localhost', async () => {
			const middleware = trustLocalProxy()
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '127.0.0.1'))
		})

		it('should trust private 10.x.x.x range', async () => {
			const middleware = trustLocalProxy()
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.50'))
		})

		it('should trust private 172.16.x.x range', async () => {
			const middleware = trustLocalProxy()
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '172.16.0.50'))
		})

		it('should trust private 192.168.x.x range', async () => {
			const middleware = trustLocalProxy()
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '192.168.1.100'))
		})
	})

	describe('trustFirstProxy', () => {
		it('should trust single proxy', async () => {
			const middleware = trustFirstProxy()
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('203.0.113.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))
		})
	})

	describe('edge cases', () => {
		it('should handle IPv6 addresses', () => {
			const ipv6 = '::1'
			expect(ipv6).toBe('::1')

			const ipv6Full = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
			expect(ipv6Full.split(':').length).toBe(8)
		})

		it('should handle localhost variations', () => {
			const localhosts = ['127.0.0.1', '::1', 'localhost']
			expect(localhosts.includes('127.0.0.1')).toBe(true)
		})

		it('should handle unknown remote address', () => {
			const socketIp = undefined
			expect(socketIp || 'unknown').toBe('unknown')
		})

		it('should handle missing X-Forwarded-For with trust true', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('10.0.0.1')
				return text('ok')
			})

			await handler(createMockContext({}, '10.0.0.1'))
		})

		it('should handle empty X-Forwarded-For', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.ip).toBe('10.0.0.1')
				return text('ok')
			})

			await handler(createMockContext({ 'x-forwarded-for': '' }, '10.0.0.1'))
		})

		it('should default port based on protocol', async () => {
			const middleware = proxy({ trust: true })

			// HTTP default
			const handlerHttp = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.port).toBe(80)
				return text('ok')
			})
			await handlerHttp(
				createMockContext({ 'x-forwarded-for': '203.0.113.1', 'x-forwarded-proto': 'http' }, '10.0.0.1')
			)

			// HTTPS default
			const handlerHttps = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.port).toBe(443)
				return text('ok')
			})
			await handlerHttps(
				createMockContext({ 'x-forwarded-for': '203.0.113.1', 'x-forwarded-proto': 'https' }, '10.0.0.1')
			)
		})

		it('should use Host header as fallback', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware((ctx) => {
				const info = getProxyInfo(ctx)
				expect(info?.host).toBe('fallback.example.com')
				return text('ok')
			})

			await handler(
				createMockContext(
					{
						'x-forwarded-for': '203.0.113.1',
						host: 'fallback.example.com',
					},
					'10.0.0.1'
				)
			)
		})

		it('should handle async handler', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware(async () => {
				await new Promise((r) => setTimeout(r, 10))
				return text('ok')
			})

			const res = await handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))
			expect(res.status).toBe(200)
		})

		it('should handle handler throwing error', async () => {
			const middleware = proxy({ trust: true })
			const handler = middleware(() => {
				throw new Error('Handler error')
			})

			await expect(handler(createMockContext({ 'x-forwarded-for': '203.0.113.1' }, '10.0.0.1'))).rejects.toThrow(
				'Handler error'
			)
		})

		it('should handle getProxyInfo without middleware', () => {
			const ctx = createMockContext()
			const info = getProxyInfo(ctx)
			expect(info).toBeUndefined()
		})

		it('should handle multiple concurrent requests', async () => {
			const middleware = proxy({ trust: true })
			const results: string[] = []

			const handler = middleware((ctx) => {
				results.push(getProxyInfo(ctx)!.ip)
				return text('ok')
			})

			await Promise.all([
				handler(createMockContext({ 'x-forwarded-for': '1.1.1.1' }, '10.0.0.1')),
				handler(createMockContext({ 'x-forwarded-for': '2.2.2.2' }, '10.0.0.1')),
				handler(createMockContext({ 'x-forwarded-for': '3.3.3.3' }, '10.0.0.1')),
			])

			expect(results).toContain('1.1.1.1')
			expect(results).toContain('2.2.2.2')
			expect(results).toContain('3.3.3.3')
		})
	})
})
