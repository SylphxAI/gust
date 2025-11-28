//! WASM bindings for JavaScript interop
//! Optimized for minimal allocations and fast JS interop

use crate::parser::{self, HeaderOffsets, MAX_HEADERS};
use crate::router::Router as InnerRouter;
use crate::websocket;
use crate::validate;
use crate::tracing;
use wasm_bindgen::prelude::*;

// ============================================================================
// HTTP Parser
// ============================================================================

/// WASM-exposed HTTP parser result
/// Uses fixed-size array to avoid Vec allocation
#[wasm_bindgen]
pub struct ParseResult {
    /// 0 = incomplete, 1 = complete, 2 = error
    pub state: u8,
    /// Method (0=GET, 1=POST, etc.)
    pub method: u8,
    /// Path start offset in buffer
    pub path_start: u32,
    /// Path end offset in buffer
    pub path_end: u32,
    /// Query start offset (0 if no query)
    pub query_start: u32,
    /// Query end offset (0 if no query)
    pub query_end: u32,
    /// Number of headers parsed
    pub headers_count: u32,
    /// Body start offset
    pub body_start: u32,
    /// Fixed-size header offsets array
    offsets: HeaderOffsets,
}

#[wasm_bindgen]
impl ParseResult {
    /// Get header offsets as a JS-compatible slice
    /// Returns only the used portion to minimize data transfer
    #[wasm_bindgen(getter)]
    pub fn header_offsets(&self) -> Vec<u32> {
        let count = (self.headers_count as usize) * 4;
        self.offsets[..count].to_vec()
    }
}

/// Parse HTTP request from raw bytes
/// Single-pass parsing with zero intermediate allocations
#[wasm_bindgen]
pub fn parse_http(buf: &[u8]) -> ParseResult {
    let mut offsets: HeaderOffsets = [0; MAX_HEADERS * 4];
    let parsed = parser::parse_request(buf, &mut offsets);

    ParseResult {
        state: parsed.state,
        method: parsed.method as u8,
        path_start: parsed.path_start,
        path_end: parsed.path_end,
        query_start: parsed.query_start,
        query_end: parsed.query_end,
        headers_count: parsed.headers_count,
        body_start: parsed.body_start,
        offsets,
    }
}

// ============================================================================
// Router
// ============================================================================

/// WASM-exposed Router
#[wasm_bindgen]
pub struct WasmRouter {
    inner: InnerRouter,
}

#[wasm_bindgen]
impl WasmRouter {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: InnerRouter::new(),
        }
    }

    /// Insert a route
    pub fn insert(&mut self, method: &str, path: &str, handler_id: u32) {
        self.inner.insert(method, path, handler_id);
    }

    /// Find a route, returns RouteMatch
    pub fn find(&self, method: &str, path: &str) -> RouteMatch {
        match self.inner.find(method, path) {
            Some(m) => RouteMatch {
                found: true,
                handler_id: m.handler_id,
                params: m
                    .params
                    .into_iter()
                    .flat_map(|(k, v)| vec![k, v])
                    .collect(),
            },
            None => RouteMatch {
                found: false,
                handler_id: 0,
                params: Vec::new(),
            },
        }
    }
}

impl Default for WasmRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Route match result for WASM
#[wasm_bindgen]
pub struct RouteMatch {
    pub found: bool,
    pub handler_id: u32,
    params: Vec<String>,
}

#[wasm_bindgen]
impl RouteMatch {
    #[wasm_bindgen(getter)]
    pub fn params(&self) -> Vec<String> {
        self.params.clone()
    }
}

/// Get method string from code
#[wasm_bindgen]
pub fn method_to_string(code: u8) -> String {
    match code {
        0 => "GET".to_string(),
        1 => "POST".to_string(),
        2 => "PUT".to_string(),
        3 => "DELETE".to_string(),
        4 => "PATCH".to_string(),
        5 => "HEAD".to_string(),
        6 => "OPTIONS".to_string(),
        7 => "CONNECT".to_string(),
        8 => "TRACE".to_string(),
        _ => "UNKNOWN".to_string(),
    }
}

// ============================================================================
// WebSocket
// ============================================================================

/// WebSocket frame parse result
#[wasm_bindgen]
pub struct WsFrameResult {
    /// Frame parsed successfully
    pub complete: bool,
    /// Needs more data
    pub incomplete: bool,
    /// Parse error occurred
    pub error: bool,
    /// FIN flag
    pub fin: bool,
    /// Opcode (0=continuation, 1=text, 2=binary, 8=close, 9=ping, 10=pong)
    pub opcode: u8,
    /// Bytes consumed from input
    pub bytes_consumed: u32,
    /// Close code (for close frames)
    pub close_code: u16,
    /// Payload data
    payload: Vec<u8>,
    /// Close reason
    close_reason: String,
}

