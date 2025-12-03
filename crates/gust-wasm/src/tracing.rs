//! Tracing utilities for WASM
//!
//! W3C Trace Context support and ID generation.
//! Uses gust_core::tracing for W3C parsing (SSOT).

// Re-export W3C types from gust-core (SSOT)
pub use gust_core::tracing::{
    SpanContext, parse_traceparent, format_traceparent,
    parse_tracestate, format_tracestate,
};

// ============================================================================
// ID Generation (using simple PRNG for WASM)
// ============================================================================

/// Simple xorshift64 PRNG state
static mut RNG_STATE: u64 = 0x853c49e6748fea9b;

/// Seed the RNG (call with timestamp or random value from JS)
pub fn seed_rng(seed: u64) {
    unsafe {
        RNG_STATE = if seed == 0 { 0x853c49e6748fea9b } else { seed };
    }
}

/// Get next random u64
fn next_u64() -> u64 {
    unsafe {
        let mut x = RNG_STATE;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        RNG_STATE = x;
        x
    }
}

/// Generate 16-byte trace ID (32 hex chars)
pub fn generate_trace_id() -> String {
    let high = next_u64();
    let low = next_u64();
    format!("{:016x}{:016x}", high, low)
}

/// Generate 8-byte span ID (16 hex chars)
pub fn generate_span_id() -> String {
    let id = next_u64();
    format!("{:016x}", id)
}

/// Generate a random 4-byte mask for WebSocket
pub fn generate_mask() -> [u8; 4] {
    let r = next_u64();
    [
        (r >> 24) as u8,
        (r >> 16) as u8,
        (r >> 8) as u8,
        r as u8,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_traceparent() {
        let header = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
        let ctx = parse_traceparent(header).unwrap();
        assert_eq!(ctx.trace_id, "0af7651916cd43dd8448eb211c80319c");
        assert_eq!(ctx.span_id, "b7ad6b7169203331");
        assert_eq!(ctx.trace_flags, 1);
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
    fn test_trace_id_format() {
        seed_rng(12345);
        let id = generate_trace_id();
        assert_eq!(id.len(), 32);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_span_id_format() {
        seed_rng(12345);
        let id = generate_span_id();
        assert_eq!(id.len(), 16);
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_parse_tracestate() {
        let state = parse_tracestate("vendor1=value1,vendor2=value2");
        assert_eq!(state.len(), 2);
        assert_eq!(state[0], ("vendor1".to_string(), "value1".to_string()));
    }
}
