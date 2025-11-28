//! OpenTelemetry Integration
//!
//! Distributed tracing and metrics for observability.
//! Implements W3C Trace Context specification.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// ============================================================================
// Span Types
// ============================================================================

/// Span attributes following OpenTelemetry semantic conventions
pub type SpanAttributes = HashMap<String, AttributeValue>;

/// Attribute value types
#[derive(Debug, Clone, PartialEq)]
pub enum AttributeValue {
    String(String),
    Int(i64),
    Float(f64),
    Bool(bool),
}

impl From<String> for AttributeValue {
    fn from(s: String) -> Self {
        AttributeValue::String(s)
    }
}

impl From<&str> for AttributeValue {
    fn from(s: &str) -> Self {
        AttributeValue::String(s.to_string())
    }
}

impl From<i64> for AttributeValue {
    fn from(n: i64) -> Self {
        AttributeValue::Int(n)
    }
}

impl From<i32> for AttributeValue {
    fn from(n: i32) -> Self {
        AttributeValue::Int(n as i64)
    }
}

impl From<u32> for AttributeValue {
    fn from(n: u32) -> Self {
        AttributeValue::Int(n as i64)
    }
}

impl From<f64> for AttributeValue {
    fn from(n: f64) -> Self {
        AttributeValue::Float(n)
    }
}

impl From<bool> for AttributeValue {
    fn from(b: bool) -> Self {
        AttributeValue::Bool(b)
    }
}

impl AttributeValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            AttributeValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            AttributeValue::Int(n) => Some(*n),
            _ => None,
        }
    }
}

/// Span context for distributed tracing
#[derive(Debug, Clone, PartialEq)]
pub struct SpanContext {
    /// 16-byte trace ID (32 hex chars)
    pub trace_id: String,
    /// 8-byte span ID (16 hex chars)
    pub span_id: String,
    /// Trace flags (1 = sampled)
    pub trace_flags: u8,
    /// Trace state (vendor-specific)
    pub trace_state: Option<String>,
}

impl SpanContext {
    pub fn new() -> Self {
        Self {
            trace_id: generate_trace_id(),
            span_id: generate_span_id(),
            trace_flags: 1, // Sampled by default
            trace_state: None,
        }
    }

    /// Check if this trace is sampled
    pub fn is_sampled(&self) -> bool {
        self.trace_flags & 0x01 != 0
    }
}

impl Default for SpanContext {
    fn default() -> Self {
        Self::new()
    }
}

/// Span status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanStatus {
    Unset,
    Ok,
    Error,
}

impl SpanStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            SpanStatus::Unset => "unset",
            SpanStatus::Ok => "ok",
            SpanStatus::Error => "error",
        }
    }

    pub fn code(&self) -> u8 {
        match self {
            SpanStatus::Unset => 0,
            SpanStatus::Ok => 1,
            SpanStatus::Error => 2,
        }
    }
}

/// Span event
#[derive(Debug, Clone)]
pub struct SpanEvent {
    pub name: String,
    pub timestamp_ns: u64,
    pub attributes: SpanAttributes,
}

impl SpanEvent {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            timestamp_ns: current_time_nanos(),
            attributes: HashMap::new(),
        }
    }

    pub fn with_attributes(mut self, attrs: SpanAttributes) -> Self {
        self.attributes = attrs;
        self
    }
}

/// Span kind
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpanKind {
    Internal,
    Server,
    Client,
    Producer,
    Consumer,
}

impl SpanKind {
    pub fn as_i32(&self) -> i32 {
        match self {
            SpanKind::Internal => 0,
            SpanKind::Server => 1,
            SpanKind::Client => 2,
            SpanKind::Producer => 3,
            SpanKind::Consumer => 4,
        }
    }
}

/// A span representing a unit of work
#[derive(Debug, Clone)]
pub struct Span {
    pub name: String,
    pub context: SpanContext,
    pub parent_span_id: Option<String>,
    pub kind: SpanKind,
    pub start_time_ns: u64,
    pub end_time_ns: Option<u64>,
    pub attributes: SpanAttributes,
    pub status: SpanStatus,
    pub events: Vec<SpanEvent>,
}

