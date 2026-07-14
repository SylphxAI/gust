//! Pure client IP extraction (parity: packages/app/src/rateLimit.ts getClientIp).

/// Parse client IP from proxy headers + fallback remote.
/// Order: first X-Forwarded-For hop → X-Real-IP → remote → "unknown".
#[must_use]
pub fn parse_client_ip(
    forwarded_for: Option<&str>,
    real_ip: Option<&str>,
    remote_addr: Option<&str>,
) -> String {
    if let Some(ff) = forwarded_for {
        if let Some(first) = ff.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    if let Some(ri) = real_ip {
        let trimmed = ri.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Some(ra) = remote_addr {
        let trimmed = ra.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "unknown".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefers_first_forwarded_hop() {
        assert_eq!(
            parse_client_ip(Some("1.2.3.4, 5.6.7.8"), Some("9.9.9.9"), Some("10.0.0.1")),
            "1.2.3.4"
        );
    }

    #[test]
    fn falls_back_real_ip() {
        assert_eq!(
            parse_client_ip(None, Some("9.9.9.9"), Some("10.0.0.1")),
            "9.9.9.9"
        );
    }

    #[test]
    fn unknown_when_empty() {
        assert_eq!(parse_client_ip(None, None, None), "unknown");
        assert_eq!(parse_client_ip(Some("  "), Some(""), Some("")), "unknown");
    }
}
