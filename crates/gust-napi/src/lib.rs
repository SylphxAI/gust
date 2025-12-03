//! Native Node.js bindings for gust-core via napi-rs
//!
//! High-performance native HTTP server for Node.js/Bun.
//! Uses gust-core for shared logic.
//!
//! Features:
//! - HTTP/1.1 and HTTP/2 support
//! - TLS/HTTPS with ALPN negotiation
//! - Streaming responses (chunked transfer encoding)
//! - Compression (gzip, brotli)
//! - WebSocket upgrade handling
//! - Multi-threaded worker pool

use bytes::Bytes;
use gust_core::{
    Method, Request, Response, ResponseBuilder, Router, StatusCode,
    // WebSocket support from core
    WebSocketFrame as CoreFrame, WebSocketOpcode as CoreOpcode,
    generate_accept_key as core_generate_accept_key,
    // Connection tracking from core
    ConnectionTracker as CoreConnectionTracker,
    // Middleware
    middleware::{
        MiddlewareChain,
        circuit_breaker::{CircuitBreaker as RustCircuitBreaker, CircuitBreakerConfig as RustCBConfig, Bulkhead as RustBulkhead, BulkheadConfig as RustBulkheadConfig, CircuitState as RustCircuitState},
        validate::{Schema as RustSchema, SchemaType as RustSchemaType, StringFormat as RustStringFormat, Value as RustValue, validate as rust_validate},
        range::{parse_range as rust_parse_range, content_range as rust_content_range, get_mime_type as rust_get_mime_type, generate_etag as rust_generate_etag},
        proxy::{ProxyConfig as RustProxyConfig, TrustProxy as RustTrustProxy, extract_proxy_info as rust_extract_proxy_info},
        otel::{Span as RustSpan, SpanContext as RustSpanContext, SpanStatus as RustSpanStatus, Tracer as RustTracer, TracerConfig as RustTracerConfig, MetricsCollector as RustMetricsCollector, generate_trace_id as rust_generate_trace_id, generate_span_id as rust_generate_span_id, parse_traceparent as rust_parse_traceparent, format_traceparent as rust_format_traceparent},
    },
};
use http_body_util::{Full, BodyExt};
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ErrorStrategy};
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::RwLock;
use arc_swap::ArcSwap;

// Use mimalloc for better performance
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Request context passed to JS handlers
#[napi(object)]
#[derive(Clone)]
pub struct RequestContext {
    pub method: String,
    pub path: String,
    pub params: HashMap<String, String>,
    pub query: Option<String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Response from JS handler
#[napi(object)]
pub struct ResponseData {
    pub status: u32,
    pub headers: HashMap<String, String>,
    pub body: String,
    /// Set to true if body is a streaming response (chunked)
    pub streaming: Option<bool>,
}

// ============================================================================
// Route Registration Types (for GustApp integration)
// ============================================================================

/// Route entry from JS manifest
/// Matches TypeScript RouteEntry interface in app.ts
#[napi(object)]
#[derive(Clone)]
pub struct RouteEntry {
    /// HTTP method (GET, POST, etc.) or * for all
    pub method: String,
    /// Route path pattern (e.g., /users/:id)
    pub path: String,
    /// Handler ID for invokeHandler
    pub handler_id: u32,
    /// Whether route has path parameters
    pub has_params: bool,
    /// Whether route has wildcard
    pub has_wildcard: bool,
}

/// Route manifest from JS
/// Matches TypeScript RouteManifest interface in app.ts
#[napi(object)]
#[derive(Clone)]
pub struct RouteManifest {
    /// All route definitions
    pub routes: Vec<RouteEntry>,
    /// Total number of handlers
    pub handler_count: u32,
}

/// Context passed to invokeHandler
/// Matches TypeScript NativeHandlerContext interface in app.ts
#[napi(object)]
#[derive(Clone)]
pub struct NativeHandlerContext {
    /// HTTP method
    pub method: String,
    /// Request path
    pub path: String,
    /// Query string (without ?)
    pub query: String,
    /// Request headers
    pub headers: HashMap<String, String>,
    /// Route parameters extracted by Rust router
    pub params: HashMap<String, String>,
    /// Request body as bytes
    pub body: Vec<u8>,
}

/// Input for invoke handler callback
/// Wraps handlerId and context for clean JS marshalling
#[napi(object)]
#[derive(Clone)]
pub struct InvokeHandlerInput {
    /// Handler ID from route manifest
    pub handler_id: u32,
    /// Request context with parsed data
    pub ctx: NativeHandlerContext,
}

/// Invoke handler callback type
/// Called with InvokeHandlerInput and returns ResponseData
type InvokeHandlerCallback = ThreadsafeFunction<InvokeHandlerInput, ErrorStrategy::Fatal>;

/// TLS/HTTPS configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct TlsConfig {
    /// Path to certificate file (PEM format)
    pub cert_path: Option<String>,
    /// Path to private key file (PEM format)
    pub key_path: Option<String>,
    /// Certificate as PEM string
    pub cert: Option<String>,
    /// Private key as PEM string
    pub key: Option<String>,
}

/// CORS configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct CorsConfig {
    /// Allowed origins (use "*" for any, or specify domains)
    pub origins: Option<Vec<String>>,
    /// Allowed HTTP methods
    pub methods: Option<Vec<String>>,
    /// Allowed headers
    pub allowed_headers: Option<Vec<String>>,
    /// Exposed headers
    pub exposed_headers: Option<Vec<String>>,
    /// Allow credentials
    pub credentials: Option<bool>,
    /// Max age in seconds
    pub max_age: Option<u32>,
}

/// Rate limiting configuration
#[napi(object)]
#[derive(Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per window
    pub max_requests: u32,
    /// Window size in seconds
    pub window_seconds: u32,
    /// Key extractor: "ip", "header:X-Api-Key", etc.
    pub key_by: Option<String>,
}

/// Security headers configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct SecurityConfig {
    /// Enable HSTS (default: true)
    pub hsts: Option<bool>,
    /// HSTS max-age in seconds (default: 31536000 = 1 year)
    pub hsts_max_age: Option<u32>,
    /// X-Frame-Options: "DENY", "SAMEORIGIN"
    pub frame_options: Option<String>,
    /// X-Content-Type-Options: nosniff
    pub content_type_options: Option<bool>,
    /// X-XSS-Protection
    pub xss_protection: Option<bool>,
    /// Referrer-Policy
    pub referrer_policy: Option<String>,
}

/// Compression configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct CompressionConfig {
    /// Enable gzip
    pub gzip: Option<bool>,
    /// Enable brotli
    pub brotli: Option<bool>,
    /// Minimum size to compress (bytes)
    pub threshold: Option<u32>,
    /// Compression level (1-9 for gzip, 1-11 for brotli)
    pub level: Option<u32>,
}

/// Server configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct ServerConfig {
    /// Port to listen on
    pub port: Option<u32>,
    /// Hostname to bind to
    pub hostname: Option<String>,
    /// Number of worker threads (0 = auto-detect)
    pub workers: Option<u32>,
    /// CORS configuration
    pub cors: Option<CorsConfig>,
    /// Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,
    /// Security headers configuration
    pub security: Option<SecurityConfig>,
    /// Compression configuration
    pub compression: Option<CompressionConfig>,
    /// TLS/HTTPS configuration
    pub tls: Option<TlsConfig>,
    /// Enable HTTP/2 (requires TLS)
    pub http2: Option<bool>,
    /// Request timeout in milliseconds (default: 30000)
    pub request_timeout_ms: Option<u32>,
    /// Maximum body size in bytes (default: 1MB)
    pub max_body_size: Option<u32>,
    /// Keep-alive timeout in milliseconds (default: 5000)
    pub keep_alive_timeout_ms: Option<u32>,
    /// Maximum header size in bytes (default: 8KB)
    pub max_header_size: Option<u32>,
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/// Circuit breaker configuration
#[napi(object)]
#[derive(Clone)]
pub struct CircuitBreakerConfig {
    /// Number of failures before opening circuit
    pub failure_threshold: u32,
    /// Number of successes before closing circuit (from half-open)
    pub success_threshold: u32,
    /// Time in milliseconds before attempting to recover
    pub reset_timeout_ms: u32,
    /// Time window in milliseconds for counting failures
    pub failure_window_ms: u32,
    /// Request timeout in milliseconds
    pub timeout_ms: u32,
    /// Circuit breaker name
    pub name: Option<String>,
}

/// Circuit breaker state
#[napi(string_enum)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

/// Circuit breaker stats
#[napi(object)]
pub struct CircuitStats {
    pub state: String,
    pub failures: u32,
    pub successes: u32,
    pub total_requests: i64,
    pub total_failures: i64,
    pub total_successes: i64,
}

/// Circuit breaker wrapper for napi
#[napi]
pub struct CircuitBreaker {
    inner: Arc<RustCircuitBreaker>,
}

#[napi]
impl CircuitBreaker {
    #[napi(constructor)]
    pub fn new(config: CircuitBreakerConfig) -> Self {
        let name = config.name.unwrap_or_else(|| "default".to_string());
        let rust_config = RustCBConfig::new(name)
            .failure_threshold(config.failure_threshold)
            .success_threshold(config.success_threshold)
            .reset_timeout(Duration::from_millis(config.reset_timeout_ms as u64))
            .failure_window(Duration::from_millis(config.failure_window_ms as u64))
            .timeout(Duration::from_millis(config.timeout_ms as u64));

        Self {
            inner: Arc::new(RustCircuitBreaker::new(rust_config)),
        }
    }

    /// Check if request can proceed
    #[napi]
    pub fn can_request(&self) -> bool {
        self.inner.can_request()
    }

    /// Record successful request
    #[napi]
    pub fn record_success(&self) {
        self.inner.record_success();
    }

    /// Record failed request
    #[napi]
    pub fn record_failure(&self) {
        self.inner.record_failure();
    }

    /// Get current state
    #[napi]
    pub fn state(&self) -> String {
        match self.inner.state() {
            RustCircuitState::Closed => "closed".to_string(),
            RustCircuitState::Open => "open".to_string(),
            RustCircuitState::HalfOpen => "half-open".to_string(),
        }
    }

