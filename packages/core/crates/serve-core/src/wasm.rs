//! WASM bindings for JavaScript interop

use wasm_bindgen::prelude::*;
use crate::parser::{self, Method, ParseState, Header, MAX_HEADERS};
use crate::router::Router as InnerRouter;

/// WASM-exposed HTTP parser result
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
    /// Header offsets: [name_start, name_end, value_start, value_end] * headers_count
    header_offsets: Vec<u32>,
}

#[wasm_bindgen]
impl ParseResult {
    #[wasm_bindgen(getter)]
    pub fn header_offsets(&self) -> Vec<u32> {
        self.header_offsets.clone()
    }
}

/// Parse HTTP request from raw bytes
#[wasm_bindgen]
pub fn parse_http(buf: &[u8]) -> ParseResult {
    let mut headers: [Header; MAX_HEADERS] = [Header { name: &[], value: &[] }; MAX_HEADERS];
    let state = parser::parse_request(buf, &mut headers);

    let mut result = ParseResult {
        state: match state {
            ParseState::Incomplete => 0,
            ParseState::Complete(_) => 1,
            ParseState::Error => 2,
        },
        method: 0,
        path_start: 0,
        path_end: 0,
        query_start: 0,
        query_end: 0,
        headers_count: 0,
        body_start: 0,
        header_offsets: Vec::new(),
    };

    if let ParseState::Complete(body_start) = state {
        result.body_start = body_start as u32;

        // Parse method
        if let Some(space) = buf.iter().position(|&b| b == b' ') {
            if let Some(method) = Method::parse(&buf[..space]) {
                result.method = method as u8;
            }

            // Parse path
            let path_start = space + 1;
            let mut path_end = path_start;
            let mut query_start = 0;
            let mut query_end = 0;

            for i in path_start..buf.len() {
                match buf[i] {
                    b' ' => {
                        if query_start == 0 {
                            path_end = i;
                        } else {
                            query_end = i;
                        }
                        break;
                    }
                    b'?' if query_start == 0 => {
                        path_end = i;
                        query_start = i + 1;
                    }
                    _ => {}
                }
            }

            result.path_start = path_start as u32;
            result.path_end = path_end as u32;
            result.query_start = query_start as u32;
            result.query_end = query_end as u32;
        }

        // Count headers and store offsets
        for header in headers.iter() {
            if header.name.is_empty() {
                break;
            }
            result.headers_count += 1;

            // Calculate offsets relative to buffer start
            let name_start = header.name.as_ptr() as usize - buf.as_ptr() as usize;
            let name_end = name_start + header.name.len();
            let value_start = header.value.as_ptr() as usize - buf.as_ptr() as usize;
            let value_end = value_start + header.value.len();

            result.header_offsets.push(name_start as u32);
            result.header_offsets.push(name_end as u32);
            result.header_offsets.push(value_start as u32);
            result.header_offsets.push(value_end as u32);
        }
    }

    result
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

    /// Insert a route (returns self for chaining)
    pub fn insert(&mut self, method: &str, path: &str, handler_id: u32) {
        self.inner.insert(method, path, handler_id);
    }

    /// Find a route, returns handler_id or -1 if not found
    pub fn find(&self, method: &str, path: &str) -> RouteMatch {
        match self.inner.find(method, path) {
            Some(m) => RouteMatch {
                found: true,
                handler_id: m.handler_id,
                params: m.params.into_iter()
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