impl Span {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            context: SpanContext::new(),
            parent_span_id: None,
            kind: SpanKind::Internal,
            start_time_ns: current_time_nanos(),
            end_time_ns: None,
            attributes: HashMap::new(),
            status: SpanStatus::Unset,
            events: Vec::new(),
        }
    }

    pub fn with_kind(mut self, kind: SpanKind) -> Self {
        self.kind = kind;
        self
    }

    pub fn with_parent(mut self, parent_context: &SpanContext) -> Self {
        self.context.trace_id = parent_context.trace_id.clone();
        self.parent_span_id = Some(parent_context.span_id.clone());
        self
    }

    pub fn set_attribute(&mut self, key: impl Into<String>, value: impl Into<AttributeValue>) {
        self.attributes.insert(key.into(), value.into());
    }

    pub fn add_event(&mut self, event: SpanEvent) {
        self.events.push(event);
    }

    pub fn end(&mut self) {
        if self.end_time_ns.is_none() {
            self.end_time_ns = Some(current_time_nanos());
        }
    }

    pub fn end_with_status(&mut self, status: SpanStatus) {
        self.status = status;
        self.end();
    }

    pub fn duration_ns(&self) -> Option<u64> {
        self.end_time_ns.map(|end| end.saturating_sub(self.start_time_ns))
    }

    pub fn duration_ms(&self) -> Option<f64> {
        self.duration_ns().map(|ns| ns as f64 / 1_000_000.0)
    }
}

// ============================================================================
// ID Generation
// ============================================================================

/// Generate 16-byte trace ID (32 hex chars)
pub fn generate_trace_id() -> String {
    let bytes = generate_random_bytes(16);
    bytes_to_hex(&bytes)
}

/// Generate 8-byte span ID (16 hex chars)
pub fn generate_span_id() -> String {
    let bytes = generate_random_bytes(8);
    bytes_to_hex(&bytes)
}

fn generate_random_bytes(len: usize) -> Vec<u8> {
    use std::time::SystemTime;

    // Counter for uniqueness within same nanosecond
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut state = seed ^ counter;

    let mut result = Vec::with_capacity(len);
    for _ in 0..len {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        result.push((state & 0xFF) as u8);
    }

    result
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn current_time_nanos() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

// ============================================================================
// W3C Trace Context
// ============================================================================

/// Parse W3C traceparent header
/// Format: version-traceId-spanId-traceFlags
/// Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
pub fn parse_traceparent(header: &str) -> Option<SpanContext> {
    let parts: Vec<&str> = header.split('-').collect();
    if parts.len() != 4 {
        return None;
    }

    let version = parts[0];
    let trace_id = parts[1];
    let span_id = parts[2];
    let flags = parts[3];

    // Version 00 is currently supported
    if version != "00" {
        return None;
    }

    // Validate trace ID (32 hex chars, not all zeros)
    if trace_id.len() != 32 || !trace_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    if trace_id == "00000000000000000000000000000000" {
        return None;
    }

    // Validate span ID (16 hex chars)
    if span_id.len() != 16 || !span_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    // Validate flags (2 hex chars)
    if flags.len() != 2 || !flags.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let trace_flags = u8::from_str_radix(flags, 16).ok()?;

    Some(SpanContext {
        trace_id: trace_id.to_string(),
        span_id: span_id.to_string(),
        trace_flags,
        trace_state: None,
    })
}

/// Format W3C traceparent header
pub fn format_traceparent(ctx: &SpanContext) -> String {
    format!(
        "00-{}-{}-{:02x}",
        ctx.trace_id, ctx.span_id, ctx.trace_flags
    )
}

/// Parse W3C tracestate header
pub fn parse_tracestate(header: &str) -> HashMap<String, String> {
    let mut state = HashMap::new();
    for pair in header.split(',') {
        let pair = pair.trim();
        if let Some((key, value)) = pair.split_once('=') {
            state.insert(key.to_string(), value.to_string());
        }
    }
    state
}

/// Format W3C tracestate header
pub fn format_tracestate(state: &HashMap<String, String>) -> String {
    state
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",")
}

// ============================================================================
// Tracer
// ============================================================================