    /// Get statistics
    #[napi]
    pub fn stats(&self) -> CircuitStats {
        let stats = self.inner.stats();
        CircuitStats {
            state: match stats.state {
                RustCircuitState::Closed => "closed".to_string(),
                RustCircuitState::Open => "open".to_string(),
                RustCircuitState::HalfOpen => "half-open".to_string(),
            },
            failures: stats.failures,
            successes: stats.successes,
            total_requests: stats.total_requests as i64,
            total_failures: stats.total_failures as i64,
            total_successes: stats.total_successes as i64,
        }
    }

    /// Reset circuit breaker
    #[napi]
    pub fn reset(&self) {
        self.inner.reset();
    }
}

/// Bulkhead configuration
#[napi(object)]
#[derive(Clone)]
pub struct BulkheadConfig {
    /// Maximum concurrent requests
    pub max_concurrent: u32,
    /// Maximum queue size
    pub max_queue: u32,
    /// Queue timeout in milliseconds
    pub queue_timeout_ms: u32,
}

/// Bulkhead for concurrency limiting
#[napi]
pub struct Bulkhead {
    inner: Arc<RustBulkhead>,
}

#[napi]
impl Bulkhead {
    #[napi(constructor)]
    pub fn new(config: BulkheadConfig) -> Self {
        let rust_config = RustBulkheadConfig::new(config.max_concurrent)
            .max_queue(config.max_queue)
            .queue_timeout(Duration::from_millis(config.queue_timeout_ms as u64));

        Self {
            inner: Arc::new(RustBulkhead::new(rust_config)),
        }
    }

    /// Try to acquire a permit
    #[napi]
    pub fn try_acquire(&self) -> bool {
        self.inner.try_acquire().is_ok()
    }

    /// Get current running count
    #[napi]
    pub fn running(&self) -> u32 {
        self.inner.running()
    }

    /// Get queue length
    #[napi]
    pub fn queued(&self) -> u32 {
        self.inner.queued()
    }

}

// ============================================================================
// Validation
// ============================================================================

/// Validation error
#[napi(object)]
#[derive(Clone)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
    pub code: String,
}

/// Validation result
#[napi(object)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

/// Schema type enum
#[napi(string_enum)]
pub enum SchemaType {
    String,
    Number,
    Boolean,
    Object,
    Array,
    Any,
}

/// String format enum
#[napi(string_enum)]
pub enum StringFormat {
    Email,
    Url,
    Uuid,
    Date,
    DateTime,
}

/// Validate JSON value against schema
#[napi]
pub fn validate_json(
    json_str: String,
    schema_type: SchemaType,
    required: bool,
    min_length: Option<u32>,
    max_length: Option<u32>,
    format: Option<StringFormat>,
    min: Option<f64>,
    max: Option<f64>,
    is_integer: Option<bool>,
) -> ValidationResult {
    // Parse JSON
    let value = match parse_json_to_value(&json_str) {
        Ok(v) => v,
        Err(e) => {
            return ValidationResult {
                valid: false,
                errors: vec![ValidationError {
                    path: "$".to_string(),
                    message: format!("Invalid JSON: {}", e),
                    code: "invalid_type".to_string(),
                }],
            };
        }
    };

    // Build schema
    let rust_schema_type = match schema_type {
        SchemaType::String => RustSchemaType::String,
        SchemaType::Number => RustSchemaType::Number,
        SchemaType::Boolean => RustSchemaType::Boolean,
        SchemaType::Object => RustSchemaType::Object,
        SchemaType::Array => RustSchemaType::Array,
        SchemaType::Any => RustSchemaType::Any,
    };

    let rust_format = format.map(|f| match f {
        StringFormat::Email => RustStringFormat::Email,
        StringFormat::Url => RustStringFormat::Url,
        StringFormat::Uuid => RustStringFormat::Uuid,
        StringFormat::Date => RustStringFormat::Date,
        StringFormat::DateTime => RustStringFormat::DateTime,
    });

    let schema = RustSchema {
        schema_type: rust_schema_type,
        required,
        nullable: false,
        min_length: min_length.map(|x| x as usize),
        max_length: max_length.map(|x| x as usize),
        pattern: None,
        format: rust_format,
        min,
        max,
        integer: is_integer.unwrap_or(false),
        enum_values: None,
        properties: None,
        additional_properties: true,
        items: None,
        min_items: None,
        max_items: None,
        unique_items: false,
    };

    let errors = rust_validate(&value, &schema, "$");

    ValidationResult {
        valid: errors.is_empty(),
        errors: errors
            .into_iter()
            .map(|e| ValidationError {
                path: e.path,
                message: e.message,
                code: "validation_error".to_string(),
            })
            .collect(),
    }
}

fn parse_json_to_value(json: &str) -> std::result::Result<RustValue, String> {
    // Simple JSON parser - handles basic types
    let json = json.trim();

    if json == "null" {
        return Ok(RustValue::Null);
    }
    if json == "true" {
        return Ok(RustValue::Bool(true));
    }
    if json == "false" {
        return Ok(RustValue::Bool(false));
    }
    if json.starts_with('"') && json.ends_with('"') {
        return Ok(RustValue::String(json[1..json.len()-1].to_string()));
    }
    if let Ok(n) = json.parse::<f64>() {
        return Ok(RustValue::Number(n));
    }
    if json.starts_with('[') {
        return Ok(RustValue::Array(vec![])); // Simplified
    }
    if json.starts_with('{') {
        return Ok(RustValue::Object(HashMap::new())); // Simplified
    }

    Err("Failed to parse JSON".to_string())
}

// ============================================================================
// Range Requests
// ============================================================================

/// Parsed range
#[napi(object)]
#[derive(Clone)]
pub struct ParsedRange {
    pub start: i64,
    pub end: i64,
}

/// Range response metadata
#[napi(object)]
#[derive(Clone)]
pub struct RangeResponseMeta {
    pub status: u32,
    pub content_type: String,
    pub content_length: i64,
    pub content_range: Option<String>,
    pub accept_ranges: String,
    pub etag: String,
}

/// Parse HTTP Range header
#[napi]
pub fn parse_range_header(header: String, file_size: i64) -> Option<ParsedRange> {
    rust_parse_range(&header, file_size as u64).and_then(|parsed| {
        parsed.ranges.first().map(|r| ParsedRange {
            start: r.start as i64,
            end: r.end as i64,
        })
    })
}

/// Generate Content-Range header value
#[napi]
pub fn content_range_header(start: i64, end: i64, total: i64) -> String {
    rust_content_range(start as u64, end as u64, total as u64)
}

/// Get MIME type from file extension
#[napi]
pub fn get_mime_type(extension: String) -> String {
    rust_get_mime_type(&extension).to_string()
}

/// Generate ETag from file metadata
#[napi]
pub fn generate_etag(mtime_ms: i64, size: i64) -> String {
    rust_generate_etag(mtime_ms as u64, size as u64)
}

// ============================================================================
// Proxy Headers
// ============================================================================

/// Proxy information
#[napi(object)]
#[derive(Clone)]
pub struct ProxyInfo {
    /// Client IP address
    pub ip: String,
    /// Original host
    pub host: String,
    /// Original protocol (http/https)
    pub protocol: String,
    /// Original port
    pub port: u32,
    /// Chain of forwarded IPs
    pub ips: Vec<String>,
}

/// Proxy trust mode
#[napi(string_enum)]
pub enum TrustProxy {
    None,
    All,
    Loopback,
}

/// Extract proxy information from headers
#[napi]
pub fn extract_proxy_info(
    trust: TrustProxy,
    socket_ip: String,
    forwarded_for: Option<String>,
    forwarded_host: Option<String>,
    forwarded_proto: Option<String>,
    forwarded_port: Option<String>,
    host_header: Option<String>,
) -> ProxyInfo {
    let rust_trust = match trust {
        TrustProxy::None => RustTrustProxy::None,
        TrustProxy::All => RustTrustProxy::All,
        TrustProxy::Loopback => RustTrustProxy::Addresses(vec![
            gust_core::middleware::proxy::TrustedAddress::parse("127.0.0.1").unwrap(),
            gust_core::middleware::proxy::TrustedAddress::parse("::1").unwrap(),
            gust_core::middleware::proxy::TrustedAddress::parse("10.0.0.0/8").unwrap(),
            gust_core::middleware::proxy::TrustedAddress::parse("172.16.0.0/12").unwrap(),
            gust_core::middleware::proxy::TrustedAddress::parse("192.168.0.0/16").unwrap(),
        ]),
    };

    let config = RustProxyConfig {
        trust: rust_trust,
        ip_header: "x-forwarded-for".to_string(),
        host_header: "x-forwarded-host".to_string(),
        proto_header: "x-forwarded-proto".to_string(),
        port_header: "x-forwarded-port".to_string(),
    };

    let mut headers = Vec::new();
    if let Some(v) = forwarded_for {
        headers.push(("x-forwarded-for".to_string(), v));
    }
    if let Some(v) = forwarded_host {
        headers.push(("x-forwarded-host".to_string(), v));
    }
    if let Some(v) = forwarded_proto {
        headers.push(("x-forwarded-proto".to_string(), v));
    }
    if let Some(v) = forwarded_port {
        headers.push(("x-forwarded-port".to_string(), v));
    }

    let info = rust_extract_proxy_info(&config, &socket_ip, &headers, host_header.as_deref());

    ProxyInfo {
        ip: info.ip,
        host: info.host,
        protocol: info.protocol.as_str().to_string(),
        port: info.port as u32,
        ips: info.ips,
    }
}

// ============================================================================
// OpenTelemetry
// ============================================================================

/// Span context
#[napi(object)]
#[derive(Clone)]
pub struct SpanContext {
    pub trace_id: String,
    pub span_id: String,
    pub trace_flags: u32,
}

/// Span status
#[napi(string_enum)]
pub enum SpanStatus {
    Unset,
    Ok,
    Error,
}

/// Generate trace ID (32 hex chars)
#[napi]
pub fn generate_trace_id() -> String {
    rust_generate_trace_id()
}

/// Generate span ID (16 hex chars)
#[napi]
pub fn generate_span_id() -> String {
    rust_generate_span_id()
}

/// Parse W3C traceparent header
#[napi]
pub fn parse_traceparent(header: String) -> Option<SpanContext> {
    rust_parse_traceparent(&header).map(|ctx| SpanContext {
        trace_id: ctx.trace_id,
        span_id: ctx.span_id,
        trace_flags: ctx.trace_flags as u32,
    })
}

