//! gust-wasm: High-performance HTTP parser and router for WASM
//!
//! Zero-copy HTTP parsing and O(k) routing compiled to WebAssembly.

pub mod parser;
pub mod router;

#[cfg(feature = "wasm")]
mod wasm;

#[cfg(feature = "wasm")]
pub use wasm::*;

pub use parser::{HeaderOffsets, Method, ParsedRequest, MAX_HEADERS};
pub use router::{Match, Router};