/// Tracer configuration
#[derive(Debug, Clone)]
pub struct TracerConfig {
    pub service_name: String,
    pub sample_rate: f64,
}

impl Default for TracerConfig {
    fn default() -> Self {
        Self {
            service_name: "unknown".to_string(),
            sample_rate: 1.0,
        }
    }
}

impl TracerConfig {
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: service_name.into(),
            ..Default::default()
        }
    }

    pub fn sample_rate(mut self, rate: f64) -> Self {
        self.sample_rate = rate.clamp(0.0, 1.0);
        self
    }
}

/// Simple tracer implementation
pub struct Tracer {
    config: TracerConfig,
    spans: RwLock<Vec<Span>>,
}

impl Tracer {
    pub fn new(config: TracerConfig) -> Self {
        Self {
            config,
            spans: RwLock::new(Vec::new()),
        }
    }

    pub fn service_name(&self) -> &str {
        &self.config.service_name
    }

    /// Start a new span
    pub fn start_span(&self, name: impl Into<String>) -> Span {
        let mut span = Span::new(name);
        span.set_attribute("service.name", self.config.service_name.clone());
        span
    }

    /// Start a child span
    pub fn start_child_span(&self, name: impl Into<String>, parent: &SpanContext) -> Span {
        let mut span = Span::new(name).with_parent(parent);
        span.set_attribute("service.name", self.config.service_name.clone());
        span
    }

    /// End a span and record it
    pub fn end_span(&self, mut span: Span, status: SpanStatus) {
        span.end_with_status(status);
        self.spans.write().unwrap().push(span);
    }

    /// Get and clear recorded spans
    pub fn drain_spans(&self) -> Vec<Span> {
        std::mem::take(&mut *self.spans.write().unwrap())
    }

    /// Get number of pending spans
    pub fn pending_count(&self) -> usize {
        self.spans.read().unwrap().len()
    }
}

// ============================================================================
// Metrics
// ============================================================================

/// Counter metric (monotonically increasing)
pub struct Counter {
    name: String,
    value: AtomicU64,
}

impl Counter {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn add(&self, delta: u64) {
        self.value.fetch_add(delta, Ordering::Relaxed);
    }

    pub fn inc(&self) {
        self.add(1);
    }

    pub fn get(&self) -> u64 {
        self.value.load(Ordering::Relaxed)
    }
}

/// Gauge metric (can increase or decrease)
pub struct Gauge {
    name: String,
    value: AtomicU64, // Store f64 bits
}

impl Gauge {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: AtomicU64::new(0),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn set(&self, value: f64) {
        self.value.store(value.to_bits(), Ordering::Relaxed);
    }

    pub fn get(&self) -> f64 {
        f64::from_bits(self.value.load(Ordering::Relaxed))
    }
}

/// Histogram metric (value distribution)
pub struct Histogram {
    name: String,
    buckets: RwLock<Vec<f64>>,
    count: AtomicU64,
    sum: AtomicU64, // Store f64 bits
}

impl Histogram {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            buckets: RwLock::new(Vec::new()),
            count: AtomicU64::new(0),
            sum: AtomicU64::new(0f64.to_bits()),
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn record(&self, value: f64) {
        self.buckets.write().unwrap().push(value);
        self.count.fetch_add(1, Ordering::Relaxed);

        // Atomic add for sum
        loop {
            let current = self.sum.load(Ordering::Relaxed);
            let current_f64 = f64::from_bits(current);
            let new_f64 = current_f64 + value;
            if self.sum.compare_exchange(
                current,
                new_f64.to_bits(),
                Ordering::Relaxed,
                Ordering::Relaxed,
            ).is_ok() {
                break;
            }
        }
    }

    pub fn count(&self) -> u64 {
        self.count.load(Ordering::Relaxed)
    }

    pub fn sum(&self) -> f64 {
        f64::from_bits(self.sum.load(Ordering::Relaxed))
    }

    pub fn mean(&self) -> f64 {
        let count = self.count();
        if count == 0 {
            0.0
        } else {
            self.sum() / count as f64
        }
    }

