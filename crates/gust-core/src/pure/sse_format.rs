//! Pure SSE wire-format helpers — mirrors `packages/server/src/sse.ts`
//! (`formatSSEEvent`, `sseEvent`, `formatSSE`, `sseHeaders`).
//! FLEET-BULK pure residual. NO authority_rust / ts_deleted / I/O.

/// Format one SSE event to the EventSource wire format.
/// `data` is already a string (caller JSON-stringifies objects).
#[must_use]
pub fn format_sse_event(
    data: &str,
    id: Option<&str>,
    event: Option<&str>,
    retry: Option<u64>,
) -> String {
    let mut result = String::new();
    if let Some(id) = id {
        result.push_str(&format!("id: {id}\n"));
    }
    if let Some(event) = event {
        result.push_str(&format!("event: {event}\n"));
    }
    if let Some(retry) = retry {
        result.push_str(&format!("retry: {retry}\n"));
    }
    for line in data.split('\n') {
        result.push_str("data: ");
        result.push_str(line);
        result.push('\n');
    }
    result.push('\n');
    result
}

/// Simple event helper (data + optional id).
#[must_use]
pub fn sse_event(data: &str, id: Option<&str>) -> String {
    format_sse_event(data, id, None, None)
}

/// Legacy formatSSE alias (same wire shape as format_sse_event).
#[must_use]
pub fn format_sse(
    data: &str,
    id: Option<&str>,
    event: Option<&str>,
    retry: Option<u64>,
) -> String {
    format_sse_event(data, id, event, retry)
}

/// SSE response header block (HTTP/1.1 response prelude for upgrade path).
#[must_use]
pub fn sse_headers_block() -> String {
    [
        "HTTP/1.1 200 OK",
        "Content-Type: text/event-stream",
        "Cache-Control: no-cache",
        "Connection: keep-alive",
        "X-Accel-Buffering: no",
        "",
        "",
    ]
    .join("\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_data_only() {
        let s = format_sse_event("hello", None, None, None);
        assert_eq!(s, "data: hello\n\n");
    }

    #[test]
    fn full_fields_and_multiline() {
        let s = format_sse_event("a\nb", Some("42"), Some("update"), Some(3000));
        assert!(s.contains("id: 42\n"));
        assert!(s.contains("event: update\n"));
        assert!(s.contains("retry: 3000\n"));
        assert!(s.contains("data: a\n"));
        assert!(s.contains("data: b\n"));
        assert!(s.ends_with("\n\n"));
    }

    #[test]
    fn sse_event_helper() {
        let s = sse_event("{\"ok\":true}", Some("1"));
        assert!(s.starts_with("id: 1\n"));
        assert!(s.contains("data: {\"ok\":true}\n"));
    }

    #[test]
    fn headers_block() {
        let h = sse_headers_block();
        assert!(h.contains("text/event-stream"));
        assert!(h.contains("X-Accel-Buffering: no"));
        assert!(h.ends_with("\r\n\r\n") || h.ends_with("\r\n"));
    }
}
