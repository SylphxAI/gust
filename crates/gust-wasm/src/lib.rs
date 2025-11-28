//! gust-wasm: High-performance HTTP parser and router for WASM
//!
//! Zero-copy HTTP parsing, O(k) routing, and utilities compiled to WebAssembly.
//!
//! ## Features
//! - HTTP/1.1 request parsing (zero-copy)
//! - Radix-tree based router with O(k) lookup
//! - WebSocket frame encoding/decoding
//! - Schema validation
//! - W3C Trace Context support

pub mod parser;
pub mod router;
pub mod websocket;
pub mod validate;
pub mod tracing;

#[cfg(feature = "wasm")]
mod wasm;

#[cfg(feature = "wasm")]
pub use wasm::*;

// Re-exports
pub use parser::{HeaderOffsets, Method, ParsedRequest, MAX_HEADERS};
pub use router::{Match, Router};
pub use websocket::{Frame, Opcode, ParseResult as WsParseResult};
pub use validate::{SchemaType, StringFormat, ValidationError, ValidationResult};
pub use tracing::{SpanContext, parse_traceparent, format_traceparent};
