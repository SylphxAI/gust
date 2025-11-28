//! Native Node.js bindings for gust-core via napi-rs
//!
//! High-performance native HTTP server for Node.js/Bun.
//! Uses gust-core for shared logic.

use bytes::Bytes;
use gust_core::{
    Method, Request, Response, ResponseBuilder, Router, StatusCode,
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
use std::time::Duration;
use tokio::sync::RwLock;

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
    /// Number of worker threads
    pub workers: Option<u32>,
    /// CORS configuration
    pub cors: Option<CorsConfig>,
    /// Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,
    /// Security headers configuration
    pub security: Option<SecurityConfig>,
    /// Compression configuration
    pub compression: Option<CompressionConfig>,
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

/// Server state shared across all connections
struct ServerState {
    /// Static routes (pre-rendered responses)
    static_routes: RwLock<Router<StaticResponse>>,
    /// Dynamic routes (JS handlers)
    dynamic_routes: RwLock<Router<DynamicHandler>>,
    /// Middleware chain
    middleware: RwLock<MiddlewareChain>,
    /// Fallback handler for unmatched routes
    fallback_handler: RwLock<Option<DynamicHandler>>,
}

impl ServerState {
    fn new() -> Self {
        Self {
            static_routes: RwLock::new(Router::new()),
            dynamic_routes: RwLock::new(Router::new()),
            middleware: RwLock::new(MiddlewareChain::new()),
            fallback_handler: RwLock::new(None),
        }
    }
}

/// Native HTTP server
#[napi]
pub struct GustServer {
    state: Arc<ServerState>,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
}

#[napi]
impl GustServer {
    /// Create a new server instance
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
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

        Ok(server)
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
        let method_enum = Method::from_str(&method)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        // Pre-render the HTTP/1.1 response
        let res = ResponseBuilder::new(StatusCode(status as u16))
            .header("content-type", &content_type)
            .body(body.clone())
            .build();
        let response_bytes = res.to_http1_bytes();

        let static_response = StaticResponse {
            bytes: response_bytes,
        };

        self.state
            .static_routes
            .write()
            .await
            .route(method_enum, &path, static_response)
            .map_err(|e| Error::from_reason(e.to_string()))
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
        let method_enum = Method::from_str(&method)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        // Create threadsafe function that can be called from any thread
        let tsfn: ThreadsafeFunction<RequestContext, ErrorStrategy::Fatal> = handler
            .create_threadsafe_function(0, |ctx| {
                Ok(vec![ctx.value])
            })?;

        let handler = DynamicHandler { callback: tsfn };

        // Use blocking write since we're not in async context
        let mut routes = self.state.dynamic_routes.blocking_write();
        routes.route(method_enum, &path, handler)
            .map_err(|e| Error::from_reason(e.to_string()))
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

    /// Start the server (non-blocking)
    #[napi]
    pub async fn serve(&self, port: u32) -> Result<()> {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use std::net::SocketAddr;
        use tokio::net::TcpListener;

        let addr: SocketAddr = format!("0.0.0.0:{}", port)
            .parse()
            .map_err(|e| Error::from_reason(format!("Invalid port: {}", e)))?;

        let state = self.state.clone();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        *self.shutdown_tx.write().await = Some(shutdown_tx);

        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| Error::from_reason(format!("Bind error: {}", e)))?;

        // Spawn server task
        tokio::spawn(async move {
            tokio::select! {
                _ = async {
                    loop {
                        let (stream, _) = match listener.accept().await {
                            Ok(conn) => conn,
                            Err(_) => continue,
                        };

                        let state = state.clone();
                        tokio::spawn(async move {
                            let io = TokioIo::new(stream);
                            let service = service_fn(move |req| {
                                let state = state.clone();
                                async move {
                                    handle_request(state, req).await
                                }
                            });

                            if let Err(e) = http1::Builder::new()
                                .serve_connection(io, service)
                                .await
                            {
                                eprintln!("Connection error: {}", e);
                            }
                        });
                    }
                } => {}
                _ = shutdown_rx => {
                    // Graceful shutdown
                }
            }
        });

        Ok(())
    }

    /// Shutdown the server
    #[napi]
    pub async fn shutdown(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
    }
}

impl Default for GustServer {
    fn default() -> Self {
        GustServer {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
        }
    }
}

/// Handle incoming HTTP request
async fn handle_request(
    state: Arc<ServerState>,
    req: hyper::Request<hyper::body::Incoming>,
) -> std::result::Result<hyper::Response<Full<Bytes>>, std::convert::Infallible> {
    let method_str = req.method().as_str().to_string();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|s| s.to_string());

    // Collect headers into HashMap
    let mut headers_map: HashMap<String, String> = HashMap::new();
    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            headers_map.insert(name.to_string().to_lowercase(), v.to_string());
        }
    }

    // Create our Request type for middleware
    let method = Method::from_str(&method_str).unwrap_or(Method::Get);
    let mut request = Request::new(method, path.clone());
    request.query = query.clone();

    // Copy headers to request
    for (name, value) in &headers_map {
        request.headers.push((name.clone(), value.clone()));
    }

    // Apply middleware chain (before)
    let middleware = state.middleware.read().await;
    if let Some(early_response) = middleware.run_before(&mut request) {
        // Middleware short-circuited - return early response
        return Ok(to_hyper_response(early_response));
    }
    drop(middleware);

    // 1. Try static routes first (fastest path)
    {
        let routes = state.static_routes.read().await;
        if let Some(matched) = routes.match_route(method, &path) {
            // Return pre-rendered response - bypass middleware after for max speed
            let response_bytes = matched.value.bytes.clone();
            return Ok(hyper::Response::builder()
                .status(200)
                .body(Full::new(response_bytes))
                .unwrap());
        }
    }

    // 2. Try dynamic routes
    let dynamic_result = {
        let routes = state.dynamic_routes.read().await;
        routes.match_route(method, &path).map(|m| (m.value.clone(), m.params.clone()))
    };

    if let Some((handler, params)) = dynamic_result {
        // Read body for dynamic handlers
        let body_bytes = match req.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => Bytes::new(),
        };
        let body_str = String::from_utf8(body_bytes.to_vec()).unwrap_or_default();

        // Create RequestContext for JS handler (matches TypeScript interface)
        let ctx = RequestContext {
            method: method_str.clone(),
            path: path.clone(),
            query,
            params,
            headers: headers_map,
            body: body_str,
        };

        // Call JS handler
        let response = call_js_handler(&handler.callback, ctx).await;
        let mut our_response = response_data_to_response(response);

        // Apply middleware chain (after)
        let middleware = state.middleware.read().await;
        middleware.run_after(&request, &mut our_response);

        return Ok(to_hyper_response(our_response));
    }

    // 3. Try fallback handler
    let fallback = state.fallback_handler.read().await.clone();
    if let Some(handler) = fallback {
        // Read body for fallback handler
        let body_bytes = match req.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => Bytes::new(),
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

        // Apply middleware chain (after)
        let middleware = state.middleware.read().await;
        middleware.run_after(&request, &mut our_response);

        return Ok(to_hyper_response(our_response));
    }

    // 4. No route matched - 404
    let mut our_response = Response::not_found();
    let middleware = state.middleware.read().await;
    middleware.run_after(&request, &mut our_response);

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
                },
            }
        }
        Err(_) => ResponseData {
            status: 500,
            headers: HashMap::new(),
            body: "Internal Server Error".to_string(),
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
