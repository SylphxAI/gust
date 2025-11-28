/**
 * Session Management
 * Cookie-based sessions with pluggable stores
 *
 * Uses native Rust/WASM for session ID generation.
 * HMAC signing uses Node.js crypto (requires user secret).
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import type { Context } from './context'
import { type CookieOptions, parseCookies, serializeCookie } from './cookie'
import { nativeGenerateTraceId } from './native'

// ============================================================================
// Types
// ============================================================================

export type SessionData = Record<string, unknown>

export type Session<T extends SessionData = SessionData> = {
	/** Session ID */
	readonly id: string
	/** Session data */
	data: T
	/** Is this a new session? */
	readonly isNew: boolean
	/** Has the session been modified? */
	readonly isModified: boolean
	/** Regenerate session ID (for security after login) */
	regenerate: () => Promise<void>
	/** Destroy session */
	destroy: () => Promise<void>
	/** Touch session (update expiry) */
	touch: () => void
	/** Save session */
	save: () => Promise<void>
}

export type SessionStore = {
	/** Get session data */
	get: (id: string) => Promise<SessionData | null>
	/** Set session data */
	set: (id: string, data: SessionData, maxAge: number) => Promise<void>
	/** Delete session */
	destroy: (id: string) => Promise<void>
	/** Touch session (update expiry) */
	touch: (id: string, maxAge: number) => Promise<void>
}

export type SessionOptions = {
	/** Cookie name (default: sid) */
	readonly name?: string
	/** Secret for signing session ID */
	readonly secret: string
	/** Session store (default: MemoryStore) */
	readonly store?: SessionStore
	/** Max age in milliseconds (default: 24 hours) */
	readonly maxAge?: number
	/** Cookie options */
	readonly cookie?: Omit<CookieOptions, 'maxAge'>
	/** Generate session ID */
	readonly genid?: () => string
	/** Rolling sessions (reset maxAge on each request) */
	readonly rolling?: boolean
	/** Save uninitialized sessions */
	readonly saveUninitialized?: boolean
	/** Resave unchanged sessions */
	readonly resave?: boolean
}

// ============================================================================
// Session ID Generation
// ============================================================================

/**
 * Generate secure session ID
 * Uses native Rust/WASM for random generation.
 */
export const generateSessionId = (): string => {
	// Use trace ID (32 hex chars) and convert to base64url for shorter representation
	const traceId = nativeGenerateTraceId()
	if (!traceId) throw new Error('Native trace ID generation unavailable')
	// Convert hex to base64url (32 hex chars = 16 bytes = ~22 base64 chars)
	const bytes = Buffer.from(traceId, 'hex')
	return bytes.toString('base64url')
}

/**
 * Sign session ID with secret
 */
const signSessionId = (id: string, secret: string): string => {
	const { createHmac } = require('node:crypto')
	const signature = createHmac('sha256', secret).update(id).digest('base64url')
	return `${id}.${signature}`
}

/**
 * Verify and extract session ID
 */
const verifySessionId = (signed: string, secret: string): string | null => {
	const dotIndex = signed.lastIndexOf('.')
	if (dotIndex === -1) return null

	const id = signed.slice(0, dotIndex)
	const signature = signed.slice(dotIndex + 1)

	const { createHmac, timingSafeEqual } = require('node:crypto')
	const expected = createHmac('sha256', secret).update(id).digest('base64url')

	const sigBuf = Buffer.from(signature)
	const expBuf = Buffer.from(expected)

	if (sigBuf.length !== expBuf.length) return null
	if (!timingSafeEqual(sigBuf, expBuf)) return null

	return id
}

// ============================================================================
// Memory Store (default, not for production)
// ============================================================================

export class MemoryStore implements SessionStore {
	private sessions = new Map<string, { data: SessionData; expires: number }>()
	private cleanupInterval: ReturnType<typeof setInterval> | null = null

	constructor() {
		// Cleanup expired sessions every minute
		this.cleanupInterval = setInterval(() => {
			const now = Date.now()
			for (const [id, session] of this.sessions) {
				if (session.expires < now) {
					this.sessions.delete(id)
				}
			}
		}, 60000)
	}

	async get(id: string): Promise<SessionData | null> {
		const session = this.sessions.get(id)
		if (!session) return null
		if (session.expires < Date.now()) {
			this.sessions.delete(id)
			return null
		}
		return session.data
	}

	async set(id: string, data: SessionData, maxAge: number): Promise<void> {
		this.sessions.set(id, {
			data,
			expires: Date.now() + maxAge,
		})
	}

	async destroy(id: string): Promise<void> {
		this.sessions.delete(id)
	}

	async touch(id: string, maxAge: number): Promise<void> {
		const session = this.sessions.get(id)
		if (session) {
			session.expires = Date.now() + maxAge
		}
	}