    pub fn percentile(&self, p: f64) -> f64 {
        let values = self.buckets.read().unwrap();
        if values.is_empty() {
            return 0.0;
        }

        let mut sorted: Vec<f64> = values.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let idx = ((p / 100.0) * (sorted.len() - 1) as f64).round() as usize;
        sorted[idx.min(sorted.len() - 1)]
    }
}

use std::sync::Arc;

/// Metrics collector
pub struct MetricsCollector {
    counters: RwLock<HashMap<String, Arc<Counter>>>,
    gauges: RwLock<HashMap<String, Arc<Gauge>>>,
    histograms: RwLock<HashMap<String, Arc<Histogram>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            counters: RwLock::new(HashMap::new()),
            gauges: RwLock::new(HashMap::new()),
            histograms: RwLock::new(HashMap::new()),
        }
    }

    pub fn counter(&self, name: &str) -> Arc<Counter> {
        {
            let counters = self.counters.read().unwrap();
            if let Some(counter) = counters.get(name) {
                return Arc::clone(counter);
            }
        }

        let mut counters = self.counters.write().unwrap();
        counters.entry(name.to_string())
            .or_insert_with(|| Arc::new(Counter::new(name)))
            .clone()
    }

    pub fn gauge(&self, name: &str) -> Arc<Gauge> {
        {
            let gauges = self.gauges.read().unwrap();
            if let Some(gauge) = gauges.get(name) {
                return Arc::clone(gauge);
            }
        }

        let mut gauges = self.gauges.write().unwrap();
        gauges.entry(name.to_string())
            .or_insert_with(|| Arc::new(Gauge::new(name)))
            .clone()
    }

    pub fn histogram(&self, name: &str) -> Arc<Histogram> {
        {
            let histograms = self.histograms.read().unwrap();
            if let Some(histogram) = histograms.get(name) {
                return Arc::clone(histogram);
            }
        }

        let mut histograms = self.histograms.write().unwrap();
        histograms.entry(name.to_string())
            .or_insert_with(|| Arc::new(Histogram::new(name)))
            .clone()
    }

    /// Export metrics in Prometheus text format
    pub fn to_prometheus(&self) -> String {
        let mut lines = Vec::new();

        // Counters
        for (name, counter) in self.counters.read().unwrap().iter() {
            lines.push(format!("# TYPE {} counter", name));
            lines.push(format!("{} {}", name, counter.get()));
        }

        // Gauges
        for (name, gauge) in self.gauges.read().unwrap().iter() {
            lines.push(format!("# TYPE {} gauge", name));
            lines.push(format!("{} {}", name, gauge.get()));
        }

        // Histograms
        for (name, histogram) in self.histograms.read().unwrap().iter() {
            lines.push(format!("# TYPE {} histogram", name));
            lines.push(format!("{}_count {}", name, histogram.count()));
            lines.push(format!("{}_sum {}", name, histogram.sum()));
        }

        lines.join("\n")
    }
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// HTTP Semantic Conventions
// ============================================================================

/// Standard HTTP span attributes
pub mod http_attrs {
    pub const METHOD: &str = "http.method";
    pub const URL: &str = "http.url";
    pub const TARGET: &str = "http.target";
    pub const HOST: &str = "http.host";
    pub const SCHEME: &str = "http.scheme";
    pub const STATUS_CODE: &str = "http.status_code";
    pub const USER_AGENT: &str = "http.user_agent";
    pub const REQUEST_CONTENT_LENGTH: &str = "http.request_content_length";
    pub const RESPONSE_CONTENT_LENGTH: &str = "http.response_content_length";
    pub const ROUTE: &str = "http.route";
    pub const CLIENT_IP: &str = "http.client_ip";
}

