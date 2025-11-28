//! HTTP caching middleware
//!
//! Implements cache headers and in-memory caching.

use crate::{Request, Response, Method};
use super::Middleware;
use smallvec::SmallVec;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[cfg(feature = "native")]
use parking_lot::RwLock;

#[cfg(not(feature = "native"))]
use std::sync::RwLock;

/// Cache configuration
#[derive(Clone)]
pub struct CacheConfig {
    /// TTL for cached responses
    pub ttl: Duration,
    /// Max entries in cache
    pub max_entries: usize,
    /// Methods to cache (default: GET, HEAD)
    pub methods: Vec<Method>,
    /// Key generator
    pub key_fn: fn(&Request) -> String,
    /// Condition for caching
    pub condition: Option<fn(&Request, &Response) -> bool>,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            ttl: Duration::from_secs(300), // 5 minutes
            max_entries: 1000,
            methods: vec![Method::Get, Method::Head],
            key_fn: default_cache_key,
            condition: None,
        }
    }
}

/// Default cache key: method + path + query
fn default_cache_key(req: &Request) -> String {
    format!(
        "{}:{}:{}",
        req.method.as_str(),
        req.path,
        req.query.as_deref().unwrap_or("")
    )
}

impl CacheConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ttl(mut self, ttl: Duration) -> Self {
        self.ttl = ttl;
        self
    }

    pub fn ttl_seconds(mut self, seconds: u64) -> Self {
        self.ttl = Duration::from_secs(seconds);
        self
    }

    pub fn max_entries(mut self, max: usize) -> Self {
        self.max_entries = max;
        self
    }

    pub fn key_fn(mut self, f: fn(&Request) -> String) -> Self {
        self.key_fn = f;
        self
    }

    pub fn condition(mut self, f: fn(&Request, &Response) -> bool) -> Self {
        self.condition = Some(f);
        self
    }
}

/// Cache entry
#[derive(Clone)]
pub struct CacheEntry {
    pub response: CachedResponse,
    pub created_at: Instant,
    pub ttl: Duration,
}

impl CacheEntry {
    pub fn is_expired(&self) -> bool {
        self.created_at.elapsed() > self.ttl
    }
}

/// Cached response data
#[derive(Clone)]
pub struct CachedResponse {
    pub status: u16,
    pub headers: SmallVec<[(String, String); 8]>,
    pub body: bytes::Bytes,
}

/// Cache store trait
pub trait CacheStore: Send + Sync {
    fn get(&self, key: &str) -> Option<CacheEntry>;
    fn set(&self, key: String, entry: CacheEntry);
    fn remove(&self, key: &str);
    fn clear(&self);
}

/// In-memory LRU cache store
pub struct MemoryCache {
    entries: Arc<RwLock<HashMap<String, CacheEntry>>>,
    max_entries: usize,
}

impl MemoryCache {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            max_entries,
        }
    }

    #[cfg(feature = "native")]
    fn read_entries(&self) -> parking_lot::RwLockReadGuard<HashMap<String, CacheEntry>> {
        self.entries.read()
    }

    #[cfg(not(feature = "native"))]
    fn read_entries(&self) -> std::sync::RwLockReadGuard<'_, HashMap<String, CacheEntry>> {
        self.entries.read().unwrap()
    }

    #[cfg(feature = "native")]
    fn write_entries(&self) -> parking_lot::RwLockWriteGuard<HashMap<String, CacheEntry>> {
        self.entries.write()
    }

    #[cfg(not(feature = "native"))]
    fn write_entries(&self) -> std::sync::RwLockWriteGuard<'_, HashMap<String, CacheEntry>> {
        self.entries.write().unwrap()
    }
}

impl CacheStore for MemoryCache {
    fn get(&self, key: &str) -> Option<CacheEntry> {
        let entries = self.read_entries();
        entries.get(key).cloned().filter(|e| !e.is_expired())
    }