/// Format W3C traceparent header
#[napi]
pub fn format_traceparent(trace_id: String, span_id: String, trace_flags: u32) -> String {
    let ctx = RustSpanContext {
        trace_id,
        span_id,
        trace_flags: trace_flags as u8,
        trace_state: None,
    };
    rust_format_traceparent(&ctx)
}

/// Tracer for creating spans
#[napi]
pub struct Tracer {
    inner: Arc<RustTracer>,
}

#[napi]
impl Tracer {
    #[napi(constructor)]
    pub fn new(service_name: String, sample_rate: Option<f64>) -> Self {
        let config = RustTracerConfig::new(service_name);
        let config = if let Some(rate) = sample_rate {
            config.sample_rate(rate)
        } else {
            config
        };

        Self {
            inner: Arc::new(RustTracer::new(config)),
        }
    }

    /// Start a new span
    #[napi]
    pub fn start_span(&self, name: String) -> Span {
        Span {
            inner: Some(self.inner.start_span(name)),
        }
    }

    /// Start a child span
    #[napi]
    pub fn start_child_span(&self, name: String, parent_trace_id: String, parent_span_id: String) -> Span {
        let parent_ctx = RustSpanContext {
            trace_id: parent_trace_id,
            span_id: parent_span_id,
            trace_flags: 1,
            trace_state: None,
        };
        Span {
            inner: Some(self.inner.start_child_span(name, &parent_ctx)),
        }
    }

    /// Get pending span count
    #[napi]
    pub fn pending_count(&self) -> u32 {
        self.inner.pending_count() as u32
    }
}

/// A span representing a unit of work
#[napi]
pub struct Span {
    inner: Option<RustSpan>,
}

#[napi]
impl Span {
    /// Get span context
    #[napi]
    pub fn context(&self) -> Option<SpanContext> {
        self.inner.as_ref().map(|s| SpanContext {
            trace_id: s.context.trace_id.clone(),
            span_id: s.context.span_id.clone(),
            trace_flags: s.context.trace_flags as u32,
        })
    }

    /// Set attribute
    #[napi]
    pub fn set_attribute(&mut self, key: String, value: String) {
        if let Some(ref mut span) = self.inner {
            span.set_attribute(key, value);
        }
    }

    /// Set numeric attribute
    #[napi]
    pub fn set_attribute_number(&mut self, key: String, value: f64) {
        if let Some(ref mut span) = self.inner {
            span.set_attribute(key, gust_core::middleware::otel::AttributeValue::Float(value));
        }
    }

    /// End span
    #[napi]
    pub fn end(&mut self) {
        if let Some(ref mut span) = self.inner {
            span.end();
        }
    }

    /// End span with status
    #[napi]
    pub fn end_with_status(&mut self, status: SpanStatus) {
        if let Some(ref mut span) = self.inner {
            let rust_status = match status {
                SpanStatus::Unset => RustSpanStatus::Unset,
                SpanStatus::Ok => RustSpanStatus::Ok,
                SpanStatus::Error => RustSpanStatus::Error,
            };
            span.end_with_status(rust_status);
        }
    }

    /// Get duration in milliseconds
    #[napi]
    pub fn duration_ms(&self) -> Option<f64> {
        self.inner.as_ref().and_then(|s| s.duration_ms())
    }
}

/// Metrics collector
#[napi]
pub struct MetricsCollector {
    inner: Arc<RustMetricsCollector>,
}

#[napi]
impl MetricsCollector {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RustMetricsCollector::new()),
        }
    }

    /// Increment counter
    #[napi]
    pub fn counter_inc(&self, name: String) {
        self.inner.counter(&name).inc();
    }

    /// Add to counter
    #[napi]
    pub fn counter_add(&self, name: String, value: i64) {
        self.inner.counter(&name).add(value as u64);
    }

    /// Get counter value
    #[napi]
    pub fn counter_get(&self, name: String) -> i64 {
        self.inner.counter(&name).get() as i64
    }

    /// Set gauge value
    #[napi]
    pub fn gauge_set(&self, name: String, value: f64) {
        self.inner.gauge(&name).set(value);
    }

    /// Get gauge value
    #[napi]
    pub fn gauge_get(&self, name: String) -> f64 {
        self.inner.gauge(&name).get()
    }

    /// Record histogram value
    #[napi]
    pub fn histogram_record(&self, name: String, value: f64) {
        self.inner.histogram(&name).record(value);
    }

    /// Get histogram count
    #[napi]
    pub fn histogram_count(&self, name: String) -> i64 {
        self.inner.histogram(&name).count() as i64
    }

    /// Get histogram sum
    #[napi]
    pub fn histogram_sum(&self, name: String) -> f64 {
        self.inner.histogram(&name).sum()
    }

    /// Get histogram mean
    #[napi]
    pub fn histogram_mean(&self, name: String) -> f64 {
        self.inner.histogram(&name).mean()
    }

    /// Get histogram percentile
    #[napi]
    pub fn histogram_percentile(&self, name: String, percentile: f64) -> f64 {
        self.inner.histogram(&name).percentile(percentile)
    }

    /// Export metrics in Prometheus format
    #[napi]
    pub fn to_prometheus(&self) -> String {
        self.inner.to_prometheus()
    }
}

/// Pre-rendered static response
#[derive(Clone)]
struct StaticResponse {
    bytes: Bytes,
}

// ============================================================================
// Native Request/Response for JS handlers
// ============================================================================

/// Request object passed to JS handlers
#[napi(object)]
#[derive(Clone)]
pub struct NativeRequest {
    /// HTTP method
    pub method: String,
    /// Request path
    pub path: String,
    /// Query string (without ?)
    pub query: Option<String>,
    /// Route parameters (e.g., { id: "123" })
    pub params: HashMap<String, String>,
    /// Request headers
    pub headers: HashMap<String, String>,
    /// Request body (raw bytes as string for now)
    pub body: Option<String>,
    /// Client IP address
    pub ip: Option<String>,
}

/// Response object returned from JS handlers
#[napi(object)]
#[derive(Clone, Default)]
pub struct NativeResponse {
    /// HTTP status code
    pub status: Option<u32>,
    /// Response headers
    pub headers: Option<HashMap<String, String>>,
    /// Response body
    pub body: Option<String>,
}

/// Handler callback type - uses RequestContext for input
type HandlerCallback = ThreadsafeFunction<RequestContext, ErrorStrategy::Fatal>;

/// Dynamic route handler
struct DynamicHandler {
    callback: HandlerCallback,
}

// Safety: HandlerCallback (ThreadsafeFunction) is designed to be Send + Sync
unsafe impl Send for DynamicHandler {}
unsafe impl Sync for DynamicHandler {}

impl Clone for DynamicHandler {
    fn clone(&self) -> Self {
        Self {
            callback: self.callback.clone(),
        }
    }
}

/// Invoke handler wrapper (for route registration pattern)
struct InvokeHandler {
    callback: InvokeHandlerCallback,
}

// Safety: InvokeHandlerCallback (ThreadsafeFunction) is designed to be Send + Sync
unsafe impl Send for InvokeHandler {}
unsafe impl Sync for InvokeHandler {}

impl Clone for InvokeHandler {
    fn clone(&self) -> Self {
        Self {
            callback: self.callback.clone(),
        }
    }
}

/// Server state shared across all connections
struct ServerState {
    /// Router using handler IDs (SSOT from gust-router) - for legacy routes
    router: RwLock<Router>,
    /// Static responses indexed by handler ID
    static_responses: RwLock<HashMap<u32, StaticResponse>>,
    /// Dynamic handlers indexed by handler ID - legacy pattern
    dynamic_handlers: RwLock<HashMap<u32, DynamicHandler>>,
    /// Next handler ID for legacy routes (atomic counter)
    next_handler_id: AtomicU32,
    /// App routes - using ArcSwap for lock-free reads on hot path
    app_routes: ArcSwap<Router>,
    /// Invoke handler callback - calls GustApp.invokeHandler(id, ctx)
    /// Using ArcSwap for lock-free reads on hot path (massive perf improvement)
    invoke_handler: ArcSwap<Option<InvokeHandler>>,
    /// Middleware chain
    middleware: RwLock<MiddlewareChain>,
    /// Fallback handler for unmatched routes
    fallback_handler: RwLock<Option<DynamicHandler>>,
    /// Compression configuration
    compression: RwLock<Option<CompressionConfig>>,
    /// TLS configuration
    tls_config: RwLock<Option<TlsConfig>>,
    /// Enable HTTP/2 (atomic for lock-free read)
    http2_enabled: AtomicBool,
    /// Request timeout in milliseconds (atomic for lock-free read)
    request_timeout_ms: AtomicU32,
    /// Maximum body size in bytes (atomic for lock-free read)
    max_body_size: AtomicU32,
    /// Keep-alive timeout in milliseconds (atomic for lock-free read)
    keep_alive_timeout_ms: AtomicU32,
    /// Maximum header size in bytes (atomic for lock-free read)
    max_header_size: AtomicU32,
}

// Default values
const DEFAULT_REQUEST_TIMEOUT_MS: u32 = 30000;  // 30 seconds
const DEFAULT_MAX_BODY_SIZE: u32 = 1024 * 1024; // 1MB
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS: u32 = 5000; // 5 seconds
const DEFAULT_MAX_HEADER_SIZE: u32 = 8192;      // 8KB

impl ServerState {
    fn new() -> Self {
        Self {
            router: RwLock::new(Router::new()),
            static_responses: RwLock::new(HashMap::new()),
            dynamic_handlers: RwLock::new(HashMap::new()),
            next_handler_id: AtomicU32::new(1000), // Start at 1000 to avoid conflicts with app routes
            app_routes: ArcSwap::new(Arc::new(Router::new())),
            invoke_handler: ArcSwap::new(Arc::new(None)),
            middleware: RwLock::new(MiddlewareChain::new()),
            fallback_handler: RwLock::new(None),
            compression: RwLock::new(None),
            tls_config: RwLock::new(None),
            http2_enabled: AtomicBool::new(false),
            request_timeout_ms: AtomicU32::new(DEFAULT_REQUEST_TIMEOUT_MS),
            max_body_size: AtomicU32::new(DEFAULT_MAX_BODY_SIZE),
            keep_alive_timeout_ms: AtomicU32::new(DEFAULT_KEEP_ALIVE_TIMEOUT_MS),
            max_header_size: AtomicU32::new(DEFAULT_MAX_HEADER_SIZE),
        }
    }
}

