//! Range Requests Middleware
//!
//! HTTP Range header support for video/audio seeking and resumable downloads.
//! Implements RFC 7233 (HTTP Range Requests).

/// A single byte range
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Range {
    /// Start byte (inclusive)
    pub start: u64,
    /// End byte (inclusive)
    pub end: u64,
}

impl Range {
    pub fn new(start: u64, end: u64) -> Self {
        Self { start, end }
    }

    /// Get content length for this range
    pub fn content_length(&self) -> u64 {
        self.end - self.start + 1
    }
}

/// Parsed range header
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedRange {
    /// Unit (usually "bytes")
    pub unit: String,
    /// Parsed ranges
    pub ranges: Vec<Range>,
}

impl ParsedRange {
    /// Check if this is a single range request
    pub fn is_single(&self) -> bool {
        self.ranges.len() == 1
    }

    /// Get the first range (most common case)
    pub fn first(&self) -> Option<&Range> {
        self.ranges.first()
    }
}

/// Parse Range header
///
/// Format: bytes=0-499, 500-999, -500 (last 500), 500- (from 500 to end)
pub fn parse_range(header: &str, file_size: u64) -> Option<ParsedRange> {
    // Parse "bytes=..." format
    let (unit, spec) = header.split_once('=')?;
    let unit = unit.trim();

    if unit != "bytes" {
        return None;
    }

    let mut ranges = Vec::new();

    for part in spec.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }

        let (start_str, end_str) = if let Some(idx) = trimmed.find('-') {
            (&trimmed[..idx], &trimmed[idx + 1..])
        } else {
            continue;
        };

        let start: u64;
        let end: u64;

        if start_str.is_empty() {
            // Suffix range: -500 means last 500 bytes
            let suffix: u64 = end_str.parse().ok()?;
            if suffix == 0 {
                continue;
            }
            start = file_size.saturating_sub(suffix);
            end = file_size - 1;
        } else if end_str.is_empty() {
            // Open-ended: 500- means from 500 to end
            start = start_str.parse().ok()?;
            end = file_size - 1;
        } else {
            // Full range: 0-499
            start = start_str.parse().ok()?;
            end = end_str.parse().ok()?;
        }

        // Validate range
        if start > end || start >= file_size {
            continue;
        }

        // Clamp end to file size
        let clamped_end = end.min(file_size - 1);

        ranges.push(Range::new(start, clamped_end));
    }

    if ranges.is_empty() {
        return None;
    }

    Some(ParsedRange {
        unit: unit.to_string(),
        ranges,
    })
}

/// Check if ranges are satisfiable
pub fn is_satisfiable(ranges: &[Range], file_size: u64) -> bool {
    ranges.iter().all(|r| r.start < file_size && r.end < file_size)
}

/// Create Content-Range header value
pub fn content_range(start: u64, end: u64, total: u64) -> String {
    format!("bytes {}-{}/{}", start, end, total)
}

/// Create Content-Range header for unsatisfiable range
pub fn content_range_unsatisfiable(total: u64) -> String {
    format!("bytes */{}", total)
}

/// Range request configuration
#[derive(Debug, Clone)]
pub struct RangeConfig {
    /// Maximum ranges to accept (default: 1)
    pub max_ranges: usize,
    /// Enable multipart responses for multiple ranges
    pub multipart: bool,
}

impl Default for RangeConfig {
    fn default() -> Self {
        Self {
            max_ranges: 1,
            multipart: false,
        }
    }
}

/// MIME type detection for common media files
pub fn get_mime_type(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        // Video
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "ogg" | "ogv" => "video/ogg",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "wmv" => "video/x-ms-wmv",
        "flv" => "video/x-flv",
        // Audio
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "oga" => "audio/ogg",
        "weba" => "audio/webm",
        "wma" => "audio/x-ms-wma",
        // Documents
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "gzip" => "application/gzip",
        "tar" => "application/x-tar",
        "rar" => "application/vnd.rar",
        "7z" => "application/x-7z-compressed",
        // Images
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        // Other
        _ => "application/octet-stream",
    }
}