    fn set(&self, key: String, entry: CacheEntry) {
        let mut entries = self.write_entries();

        // Simple eviction: remove expired entries first
        if entries.len() >= self.max_entries {
            entries.retain(|_, e| !e.is_expired());
        }

        // If still full, remove oldest
        if entries.len() >= self.max_entries {
            if let Some(oldest_key) = entries
                .iter()
                .min_by_key(|(_, e)| e.created_at)
                .map(|(k, _)| k.clone())
            {
                entries.remove(&oldest_key);
            }
        }

        entries.insert(key, entry);
    }

    fn remove(&self, key: &str) {
        let mut entries = self.write_entries();
        entries.remove(key);
    }

    fn clear(&self) {
        let mut entries = self.write_entries();
        entries.clear();
    }
}

/// Cache middleware
pub struct Cache<S: CacheStore = MemoryCache> {
    config: CacheConfig,
    store: Arc<S>,
}

impl Cache<MemoryCache> {
    pub fn new(config: CacheConfig) -> Self {
        let store = MemoryCache::new(config.max_entries);
        Self {
            config,
            store: Arc::new(store),
        }
    }
}

impl<S: CacheStore> Cache<S> {
    pub fn with_store(config: CacheConfig, store: S) -> Self {
        Self {
            config,
            store: Arc::new(store),
        }
    }

    fn should_cache_method(&self, method: &Method) -> bool {
        self.config.methods.contains(method)
    }
}

impl<S: CacheStore + 'static> Middleware for Cache<S> {
    fn before(&self, req: &mut Request) -> Option<Response> {
        // Only cache specified methods
        if !self.should_cache_method(&req.method) {
            return None;
        }

        // Check for cached response
        let key = (self.config.key_fn)(req);

        if let Some(entry) = self.store.get(&key) {
            // Return cached response
            let mut res = Response {
                status: crate::StatusCode(entry.response.status),
                headers: entry.response.headers.clone(),
                body: entry.response.body.clone(),
            };

            // Add cache headers
            res.headers.push(("X-Cache".to_string(), "HIT".to_string()));

            return Some(res);
        }

        // Store key for after()
        req.params.insert("_cache_key".to_string(), key);
        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        // Check if we should cache this response
        if !self.should_cache_method(&req.method) {
            return;
        }

        // Check condition
        if let Some(condition) = self.config.condition {
            if !condition(req, res) {
                return;
            }
        }

        // Only cache successful responses
        if res.status.0 < 200 || res.status.0 >= 300 {
            return;
        }

        // Get cache key
        let key = match req.params.get("_cache_key") {
            Some(k) => k.clone(),
            None => return,
        };

        // Store in cache
        let entry = CacheEntry {
            response: CachedResponse {
                status: res.status.0,
                headers: res.headers.clone(),
                body: res.body.clone(),
            },
            created_at: Instant::now(),
            ttl: self.config.ttl,
        };

        self.store.set(key, entry);

        // Add cache headers
        res.headers.push(("X-Cache".to_string(), "MISS".to_string()));
        res.headers.push((
            "Cache-Control".to_string(),
            format!("max-age={}", self.config.ttl.as_secs()),
        ));
    }
}

/// Generate ETag from response body
pub fn etag(body: &[u8]) -> String {
    // Simple hash-based ETag
    let hash = simple_hash(body);
    format!("\"{}\"", hex_encode_u64(hash))
}

fn simple_hash(data: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325; // FNV offset basis
    for &byte in data {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3); // FNV prime
    }
    hash
}

fn hex_encode_u64(n: u64) -> String {
    format!("{:016x}", n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_config() {
        let config = CacheConfig::new().ttl_seconds(600);
        assert_eq!(config.ttl, Duration::from_secs(600));
    }

    #[test]
    fn test_memory_cache() {
        let cache = MemoryCache::new(10);
        let entry = CacheEntry {
            response: CachedResponse {
                status: 200,
                headers: vec![],
                body: bytes::Bytes::from("test"),
            },
            created_at: Instant::now(),
            ttl: Duration::from_secs(60),
        };

        cache.set("key1".to_string(), entry.clone());
        assert!(cache.get("key1").is_some());
        assert!(cache.get("key2").is_none());
    }

    #[test]
    fn test_etag() {
        let tag = etag(b"hello world");
        assert!(tag.starts_with('"'));
        assert!(tag.ends_with('"'));
    }
}