/// Standard service attributes
pub mod service_attrs {
    pub const NAME: &str = "service.name";
    pub const VERSION: &str = "service.version";
    pub const INSTANCE_ID: &str = "service.instance.id";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_trace_id() {
        let id1 = generate_trace_id();
        let id2 = generate_trace_id();

        assert_eq!(id1.len(), 32);
        assert_eq!(id2.len(), 32);
        assert_ne!(id1, id2);
        assert!(id1.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_generate_span_id() {
        let id1 = generate_span_id();
        let id2 = generate_span_id();

        assert_eq!(id1.len(), 16);
        assert_eq!(id2.len(), 16);
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_parse_traceparent() {
        let header = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
        let ctx = parse_traceparent(header).unwrap();

        assert_eq!(ctx.trace_id, "0af7651916cd43dd8448eb211c80319c");
        assert_eq!(ctx.span_id, "b7ad6b7169203331");
        assert_eq!(ctx.trace_flags, 1);
        assert!(ctx.is_sampled());
    }

    #[test]
    fn test_parse_traceparent_invalid() {
        // Wrong version
        assert!(parse_traceparent("01-abc-def-00").is_none());

        // Wrong format
        assert!(parse_traceparent("00-abc").is_none());

        // All zeros trace ID
        assert!(parse_traceparent("00-00000000000000000000000000000000-b7ad6b7169203331-01").is_none());

        // Invalid hex
        assert!(parse_traceparent("00-gggggggggggggggggggggggggggggggg-b7ad6b7169203331-01").is_none());
    }

    #[test]
    fn test_format_traceparent() {
        let ctx = SpanContext {
            trace_id: "0af7651916cd43dd8448eb211c80319c".to_string(),
            span_id: "b7ad6b7169203331".to_string(),
            trace_flags: 1,
            trace_state: None,
        };

        let header = format_traceparent(&ctx);
        assert_eq!(header, "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01");
    }

    #[test]
    fn test_parse_tracestate() {
        let header = "vendor1=value1,vendor2=value2";
        let state = parse_tracestate(header);

        assert_eq!(state.get("vendor1"), Some(&"value1".to_string()));
        assert_eq!(state.get("vendor2"), Some(&"value2".to_string()));
    }

    #[test]
    fn test_span_lifecycle() {
        let mut span = Span::new("test-operation");
        span.set_attribute("key", "value");
        span.add_event(SpanEvent::new("event1"));
        span.end_with_status(SpanStatus::Ok);

        assert!(span.end_time_ns.is_some());
        assert_eq!(span.status, SpanStatus::Ok);
        assert_eq!(span.attributes.get("key"), Some(&AttributeValue::String("value".to_string())));
        assert_eq!(span.events.len(), 1);
    }

    #[test]
    fn test_tracer() {
        let tracer = Tracer::new(TracerConfig::new("test-service"));

        let span = tracer.start_span("test-span");
        assert_eq!(span.attributes.get("service.name"), Some(&AttributeValue::String("test-service".to_string())));

        tracer.end_span(span, SpanStatus::Ok);
        assert_eq!(tracer.pending_count(), 1);

        let spans = tracer.drain_spans();
        assert_eq!(spans.len(), 1);
        assert_eq!(tracer.pending_count(), 0);
    }

    #[test]
    fn test_counter() {
        let counter = Counter::new("requests_total");
        counter.inc();
        counter.inc();
        counter.add(5);

        assert_eq!(counter.get(), 7);
    }

    #[test]
    fn test_gauge() {
        let gauge = Gauge::new("temperature");
        gauge.set(25.5);
        assert_eq!(gauge.get(), 25.5);

        gauge.set(30.0);
        assert_eq!(gauge.get(), 30.0);
    }

    #[test]
    fn test_histogram() {
        let histogram = Histogram::new("request_duration_ms");
        histogram.record(10.0);
        histogram.record(20.0);
        histogram.record(30.0);

        assert_eq!(histogram.count(), 3);
        assert_eq!(histogram.sum(), 60.0);
        assert_eq!(histogram.mean(), 20.0);
        assert_eq!(histogram.percentile(50.0), 20.0);
    }

    #[test]
    fn test_metrics_collector() {
        let collector = MetricsCollector::new();

        collector.counter("http_requests").inc();
        collector.counter("http_requests").inc();
        collector.gauge("connections").set(5.0);
        collector.histogram("latency_ms").record(100.0);

        assert_eq!(collector.counter("http_requests").get(), 2);
        assert_eq!(collector.gauge("connections").get(), 5.0);
        assert_eq!(collector.histogram("latency_ms").count(), 1);

        let prometheus = collector.to_prometheus();
        assert!(prometheus.contains("http_requests 2"));
        assert!(prometheus.contains("connections 5"));
    }
}