	/**
	 * Get all sessions (for debugging)
	 */
	all(): Map<string, { data: SessionData; expires: number }> {
		return this.sessions
	}

	/**
	 * Clear all sessions
	 */
	clear(): void {
		this.sessions.clear()
	}

	/**
	 * Stop cleanup interval
	 */
	close(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval)
			this.cleanupInterval = null
		}
	}
}

// ============================================================================
// Session Context
// ============================================================================

// Store session in context
const sessionMap = new WeakMap<Context, Session>()

/**
 * Get session from context
 */
export const getSession = <T extends SessionData = SessionData>(
	ctx: Context
): Session<T> | undefined => {
	return sessionMap.get(ctx) as Session<T> | undefined
}

// ============================================================================
// Session Middleware
// ============================================================================

// Default memory store (shared across instances)
let defaultStore: MemoryStore | null = null

const getDefaultStore = (): MemoryStore => {
	if (!defaultStore) {
		defaultStore = new MemoryStore()
	}
	return defaultStore
}

/**
 * Session middleware
 */
export const session = (options: SessionOptions): Wrapper<Context> => {
	const {
		name = 'sid',
		secret,
		store = getDefaultStore(),
		maxAge = 24 * 60 * 60 * 1000, // 24 hours
		cookie = {},
		genid = generateSessionId,
		rolling = false,
		saveUninitialized = false,
		resave = false,
	} = options

	const cookieOptions: CookieOptions = {
		httpOnly: true,
		sameSite: 'Lax',
		path: '/',
		...cookie,
		maxAge: Math.floor(maxAge / 1000), // Convert to seconds for cookie
	}

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Parse existing session ID from cookie
			const cookies = parseCookies(ctx.headers.cookie || '')
			const signedId = cookies[name]
			let sessionId = signedId ? verifySessionId(signedId, secret) : null

			// Load existing session or create new
			let isNew = false
			let sessionData: SessionData = {}

			if (sessionId) {
				const existing = await store.get(sessionId)
				if (existing) {
					sessionData = existing
				} else {
					sessionId = null // Session expired or invalid
				}
			}

			if (!sessionId) {
				sessionId = genid()
				isNew = true
			}

			// At this point sessionId is guaranteed to be a string
			const currentSessionId = sessionId

			// Track modifications
			let modified = false
			let destroyed = false
			let touched = false
			let regenerated = false
			let newSessionId = sessionId

			// Create session object
			const sessionObj: Session = {
				id: sessionId,
				data: new Proxy(sessionData, {
					set: (target, prop, value) => {
						target[prop as string] = value
						modified = true
						return true
					},
					deleteProperty: (target, prop) => {
						delete target[prop as string]
						modified = true
						return true
					},
				}),
				isNew,
				get isModified() {
					return modified
				},
				regenerate: async () => {
					await store.destroy(currentSessionId)
					newSessionId = genid()
					regenerated = true
					modified = true
				},
				destroy: async () => {
					await store.destroy(currentSessionId)
					destroyed = true
				},
				touch: () => {
					touched = true
				},
				save: async () => {
					if (!destroyed) {
						await store.set(newSessionId, sessionData, maxAge)
					}
				},
			}

			// Store in context
			sessionMap.set(ctx, sessionObj)

			// Execute handler
			const res = await handler(ctx)

			// Handle session persistence
			let setCookieHeader: string | undefined

			if (destroyed) {
				// Clear cookie
				setCookieHeader = serializeCookie(name, '', { ...cookieOptions, maxAge: 0 })
			} else if (modified || regenerated || (isNew && saveUninitialized) || resave) {
				// Save session
				await store.set(newSessionId, sessionData, maxAge)
				setCookieHeader = serializeCookie(name, signSessionId(newSessionId, secret), cookieOptions)
			} else if (touched || rolling) {
				// Touch session
				await store.touch(newSessionId, maxAge)
				if (rolling) {
					setCookieHeader = serializeCookie(
						name,
						signSessionId(newSessionId, secret),
						cookieOptions
					)
				}
			}

			// Add Set-Cookie header if needed
			if (setCookieHeader) {
				return {
					...res,
					headers: {
						...res.headers,
						'set-cookie': setCookieHeader,
					},
				}
			}

			return res
		}
	}
}

/**
 * Flash messages (one-time session messages)
 */
export const flash = <T = string>(ctx: Context, key: string, value?: T): T | T[] | undefined => {
	const sess = getSession(ctx)
	if (!sess) return undefined

	const flashKey = `_flash_${key}`

	if (value !== undefined) {
		// Set flash message
		const existing = sess.data[flashKey] as T[] | undefined
		sess.data[flashKey] = existing ? [...existing, value] : [value]
		return undefined
	} else {
		// Get and clear flash messages
		const messages = sess.data[flashKey] as T[] | undefined
		if (messages) {
			delete sess.data[flashKey]
		}
		return messages
	}
}