/// Generate ETag from file metadata
pub fn generate_etag(mtime_ms: u64, size: u64) -> String {
    format!("\"{:x}-{:x}\"", mtime_ms, size)
}

/// Check If-None-Match header
pub fn check_if_none_match(if_none_match: &str, etag: &str) -> bool {
    if_none_match == etag || if_none_match == "*"
}

/// Check If-Modified-Since header
pub fn check_if_modified_since(if_modified_since: &str, mtime: u64) -> bool {
    // Parse HTTP date format and compare
    // This is a simplified implementation
    parse_http_date(if_modified_since)
        .map(|since| mtime <= since)
        .unwrap_or(false)
}

/// Parse HTTP date (simplified)
fn parse_http_date(date: &str) -> Option<u64> {
    // HTTP dates are in format: "Sun, 06 Nov 1994 08:49:37 GMT"
    // This is a very simplified parser - in production, use a proper date parser

    // For now, just return None to disable If-Modified-Since checking
    // A full implementation would parse RFC 7231 date formats
    let _ = date;
    None
}

/// Range response builder
#[derive(Debug)]
pub struct RangeResponse {
    /// HTTP status code (200 for full, 206 for partial)
    pub status: u16,
    /// Content-Type header
    pub content_type: String,
    /// Content-Length header
    pub content_length: u64,
    /// Content-Range header (for 206 responses)
    pub content_range: Option<String>,
    /// Accept-Ranges header
    pub accept_ranges: String,
    /// ETag header
    pub etag: String,
    /// Last-Modified header
    pub last_modified: String,
    /// Cache-Control header
    pub cache_control: String,
    /// Range to serve (start, end)
    pub range: Option<Range>,
}

impl RangeResponse {
    /// Build response for full file (no Range header)
    pub fn full(
        content_type: &str,
        size: u64,
        etag: &str,
        last_modified: &str,
        max_age: u32,
    ) -> Self {
        Self {
            status: 200,
            content_type: content_type.to_string(),
            content_length: size,
            content_range: None,
            accept_ranges: "bytes".to_string(),
            etag: etag.to_string(),
            last_modified: last_modified.to_string(),
            cache_control: format!("public, max-age={}", max_age),
            range: None,
        }
    }

    /// Build response for partial content (206)
    pub fn partial(
        content_type: &str,
        range: Range,
        total_size: u64,
        etag: &str,
        last_modified: &str,
        max_age: u32,
    ) -> Self {
        Self {
            status: 206,
            content_type: content_type.to_string(),
            content_length: range.content_length(),
            content_range: Some(content_range(range.start, range.end, total_size)),
            accept_ranges: "bytes".to_string(),
            etag: etag.to_string(),
            last_modified: last_modified.to_string(),
            cache_control: format!("public, max-age={}", max_age),
            range: Some(range),
        }
    }

    /// Build 304 Not Modified response
    pub fn not_modified(etag: &str, last_modified: &str) -> Self {
        Self {
            status: 304,
            content_type: String::new(),
            content_length: 0,
            content_range: None,
            accept_ranges: "bytes".to_string(),
            etag: etag.to_string(),
            last_modified: last_modified.to_string(),
            cache_control: String::new(),
            range: None,
        }
    }

    /// Build 416 Range Not Satisfiable response
    pub fn not_satisfiable(total_size: u64) -> Self {
        Self {
            status: 416,
            content_type: String::new(),
            content_length: 0,
            content_range: Some(content_range_unsatisfiable(total_size)),
            accept_ranges: "bytes".to_string(),
            etag: String::new(),
            last_modified: String::new(),
            cache_control: String::new(),
            range: None,
        }
    }