#[wasm_bindgen]
impl WsFrameResult {
    #[wasm_bindgen(getter)]
    pub fn payload(&self) -> Vec<u8> {
        self.payload.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn close_reason(&self) -> String {
        self.close_reason.clone()
    }
}

/// Parse a WebSocket frame
#[wasm_bindgen]
pub fn parse_websocket_frame(data: &[u8]) -> WsFrameResult {
    match websocket::parse_frame(data) {
        websocket::ParseResult::Complete(frame, consumed) => WsFrameResult {
            complete: true,
            incomplete: false,
            error: false,
            fin: frame.fin,
            opcode: frame.opcode as u8,
            bytes_consumed: consumed as u32,
            close_code: frame.close_code.unwrap_or(0),
            payload: frame.payload,
            close_reason: frame.close_reason.unwrap_or_default(),
        },
        websocket::ParseResult::Incomplete => WsFrameResult {
            complete: false,
            incomplete: true,
            error: false,
            fin: false,
            opcode: 0,
            bytes_consumed: 0,
            close_code: 0,
            payload: Vec::new(),
            close_reason: String::new(),
        },
        websocket::ParseResult::Error(_) => WsFrameResult {
            complete: false,
            incomplete: false,
            error: true,
            fin: false,
            opcode: 0,
            bytes_consumed: 0,
            close_code: 0,
            payload: Vec::new(),
            close_reason: String::new(),
        },
    }
}

/// Encode a WebSocket text frame
#[wasm_bindgen]
pub fn encode_websocket_text(text: &str, fin: bool) -> Vec<u8> {
    websocket::encode_text(text, fin)
}

/// Encode a WebSocket binary frame
#[wasm_bindgen]
pub fn encode_websocket_binary(data: &[u8], fin: bool) -> Vec<u8> {
    websocket::encode_binary(data, fin)
}

/// Encode a WebSocket ping frame
#[wasm_bindgen]
pub fn encode_websocket_ping(data: &[u8]) -> Vec<u8> {
    websocket::encode_ping(data)
}

/// Encode a WebSocket pong frame
#[wasm_bindgen]
pub fn encode_websocket_pong(data: &[u8]) -> Vec<u8> {
    websocket::encode_pong(data)
}

/// Encode a WebSocket close frame
#[wasm_bindgen]
pub fn encode_websocket_close(code: Option<u16>, reason: Option<String>) -> Vec<u8> {
    websocket::encode_close(code, reason.as_deref())
}

/// Generate WebSocket accept key
#[wasm_bindgen]
pub fn generate_websocket_accept(key: &str) -> String {
    websocket::generate_accept_key(key)
}

// ============================================================================
// Validation
// ============================================================================

/// Validation result for WASM
#[wasm_bindgen]
pub struct WasmValidationResult {
    pub valid: bool,
    errors: Vec<String>,
}

#[wasm_bindgen]
impl WasmValidationResult {
    #[wasm_bindgen(getter)]
    pub fn errors(&self) -> Vec<String> {
        self.errors.clone()
    }
}

/// Validate a string value
#[wasm_bindgen]
pub fn validate_string(
    value: &str,
    min_length: Option<u32>,
    max_length: Option<u32>,
    format: Option<String>,
) -> WasmValidationResult {
    let fmt = format.as_ref().and_then(|f| match f.as_str() {
        "email" => Some(validate::StringFormat::Email),
        "url" => Some(validate::StringFormat::Url),
        "uuid" => Some(validate::StringFormat::Uuid),
        "date" => Some(validate::StringFormat::Date),
        "datetime" => Some(validate::StringFormat::DateTime),
        _ => None,
    });

    let result = validate::validate_string(
        value,
        min_length.map(|n| n as usize),
        max_length.map(|n| n as usize),
        fmt,
    );

    WasmValidationResult {
        valid: result.valid,
        errors: result.errors.into_iter().map(|e| e.message).collect(),
    }
}

/// Validate a number value
#[wasm_bindgen]
pub fn validate_number(
    value: f64,
    min: Option<f64>,
    max: Option<f64>,
    is_integer: bool,
) -> WasmValidationResult {
    let result = validate::validate_number(value, min, max, is_integer);

    WasmValidationResult {
        valid: result.valid,
        errors: result.errors.into_iter().map(|e| e.message).collect(),
    }
}

// ============================================================================
// Tracing
// ============================================================================

/// Span context for WASM
#[wasm_bindgen]
pub struct WasmSpanContext {
    pub trace_flags: u8,
    trace_id: String,
    span_id: String,
}

#[wasm_bindgen]
impl WasmSpanContext {
    #[wasm_bindgen(getter)]
    pub fn trace_id(&self) -> String {
        self.trace_id.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn span_id(&self) -> String {
        self.span_id.clone()
    }
}

/// Parse W3C traceparent header
#[wasm_bindgen]
pub fn parse_traceparent(header: &str) -> Option<WasmSpanContext> {
    tracing::parse_traceparent(header).map(|ctx| WasmSpanContext {
        trace_id: ctx.trace_id,
        span_id: ctx.span_id,
        trace_flags: ctx.trace_flags,
    })
}

/// Format W3C traceparent header
#[wasm_bindgen]
pub fn format_traceparent(trace_id: &str, span_id: &str, trace_flags: u8) -> String {
    let ctx = tracing::SpanContext {
        trace_id: trace_id.to_string(),
        span_id: span_id.to_string(),
        trace_flags,
        trace_state: None,
    };
    tracing::format_traceparent(&ctx)
}

/// Seed the random number generator
#[wasm_bindgen]
pub fn seed_rng(seed: u64) {
    tracing::seed_rng(seed);
}

/// Generate a trace ID (32 hex chars)
#[wasm_bindgen]
pub fn generate_trace_id() -> String {
    tracing::generate_trace_id()
}

/// Generate a span ID (16 hex chars)
#[wasm_bindgen]
pub fn generate_span_id() -> String {
    tracing::generate_span_id()
}

/// Generate a random WebSocket mask (4 bytes)
#[wasm_bindgen]
pub fn generate_websocket_mask() -> Vec<u8> {
    tracing::generate_mask().to_vec()
}
