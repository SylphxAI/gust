//! WASM bindings for gust-core
//!
//! Thin layer exposing gust-core types to JavaScript via wasm-bindgen.
//! Used for edge/serverless environments (Cloudflare Workers, Vercel Edge, etc.)

use gust_core::{Method, Router};
use wasm_bindgen::prelude::*;

/// Initialize the WASM module
#[wasm_bindgen(start)]
pub fn init() {
    // Set panic hook for better error messages in browser console
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// WASM-exposed router
#[wasm_bindgen]
pub struct WasmRouter {
    inner: Router<u32>, // Store handler IDs, not actual functions
}

#[wasm_bindgen]
impl WasmRouter {
    /// Create a new router
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Router::new(),
        }
    }

    /// Add a route
    #[wasm_bindgen(js_name = addRoute)]
    pub fn add_route(&mut self, method: &str, path: &str, handler_id: u32) -> Result<(), JsValue> {
        let method = Method::from_str(method)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.inner
            .route(method, path, handler_id)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Match a request and return handler ID + params
    #[wasm_bindgen(js_name = matchRoute)]
    pub fn match_route(&self, method: &str, path: &str) -> JsValue {
        let method = match Method::from_str(method) {
            Ok(m) => m,
            Err(_) => return JsValue::NULL,
        };

        match self.inner.match_route(method, path) {
            Some(matched) => {
                // Return { handlerId, params }
                let obj = js_sys::Object::new();
                js_sys::Reflect::set(&obj, &"handlerId".into(), &JsValue::from(matched.value)).unwrap();

                let params = js_sys::Object::new();
                for (k, v) in matched.params {
                    js_sys::Reflect::set(&params, &k.into(), &v.into()).unwrap();
                }
                js_sys::Reflect::set(&obj, &"params".into(), &params).unwrap();

                obj.into()
            }
            None => JsValue::NULL,
        }
    }
}

impl Default for WasmRouter {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse query string into object
#[wasm_bindgen(js_name = parseQuery)]
pub fn parse_query(query: &str) -> JsValue {
    let obj = js_sys::Object::new();

    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            let decoded_key = urlencoding_decode(key);
            let decoded_value = urlencoding_decode(value);
            js_sys::Reflect::set(&obj, &decoded_key.into(), &decoded_value.into()).unwrap();
        }
    }

    obj.into()
}

/// Simple URL decoding
fn urlencoding_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
            }
            result.push('%');
            result.push_str(&hex);
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

/// Check if WASM module is initialized
#[wasm_bindgen(js_name = isReady)]
pub fn is_ready() -> bool {
    true
}

/// Get WASM module version
#[wasm_bindgen(js_name = getVersion)]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_router() {
        let mut router = WasmRouter::new();
        router.add_route("GET", "/", 1).unwrap();
        router.add_route("GET", "/users/:id", 2).unwrap();
    }

    #[test]
    fn test_parse_query() {
        // Can't test JsValue in non-wasm tests
    }
}
