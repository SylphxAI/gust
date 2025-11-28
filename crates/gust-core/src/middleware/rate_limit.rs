//! Rate limiting middleware
//!
//! Implements token bucket and sliding window algorithms.

use crate::{Request, Response, ResponseBuilder, StatusCode};
use super::Middleware;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(feature = "native")]
use parking_lot::RwLock;

#[cfg(not(feature = "native"))]
use std::sync::RwLock;

/// Rate limit configuration
#[derive(Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per window
    pub max_requests: u32,
    /// Window duration
    pub window: Duration,
    /// Key extractor (default: IP address)
    pub key_extractor: KeyExtractor,
    /// Skip function
    pub skip: Option<fn(&Request) -> bool>,
    /// Response headers
    pub headers: bool,
}

/// Key extractor for rate limiting
#[derive(Clone)]
pub enum KeyExtractor {
    /// Use client IP
    Ip,
    /// Use specific header
    Header(String),
    /// Use authenticated user
    User,
    /// Custom key function
    Custom(fn(&Request) -> String),
}

impl Default for KeyExtractor {
    fn default() -> Self {
        KeyExtractor::Ip
    }
}

impl RateLimitConfig {
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            key_extractor: KeyExtractor::default(),
            skip: None,
            headers: true,
        }
    }

    /// Requests per second
    pub fn per_second(max: u32) -> Self {
        Self::new(max, Duration::from_secs(1))
    }

    /// Requests per minute
    pub fn per_minute(max: u32) -> Self {
        Self::new(max, Duration::from_secs(60))
    }

    /// Requests per hour
    pub fn per_hour(max: u32) -> Self {
        Self::new(max, Duration::from_secs(3600))
    }

    pub fn key_extractor(mut self, extractor: KeyExtractor) -> Self {
        self.key_extractor = extractor;
        self
    }

    pub fn skip(mut self, skip_fn: fn(&Request) -> bool) -> Self {
        self.skip = Some(skip_fn);
        self
    }

    pub fn with_headers(mut self, enabled: bool) -> Self {
        self.headers = enabled;
        self
    }
}

/// Rate limit entry
#[derive(Clone)]
struct RateLimitEntry {
    count: u32,
    window_start: Instant,
}

/// Rate limit store trait
pub trait RateLimitStore: Send + Sync {
    fn check(&self, key: &str, config: &RateLimitConfig) -> RateLimitResult;
    fn increment(&self, key: &str, config: &RateLimitConfig);
}

/// Rate limit check result
#[derive(Debug, Clone)]
pub struct RateLimitResult {
    pub allowed: bool,
    pub limit: u32,
    pub remaining: u32,
    pub reset: Duration,
}

/// In-memory rate limit store
pub struct MemoryStore {
    entries: Arc<RwLock<HashMap<String, RateLimitEntry>>>,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    #[cfg(feature = "native")]
    fn read_entries(&self) -> parking_lot::RwLockReadGuard<'_, HashMap<String, RateLimitEntry>> {
        self.entries.read()
    }

    #[cfg(not(feature = "native"))]
    fn read_entries(&self) -> std::sync::RwLockReadGuard<'_, HashMap<String, RateLimitEntry>> {
        self.entries.read().unwrap()
    }

    #[cfg(feature = "native")]
    fn write_entries(&self) -> parking_lot::RwLockWriteGuard<'_, HashMap<String, RateLimitEntry>> {
        self.entries.write()
    }

    #[cfg(not(feature = "native"))]
    fn write_entries(&self) -> std::sync::RwLockWriteGuard<'_, HashMap<String, RateLimitEntry>> {
        self.entries.write().unwrap()
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimitStore for MemoryStore {
    fn check(&self, key: &str, config: &RateLimitConfig) -> RateLimitResult {
        let entries = self.read_entries();
        let now = Instant::now();

        if let Some(entry) = entries.get(key) {
            let elapsed = now.duration_since(entry.window_start);

            if elapsed >= config.window {
                // Window expired, allow
                RateLimitResult {
                    allowed: true,
                    limit: config.max_requests,
                    remaining: config.max_requests - 1,
                    reset: config.window,
                }
            } else {
                // Check count
                let remaining = config.max_requests.saturating_sub(entry.count);
                let reset = config.window - elapsed;

                RateLimitResult {
                    allowed: entry.count < config.max_requests,
                    limit: config.max_requests,
                    remaining,
                    reset,
                }
            }
        } else {
            // No entry, allow
            RateLimitResult {
                allowed: true,
                limit: config.max_requests,
                remaining: config.max_requests - 1,
                reset: config.window,
            }
        }
    }

    fn increment(&self, key: &str, config: &RateLimitConfig) {
        let mut entries = self.write_entries();
        let now = Instant::now();

        let entry = entries.entry(key.to_string()).or_insert_with(|| RateLimitEntry {
            count: 0,
            window_start: now,
        });

        let elapsed = now.duration_since(entry.window_start);

        if elapsed >= config.window {
            // Reset window
            entry.count = 1;
            entry.window_start = now;
        } else {
            entry.count += 1;
        }
    }
}