// ConnectionTracker is now in gust_core::ConnectionTracker (CoreConnectionTracker)

/// Native HTTP server
#[napi]
pub struct GustServer {
    state: Arc<ServerState>,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
    connection_tracker: Arc<CoreConnectionTracker>,
}

#[napi]
impl GustServer {
    /// Create a new server instance
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
            connection_tracker: Arc::new(CoreConnectionTracker::new()),
        }
    }

    /// Create a server with configuration
    #[napi(factory)]
    pub async fn with_config(config: ServerConfig) -> Result<Self> {
        let server = Self::new();

        // Apply middleware from config
        if let Some(cors) = config.cors {
            server.enable_cors(cors).await?;
        }

        if let Some(rate_limit) = config.rate_limit {
            server.enable_rate_limit(rate_limit).await?;
        }

        if let Some(security) = config.security {
            server.enable_security(security).await?;
        }

        if let Some(compression) = config.compression {
            server.enable_compression(compression).await?;
        }

        if let Some(tls) = config.tls {
            server.enable_tls(tls).await?;
        }

        if let Some(http2) = config.http2 {
            server.state.http2_enabled.store(http2, Ordering::Relaxed);
        }

        // Apply timeout and limit configurations (lock-free atomic stores)
        if let Some(timeout) = config.request_timeout_ms {
            server.state.request_timeout_ms.store(timeout, Ordering::Relaxed);
        }
        if let Some(max_body) = config.max_body_size {
            server.state.max_body_size.store(max_body, Ordering::Relaxed);
        }
        if let Some(keep_alive) = config.keep_alive_timeout_ms {
            server.state.keep_alive_timeout_ms.store(keep_alive, Ordering::Relaxed);
        }
        if let Some(max_header) = config.max_header_size {
            server.state.max_header_size.store(max_header, Ordering::Relaxed);
        }

        Ok(server)
    }

    /// Set request timeout in milliseconds
    #[napi]
    pub async fn set_request_timeout(&self, timeout_ms: u32) -> Result<()> {
        self.state.request_timeout_ms.store(timeout_ms, Ordering::Relaxed);
        Ok(())
    }

    /// Set maximum body size in bytes
    #[napi]
    pub async fn set_max_body_size(&self, max_bytes: u32) -> Result<()> {
        self.state.max_body_size.store(max_bytes, Ordering::Relaxed);
        Ok(())
    }

    /// Set keep-alive timeout in milliseconds
    #[napi]
    pub async fn set_keep_alive_timeout(&self, timeout_ms: u32) -> Result<()> {
        self.state.keep_alive_timeout_ms.store(timeout_ms, Ordering::Relaxed);
        Ok(())
    }

    /// Set maximum header size in bytes
    #[napi]
    pub async fn set_max_header_size(&self, max_bytes: u32) -> Result<()> {
        self.state.max_header_size.store(max_bytes, Ordering::Relaxed);
        Ok(())
    }

    /// Enable compression middleware
    #[napi]
    pub async fn enable_compression(&self, config: CompressionConfig) -> Result<()> {
        *self.state.compression.write().await = Some(config);
        Ok(())
    }

    /// Enable TLS/HTTPS
    #[napi]
    pub async fn enable_tls(&self, config: TlsConfig) -> Result<()> {
        *self.state.tls_config.write().await = Some(config);
        Ok(())
    }

    /// Enable HTTP/2
    #[napi]
    pub async fn enable_http2(&self) -> Result<()> {
        self.state.http2_enabled.store(true, Ordering::Relaxed);
        Ok(())
    }

    /// Enable CORS middleware
    #[napi]
    pub async fn enable_cors(&self, config: CorsConfig) -> Result<()> {
        use gust_core::middleware::cors::{Cors, CorsConfig as CoreConfig};

        let mut core_config = if config.origins.as_ref().map(|o| o.contains(&"*".to_string())).unwrap_or(false) {
            CoreConfig::default().allow_all_origins()
        } else {
            CoreConfig::default()
        };

        // Apply origins
        if let Some(origins) = config.origins {
            for origin in origins {
                if origin != "*" {
                    core_config = core_config.allow_origin(origin);
                }
            }
        }

        // Apply methods
        if let Some(methods) = config.methods {
            for method in methods {
                if let Ok(m) = Method::from_str(&method) {
                    core_config = core_config.allow_method(m);
                }
            }
        }

        // Apply headers
        if let Some(headers) = config.allowed_headers {
            for header in headers {
                core_config = core_config.allow_header(header);
            }
        }

        // Apply exposed headers
        if let Some(headers) = config.exposed_headers {
            for header in headers {
                core_config = core_config.expose_header(header);
            }
        }

        // Apply credentials
        if let Some(true) = config.credentials {
            core_config = core_config.allow_credentials();
        }

        // Apply max age
        if let Some(max_age) = config.max_age {
            core_config = core_config.max_age(max_age);
        }

        let cors = Cors::new(core_config);
        self.state.middleware.write().await.add(cors);
        Ok(())
    }

    /// Enable rate limiting middleware
    #[napi]
    pub async fn enable_rate_limit(&self, config: RateLimitConfig) -> Result<()> {
        use gust_core::middleware::rate_limit::{RateLimit, RateLimitConfig as CoreConfig};

        let core_config = CoreConfig::new(
            config.max_requests,
            Duration::from_secs(config.window_seconds as u64),
        );

        let rate_limit = RateLimit::new(core_config);
        self.state.middleware.write().await.add(rate_limit);
        Ok(())
    }

    /// Enable security headers middleware
    #[napi]
    pub async fn enable_security(&self, config: SecurityConfig) -> Result<()> {
        use gust_core::middleware::security::{Security, SecurityConfig as CoreConfig, FrameOptions, HstsConfig};

        let frame_options = match config.frame_options.as_deref() {
            Some("DENY") => FrameOptions::Deny,
            Some("SAMEORIGIN") => FrameOptions::SameOrigin,
            _ => FrameOptions::None,
        };

        let hsts = if config.hsts.unwrap_or(false) {
            Some(HstsConfig {
                max_age: config.hsts_max_age.unwrap_or(31536000) as u64,
                include_subdomains: true,
                preload: false,
            })
        } else {
            None
        };

        let core_config = CoreConfig {
            csp: None,
            frame_options,
            content_type_options: config.content_type_options.unwrap_or(false),
            xss_protection: config.xss_protection.unwrap_or(false),
            hsts,
            referrer_policy: config.referrer_policy,
            permissions_policy: None,
            coop: None,
            coep: None,
            corp: None,
        };

        let security = Security::new(core_config);
        self.state.middleware.write().await.add(security);
        Ok(())
    }

    /// Add a static route (pre-rendered response)
    #[napi]
    pub async fn add_static_route(
        &self,
        method: String,
        path: String,
        status: u32,
        content_type: String,
        body: String,
    ) -> Result<()> {
        // Generate unique handler ID
        let handler_id = self.state.next_handler_id.fetch_add(1, Ordering::SeqCst);

        // Pre-render the HTTP/1.1 response
        let res = ResponseBuilder::new(StatusCode(status as u16))
            .header("content-type", &content_type)
            .body(body.clone())
            .build();
        let response_bytes = res.to_http1_bytes();

        let static_response = StaticResponse {
            bytes: response_bytes,
        };

        // Store response in HashMap
        self.state
            .static_responses
            .write()
            .await
            .insert(handler_id, static_response);

        // Insert route into router
        self.state
            .router
            .write()
            .await
            .insert(&method, &path, handler_id);

        Ok(())
    }

    /// Add a dynamic route with JS handler callback
    ///
    /// The handler will be called with RequestContext and should return ResponseData (or Promise<ResponseData>)
    #[napi]
    pub fn add_dynamic_route(
        &self,
        method: String,
        path: String,
        handler: JsFunction,
    ) -> Result<()> {
        // Generate unique handler ID
        let handler_id = self.state.next_handler_id.fetch_add(1, Ordering::SeqCst);

        // Create threadsafe function that can be called from any thread
        let tsfn: ThreadsafeFunction<RequestContext, ErrorStrategy::Fatal> = handler
            .create_threadsafe_function(0, |ctx| {
                Ok(vec![ctx.value])
            })?;

        let dynamic_handler = DynamicHandler { callback: tsfn };

        // Store handler in HashMap
        self.state.dynamic_handlers.blocking_write().insert(handler_id, dynamic_handler);

        // Insert route into router
        self.state.router.blocking_write().insert(&method, &path, handler_id);

        Ok(())
    }

    /// Set fallback handler for unmatched routes
    #[napi]
    pub fn set_fallback(
        &self,
        handler: JsFunction,
    ) -> Result<()> {
        let tsfn: ThreadsafeFunction<RequestContext, ErrorStrategy::Fatal> = handler
            .create_threadsafe_function(0, |ctx| {
                Ok(vec![ctx.value])
            })?;

        let handler = DynamicHandler { callback: tsfn };
        *self.state.fallback_handler.blocking_write() = Some(handler);
        Ok(())
    }

    // ========================================================================
    // GustApp Integration (Route Registration Pattern)
    // ========================================================================

    /// Register routes from GustApp manifest
    ///
    /// This enables Rust-side routing with handler ID dispatch.
    /// Routes are registered in the Rust Radix Trie router.
    /// When a request matches, `invoke_handler(handler_id, ctx)` is called.
    ///
    /// @example
    /// ```typescript
    /// const app = createApp({ routes: [...] })
    /// server.registerRoutes(app.manifest)
    /// server.setInvokeHandler(app.invokeHandler)
    /// ```
    #[napi]
    pub async fn register_routes(&self, manifest: RouteManifest) -> Result<()> {
        // Build new router - this happens at startup, not on hot path
        let mut new_router = Router::new();

        for entry in manifest.routes {
            // Use insert() instead of route() - new gust-router API
            new_router.insert(&entry.method, &entry.path, entry.handler_id);
        }

        // Atomic swap with ArcSwap - lock-free on read path
        self.state.app_routes.store(Arc::new(new_router));
        Ok(())
    }

    /// Set the invoke handler callback from GustApp
    ///
    /// This callback is called when a route matches with:
    /// - `handlerId`: The handler ID from the route manifest
    /// - `ctx`: The native handler context with parsed request data
    ///
    /// The callback should return a ResponseData (or Promise<ResponseData>).
    ///
    /// @example
    /// ```typescript
    /// const app = createApp({ routes: [...] })
    /// server.setInvokeHandler(app.invokeHandler)
    /// ```
    #[napi]
    pub fn set_invoke_handler(&self, handler: JsFunction) -> Result<()> {
        // Create threadsafe function that accepts (handlerId, context) tuple
        let tsfn: InvokeHandlerCallback = handler
            .create_threadsafe_function(0, |ctx| {
                // ctx.value is (u32, NativeHandlerContext)
                // We need to convert this to JS arguments
                Ok(vec![ctx.value])
            })?;

        let invoke = InvokeHandler { callback: tsfn };
        // Use ArcSwap for lock-free atomic swap
        self.state.invoke_handler.store(Arc::new(Some(invoke)));
        Ok(())
    }

    /// Check if app routes pattern is configured
    /// Returns true if invoke_handler is set
    #[napi]
    pub fn has_app_routes(&self) -> bool {
        // Lock-free read with ArcSwap
        self.state.invoke_handler.load().is_some()
    }

    /// Clear all app routes (for hot reload)
    #[napi]
    pub fn clear_app_routes(&self) -> Result<()> {
        // Atomic swap with ArcSwap - lock-free
        self.state.app_routes.store(Arc::new(Router::new()));
        Ok(())
    }

    /// Start the server (non-blocking)
    #[napi]
    pub async fn serve(&self, port: u32) -> Result<()> {
        self.serve_with_hostname(port, "0.0.0.0".to_string()).await
    }

    /// Start the server with custom hostname (non-blocking)
    #[napi]
    pub async fn serve_with_hostname(&self, port: u32, hostname: String) -> Result<()> {
        use std::net::SocketAddr;
        use tokio::net::TcpListener;

        let addr: SocketAddr = format!("{}:{}", hostname, port)
            .parse()
            .map_err(|e| Error::from_reason(format!("Invalid address: {}", e)))?;

        let state = self.state.clone();
        let tls_config = state.tls_config.read().await.clone();
        let http2_enabled = state.http2_enabled.load(Ordering::Relaxed);

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        *self.shutdown_tx.write().await = Some(shutdown_tx);

        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| Error::from_reason(format!("Bind error: {}", e)))?;

        // Spawn server task
        #[allow(unused_variables)]
        if let Some(tls) = tls_config {
            // TLS server
            #[cfg(feature = "tls")]
            {
                self.serve_tls(listener, tls, http2_enabled, state, shutdown_rx).await?;
            }
            #[cfg(not(feature = "tls"))]
            {
                let _ = (tls, http2_enabled); // Suppress unused variable warning
                return Err(Error::from_reason("TLS support not enabled. Compile with 'tls' feature.".to_string()));
            }
        } else {
            // Plain HTTP server
            self.serve_http(listener, http2_enabled, state, shutdown_rx).await?;
        }

        Ok(())
    }

    /// Serve HTTP (non-TLS) connections
    #[allow(unused_variables)]
    async fn serve_http(
        &self,
        listener: tokio::net::TcpListener,
        http2_enabled: bool, // Reserved for future h2c support
        state: Arc<ServerState>,
        shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<()> {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;

        let tracker = self.connection_tracker.clone();

        tokio::spawn(async move {
            tokio::select! {
                _ = async {
                    loop {
                        let (stream, _) = match listener.accept().await {
                            Ok(conn) => conn,
                            Err(_) => continue,
                        };

                        // Reject new connections during shutdown
                        if tracker.is_shutting_down() {
                            drop(stream);
                            continue;
                        }

                        let state = state.clone();
                        let conn_tracker = tracker.clone();
                        conn_tracker.increment();

                        tokio::spawn(async move {
                            let io = TokioIo::new(stream);
                            let service = service_fn(move |req| {
                                let state = state.clone();
                                async move {
                                    handle_request(state, req).await
                                }
                            });

                            // HTTP/2 over clear text (h2c) is less common, use HTTP/1.1 by default
                            if let Err(e) = http1::Builder::new()
                                .serve_connection(io, service)
                                .await
                            {
                                // Only log if not a normal connection close
                                if !e.to_string().contains("connection closed") {
                                    eprintln!("Connection error: {}", e);
                                }
                            }

                            conn_tracker.decrement();
                        });
                    }
                } => {}
                _ = shutdown_rx => {
                    // Signal shutdown - new connections will be rejected
                    tracker.start_shutdown();
                }
            }
        });

        Ok(())
    }

    /// Serve TLS connections with optional HTTP/2
    #[cfg(feature = "tls")]
    async fn serve_tls(
        &self,
        listener: tokio::net::TcpListener,
        tls_config: TlsConfig,
        http2_enabled: bool,
        state: Arc<ServerState>,
        shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<()> {
        use hyper::server::conn::http1;
        use hyper::server::conn::http2;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;

        // Load TLS configuration
        let tls_acceptor = load_tls_config(&tls_config, http2_enabled)
            .map_err(|e| Error::from_reason(format!("TLS config error: {}", e)))?;

        let tracker = self.connection_tracker.clone();

        tokio::spawn(async move {
            tokio::select! {
                _ = async {
                    loop {
                        let (stream, _) = match listener.accept().await {
                            Ok(conn) => conn,
                            Err(_) => continue,
                        };

                        // Reject new connections during shutdown
                        if tracker.is_shutting_down() {
                            drop(stream);
                            continue;
                        }

                        let acceptor = tls_acceptor.clone();
                        let state = state.clone();
                        let http2 = http2_enabled;
                        let conn_tracker = tracker.clone();
                        conn_tracker.increment();

                        tokio::spawn(async move {
                            // TLS handshake
                            let tls_stream = match acceptor.accept(stream).await {
                                Ok(s) => s,
                                Err(e) => {
                                    // Only log if not a normal connection close
                                    if !e.to_string().contains("connection closed") {
                                        eprintln!("TLS handshake error: {}", e);
                                    }
                                    conn_tracker.decrement();
                                    return;
                                }
                            };

                            let io = TokioIo::new(tls_stream);
                            let service = service_fn(move |req| {
                                let state = state.clone();
                                async move {
                                    handle_request(state, req).await
                                }
                            });

                            // Use HTTP/2 if enabled and negotiated via ALPN
                            if http2 {
                                // Try HTTP/2 first, fall back to HTTP/1.1
                                if let Err(e) = http2::Builder::new(TokioExecutor)
                                    .serve_connection(io, service)
                                    .await
                                {
                                    if !e.to_string().contains("connection closed") {
                                        eprintln!("HTTP/2 connection error: {}", e);
                                    }
                                }
                            } else {
                                if let Err(e) = http1::Builder::new()
                                    .serve_connection(io, service)
                                    .await
                                {
                                    if !e.to_string().contains("connection closed") {
                                        eprintln!("HTTP/1.1 connection error: {}", e);
                                    }
                                }
                            }

                            conn_tracker.decrement();
                        });
                    }
                } => {}
                _ = shutdown_rx => {
                    // Signal shutdown - new connections will be rejected
                    tracker.start_shutdown();
                }
            }
        });

        Ok(())
    }

    /// Shutdown the server immediately (doesn't wait for connections)
    #[napi]
    pub async fn shutdown(&self) {
        self.connection_tracker.start_shutdown();
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
    }

    /// Graceful shutdown - waits for active connections to drain
    /// timeout_ms: Maximum time to wait for connections to drain (0 = no timeout)
    /// Returns true if all connections drained, false if timeout reached
    #[napi]
    pub async fn graceful_shutdown(&self, timeout_ms: u32) -> bool {
        // Signal shutdown to stop accepting new connections
        self.connection_tracker.start_shutdown();

        // Send shutdown signal to server loop
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }

        // Wait for connections to drain
        let start = std::time::Instant::now();
        let timeout = if timeout_ms > 0 {
            Some(Duration::from_millis(timeout_ms as u64))
        } else {
            None
        };

        loop {
            let active = self.connection_tracker.count();
            if active == 0 {
                return true; // All connections drained
            }

            // Check timeout
            if let Some(t) = timeout {
                if start.elapsed() >= t {
                    return false; // Timeout reached
                }
            }

            // Wait a bit before checking again
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Get the number of active connections
    #[napi]
    pub fn active_connections(&self) -> u32 {
        self.connection_tracker.count() as u32
    }

    /// Check if server is shutting down
    #[napi]
    pub fn is_shutting_down(&self) -> bool {
        self.connection_tracker.is_shutting_down()
    }
}

impl Default for GustServer {
    fn default() -> Self {
        GustServer {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
            connection_tracker: Arc::new(CoreConnectionTracker::new()),
        }
    }
}

/// Handle incoming HTTP request
async fn handle_request(
    state: Arc<ServerState>,
    req: hyper::Request<hyper::body::Incoming>,
) -> std::result::Result<hyper::Response<Full<Bytes>>, std::convert::Infallible> {
    let method_str = req.method().as_str();
    let path = req.uri().path();
    let method = Method::from_str(method_str).unwrap_or(Method::Get);
    let _is_get_or_head = method == Method::Get || method == Method::Head;

    // FAST PATH: Check legacy static/dynamic routes first with minimal overhead
    {
        let router = state.router.read().await;
        if let Some(matched) = router.find(method_str, path) {
            let handler_id = matched.handler_id;
            drop(router);

            // Try static response first
            let static_responses = state.static_responses.read().await;
            if let Some(static_response) = static_responses.get(&handler_id) {
                let response_bytes = static_response.bytes.clone();
                return Ok(hyper::Response::builder()
                    .status(200)
                    .body(Full::new(response_bytes))
                    .unwrap());
            }
            drop(static_responses);

            // Try dynamic handler
            let dynamic_handlers = state.dynamic_handlers.read().await;
            if let Some(handler) = dynamic_handlers.get(&handler_id) {
                let handler = handler.clone();
                let params: HashMap<String, String> = matched.params.into_iter().collect();
                drop(dynamic_handlers);

                // Create minimal context for dynamic handler
                let ctx = RequestContext {
                    method: method_str.to_string(),
                    path: path.to_string(),
                    query: req.uri().query().map(|s| s.to_string()),
                    params,
                    headers: HashMap::new(), // TODO: collect if needed
                    body: String::new(),     // TODO: read if needed
                };

                let response = call_js_handler(&handler.callback, ctx).await;
                return Ok(to_hyper_response(response_data_to_response(response)));
            }
        }
    }

    // FAST PATH 2: Check app routes (GustApp pattern - Rust routing, ID-based dispatch)
    // OPTIMIZED: Lock-free routing + lock-free invoke_handler read + skip body for GET/HEAD
    {
        // OPTIMIZATION: Lock-free read of app routes using ArcSwap
        let routes = state.app_routes.load();
        if let Some(matched) = routes.find(method_str, path) {
            let handler_id = matched.handler_id;
            let params: HashMap<String, String> = matched.params.into_iter().collect();
            // No need to drop - ArcSwap guard is cheap

            // OPTIMIZATION: Lock-free read of invoke handler using ArcSwap
            let invoke_guard = state.invoke_handler.load();
            if let Some(ref handler) = **invoke_guard {
                // Extract all data from req BEFORE consuming it
                let method_str_owned = method_str.to_string();
                let path_owned = path.to_string();
                let query_owned = req.uri().query().unwrap_or("").to_string();

                // OPTIMIZATION: Check if we can skip body reading entirely (GET/HEAD have no body)
                let skip_body = method == Method::Get || method == Method::Head;

                // OPTIMIZATION: Sucrose-style - skip header collection for simple GET/HEAD routes
                // If route has no params and is GET/HEAD, handler likely doesn't need headers
                let skip_headers = skip_body && params.is_empty();

                // Collect headers only if needed (Sucrose-style optimization)
                let headers_map: HashMap<String, String> = if skip_headers {
                    // Fast path: empty headers for simple GET/HEAD without params
                    HashMap::new()
                } else {
                    // Full path: collect headers with pre-allocated capacity
                    let mut map = HashMap::with_capacity(req.headers().len());
                    for (name, value) in req.headers() {
                        if let Ok(v) = value.to_str() {
                            map.insert(name.as_str().to_lowercase(), v.to_string());
                        }
                    }
                    map
                };

                // OPTIMIZATION: Skip body size check and reading for GET/HEAD
                let body_bytes = if skip_body {
                    // GET/HEAD - no body, skip entirely
                    Bytes::new()
                } else {
                    // POST/PUT/PATCH/etc - need to read body
                    let max_body_size = state.max_body_size.load(Ordering::Relaxed) as usize;

                    // Check body size limit from Content-Length header
                    if let Some(content_length) = headers_map.get("content-length") {
                        if let Ok(len) = content_length.parse::<usize>() {
                            if len > max_body_size {
                                return Ok(hyper::Response::builder()
                                    .status(413)
                                    .header("content-type", "text/plain")
                                    .body(Full::new(Bytes::from("Request Entity Too Large")))
                                    .unwrap());
                            }
                        }
                    }

                    // Read body with timeout
                    let request_timeout = state.request_timeout_ms.load(Ordering::Relaxed);
                    let body_result = if request_timeout > 0 {
                        tokio::time::timeout(
                            Duration::from_millis(request_timeout as u64),
                            req.collect()
                        ).await
                    } else {
                        Ok(req.collect().await)
                    };

                    match body_result {
                        Ok(Ok(collected)) => {
                            let bytes = collected.to_bytes();
                            if bytes.len() > max_body_size {
                                return Ok(hyper::Response::builder()
                                    .status(413)
                                    .header("content-type", "text/plain")
                                    .body(Full::new(Bytes::from("Request Entity Too Large")))
                                    .unwrap());
                            }
                            bytes
                        },
                        Ok(Err(_)) => Bytes::new(),
                        Err(_) => {
                            return Ok(hyper::Response::builder()
                                .status(408)
                                .header("content-type", "text/plain")
                                .body(Full::new(Bytes::from("Request Timeout")))
                                .unwrap());
                        }
                    }
                };

                // Create native handler context
                let native_ctx = NativeHandlerContext {
                    method: method_str_owned,
                    path: path_owned,
                    query: query_owned,
                    headers: headers_map,
                    params,
                    body: body_bytes.to_vec(),
                };

                // Create input for invoke handler
                let input = InvokeHandlerInput {
                    handler_id,
                    ctx: native_ctx,
                };

                // Call invoke handler with input
                let response = call_invoke_handler(&handler.callback, input).await;
                return Ok(to_hyper_response(response_data_to_response(response)));
            }
        }
    }

    // Check middleware early to know if we need request object
    let middleware = state.middleware.read().await;
    let has_middleware = !middleware.is_empty();
    drop(middleware);

    // FAST PATH: No middleware, check if we can use fallback directly
    if !has_middleware {
        // Note: Legacy routes already checked above, so this section is for fallback only
        // If no route matched, try fallback
        if true {
            // No dynamic route match - try fallback with minimal context
            let fallback = state.fallback_handler.read().await.clone();
            if let Some(handler) = fallback {
                // Minimal context for fallback - only allocate what's needed
                let ctx = RequestContext {
                    method: method_str.to_string(),
                    path: path.to_string(),
                    query: req.uri().query().map(|s| s.to_string()),
                    params: HashMap::new(),
                    headers: HashMap::new(), // Empty for fast path
                    body: String::new(),     // Skip body for GET/HEAD
                };

                let response = call_js_handler(&handler.callback, ctx).await;
                return Ok(to_hyper_response(response_data_to_response(response)));
            }

            // No fallback - 404
            return Ok(to_hyper_response(Response::not_found()));
        }
    }

    // For dynamic routes with middleware, we need full context
    let method_str = method_str.to_string();
    let path = path.to_string();
    let query = req.uri().query().map(|s| s.to_string());

    // Collect headers into HashMap
    let mut headers_map: HashMap<String, String> = HashMap::with_capacity(req.headers().len());
    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            headers_map.insert(name.as_str().to_lowercase(), v.to_string());
        }
    }

    // Create request object for middleware (if needed)
    let middleware = state.middleware.read().await;
    let request = if has_middleware {
        let mut mw_req = Request::new(method, path.clone());
        mw_req.query = query.clone();
        for (name, value) in &headers_map {
            mw_req.headers.push((name.clone(), value.clone()));
        }
        // Run before middleware
        if let Some(early_response) = middleware.run_before(&mut mw_req) {
            return Ok(to_hyper_response(early_response));
        }
        Some(mw_req)
    } else {
        None
    };
    drop(middleware);

    // 2. Try legacy routes again with middleware (shouldn't happen often)
    // This path is only for cases where middleware exists and modifies request
    let legacy_result = {
        let router = state.router.read().await;
        router.find(&method_str, &path)
    };

    if let Some(matched) = legacy_result {
        let handler_id = matched.handler_id;
        let params: HashMap<String, String> = matched.params.into_iter().collect();

        // Try dynamic handler
        let dynamic_handlers = state.dynamic_handlers.read().await;
        if let Some(handler) = dynamic_handlers.get(&handler_id).cloned() {
            drop(dynamic_handlers);

            // Check body size limit (lock-free atomic read)
            let max_body_size = state.max_body_size.load(Ordering::Relaxed) as usize;
        if let Some(content_length) = headers_map.get("content-length") {
            if let Ok(len) = content_length.parse::<usize>() {
                    if len > max_body_size {
                        return Ok(hyper::Response::builder()
                            .status(413)
                            .header("content-type", "text/plain")
                            .body(Full::new(Bytes::from("Request Entity Too Large")))
                            .unwrap());
                    }
                }
            }

            // Read body for dynamic handlers with timeout (lock-free atomic read)
            let request_timeout = state.request_timeout_ms.load(Ordering::Relaxed);
            let body_result = if request_timeout > 0 {
                tokio::time::timeout(
                    Duration::from_millis(request_timeout as u64),
                    req.collect()
                ).await
            } else {
                Ok(req.collect().await)
            };

            let body_bytes = match body_result {
                Ok(Ok(collected)) => {
                    let bytes = collected.to_bytes();
                    // Double-check size after reading (for chunked encoding)
                    if bytes.len() > max_body_size {
                        return Ok(hyper::Response::builder()
                            .status(413)
                            .header("content-type", "text/plain")
                            .body(Full::new(Bytes::from("Request Entity Too Large")))
                            .unwrap());
                    }
                    bytes
                },
                Ok(Err(_)) => Bytes::new(),
                Err(_) => {
                    // Timeout
                    return Ok(hyper::Response::builder()
                        .status(408)
                        .header("content-type", "text/plain")
                        .body(Full::new(Bytes::from("Request Timeout")))
                        .unwrap());
                }
            };
            let body_str = String::from_utf8(body_bytes.to_vec()).unwrap_or_default();

            // Create RequestContext for JS handler (matches TypeScript interface)
            let ctx = RequestContext {
                method: method_str.clone(),
                path: path.clone(),
                query,
                params,
                headers: headers_map.clone(),
                body: body_str,
            };

            // Call JS handler
            let response = call_js_handler(&handler.callback, ctx).await;
            let mut our_response = response_data_to_response(response);

            // Apply middleware chain (after) - only if middleware exists
            if let Some(ref req) = request {
                let middleware = state.middleware.read().await;
                middleware.run_after(req, &mut our_response);
            }

            return Ok(to_hyper_response(our_response));
        }
    }

    // 3. Try fallback handler
    let fallback = state.fallback_handler.read().await.clone();
    if let Some(handler) = fallback {
        // Check body size limit (lock-free atomic read)
        let max_body_size = state.max_body_size.load(Ordering::Relaxed) as usize;
        if let Some(content_length) = headers_map.get("content-length") {
            if let Ok(len) = content_length.parse::<usize>() {
                if len > max_body_size {
                    return Ok(hyper::Response::builder()
                        .status(413)
                        .header("content-type", "text/plain")
                        .body(Full::new(Bytes::from("Request Entity Too Large")))
                        .unwrap());
                }
            }
        }

        // Read body for fallback handler with timeout (lock-free atomic read)
        let request_timeout = state.request_timeout_ms.load(Ordering::Relaxed);
        let body_result = if request_timeout > 0 {
            tokio::time::timeout(
                Duration::from_millis(request_timeout as u64),
                req.collect()
            ).await
        } else {
            Ok(req.collect().await)
        };

        let body_bytes = match body_result {
            Ok(Ok(collected)) => {
                let bytes = collected.to_bytes();
                if bytes.len() > max_body_size {
                    return Ok(hyper::Response::builder()
                        .status(413)
                        .header("content-type", "text/plain")
                        .body(Full::new(Bytes::from("Request Entity Too Large")))
                        .unwrap());
                }
                bytes
            },
            Ok(Err(_)) => Bytes::new(),
            Err(_) => {
                return Ok(hyper::Response::builder()
                    .status(408)
                    .header("content-type", "text/plain")
                    .body(Full::new(Bytes::from("Request Timeout")))
                    .unwrap());
            }
        };
        let body_str = String::from_utf8(body_bytes.to_vec()).unwrap_or_default();

        let ctx = RequestContext {
            method: method_str,
            path: path.clone(),
            query,
            params: HashMap::new(),
            headers: headers_map,
            body: body_str,
        };

        let response = call_js_handler(&handler.callback, ctx).await;
        let mut our_response = response_data_to_response(response);

        // Apply middleware chain (after) - only if middleware exists
        if let Some(ref req) = request {
            let middleware = state.middleware.read().await;
            middleware.run_after(req, &mut our_response);
        }

        return Ok(to_hyper_response(our_response));
    }

    // 4. No route matched - 404
    let mut our_response = Response::not_found();
    if let Some(ref req) = request {
        let middleware = state.middleware.read().await;
        middleware.run_after(req, &mut our_response);
    }

    Ok(to_hyper_response(our_response))
}

