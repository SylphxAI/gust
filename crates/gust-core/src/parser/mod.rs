//! HTTP Parser types - SSOT for Method enum and parsing utilities
//!
//! This module provides shared HTTP parsing types used by both
//! native (via hyper) and WASM builds.

mod method;

pub use method::Method;

/// Maximum number of headers to parse
pub const MAX_HEADERS: usize = 64;

/// Header offsets: [name_start, name_end, value_start, value_end]
pub type HeaderOffsets = [u32; MAX_HEADERS * 4];

/// Parsed request result - all offsets, no allocations
#[derive(Debug, Clone, Copy)]
pub struct ParsedRequest {
    /// Parse state: 0=incomplete, 1=complete, 2=error
    pub state: u8,
    /// HTTP method
    pub method: Method,
    /// Path start offset
    pub path_start: u32,
    /// Path end offset
    pub path_end: u32,
    /// Query start offset (0 if none)
    pub query_start: u32,
    /// Query end offset (0 if none)
    pub query_end: u32,
    /// Number of headers parsed
    pub headers_count: u32,
    /// Body start offset
    pub body_start: u32,
}

impl Default for ParsedRequest {
    fn default() -> Self {
        Self {
            state: 0,
            method: Method::Get,
            path_start: 0,
            path_end: 0,
            query_start: 0,
            query_end: 0,
            headers_count: 0,
            body_start: 0,
        }
    }
}
