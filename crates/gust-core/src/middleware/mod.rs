//! Middleware implementations
//!
//! All middleware is implemented in Rust for maximum performance.

pub mod cors;
pub mod compress;
pub mod cookie;
pub mod auth;
pub mod jwt;
pub mod csrf;
pub mod rate_limit;
pub mod security;
pub mod body_limit;
pub mod cache;
pub mod tracing;
pub mod circuit_breaker;
pub mod session;
pub mod validate;
pub mod range;
pub mod proxy;

// Re-exports for convenience
pub use cors::{Cors, CorsConfig};
pub use compress::{Compress, CompressionLevel, Encoding};
pub use cookie::{Cookie, CookieJar, SameSite};
pub use auth::{BasicAuth, BearerAuth, ApiKeyAuth, BasicCredentials, BearerToken};
pub use jwt::{Jwt, JwtConfig, Claims, Algorithm as JwtAlgorithm, JwtError};
pub use csrf::{Csrf, CsrfConfig};
pub use rate_limit::{RateLimit, RateLimitConfig, RateLimitStore, MemoryStore as RateLimitMemoryStore};
pub use security::{Security, SecurityConfig, FrameOptions, HstsConfig};
pub use body_limit::{BodyLimit, BodyLimitConfig, format_size};
pub use cache::{Cache, CacheConfig, CacheStore, MemoryCache, etag};
pub use tracing::{Tracing, TracingConfig, IdGenerator, generate_uuid, generate_nano_id, generate_short_id};
pub use circuit_breaker::{CircuitBreaker, CircuitBreakerConfig, CircuitState, CircuitStats, Bulkhead, BulkheadConfig};
pub use session::{Session, SessionConfig, SessionStore, MemoryStore as SessionMemoryStore, SessionData, SessionValue, SameSite as SessionSameSite};
pub use validate::{Schema, SchemaType, StringFormat, ValidationError, ValidationResult, Value, ValidateConfig, validate};
pub use range::{Range, ParsedRange, RangeConfig, RangeResponse, parse_range, content_range, get_mime_type, generate_etag};
pub use proxy::{ProxyInfo, ProxyConfig, Protocol, TrustProxy, TrustedAddress, extract_proxy_info, parse_forwarded_for};

use crate::{Request, Response};

/// Middleware trait - process request/response
pub trait Middleware: Send + Sync {
    /// Process request before handler
    fn before(&self, req: &mut Request) -> Option<Response>;

    /// Process response after handler
    fn after(&self, req: &Request, res: &mut Response);
}

/// Middleware chain
pub struct MiddlewareChain {
    middlewares: Vec<Box<dyn Middleware>>,
}

impl MiddlewareChain {
    pub fn new() -> Self {
        Self {
            middlewares: Vec::new(),
        }
    }

    pub fn add<M: Middleware + 'static>(&mut self, middleware: M) {
        self.middlewares.push(Box::new(middleware));
    }

    /// Run before middlewares, return early response if any
    pub fn run_before(&self, req: &mut Request) -> Option<Response> {
        for m in &self.middlewares {
            if let Some(res) = m.before(req) {
                return Some(res);
            }
        }
        None
    }

    /// Run after middlewares in reverse order
    pub fn run_after(&self, req: &Request, res: &mut Response) {
        for m in self.middlewares.iter().rev() {
            m.after(req, res);
        }
    }
}

impl Default for MiddlewareChain {
    fn default() -> Self {
        Self::new()
    }
}