/// Call JS handler and await result
async fn call_js_handler(
    callback: &ThreadsafeFunction<RequestContext, ErrorStrategy::Fatal>,
    ctx: RequestContext,
) -> ResponseData {
    // Use call_async to properly handle Promise returns
    match callback.call_async::<Promise<ResponseData>>(ctx).await {
        Ok(promise) => {
            match promise.await {
                Ok(response) => response,
                Err(_) => ResponseData {
                    status: 500,
                    headers: HashMap::new(),
                    body: "Internal Server Error".to_string(),
                    streaming: None,
                },
            }
        }
        Err(_) => ResponseData {
            status: 500,
            headers: HashMap::new(),
            body: "Internal Server Error".to_string(),
            streaming: None,
        },
    }
}

/// Call invoke handler (GustApp pattern) and await result
///
/// This is the new route registration pattern where Rust routes first,
/// then calls the JS invokeHandler with handler ID and context.
async fn call_invoke_handler(
    callback: &InvokeHandlerCallback,
    input: InvokeHandlerInput,
) -> ResponseData {
    // Use call_async to properly handle Promise returns
    match callback.call_async::<Promise<ResponseData>>(input).await {
        Ok(promise) => {
            match promise.await {
                Ok(response) => response,
                Err(_) => ResponseData {
                    status: 500,
                    headers: HashMap::new(),
                    body: "Internal Server Error".to_string(),
                    streaming: None,
                },
            }
        }
        Err(_) => ResponseData {
            status: 500,
            headers: HashMap::new(),
            body: "Internal Server Error".to_string(),
            streaming: None,
        },
    }
}