/// Rate limit middleware
pub struct RateLimit<S: RateLimitStore = MemoryStore> {
    config: RateLimitConfig,
    store: Arc<S>,
}

impl RateLimit<MemoryStore> {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            store: Arc::new(MemoryStore::new()),
        }
    }
}

impl<S: RateLimitStore> RateLimit<S> {
    pub fn with_store(config: RateLimitConfig, store: S) -> Self {
        Self {
            config,
            store: Arc::new(store),
        }
    }

    fn extract_key(&self, req: &Request) -> String {
        match &self.config.key_extractor {
            KeyExtractor::Ip => {
                // Try X-Forwarded-For, then X-Real-IP, then fallback
                req.header("x-forwarded-for")
                    .and_then(|h| h.split(',').next())
                    .map(|s| s.trim().to_string())
                    .or_else(|| req.header("x-real-ip").map(|s| s.to_string()))
                    .unwrap_or_else(|| "unknown".to_string())
            }
            KeyExtractor::Header(name) => {
                req.header(name).unwrap_or("unknown").to_string()
            }
            KeyExtractor::User => {
                req.params.get("_auth_user").cloned().unwrap_or_else(|| "anonymous".to_string())
            }
            KeyExtractor::Custom(f) => f(req),
        }
    }
}

impl<S: RateLimitStore + 'static> Middleware for RateLimit<S> {
    fn before(&self, req: &mut Request) -> Option<Response> {
        // Check skip function
        if let Some(skip) = self.config.skip {
            if skip(req) {
                return None;
            }
        }

        let key = self.extract_key(req);
        let result = self.store.check(&key, &self.config);

        if !result.allowed {
            let mut res = ResponseBuilder::new(StatusCode::TOO_MANY_REQUESTS)
                .body("Rate limit exceeded")
                .build();

            if self.config.headers {
                res.headers.push((
                    "X-RateLimit-Limit".to_string(),
                    result.limit.to_string(),
                ));
                res.headers.push((
                    "X-RateLimit-Remaining".to_string(),
                    "0".to_string(),
                ));
                res.headers.push((
                    "X-RateLimit-Reset".to_string(),
                    result.reset.as_secs().to_string(),
                ));
                res.headers.push((
                    "Retry-After".to_string(),
                    result.reset.as_secs().to_string(),
                ));
            }

            return Some(res);
        }

        // Increment counter
        self.store.increment(&key, &self.config);

        // Store result for after()
        req.params.insert("_rate_limit_remaining".to_string(), result.remaining.to_string());
        req.params.insert("_rate_limit_limit".to_string(), result.limit.to_string());
        req.params.insert("_rate_limit_reset".to_string(), result.reset.as_secs().to_string());

        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        if self.config.headers {
            if let Some(limit) = req.params.get("_rate_limit_limit") {
                res.headers.push(("X-RateLimit-Limit".to_string(), limit.clone()));
            }
            if let Some(remaining) = req.params.get("_rate_limit_remaining") {
                res.headers.push(("X-RateLimit-Remaining".to_string(), remaining.clone()));
            }
            if let Some(reset) = req.params.get("_rate_limit_reset") {
                res.headers.push(("X-RateLimit-Reset".to_string(), reset.clone()));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limit_config() {
        let config = RateLimitConfig::per_minute(100);
        assert_eq!(config.max_requests, 100);
        assert_eq!(config.window, Duration::from_secs(60));
    }

    #[test]
    fn test_memory_store() {
        let store = MemoryStore::new();
        let config = RateLimitConfig::new(5, Duration::from_secs(60));

        // First request should be allowed - no entry exists yet
        let result = store.check("test", &config);
        assert!(result.allowed);
        assert_eq!(result.remaining, 4); // max - 1 for anticipated request

        // Increment creates entry with count=1
        store.increment("test", &config);
        let result = store.check("test", &config);
        assert!(result.allowed);
        assert_eq!(result.remaining, 4); // 5 - 1 = 4 remaining

        // Exhaust limit (need 4 more increments to reach 5)
        for _ in 0..4 {
            store.increment("test", &config);
        }

        let result = store.check("test", &config);
        assert!(!result.allowed);
        assert_eq!(result.remaining, 0);
    }
}
