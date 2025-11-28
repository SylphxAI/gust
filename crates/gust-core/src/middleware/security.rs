//! Security headers middleware
//!
//! Adds common security headers to responses.

use crate::{Request, Response};
use super::Middleware;

/// Security configuration
#[derive(Clone)]
pub struct SecurityConfig {
    /// Content-Security-Policy
    pub csp: Option<String>,
    /// X-Frame-Options
    pub frame_options: FrameOptions,
    /// X-Content-Type-Options
    pub content_type_options: bool,
    /// X-XSS-Protection
    pub xss_protection: bool,
    /// Strict-Transport-Security
    pub hsts: Option<HstsConfig>,
    /// Referrer-Policy
    pub referrer_policy: Option<String>,
    /// Permissions-Policy
    pub permissions_policy: Option<String>,
    /// Cross-Origin-Opener-Policy
    pub coop: Option<String>,
    /// Cross-Origin-Embedder-Policy
    pub coep: Option<String>,
    /// Cross-Origin-Resource-Policy
    pub corp: Option<String>,
}

/// X-Frame-Options value
#[derive(Clone)]
pub enum FrameOptions {
    Deny,
    SameOrigin,
    AllowFrom(String),
    None,
}

impl FrameOptions {
    pub fn as_header_value(&self) -> Option<String> {
        match self {
            FrameOptions::Deny => Some("DENY".to_string()),
            FrameOptions::SameOrigin => Some("SAMEORIGIN".to_string()),
            FrameOptions::AllowFrom(uri) => Some(format!("ALLOW-FROM {}", uri)),
            FrameOptions::None => None,
        }
    }
}

/// HSTS configuration
#[derive(Clone)]
pub struct HstsConfig {
    pub max_age: u64,
    pub include_subdomains: bool,
    pub preload: bool,
}

impl Default for HstsConfig {
    fn default() -> Self {
        Self {
            max_age: 31536000, // 1 year
            include_subdomains: true,
            preload: false,
        }
    }
}

impl HstsConfig {
    pub fn as_header_value(&self) -> String {
        let mut parts = vec![format!("max-age={}", self.max_age)];
        if self.include_subdomains {
            parts.push("includeSubDomains".to_string());
        }
        if self.preload {
            parts.push("preload".to_string());
        }
        parts.join("; ")
    }
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            csp: None,
            frame_options: FrameOptions::Deny,
            content_type_options: true,
            xss_protection: true,
            hsts: None,
            referrer_policy: Some("strict-origin-when-cross-origin".to_string()),
            permissions_policy: None,
            coop: None,
            coep: None,
            corp: None,
        }
    }
}

impl SecurityConfig {
    pub fn new() -> Self {
        Self::default()
    }

    /// Strict security preset
    pub fn strict() -> Self {
        Self {
            csp: Some("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'".to_string()),
            frame_options: FrameOptions::Deny,
            content_type_options: true,
            xss_protection: true,
            hsts: Some(HstsConfig {
                max_age: 31536000,
                include_subdomains: true,
                preload: true,
            }),
            referrer_policy: Some("strict-origin-when-cross-origin".to_string()),
            permissions_policy: Some("geolocation=(), microphone=(), camera=()".to_string()),
            coop: Some("same-origin".to_string()),
            coep: Some("require-corp".to_string()),
            corp: Some("same-origin".to_string()),
        }
    }

    /// API security preset (no CSP, relaxed frame options)
    pub fn api() -> Self {
        Self {
            csp: None,
            frame_options: FrameOptions::None,
            content_type_options: true,
            xss_protection: false, // Not needed for APIs
            hsts: Some(HstsConfig::default()),
            referrer_policy: Some("no-referrer".to_string()),
            permissions_policy: None,
            coop: None,
            coep: None,
            corp: None,
        }
    }

    pub fn csp(mut self, policy: impl Into<String>) -> Self {
        self.csp = Some(policy.into());
        self
    }

    pub fn frame_options(mut self, options: FrameOptions) -> Self {
        self.frame_options = options;
        self
    }

    pub fn hsts(mut self, config: HstsConfig) -> Self {
        self.hsts = Some(config);
        self
    }

    pub fn no_hsts(mut self) -> Self {
        self.hsts = None;
        self
    }

    pub fn referrer_policy(mut self, policy: impl Into<String>) -> Self {
        self.referrer_policy = Some(policy.into());
        self
    }

    pub fn permissions_policy(mut self, policy: impl Into<String>) -> Self {
        self.permissions_policy = Some(policy.into());
        self
    }
}

/// Security middleware
pub struct Security {
    config: SecurityConfig,
}

impl Security {
    pub fn new(config: SecurityConfig) -> Self {
        Self { config }
    }

    pub fn default_headers() -> Self {
        Self::new(SecurityConfig::default())
    }

    pub fn strict() -> Self {
        Self::new(SecurityConfig::strict())
    }

    pub fn api() -> Self {
        Self::new(SecurityConfig::api())
    }
}

impl Default for Security {
    fn default() -> Self {
        Self::default_headers()
    }
}

impl Middleware for Security {
    fn before(&self, _req: &mut Request) -> Option<Response> {
        None
    }

    fn after(&self, _req: &Request, res: &mut Response) {
        // Content-Security-Policy
        if let Some(ref csp) = self.config.csp {
            res.headers.push(("Content-Security-Policy".to_string(), csp.clone()));
        }

        // X-Frame-Options
        if let Some(value) = self.config.frame_options.as_header_value() {
            res.headers.push(("X-Frame-Options".to_string(), value));
        }

        // X-Content-Type-Options
        if self.config.content_type_options {
            res.headers.push(("X-Content-Type-Options".to_string(), "nosniff".to_string()));
        }

        // X-XSS-Protection
        if self.config.xss_protection {
            res.headers.push(("X-XSS-Protection".to_string(), "1; mode=block".to_string()));
        }

        // Strict-Transport-Security
        if let Some(ref hsts) = self.config.hsts {
            res.headers.push(("Strict-Transport-Security".to_string(), hsts.as_header_value()));
        }

        // Referrer-Policy
        if let Some(ref policy) = self.config.referrer_policy {
            res.headers.push(("Referrer-Policy".to_string(), policy.clone()));
        }

        // Permissions-Policy
        if let Some(ref policy) = self.config.permissions_policy {
            res.headers.push(("Permissions-Policy".to_string(), policy.clone()));
        }

        // Cross-Origin-Opener-Policy
        if let Some(ref coop) = self.config.coop {
            res.headers.push(("Cross-Origin-Opener-Policy".to_string(), coop.clone()));
        }

        // Cross-Origin-Embedder-Policy
        if let Some(ref coep) = self.config.coep {
            res.headers.push(("Cross-Origin-Embedder-Policy".to_string(), coep.clone()));
        }

        // Cross-Origin-Resource-Policy
        if let Some(ref corp) = self.config.corp {
            res.headers.push(("Cross-Origin-Resource-Policy".to_string(), corp.clone()));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hsts_header() {
        let hsts = HstsConfig {
            max_age: 31536000,
            include_subdomains: true,
            preload: true,
        };

        let value = hsts.as_header_value();
        assert!(value.contains("max-age=31536000"));
        assert!(value.contains("includeSubDomains"));
        assert!(value.contains("preload"));
    }

    #[test]
    fn test_frame_options() {
        assert_eq!(FrameOptions::Deny.as_header_value(), Some("DENY".to_string()));
        assert_eq!(FrameOptions::SameOrigin.as_header_value(), Some("SAMEORIGIN".to_string()));
        assert_eq!(FrameOptions::None.as_header_value(), None);
    }
}