/// Convert ResponseData to our Response type
fn response_data_to_response(data: ResponseData) -> Response {
    let mut res = ResponseBuilder::new(StatusCode(data.status as u16))
        .body(data.body)
        .build();

    for (name, value) in data.headers {
        res.headers.push((name, value));
    }

    res
}

/// Convert our Response to hyper Response
fn to_hyper_response(res: Response) -> hyper::Response<Full<Bytes>> {
    let mut builder = hyper::Response::builder().status(res.status.as_u16());

    for (name, value) in &res.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }

    builder.body(Full::new(res.body)).unwrap()
}

/// Check if io_uring is available (Linux kernel 5.1+)
#[napi]
pub fn is_io_uring_available() -> bool {
    #[cfg(all(target_os = "linux", feature = "io_uring"))]
    {
        true
    }
    #[cfg(not(all(target_os = "linux", feature = "io_uring")))]
    {
        false
    }
}

/// Get the number of CPU cores
#[napi]
pub fn get_cpu_count() -> u32 {
    num_cpus::get() as u32
}

/// Get the number of physical CPU cores (excluding hyperthreading)
#[napi]
pub fn get_physical_cpu_count() -> u32 {
    num_cpus::get_physical() as u32
}

/// Get recommended worker count for optimal performance
/// Returns min(cpu_count, 4) for typical web server workloads
#[napi]
pub fn get_recommended_workers() -> u32 {
    let cpus = num_cpus::get() as u32;
    cpus.min(8) // Cap at 8 workers for most workloads
}

