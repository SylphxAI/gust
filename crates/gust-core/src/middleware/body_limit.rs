//! Body size limit middleware
//!
//! Limits request body size to prevent DoS attacks.

use crate::{Request, Response, ResponseBuilder, StatusCode};
use super::Middleware;

/// Body limit configuration
#[derive(Clone)]
pub struct BodyLimitConfig {
    /// Maximum body size in bytes
    pub max_size: usize,
    /// Custom error message
    pub message: String,
}

impl BodyLimitConfig {
    pub fn new(max_size: usize) -> Self {
        Self {
            max_size,
            message: "Request body too large".to_string(),
        }
    }

    /// Set limit in bytes
    pub fn bytes(size: usize) -> Self {
        Self::new(size)
    }

    /// Set limit in kilobytes
    pub fn kb(size: usize) -> Self {
        Self::new(size * 1024)
    }

    /// Set limit in megabytes
    pub fn mb(size: usize) -> Self {
        Self::new(size * 1024 * 1024)
    }

    /// Set limit in gigabytes
    pub fn gb(size: usize) -> Self {
        Self::new(size * 1024 * 1024 * 1024)
    }

    /// Parse size from string (e.g., "10mb", "1gb", "500kb")
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim().to_lowercase();

        let (num_str, multiplier) = if s.ends_with("gb") {
            (&s[..s.len() - 2], 1024 * 1024 * 1024)
        } else if s.ends_with("mb") {
            (&s[..s.len() - 2], 1024 * 1024)
        } else if s.ends_with("kb") {
            (&s[..s.len() - 2], 1024)
        } else if s.ends_with('b') {
            (&s[..s.len() - 1], 1)
        } else {
            (s.as_str(), 1)
        };

        let num: usize = num_str.trim().parse().ok()?;
        Some(Self::new(num * multiplier))
    }

    pub fn message(mut self, msg: impl Into<String>) -> Self {
        self.message = msg.into();
        self
    }
}

/// Format size for display
pub fn format_size(bytes: usize) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1}GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{}B", bytes)
    }
}

/// Body limit middleware
pub struct BodyLimit {
    config: BodyLimitConfig,
}

impl BodyLimit {
    pub fn new(config: BodyLimitConfig) -> Self {
        Self { config }
    }

    /// JSON body limit (default 1MB)
    pub fn json() -> Self {
        Self::new(BodyLimitConfig::mb(1))
    }

    /// Form upload limit (default 10MB)
    pub fn upload() -> Self {
        Self::new(BodyLimitConfig::mb(10))
    }

    /// Large file upload limit (default 100MB)
    pub fn large_upload() -> Self {
        Self::new(BodyLimitConfig::mb(100))
    }
}

impl Middleware for BodyLimit {
    fn before(&self, req: &mut Request) -> Option<Response> {
        // Check Content-Length header
        if let Some(length_str) = req.header("content-length") {
            if let Ok(length) = length_str.parse::<usize>() {
                if length > self.config.max_size {
                    return Some(
                        ResponseBuilder::new(StatusCode::PAYLOAD_TOO_LARGE)
                            .header("Content-Type", "application/json")
                            .body(format!(
                                r#"{{"error":"{}","max_size":"{}","received":"{}"}}"#,
                                self.config.message,
                                format_size(self.config.max_size),
                                format_size(length)
                            ))
                            .build(),
                    );
                }
            }
        }

        // Also check actual body size
        if req.body.len() > self.config.max_size {
            return Some(
                ResponseBuilder::new(StatusCode::PAYLOAD_TOO_LARGE)
                    .header("Content-Type", "application/json")
                    .body(format!(
                        r#"{{"error":"{}","max_size":"{}"}}"#,
                        self.config.message,
                        format_size(self.config.max_size)
                    ))
                    .build(),
            );
        }

        None
    }

    fn after(&self, _req: &Request, _res: &mut Response) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_body_limit_config() {
        let config = BodyLimitConfig::mb(10);
        assert_eq!(config.max_size, 10 * 1024 * 1024);
    }

    #[test]
    fn test_parse_size() {
        assert_eq!(BodyLimitConfig::parse("10mb").unwrap().max_size, 10 * 1024 * 1024);
        assert_eq!(BodyLimitConfig::parse("500kb").unwrap().max_size, 500 * 1024);
        assert_eq!(BodyLimitConfig::parse("1gb").unwrap().max_size, 1024 * 1024 * 1024);
        assert_eq!(BodyLimitConfig::parse("100b").unwrap().max_size, 100);
        assert_eq!(BodyLimitConfig::parse("100").unwrap().max_size, 100);
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(500), "500B");
        assert_eq!(format_size(1024), "1.0KB");
        assert_eq!(format_size(1024 * 1024), "1.0MB");
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0GB");
    }
}
