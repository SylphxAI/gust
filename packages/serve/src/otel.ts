/**
 * OpenTelemetry Integration
 * Distributed tracing and metrics for observability
 */

import type { Handler, ServerResponse, Wrapper } from '@sylphx/gust-core'
import type { Context } from './context'
import { getClientIp } from './proxy'
import { getRequestId } from './tracing'

// ============================================================================
// Types
// ============================================================================

/**
 * Span attributes following OpenTelemetry semantic conventions
 */
export type SpanAttributes = Record<string, string | number | boolean | undefined>

/**
 * Span context for distributed tracing
 */
export type SpanContext = {
	traceId: string
	spanId: string
	traceFlags: number
	traceState?: string
}

/**
 * Span for tracing
 */
export type Span = {
	name: string
	context: SpanContext
	parentSpanId?: string
	startTime: number
	endTime?: number
	attributes: SpanAttributes
	status: 'ok' | 'error' | 'unset'
	events: SpanEvent[]
}

/**
 * Span event
 */
export type SpanEvent = {
	name: string
	time: number
	attributes?: SpanAttributes
}

/**
 * Tracer interface (compatible with OpenTelemetry)
 */
export type Tracer = {
	startSpan: (name: string, attributes?: SpanAttributes) => Span
	endSpan: (span: Span, status?: 'ok' | 'error') => void
	addEvent: (span: Span, name: string, attributes?: SpanAttributes) => void
	setAttributes: (span: Span, attributes: SpanAttributes) => void
	export: (spans: Span[]) => Promise<void>
}

/**
 * Span exporter interface
 */