/// Create a CORS middleware with permissive settings
#[napi]
pub fn cors_permissive() -> CorsConfig {
    CorsConfig {
        origins: Some(vec!["*".to_string()]),
        methods: Some(vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string(), "PATCH".to_string(), "OPTIONS".to_string()]),
        allowed_headers: Some(vec!["*".to_string()]),
        exposed_headers: None,
        credentials: Some(true),
        max_age: Some(86400),
    }
}

/// Create security headers with strict defaults
#[napi]
pub fn security_strict() -> SecurityConfig {
    SecurityConfig {
        hsts: Some(true),
        hsts_max_age: Some(31536000),
        frame_options: Some("DENY".to_string()),
        content_type_options: Some(true),
        xss_protection: Some(true),
        referrer_policy: Some("strict-origin-when-cross-origin".to_string()),
    }
}

/// Check if TLS support is available
#[napi]
pub fn is_tls_available() -> bool {
    #[cfg(feature = "tls")]
    { true }
    #[cfg(not(feature = "tls"))]
    { false }
}

/// Check if HTTP/2 support is available
#[napi]
pub fn is_http2_available() -> bool {
    // HTTP/2 is always available through hyper
    true
}

/// Check if compression support is available
#[napi]
pub fn is_compression_available() -> bool {
    #[cfg(feature = "compress")]
    { true }
    #[cfg(not(feature = "compress"))]
    { false }
}

// ============================================================================
// TLS Configuration
// ============================================================================

/// Tokio executor for hyper HTTP/2
#[derive(Clone, Copy)]
#[allow(dead_code)]
struct TokioExecutor;

impl<F> hyper::rt::Executor<F> for TokioExecutor
where
    F: std::future::Future + Send + 'static,
    F::Output: Send + 'static,
{
    fn execute(&self, fut: F) {
        tokio::spawn(fut);
    }
}

/// Load TLS configuration from TlsConfig
#[cfg(feature = "tls")]
fn load_tls_config(config: &TlsConfig, http2_enabled: bool) -> std::result::Result<tokio_rustls::TlsAcceptor, String> {
    use rustls::pki_types::{CertificateDer, PrivateKeyDer};
    use std::io::BufReader;
    use std::fs::File;
    use std::sync::Arc;

    // Load certificate
    let certs: Vec<CertificateDer<'static>> = if let Some(ref cert_path) = config.cert_path {
        let file = File::open(cert_path).map_err(|e| format!("Failed to open cert file: {}", e))?;
        let mut reader = BufReader::new(file);
        rustls_pemfile::certs(&mut reader)
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to parse cert: {}", e))?
    } else if let Some(ref cert_pem) = config.cert {
        let mut reader = BufReader::new(cert_pem.as_bytes());
        rustls_pemfile::certs(&mut reader)
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to parse cert PEM: {}", e))?
    } else {
        return Err("No certificate provided".to_string());
    };

    // Load private key
    let key: PrivateKeyDer<'static> = if let Some(ref key_path) = config.key_path {
        let file = File::open(key_path).map_err(|e| format!("Failed to open key file: {}", e))?;
        let mut reader = BufReader::new(file);
        rustls_pemfile::private_key(&mut reader)
            .map_err(|e| format!("Failed to parse key: {}", e))?
            .ok_or_else(|| "No private key found".to_string())?
    } else if let Some(ref key_pem) = config.key {
        let mut reader = BufReader::new(key_pem.as_bytes());
        rustls_pemfile::private_key(&mut reader)
            .map_err(|e| format!("Failed to parse key PEM: {}", e))?
            .ok_or_else(|| "No private key found".to_string())?
    } else {
        return Err("No private key provided".to_string());
    };

    // Build server config
    let mut server_config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| format!("Failed to build TLS config: {}", e))?;

    // Enable ALPN for HTTP/2 negotiation
    if http2_enabled {
        server_config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    } else {
        server_config.alpn_protocols = vec![b"http/1.1".to_vec()];
    }

    Ok(tokio_rustls::TlsAcceptor::from(Arc::new(server_config)))
}

// ============================================================================
// Compression
// ============================================================================

/// Compress response body if compression is enabled and applicable
#[cfg(feature = "compress")]
fn maybe_compress_response(
    body: Bytes,
    accept_encoding: Option<&str>,
    content_type: Option<&str>,
    config: &CompressionConfig,
) -> (Bytes, Option<String>) {
    use flate2::Compression;
    use flate2::write::GzEncoder;
    use std::io::Write;

    // Check threshold
    let threshold = config.threshold.unwrap_or(1024) as usize;
    if body.len() < threshold {
        return (body, None);
    }

    // Check if content type is compressible
    let compressible = content_type.map(|ct| {
        ct.starts_with("text/") ||
        ct.contains("json") ||
        ct.contains("xml") ||
        ct.contains("javascript") ||
        ct.contains("css")
    }).unwrap_or(false);

    if !compressible {
        return (body, None);
    }

    // Check Accept-Encoding header
    let accept = accept_encoding.unwrap_or("");

    // Try brotli first (if enabled), then gzip
    if config.brotli.unwrap_or(false) && accept.contains("br") {
        // Brotli compression
        let level = config.level.unwrap_or(4);
        let mut encoder = brotli::CompressorWriter::new(
            Vec::new(),
            4096,
            level as u32,
            22
        );
        if encoder.write_all(&body).is_ok() {
            // into_inner returns Vec<u8> directly
            let compressed = encoder.into_inner();
            return (Bytes::from(compressed), Some("br".to_string()));
        }
    }

    if config.gzip.unwrap_or(true) && accept.contains("gzip") {
        // Gzip compression
        let level = config.level.unwrap_or(6);
        let mut encoder = GzEncoder::new(Vec::new(), Compression::new(level));
        if encoder.write_all(&body).is_ok() {
            if let Ok(compressed) = encoder.finish() {
                return (Bytes::from(compressed), Some("gzip".to_string()));
            }
        }
    }

    (body, None)
}

