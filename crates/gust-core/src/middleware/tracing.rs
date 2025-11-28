//! Request tracing middleware
//!
//! Adds request IDs and logging.

use crate::{Request, Response};
use super::Middleware;
use std::time::Instant;

/// Tracing configuration
#[derive(Clone)]
pub struct TracingConfig {
    /// Header name for request ID
    pub header_name: String,
    /// Generate request ID if not present
    pub generate_id: bool,
    /// Log requests
    pub log_requests: bool,
    /// Log responses
    pub log_responses: bool,
    /// ID generator
    pub id_generator: IdGenerator,
}

/// ID generator type
#[derive(Clone, Copy)]
pub enum IdGenerator {
    Uuid,
    NanoId,
    ShortId,
    Counter,
}

impl Default for TracingConfig {
    fn default() -> Self {
        Self {
            header_name: "X-Request-ID".to_string(),
            generate_id: true,
            log_requests: false,
            log_responses: false,
            id_generator: IdGenerator::NanoId,
        }
    }
}

impl TracingConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn header_name(mut self, name: impl Into<String>) -> Self {
        self.header_name = name.into();
        self
    }

    pub fn generate_id(mut self, generate: bool) -> Self {
        self.generate_id = generate;
        self
    }

    pub fn log_requests(mut self) -> Self {
        self.log_requests = true;
        self
    }

    pub fn log_responses(mut self) -> Self {
        self.log_responses = true;
        self
    }

    pub fn id_generator(mut self, generator: IdGenerator) -> Self {
        self.id_generator = generator;
        self
    }
}

/// Generate UUID v4
pub fn generate_uuid() -> String {
    let mut bytes = [0u8; 16];
    fill_random(&mut bytes);

    // Set version (4) and variant (RFC 4122)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        u16::from_be_bytes([bytes[4], bytes[5]]),
        u16::from_be_bytes([bytes[6], bytes[7]]),
        u16::from_be_bytes([bytes[8], bytes[9]]),
        u64::from_be_bytes([0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]])
    )
}

/// Generate NanoID (21 characters)
pub fn generate_nano_id() -> String {
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
    let mut bytes = [0u8; 21];
    fill_random(&mut bytes);

    bytes.iter().map(|&b| ALPHABET[(b as usize) % ALPHABET.len()] as char).collect()
}

/// Generate short ID (8 characters)
pub fn generate_short_id() -> String {
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let mut bytes = [0u8; 8];
    fill_random(&mut bytes);

    bytes.iter().map(|&b| ALPHABET[(b as usize) % ALPHABET.len()] as char).collect()
}

/// Simple counter-based ID
static COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn generate_counter_id() -> String {
    let count = COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{:016x}", count)
}

/// Fill buffer with pseudo-random bytes
fn fill_random(buf: &mut [u8]) {
    use std::time::{SystemTime, UNIX_EPOCH};

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();

    let mut seed = now.as_nanos() as u64;

    for byte in buf.iter_mut() {
        // Simple xorshift64
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        *byte = (seed & 0xff) as u8;
    }
}

/// Tracing middleware
pub struct Tracing {
    config: TracingConfig,
}

impl Tracing {
    pub fn new(config: TracingConfig) -> Self {
        Self { config }
    }
}

impl Default for Tracing {
    fn default() -> Self {
        Self::new(TracingConfig::default())
    }
}

impl Middleware for Tracing {
    fn before(&self, req: &mut Request) -> Option<Response> {
        // Get or generate request ID
        let request_id = req
            .header(&self.config.header_name)
            .map(|s| s.to_string())
            .or_else(|| {
                if self.config.generate_id {
                    Some(match self.config.id_generator {
                        IdGenerator::Uuid => generate_uuid(),
                        IdGenerator::NanoId => generate_nano_id(),
                        IdGenerator::ShortId => generate_short_id(),
                        IdGenerator::Counter => generate_counter_id(),
                    })
                } else {
                    None
                }
            });

        if let Some(id) = request_id {
            req.params.insert("_request_id".to_string(), id.clone());
            req.params.insert("_request_start".to_string(), format!("{:?}", Instant::now()));
        }

        // Log request
        if self.config.log_requests {
            let id = req.params.get("_request_id").map(|s| s.as_str()).unwrap_or("-");
            eprintln!("[{}] {} {} {}", id, req.method.as_str(), req.path, req.query.as_deref().unwrap_or(""));
        }

        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        // Add request ID to response
        if let Some(id) = req.params.get("_request_id") {
            res.headers.push((self.config.header_name.clone(), id.clone()));
        }

        // Log response
        if self.config.log_responses {
            let id = req.params.get("_request_id").map(|s| s.as_str()).unwrap_or("-");
            let duration = req.params.get("_request_start").and_then(|_| {
                // Would need proper duration tracking - placeholder for now
                None::<f64>
            }).unwrap_or(0.0);

            eprintln!("[{}] {} {} -> {} ({:.2}ms)", id, req.method.as_str(), req.path, res.status.0, duration);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uuid_format() {
        let uuid = generate_uuid();
        assert_eq!(uuid.len(), 36);
        assert_eq!(uuid.chars().filter(|&c| c == '-').count(), 4);
    }

    #[test]
    fn test_nano_id_format() {
        let id = generate_nano_id();
        assert_eq!(id.len(), 21);
    }

    #[test]
    fn test_short_id_format() {
        let id = generate_short_id();
        assert_eq!(id.len(), 8);
    }

    #[test]
    fn test_counter_id() {
        let id1 = generate_counter_id();
        let id2 = generate_counter_id();
        assert_ne!(id1, id2);
    }
}