export type SpanExporter = {
	export: (spans: Span[]) => Promise<void>
	shutdown?: () => Promise<void>
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate 16-byte trace ID (32 hex chars)
 */
export const generateTraceId = (): string => {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

/**
 * Generate 8-byte span ID (16 hex chars)
 */
export const generateSpanId = (): string => {
	const bytes = new Uint8Array(8)
	crypto.getRandomValues(bytes)
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

// ============================================================================
// W3C Trace Context
// ============================================================================

/**
 * Parse W3C traceparent header
 * Format: version-traceId-spanId-traceFlags
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
export const parseTraceparent = (header: string): SpanContext | null => {
	const parts = header.split('-')
	if (parts.length !== 4) return null

	const version = parts[0]
	const traceId = parts[1]
	const spanId = parts[2]
	const flags = parts[3]

	// Version 00 is currently supported
	if (!version || !traceId || !spanId || !flags) return null
	if (version !== '00') return null
	if (traceId.length !== 32 || !/^[0-9a-f]+$/.test(traceId)) return null
	if (spanId.length !== 16 || !/^[0-9a-f]+$/.test(spanId)) return null
	if (flags.length !== 2 || !/^[0-9a-f]+$/.test(flags)) return null

	// All zeros trace ID is invalid
	if (traceId === '00000000000000000000000000000000') return null

	return {
		traceId,
		spanId,
		traceFlags: parseInt(flags, 16),
	}
}

/**
 * Format W3C traceparent header
 */
export const formatTraceparent = (ctx: SpanContext): string => {
	return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags.toString(16).padStart(2, '0')}`
}

/**
 * Parse W3C tracestate header
 */
export const parseTracestate = (header: string): Record<string, string> => {
	const state: Record<string, string> = {}
	for (const pair of header.split(',')) {
		const [key, value] = pair.trim().split('=')
		if (key && value) {
			state[key] = value
		}
	}
	return state
}

/**
 * Format W3C tracestate header
 */
export const formatTracestate = (state: Record<string, string>): string => {
	return Object.entries(state)
		.map(([k, v]) => `${k}=${v}`)
		.join(',')
}

// ============================================================================
// Simple Tracer Implementation
// ============================================================================

/**
 * Create a simple tracer (in-memory, for development)
 */
export const createTracer = (exporter?: SpanExporter): Tracer => {
	const pendingSpans: Span[] = []
	let flushTimer: ReturnType<typeof setTimeout> | null = null

	const scheduleFlush = () => {
		if (flushTimer) return
		flushTimer = setTimeout(async () => {
			flushTimer = null
			if (pendingSpans.length > 0 && exporter) {
				const spans = pendingSpans.splice(0)
				await exporter.export(spans)
			}
		}, 1000)
	}

	return {
		startSpan: (name: string, attributes: SpanAttributes = {}): Span => {
			return {
				name,
				context: {
					traceId: generateTraceId(),
					spanId: generateSpanId(),
					traceFlags: 1, // Sampled
				},
				startTime: performance.now(),
				attributes,
				status: 'unset',
				events: [],
			}
		},

		endSpan: (span: Span, status: 'ok' | 'error' = 'ok') => {
			span.endTime = performance.now()
			span.status = status
			pendingSpans.push(span)
			scheduleFlush()
		},

		addEvent: (span: Span, name: string, attributes?: SpanAttributes) => {
			span.events.push({
				name,
				time: performance.now(),
				attributes,
			})
		},

		setAttributes: (span: Span, attributes: SpanAttributes) => {
			Object.assign(span.attributes, attributes)
		},

		export: async (spans: Span[]) => {
			if (exporter) {
				await exporter.export(spans)
			}
		},
	}
}

// ============================================================================
// Exporters
// ============================================================================

/**
 * Console exporter (for development)
 */
export const consoleExporter: SpanExporter = {
	export: async (spans: Span[]) => {
		for (const span of spans) {
			const duration = span.endTime ? (span.endTime - span.startTime).toFixed(2) : '?'
			console.log(
				`[TRACE] ${span.name}`,
				`trace=${span.context.traceId.slice(0, 8)}`,
				`span=${span.context.spanId.slice(0, 8)}`,
				`duration=${duration}ms`,
				`status=${span.status}`
			)
			if (Object.keys(span.attributes).length > 0) {
				console.log('  attributes:', span.attributes)
			}
			for (const event of span.events) {
				console.log(`  event: ${event.name}`, event.attributes || '')
			}
		}
	},
}

/**
 * OTLP HTTP exporter (for production)
 */
export const createOtlpExporter = (
	endpoint: string,
	headers?: Record<string, string>
): SpanExporter => {
	return {
		export: async (spans: Span[]) => {
			// Convert to OTLP format
			const resourceSpans = [
				{
					resource: {
						attributes: [{ key: 'service.name', value: { stringValue: 'serve' } }],
					},
					scopeSpans: [
						{
							scope: { name: '@sylphx/gust' },
							spans: spans.map((span) => ({
								traceId: span.context.traceId,
								spanId: span.context.spanId,
								parentSpanId: span.parentSpanId,
								name: span.name,
								kind: 2, // SERVER
								startTimeUnixNano: Math.floor(span.startTime * 1000000),
								endTimeUnixNano: span.endTime ? Math.floor(span.endTime * 1000000) : undefined,
								attributes: Object.entries(span.attributes).map(([key, value]) => ({
									key,
									value:
										typeof value === 'string'
											? { stringValue: value }
											: typeof value === 'number'
												? { intValue: value }
												: { boolValue: value },
								})),
								status: {
									code: span.status === 'error' ? 2 : span.status === 'ok' ? 1 : 0,
								},
								events: span.events.map((e) => ({
									name: e.name,
									timeUnixNano: Math.floor(e.time * 1000000),
									attributes: e.attributes
										? Object.entries(e.attributes).map(([key, value]) => ({
												key,
												value: { stringValue: String(value) },
											}))
										: [],
								})),
							})),
						},
					],
				},
			]

			try {
				await fetch(endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...headers,
					},
					body: JSON.stringify({ resourceSpans }),
				})
			} catch (err) {
				console.error('Failed to export spans:', err)
			}
		},
	}
}

// ============================================================================
// Middleware
// ============================================================================

// Store span in context
const spanMap = new WeakMap<Context, Span>()

/**
 * Get current span from context
 */
export const getSpan = (ctx: Context): Span | undefined => {
	return spanMap.get(ctx)
}

export type OtelOptions = {
	/** Tracer instance */
	readonly tracer: Tracer
	/** Service name */
	readonly serviceName?: string
	/** Skip tracing for certain requests */
	readonly skip?: (ctx: Context) => boolean
	/** Sample rate (0-1, default: 1) */
	readonly sampleRate?: number
	/** Add request headers to span */
	readonly captureHeaders?: string[]
	/** Add response headers to span */
	readonly captureResponseHeaders?: string[]
}

/**
 * OpenTelemetry middleware
 */
export const otel = (options: OtelOptions): Wrapper<Context> => {
	const {
		tracer,
		serviceName = 'serve',
		skip,
		sampleRate = 1,
		captureHeaders = [],
		captureResponseHeaders = [],
	} = options

	const captureHeadersLower = captureHeaders.map((h) => h.toLowerCase())
	const captureResponseHeadersLower = captureResponseHeaders.map((h) => h.toLowerCase())

	return (handler: Handler<Context>): Handler<Context> => {
		return async (ctx: Context): Promise<ServerResponse> => {
			// Skip if configured
			if (skip?.(ctx)) {
				return handler(ctx)
			}

			// Sample
			if (sampleRate < 1 && Math.random() > sampleRate) {
				return handler(ctx)
			}

			// Parse incoming trace context
			const traceparent = ctx.headers.traceparent
			const parentContext = traceparent ? parseTraceparent(traceparent) : null

			// Start span
			const span = tracer.startSpan(`${ctx.method} ${ctx.path}`, {
				'http.method': ctx.method,
				'http.url': ctx.path + (ctx.query || ''),
				'http.target': ctx.path,
				'http.host': ctx.headers.host || '',
				'http.scheme': 'http',
				'http.user_agent': ctx.headers['user-agent'] || '',
				'net.peer.ip': getClientIp(ctx),
				'service.name': serviceName,
			})

			// Link to parent trace
			if (parentContext) {
				span.context.traceId = parentContext.traceId
				span.parentSpanId = parentContext.spanId
			}

			// Capture request headers
			for (const header of captureHeadersLower) {
				if (ctx.headers[header]) {
					span.attributes[`http.request.header.${header}`] = ctx.headers[header]
				}
			}

			// Add request ID if available
			const requestId = getRequestId(ctx)
			if (requestId) {
				span.attributes['http.request_id'] = requestId
			}

			// Store span in context
			spanMap.set(ctx, span)

			try {
				const res = await handler(ctx)

				// Record response
				span.attributes['http.status_code'] = res.status
				span.attributes['http.response_content_length'] = res.body
					? typeof res.body === 'string'
						? res.body.length
						: res.body.length
					: 0

				// Capture response headers
				for (const header of captureResponseHeadersLower) {
					if (res.headers[header]) {
						span.attributes[`http.response.header.${header}`] = res.headers[header]
					}
				}

				// End span with appropriate status
				const status = res.status >= 400 ? 'error' : 'ok'
				tracer.endSpan(span, status)

				// Add trace headers to response
				return {
					...res,
					headers: {
						...res.headers,
						traceparent: formatTraceparent(span.context),
					},
				}
			} catch (error) {
				// Record error
				tracer.addEvent(span, 'exception', {
					'exception.type': (error as Error).name,
					'exception.message': (error as Error).message,
				})
				tracer.endSpan(span, 'error')
				throw error
			}
		}
	}
}

/**
 * Child span helper for manual instrumentation
 */
export const startChildSpan = (
	ctx: Context,
	tracer: Tracer,
	name: string,
	attributes?: SpanAttributes
): Span => {
	const parentSpan = getSpan(ctx)
	const span = tracer.startSpan(name, attributes)

	if (parentSpan) {
		span.context.traceId = parentSpan.context.traceId
		span.parentSpanId = parentSpan.context.spanId
	}

	return span
}

// ============================================================================
// Metrics
// ============================================================================

export type Counter = {
	add: (value: number, attributes?: SpanAttributes) => void
}

export type Histogram = {
	record: (value: number, attributes?: SpanAttributes) => void
}

export type Gauge = {
	set: (value: number, attributes?: SpanAttributes) => void
}

/** Generate a stable key from attributes for efficient lookup */
const attributeKey = (attrs: SpanAttributes): string => {
	const keys = Object.keys(attrs).sort()
	if (keys.length === 0) return ''
	return keys.map((k) => `${k}=${attrs[k]}`).join('&')
}

/**
 * Simple metrics collector
 */
export class MetricsCollector {
	private counters = new Map<string, { value: number; attributes: SpanAttributes }[]>()
	private histograms = new Map<
		string,
		Map<string, { values: number[]; attributes: SpanAttributes }>
	>()
	private gauges = new Map<string, { value: number; attributes: SpanAttributes }>()

	createCounter(name: string): Counter {
		if (!this.counters.has(name)) {
			this.counters.set(name, [])
		}
		return {
			add: (value: number, attributes: SpanAttributes = {}) => {
				this.counters.get(name)?.push({ value, attributes })
			},
		}
	}

	createHistogram(name: string): Histogram {
		if (!this.histograms.has(name)) {
			this.histograms.set(name, new Map())
		}
		return {
			record: (value: number, attributes: SpanAttributes = {}) => {
				const bucketMap = this.histograms.get(name)
				if (!bucketMap) return
				const key = attributeKey(attributes)
				let entry = bucketMap.get(key)
				if (!entry) {
					entry = { values: [], attributes }
					bucketMap.set(key, entry)
				}
				entry.values.push(value)
			},
		}
	}

	createGauge(name: string): Gauge {
		return {
			set: (value: number, attributes: SpanAttributes = {}) => {
				this.gauges.set(`${name}:${attributeKey(attributes)}`, { value, attributes })
			},
		}
	}

	/**
	 * Export metrics in Prometheus format
	 */
	toPrometheus(): string {
		const lines: string[] = []

		// Counters
		for (const [name, entries] of this.counters) {
			const total = entries.reduce((sum, e) => sum + e.value, 0)
			lines.push(`# TYPE ${name} counter`)
			lines.push(`${name} ${total}`)
		}

		// Histograms (simplified)
		for (const [name, bucketMap] of this.histograms) {
			lines.push(`# TYPE ${name} histogram`)
			for (const bucket of bucketMap.values()) {
				const count = bucket.values.length
				const sum = bucket.values.reduce((a, b) => a + b, 0)
				const labels = Object.entries(bucket.attributes)
					.map(([k, v]) => `${k}="${v}"`)
					.join(',')
				lines.push(`${name}_count{${labels}} ${count}`)
				lines.push(`${name}_sum{${labels}} ${sum}`)
			}
		}

		// Gauges
		for (const [key, { value }] of this.gauges) {
			const [name] = key.split(':')
			lines.push(`# TYPE ${name} gauge`)
			lines.push(`${name} ${value}`)
		}

		return lines.join('\n')
	}
}
