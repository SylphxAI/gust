//! Pure body-size helpers — mirrors `packages/app/src/bodyLimit.ts`
//! `parseSize` / `formatSize`. FLEET-PRODUCTS-WAVE5. NO authority_rust.

const DEFAULT_MAX_SIZE: u64 = 1024 * 1024;

/// Parse size string (`1kb`, `1mb`, `1gb`, or raw number) to bytes.
#[must_use]
pub fn parse_size_str(size: &str) -> u64 {
    let s = size.trim().to_ascii_lowercase();
    // match /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/
    let mut num_str = String::new();
    let mut unit = String::new();
    let mut seen_dot = false;
    let mut in_unit = false;
    for ch in s.chars() {
        if ch.is_ascii_whitespace() {
            continue;
        }
        if !in_unit && (ch.is_ascii_digit() || (ch == '.' && !seen_dot)) {
            if ch == '.' {
                seen_dot = true;
            }
            num_str.push(ch);
        } else {
            in_unit = true;
            unit.push(ch);
        }
    }
    if num_str.is_empty() {
        return DEFAULT_MAX_SIZE;
    }
    let num: f64 = num_str.parse().unwrap_or(0.0);
    let mult = match unit.as_str() {
        "" | "b" => 1.0,
        "kb" => 1024.0,
        "mb" => 1024.0 * 1024.0,
        "gb" => 1024.0 * 1024.0 * 1024.0,
        _ => return DEFAULT_MAX_SIZE,
    };
    (num * mult).floor() as u64
}

/// Parse size from either raw bytes or string.
#[must_use]
pub fn parse_size_bytes(bytes: u64) -> u64 {
    bytes
}

/// Format bytes to human readable (`B`/`KB`/`MB`/`GB`).
#[must_use]
pub fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes}B");
    }
    if bytes < 1024 * 1024 {
        let v = bytes as f64 / 1024.0;
        return format!("{v:.1}KB");
    }
    if bytes < 1024 * 1024 * 1024 {
        let v = bytes as f64 / (1024.0 * 1024.0);
        return format!("{v:.1}MB");
    }
    let v = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    format!("{v:.1}GB")
}

/// True when content-length exceeds max.
#[must_use]
pub fn exceeds_limit(size: u64, max_size: u64) -> bool {
    size > max_size
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_units() {
        assert_eq!(parse_size_str("100"), 100);
        assert_eq!(parse_size_str("1kb"), 1024);
        assert_eq!(parse_size_str("1mb"), 1024 * 1024);
        assert_eq!(parse_size_str("2gb"), 2 * 1024 * 1024 * 1024);
        assert_eq!(parse_size_str("1.5kb"), 1536);
    }

    #[test]
    fn format_sizes() {
        assert_eq!(format_size(500), "500B");
        assert_eq!(format_size(1536), "1.5KB");
        assert_eq!(format_size(1024 * 1024), "1.0MB");
    }

    #[test]
    fn limit_check() {
        assert!(!exceeds_limit(100, 100));
        assert!(exceeds_limit(101, 100));
    }
}
