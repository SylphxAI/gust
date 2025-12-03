//! Tracing utilities - SSOT for W3C Trace Context
//!
//! W3C Trace Context parsing/formatting used by both native and WASM.

mod w3c;

pub use w3c::{
    SpanContext, parse_traceparent, format_traceparent,
    parse_tracestate, format_tracestate,
};
