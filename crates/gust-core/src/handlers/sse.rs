//! Server-Sent Events (SSE) handler
//!
//! Implements SSE streaming for real-time updates.

use crate::{Response, ResponseBuilder, StatusCode};
use bytes::Bytes;

/// SSE Event
#[derive(Debug, Clone, Default)]
pub struct SseEvent {
    /// Event ID
    pub id: Option<String>,
    /// Event type
    pub event: Option<String>,
    /// Event data (can be multiple lines)
    pub data: String,
    /// Retry interval in milliseconds
    pub retry: Option<u32>,
}

impl SseEvent {
    /// Create a new SSE event with data
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            data: data.into(),
            ..Default::default()
        }
    }

    /// Set event ID
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set event type
    pub fn event(mut self, event: impl Into<String>) -> Self {
        self.event = Some(event.into());
        self
    }

    /// Set retry interval
    pub fn retry(mut self, ms: u32) -> Self {
        self.retry = Some(ms);
        self
    }

    /// Serialize to SSE format
    pub fn to_string(&self) -> String {
        let mut output = String::new();

        if let Some(ref id) = self.id {
            output.push_str("id: ");
            output.push_str(id);
            output.push('\n');
        }

        if let Some(ref event) = self.event {
            output.push_str("event: ");
            output.push_str(event);
            output.push('\n');
        }

        if let Some(retry) = self.retry {
            output.push_str("retry: ");
            output.push_str(&retry.to_string());
            output.push('\n');
        }

        // Data can be multiple lines
        for line in self.data.lines() {
            output.push_str("data: ");
            output.push_str(line);
            output.push('\n');
        }

        output.push('\n'); // Empty line to end event
        output
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Bytes {
        Bytes::from(self.to_string())
    }
}

/// SSE Stream for sending multiple events
pub struct SseStream {
    events: Vec<SseEvent>,
    last_event_id: Option<String>,
}

impl SseStream {
    pub fn new() -> Self {
        Self {
            events: Vec::new(),
            last_event_id: None,
        }
    }

    /// Add an event
    pub fn push(&mut self, event: SseEvent) {
        if let Some(ref id) = event.id {
            self.last_event_id = Some(id.clone());
        }
        self.events.push(event);
    }

    /// Add a simple data event
    pub fn data(&mut self, data: impl Into<String>) {
        self.events.push(SseEvent::new(data));
    }

    /// Add a named event
    pub fn event(&mut self, name: impl Into<String>, data: impl Into<String>) {
        self.events.push(SseEvent::new(data).event(name));
    }

    /// Add a comment (for keep-alive)
    pub fn comment(&mut self, text: impl Into<String>) {
        let mut output = String::from(": ");
        output.push_str(&text.into());
        output.push('\n');
        // Store as raw data event (hacky but works)
        self.events.push(SseEvent {
            data: output,
            ..Default::default()
        });
    }

    /// Get last event ID
    pub fn last_event_id(&self) -> Option<&str> {
        self.last_event_id.as_deref()
    }

    /// Take all events
    pub fn take(&mut self) -> Vec<SseEvent> {
        std::mem::take(&mut self.events)
    }

    /// Serialize all events
    pub fn to_string(&self) -> String {
        self.events.iter().map(|e| e.to_string()).collect()
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Bytes {
        Bytes::from(self.to_string())
    }
}

impl Default for SseStream {
    fn default() -> Self {
        Self::new()
    }
}

/// SSE Handler for creating SSE responses
pub struct Sse;

impl Sse {
    /// Create SSE response headers
    pub fn headers() -> Vec<(&'static str, &'static str)> {
        vec![
            ("Content-Type", "text/event-stream"),
            ("Cache-Control", "no-cache"),
            ("Connection", "keep-alive"),
            ("X-Accel-Buffering", "no"), // Disable nginx buffering
        ]
    }

    /// Create initial SSE response
    pub fn response() -> Response {
        let mut builder = ResponseBuilder::new(StatusCode::OK);

        for (k, v) in Self::headers() {
            builder = builder.header(k, v);
        }

        builder.body("").build()
    }

    /// Format a single event
    pub fn format_event(data: &str) -> String {
        SseEvent::new(data).to_string()
    }

    /// Format a named event
    pub fn format_named_event(event: &str, data: &str) -> String {
        SseEvent::new(data).event(event).to_string()
    }

    /// Format a JSON string event
    pub fn format_json_str(json: &str) -> String {
        SseEvent::new(json).to_string()
    }

    /// Format keep-alive comment
    pub fn keep_alive() -> String {
        ": keep-alive\n\n".to_string()
    }

    /// Parse Last-Event-ID header
    pub fn parse_last_event_id(header: Option<&str>) -> Option<String> {
        header.map(|s| s.to_string())
    }
}

/// Create a simple text stream response
pub fn text_stream(events: impl IntoIterator<Item = String>) -> Response {
    let body: String = events
        .into_iter()
        .map(|data| SseEvent::new(data).to_string())
        .collect();

    let mut builder = ResponseBuilder::new(StatusCode::OK);
    for (k, v) in Sse::headers() {
        builder = builder.header(k, v);
    }
    builder.body(body).build()
}

/// Create an NDJSON stream response (newline-delimited JSON)
pub fn ndjson_stream(lines: impl IntoIterator<Item = String>) -> Response {
    let body: String = lines
        .into_iter()
        .map(|line| format!("{}\n", line))
        .collect();

    ResponseBuilder::new(StatusCode::OK)
        .header("Content-Type", "application/x-ndjson")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(body)
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sse_event_simple() {
        let event = SseEvent::new("Hello, World!");
        let output = event.to_string();
        assert_eq!(output, "data: Hello, World!\n\n");
    }

    #[test]
    fn test_sse_event_with_id() {
        let event = SseEvent::new("data").id("123").event("message");
        let output = event.to_string();
        assert!(output.contains("id: 123\n"));
        assert!(output.contains("event: message\n"));
        assert!(output.contains("data: data\n"));
    }

    #[test]
    fn test_sse_event_multiline() {
        let event = SseEvent::new("line1\nline2\nline3");
        let output = event.to_string();
        assert!(output.contains("data: line1\n"));
        assert!(output.contains("data: line2\n"));
        assert!(output.contains("data: line3\n"));
    }

    #[test]
    fn test_sse_stream() {
        let mut stream = SseStream::new();
        stream.data("event1");
        stream.event("update", "event2");

        let output = stream.to_string();
        assert!(output.contains("data: event1\n"));
        assert!(output.contains("event: update\n"));
        assert!(output.contains("data: event2\n"));
    }

    #[test]
    fn test_keep_alive() {
        let ka = Sse::keep_alive();
        assert_eq!(ka, ": keep-alive\n\n");
    }
}
