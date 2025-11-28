//! WASM bindings for JavaScript interop
//! Optimized for minimal allocations and fast JS interop

use crate::parser::{self, HeaderOffsets, MAX_HEADERS};
use crate::router::Router as InnerRouter;
use wasm_bindgen::prelude::*;

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
