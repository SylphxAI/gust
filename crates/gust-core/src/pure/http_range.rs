//! Pure HTTP Range header parse + sticky session hash —
//! mirrors `packages/server/src/range.ts` and `cluster.ts#stickySession`.
//! FLEET-PRODUCTS-WAVE8 pure residual. NO authority_rust / ts_deleted.

/// Inclusive byte range.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ByteRange {
    pub start: u64,
    pub end: u64,
}

/// Parsed Range header.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedRange {
    pub unit: String,
    pub ranges: Vec<ByteRange>,
}

/// Parse `Range` header. Format: `bytes=0-499,500-999,-500,500-`.
#[must_use]
pub fn parse_range(range_header: &str, file_size: u64) -> Option<ParsedRange> {
    let header = range_header.trim();
    let eq = header.find('=')?;
    let unit = &header[..eq];
    let range_spec = &header[eq + 1..];
    if unit != "bytes" || range_spec.is_empty() {
        return None;
    }
    let mut ranges = Vec::new();
    for part in range_spec.split(',') {
        let trimmed = part.trim();
        let dash = match trimmed.find('-') {
            Some(i) => i,
            None => continue,
        };
        // only one dash expected for simple forms; if more, still split first
        let start_str = &trimmed[..dash];
        let end_str = &trimmed[dash + 1..];
        // reject extra dashes mid-form roughly: if end has '-', skip (multipart rare)
        let (start, end) = if start_str.is_empty() {
            // suffix: -500
            let suffix: i64 = end_str.parse().ok()?;
            if suffix <= 0 {
                continue;
            }
            let suffix = suffix as u64;
            let start = file_size.saturating_sub(suffix);
            let end = file_size.saturating_sub(1);
            (start, end)
        } else if end_str.is_empty() {
            let start: u64 = match start_str.parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            if start as i64 >= 0 {
                /* ok */
            }
            let end = file_size.saturating_sub(1);
            (start, end)
        } else {
            let start: u64 = match start_str.parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let end: u64 = match end_str.parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            (start, end)
        };
        if start > end || start >= file_size {
            continue;
        }
        let end = end.min(file_size.saturating_sub(1));
        ranges.push(ByteRange { start, end });
    }
    if ranges.is_empty() {
        return None;
    }
    Some(ParsedRange {
        unit: unit.to_string(),
        ranges,
    })
}

/// Check if all ranges are satisfiable for `file_size`.
#[must_use]
pub fn is_range_satisfiable(ranges: &[ByteRange], file_size: u64) -> bool {
    ranges
        .iter()
        .all(|r| r.start < file_size && r.end < file_size)
}

/// `Content-Range` header value: `bytes start-end/total`.
#[must_use]
pub fn content_range(start: u64, end: u64, total: u64) -> String {
    format!("bytes {start}-{end}/{total}")
}

/// Sticky session worker index from IP string (signed 32-bit string hash, abs % workers).
#[must_use]
pub fn sticky_session(ip: &str, worker_count: u32) -> u32 {
    if worker_count == 0 {
        return 0;
    }
    let mut hash: i32 = 0;
    for ch in ip.chars() {
        let code = ch as u32 as i32;
        hash = hash.wrapping_shl(5).wrapping_sub(hash).wrapping_add(code);
    }
    (hash.unsigned_abs()) % worker_count
}

/// Pure WebSocket upgrade check on header values.
#[must_use]
pub fn is_websocket_upgrade(upgrade: Option<&str>, connection: Option<&str>) -> bool {
    let up = upgrade.map(|s| s.to_ascii_lowercase()).unwrap_or_default();
    let conn = connection.map(|s| s.to_ascii_lowercase()).unwrap_or_default();
    up == "websocket" && conn.contains("upgrade")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_full_range() {
        let p = parse_range("bytes=0-499", 1000).unwrap();
        assert_eq!(p.unit, "bytes");
        assert_eq!(p.ranges[0], ByteRange { start: 0, end: 499 });
    }

    #[test]
    fn parse_open_and_suffix() {
        let open = parse_range("bytes=500-", 1000).unwrap();
        assert_eq!(open.ranges[0], ByteRange { start: 500, end: 999 });
        let suf = parse_range("bytes=-100", 1000).unwrap();
        assert_eq!(suf.ranges[0], ByteRange { start: 900, end: 999 });
    }

    #[test]
    fn reject_non_bytes() {
        assert!(parse_range("items=0-1", 10).is_none());
    }

    #[test]
    fn satisfiable_and_content_range() {
        let r = [ByteRange { start: 0, end: 9 }];
        assert!(is_range_satisfiable(&r, 10));
        assert!(!is_range_satisfiable(&r, 5));
        assert_eq!(content_range(0, 9, 100), "bytes 0-9/100");
    }

    #[test]
    fn sticky_stable() {
        let a = sticky_session("1.2.3.4", 4);
        let b = sticky_session("1.2.3.4", 4);
        assert_eq!(a, b);
        assert!(a < 4);
        assert_eq!(sticky_session("x", 0), 0);
    }

    #[test]
    fn ws_upgrade() {
        assert!(is_websocket_upgrade(Some("WebSocket"), Some("keep-alive, Upgrade")));
        assert!(!is_websocket_upgrade(Some("websocket"), Some("keep-alive")));
    }
}
