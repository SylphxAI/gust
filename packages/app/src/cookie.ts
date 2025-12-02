/**
 * Cookie parsing and serialization
 * RFC 6265 compliant cookie handling
 */

export type CookieOptions = {
	/** Cookie domain */
	readonly domain?: string
	/** Cookie path */
	readonly path?: string
	/** Expiration date */
	readonly expires?: Date
	/** Max age in seconds */
	readonly maxAge?: number
	/** HTTP only flag */
	readonly httpOnly?: boolean
	/** Secure flag (HTTPS only) */
	readonly secure?: boolean
	/** SameSite attribute */
	readonly sameSite?: 'Strict' | 'Lax' | 'None'
	/** Partitioned attribute (CHIPS) */
	readonly partitioned?: boolean
}

export type Cookie = {
	readonly name: string
	readonly value: string
} & CookieOptions

/**
 * Parse Cookie header string into key-value pairs
 */
export const parseCookies = (cookieHeader: string): Record<string, string> => {
	const cookies: Record<string, string> = {}

	if (!cookieHeader) return cookies

	const pairs = cookieHeader.split(';')

	for (const pair of pairs) {
		const trimmed = pair.trim()
		const eqIndex = trimmed.indexOf('=')

		if (eqIndex > 0) {
			const name = trimmed.substring(0, eqIndex).trim()
			let value = trimmed.substring(eqIndex + 1).trim()

			// Remove quotes if present
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1)
			}

			// Decode URL-encoded value
			try {
				cookies[name] = decodeURIComponent(value)
			} catch {
				cookies[name] = value
			}
		}
	}

	return cookies
}

/**
 * Serialize cookie for Set-Cookie header
 */
export const serializeCookie = (
	name: string,
	value: string,
	options: CookieOptions = {}
): string => {
	// Encode the value
	const encodedValue = encodeURIComponent(value)
	let cookie = `${name}=${encodedValue}`

	// Add options
	if (options.domain) {
		cookie += `; Domain=${options.domain}`
	}

	if (options.path) {
		cookie += `; Path=${options.path}`
	}

	if (options.expires) {
		cookie += `; Expires=${options.expires.toUTCString()}`
	}

	if (options.maxAge !== undefined) {
		cookie += `; Max-Age=${options.maxAge}`
	}

	if (options.httpOnly) {
		cookie += '; HttpOnly'
	}

	if (options.secure) {
		cookie += '; Secure'
	}

	if (options.sameSite) {
		cookie += `; SameSite=${options.sameSite}`
	}

	if (options.partitioned) {
		cookie += '; Partitioned'
	}

	return cookie
}

/**
 * Create a delete cookie string (sets expiration in past)
 */
export const deleteCookie = (
	name: string,
	options: Pick<CookieOptions, 'domain' | 'path'> = {}
): string => {
	return serializeCookie(name, '', {
		...options,
		expires: new Date(0),
		maxAge: 0,
	})
}

/**
 * Get cookies from context headers
 */
export const getCookies = (headers: Record<string, string>): Record<string, string> => {
	return parseCookies(headers.cookie || '')
}

/**
 * Get a specific cookie value
 */
export const getCookie = (headers: Record<string, string>, name: string): string | undefined => {
	const cookies = getCookies(headers)
	return cookies[name]
}

/**
 * Create Set-Cookie header value for a single cookie
 */
export const setCookie = (name: string, value: string, options?: CookieOptions): string => {
	return serializeCookie(name, value, options)
}

/**
 * Create multiple Set-Cookie headers
 * Returns array of header values (HTTP allows multiple Set-Cookie headers)
 */
export const setCookies = (cookies: Cookie[]): string[] => {
	return cookies.map((cookie) => serializeCookie(cookie.name, cookie.value, cookie))
}