    /// Convert to headers map
    pub fn to_headers(&self) -> Vec<(String, String)> {
        let mut headers = Vec::new();

        if !self.content_type.is_empty() {
            headers.push(("content-type".to_string(), self.content_type.clone()));
        }

        if self.status != 304 {
            headers.push(("content-length".to_string(), self.content_length.to_string()));
        }

        if let Some(ref range) = self.content_range {
            headers.push(("content-range".to_string(), range.clone()));
        }

        headers.push(("accept-ranges".to_string(), self.accept_ranges.clone()));

        if !self.etag.is_empty() {
            headers.push(("etag".to_string(), self.etag.clone()));
        }

        if !self.last_modified.is_empty() {
            headers.push(("last-modified".to_string(), self.last_modified.clone()));
        }

        if !self.cache_control.is_empty() {
            headers.push(("cache-control".to_string(), self.cache_control.clone()));
        }

        headers
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_range_simple() {
        let parsed = parse_range("bytes=0-499", 1000).unwrap();
        assert_eq!(parsed.unit, "bytes");
        assert_eq!(parsed.ranges.len(), 1);
        assert_eq!(parsed.ranges[0].start, 0);
        assert_eq!(parsed.ranges[0].end, 499);
    }

    #[test]
    fn test_parse_range_suffix() {
        let parsed = parse_range("bytes=-500", 1000).unwrap();
        assert_eq!(parsed.ranges[0].start, 500);
        assert_eq!(parsed.ranges[0].end, 999);
    }

    #[test]
    fn test_parse_range_open_ended() {
        let parsed = parse_range("bytes=500-", 1000).unwrap();
        assert_eq!(parsed.ranges[0].start, 500);
        assert_eq!(parsed.ranges[0].end, 999);
    }

    #[test]
    fn test_parse_range_multiple() {
        let parsed = parse_range("bytes=0-99, 200-299", 1000).unwrap();
        assert_eq!(parsed.ranges.len(), 2);
        assert_eq!(parsed.ranges[0].start, 0);
        assert_eq!(parsed.ranges[0].end, 99);
        assert_eq!(parsed.ranges[1].start, 200);
        assert_eq!(parsed.ranges[1].end, 299);
    }

    #[test]
    fn test_parse_range_clamp() {
        // End exceeds file size, should be clamped
        let parsed = parse_range("bytes=0-2000", 1000).unwrap();
        assert_eq!(parsed.ranges[0].end, 999);
    }

    #[test]
    fn test_parse_range_invalid() {
        // Invalid unit
        assert!(parse_range("chunks=0-499", 1000).is_none());

        // Start > file size
        assert!(parse_range("bytes=2000-3000", 1000).is_none());

        // Empty
        assert!(parse_range("bytes=", 1000).is_none());
    }

    #[test]
    fn test_content_range() {
        assert_eq!(content_range(0, 499, 1000), "bytes 0-499/1000");
        assert_eq!(content_range_unsatisfiable(1000), "bytes */1000");
    }

    #[test]
    fn test_range_content_length() {
        let range = Range::new(0, 499);
        assert_eq!(range.content_length(), 500);

        let range = Range::new(100, 199);
        assert_eq!(range.content_length(), 100);
    }

    #[test]
    fn test_mime_types() {
        assert_eq!(get_mime_type("mp4"), "video/mp4");
        assert_eq!(get_mime_type("MP4"), "video/mp4");
        assert_eq!(get_mime_type("mp3"), "audio/mpeg");
        assert_eq!(get_mime_type("pdf"), "application/pdf");
        assert_eq!(get_mime_type("unknown"), "application/octet-stream");
    }

    #[test]
    fn test_etag_generation() {
        let etag = generate_etag(1234567890, 1000);
        assert!(etag.starts_with('"'));
        assert!(etag.ends_with('"'));
        assert!(etag.contains('-'));
    }

    #[test]
    fn test_range_response_full() {
        let resp = RangeResponse::full("video/mp4", 1000, "\"abc\"", "Mon, 01 Jan 2024 00:00:00 GMT", 86400);
        assert_eq!(resp.status, 200);
        assert_eq!(resp.content_length, 1000);
        assert!(resp.content_range.is_none());
    }

    #[test]
    fn test_range_response_partial() {
        let range = Range::new(0, 499);
        let resp = RangeResponse::partial("video/mp4", range, 1000, "\"abc\"", "Mon, 01 Jan 2024 00:00:00 GMT", 86400);
        assert_eq!(resp.status, 206);
        assert_eq!(resp.content_length, 500);
        assert_eq!(resp.content_range, Some("bytes 0-499/1000".to_string()));
    }
}