/// Allow unused for now until compression is fully integrated
#[allow(dead_code)]
fn _compression_placeholder() {
    #[cfg(feature = "compress")]
    let _ = maybe_compress_response;
}

// ============================================================================
// WebSocket Support
// ============================================================================

/// Check if request is a WebSocket upgrade request
#[napi]
pub fn is_websocket_upgrade(headers: HashMap<String, String>) -> bool {
    let connection = headers.get("connection").map(|s| s.to_lowercase());
    let upgrade = headers.get("upgrade").map(|s| s.to_lowercase());
    let ws_key = headers.get("sec-websocket-key");

    connection.map(|c| c.contains("upgrade")).unwrap_or(false)
        && upgrade.map(|u| u == "websocket").unwrap_or(false)
        && ws_key.is_some()
}

/// Generate WebSocket accept key from client key
/// Uses gust_core::generate_accept_key internally
#[napi]
pub fn generate_websocket_accept(key: String) -> String {
    core_generate_accept_key(&key)
}

/// WebSocket upgrade response headers
#[napi(object)]
pub struct WebSocketUpgradeResponse {
    pub status: u32,
    pub headers: HashMap<String, String>,
}

/// Generate WebSocket upgrade response
#[napi]
pub fn create_websocket_upgrade_response(key: String, protocol: Option<String>) -> WebSocketUpgradeResponse {
    let accept = generate_websocket_accept(key);

    let mut headers = HashMap::new();
    headers.insert("upgrade".to_string(), "websocket".to_string());
    headers.insert("connection".to_string(), "Upgrade".to_string());
    headers.insert("sec-websocket-accept".to_string(), accept);

    if let Some(proto) = protocol {
        headers.insert("sec-websocket-protocol".to_string(), proto);
    }

    WebSocketUpgradeResponse {
        status: 101,
        headers,
    }
}

// ============================================================================
// WebSocket Frame Encoding/Decoding (RFC 6455)
// Uses gust_core::WebSocketFrame (CoreFrame) internally
// ============================================================================

/// WebSocket frame opcode (for JavaScript consumption)
#[napi(string_enum)]
#[derive(PartialEq)]
pub enum WebSocketOpcode {
    /// Continuation frame (0x0)
    Continuation,
    /// Text frame (0x1)
    Text,
    /// Binary frame (0x2)
    Binary,
    /// Close frame (0x8)
    Close,
    /// Ping frame (0x9)
    Ping,
    /// Pong frame (0xA)
    Pong,
}

// Convert between NAPI enum and core enum
fn core_opcode_to_string(opcode: CoreOpcode) -> &'static str {
    match opcode {
        CoreOpcode::Continuation => "continuation",
        CoreOpcode::Text => "text",
        CoreOpcode::Binary => "binary",
        CoreOpcode::Close => "close",
        CoreOpcode::Ping => "ping",
        CoreOpcode::Pong => "pong",
    }
}

/// Parsed WebSocket frame
#[napi(object)]
#[derive(Clone)]
pub struct WebSocketFrame {
    /// Frame opcode
    pub opcode: String,
    /// Is this the final frame in a message?
    pub fin: bool,
    /// Payload data (unmasked)
    pub payload: Vec<u8>,
    /// Total bytes consumed from input buffer
    pub bytes_consumed: u32,
    /// For close frames: the close code (if present)
    pub close_code: Option<u32>,
    /// For close frames: the close reason (if present)
    pub close_reason: Option<String>,
}

/// Result of parsing WebSocket frame
#[napi(object)]
pub struct WebSocketParseResult {
    /// The parsed frame (if complete)
    pub frame: Option<WebSocketFrame>,
    /// Error message (if parse failed)
    pub error: Option<String>,
    /// Needs more data?
    pub incomplete: bool,
}

/// Parse a WebSocket frame from raw bytes
/// Uses gust_core::WebSocketFrame::decode() internally
#[napi]
pub fn parse_websocket_frame(data: Vec<u8>) -> WebSocketParseResult {
    match CoreFrame::decode(&data) {
        Some((frame, bytes_consumed)) => {
            let opcode_str = core_opcode_to_string(frame.opcode);

            // Parse close code and reason for close frames
            let (close_code, close_reason) = if frame.opcode == CoreOpcode::Close && frame.payload.len() >= 2 {
                let code = u16::from_be_bytes([frame.payload[0], frame.payload[1]]) as u32;
                let reason = if frame.payload.len() > 2 {
                    String::from_utf8(frame.payload[2..].to_vec()).ok()
                } else {
                    None
                };
                (Some(code), reason)
            } else {
                (None, None)
            };

            WebSocketParseResult {
                frame: Some(WebSocketFrame {
                    opcode: opcode_str.to_string(),
                    fin: frame.fin,
                    payload: frame.payload,
                    bytes_consumed: bytes_consumed as u32,
                    close_code,
                    close_reason,
                }),
                error: None,
                incomplete: false,
            }
        }
        None => {
            // Could be incomplete or invalid
            if data.len() < 2 {
                WebSocketParseResult {
                    frame: None,
                    error: None,
                    incomplete: true,
                }
            } else {
                // Check if opcode is valid
                let opcode_raw = data[0] & 0x0F;
                if CoreOpcode::from_u8(opcode_raw).is_none() {
                    WebSocketParseResult {
                        frame: None,
                        error: Some(format!("Invalid opcode: {}", opcode_raw)),
                        incomplete: false,
                    }
                } else {
                    // Probably just needs more data
                    WebSocketParseResult {
                        frame: None,
                        error: None,
                        incomplete: true,
                    }
                }
            }
        }
    }
}

/// Encode a WebSocket text frame
/// Uses gust_core::WebSocketFrame::text().encode() internally
#[napi]
pub fn encode_websocket_text(text: String, fin: Option<bool>) -> Vec<u8> {
    let mut frame = CoreFrame::text(text);
    frame.fin = fin.unwrap_or(true);
    frame.encode()
}

/// Encode a WebSocket binary frame
/// Uses gust_core::WebSocketFrame::binary().encode() internally
#[napi]
pub fn encode_websocket_binary(data: Vec<u8>, fin: Option<bool>) -> Vec<u8> {
    let mut frame = CoreFrame::binary(data);
    frame.fin = fin.unwrap_or(true);
    frame.encode()
}

/// Encode a WebSocket ping frame
/// Uses gust_core::WebSocketFrame::ping().encode() internally
#[napi]
pub fn encode_websocket_ping(data: Option<Vec<u8>>) -> Vec<u8> {
    CoreFrame::ping(data.unwrap_or_default()).encode()
}

/// Encode a WebSocket pong frame (in response to ping)
/// Uses gust_core::WebSocketFrame::pong().encode() internally
#[napi]
pub fn encode_websocket_pong(data: Option<Vec<u8>>) -> Vec<u8> {
    CoreFrame::pong(data.unwrap_or_default()).encode()
}

/// Encode a WebSocket close frame
/// Uses gust_core::WebSocketFrame::close().encode() internally
#[napi]
pub fn encode_websocket_close(code: Option<u32>, reason: Option<String>) -> Vec<u8> {
    let code = code.unwrap_or(1000) as u16;
    let reason = reason.unwrap_or_default();
    CoreFrame::close(code, &reason).encode()
}

/// Encode a WebSocket continuation frame (for fragmented messages)
#[napi]
pub fn encode_websocket_continuation(data: Vec<u8>, fin: bool) -> Vec<u8> {
    CoreFrame {
        fin,
        opcode: CoreOpcode::Continuation,
        mask: None,
        payload: data,
    }.encode()
}

/// Mask WebSocket payload data (for client->server frames)
///
/// The same XOR operation is used for both masking and unmasking
#[napi]
pub fn mask_websocket_payload(data: Vec<u8>, mask_key: Vec<u8>) -> Vec<u8> {
    if mask_key.len() != 4 {
        return data; // Invalid mask key, return unchanged
    }

    let mut result = data;
    for (i, byte) in result.iter_mut().enumerate() {
        *byte ^= mask_key[i % 4];
    }
    result
}

/// Generate a random mask key for client->server frames
#[napi]
pub fn generate_websocket_mask() -> Vec<u8> {
    use std::time::{SystemTime, UNIX_EPOCH};

    // Simple PRNG using system time (good enough for masking)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    let mut seed = now as u64;
    let mut mask = Vec::with_capacity(4);

    for _ in 0..4 {
        // LCG-based PRNG
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
        mask.push((seed >> 33) as u8);
    }

    mask
}

/// WebSocket close codes (RFC 6455)
#[napi(object)]
pub struct WebSocketCloseCodes;

/// Get standard WebSocket close code values
#[napi]
pub fn websocket_close_codes() -> HashMap<String, u32> {
    let mut codes = HashMap::new();
    codes.insert("NORMAL".to_string(), 1000);
    codes.insert("GOING_AWAY".to_string(), 1001);
    codes.insert("PROTOCOL_ERROR".to_string(), 1002);
    codes.insert("UNSUPPORTED_DATA".to_string(), 1003);
    codes.insert("NO_STATUS".to_string(), 1005);
    codes.insert("ABNORMAL".to_string(), 1006);
    codes.insert("INVALID_PAYLOAD".to_string(), 1007);
    codes.insert("POLICY_VIOLATION".to_string(), 1008);
    codes.insert("MESSAGE_TOO_BIG".to_string(), 1009);
    codes.insert("EXTENSION_REQUIRED".to_string(), 1010);
    codes.insert("INTERNAL_ERROR".to_string(), 1011);
    codes.insert("TLS_HANDSHAKE".to_string(), 1015);
    codes
}

/// Validate a WebSocket close code
#[napi]
pub fn is_valid_close_code(code: u32) -> bool {
    match code {
        // Normal closure codes
        1000..=1003 | 1007..=1011 => true,
        // Reserved for private use
        3000..=3999 => true,
        // Reserved for applications
        4000..=4999 => true,
        // Invalid
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_creation() {
        let _server = GustServer::new();
    }

    #[test]
    fn test_cors_permissive() {
        let cors = cors_permissive();
        assert_eq!(cors.origins, Some(vec!["*".to_string()]));
        assert!(cors.credentials.unwrap());
    }

    #[test]
    fn test_security_strict() {
        let security = security_strict();
        assert!(security.hsts.unwrap());
        assert_eq!(security.frame_options, Some("DENY".to_string()));
    }
}
