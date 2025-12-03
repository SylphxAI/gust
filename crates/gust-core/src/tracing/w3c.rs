//! W3C Trace Context (SSOT)
//!
//! Parse and format W3C traceparent and tracestate headers.
//! Used by both native and WASM tracing implementations.

/// Span context for distributed tracing
#[derive(Debug, Clone)]
pub struct SpanContext {
    pub trace_id: String,
    pub span_id: String,
    pub trace_flags: u8,
    pub trace_state: Option<String>,
}

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

    // Validate trace_id (32 hex chars)
    if trace_id.len() != 32 || !trace_id.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    // All zeros trace ID is invalid
    if trace_id.chars().all(|c| c == '0') {
        return None;
    }

    // Validate span_id (16 hex chars)
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
pub fn parse_tracestate(header: &str) -> Vec<(String, String)> {
    header
        .split(',')
        .filter_map(|pair| {
            let mut parts = pair.trim().splitn(2, '=');
            match (parts.next(), parts.next()) {
                (Some(key), Some(value)) => Some((key.to_string(), value.to_string())),
                _ => None,
            }
        })
        .collect()
}

/// Format W3C tracestate header
pub fn format_tracestate(state: &[(String, String)]) -> String {
    state
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join(",")
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
    fn test_parse_tracestate() {
        let state = parse_tracestate("vendor1=value1,vendor2=value2");
        assert_eq!(state.len(), 2);
        assert_eq!(state[0], ("vendor1".to_string(), "value1".to_string()));
    }

    #[test]
    fn test_format_tracestate() {
        let state = vec![
            ("vendor1".to_string(), "value1".to_string()),
            ("vendor2".to_string(), "value2".to_string()),
        ];
        assert_eq!(format_tracestate(&state), "vendor1=value1,vendor2=value2");
    }

    #[test]
    fn test_invalid_traceparent() {
        // Wrong version
        assert!(parse_traceparent("01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01").is_none());
        // All zeros trace_id
        assert!(parse_traceparent("00-00000000000000000000000000000000-b7ad6b7169203331-01").is_none());
        // Wrong format
        assert!(parse_traceparent("invalid").is_none());
    }
}
