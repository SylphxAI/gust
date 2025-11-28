//! CSRF (Cross-Site Request Forgery) protection middleware
//!
//! Implements double-submit cookie pattern.

use crate::{Request, Response, ResponseBuilder, StatusCode, Method};
use super::Middleware;
use std::time::{SystemTime, UNIX_EPOCH};

/// CSRF configuration
#[derive(Clone)]
pub struct CsrfConfig {
    /// Cookie name for CSRF token
    pub cookie_name: String,
    /// Header name for CSRF token
    pub header_name: String,
    /// Form field name for CSRF token
    pub field_name: String,
    /// Token TTL in seconds
    pub ttl: u64,
    /// Safe methods that don't require CSRF
    pub safe_methods: Vec<Method>,
    /// Paths to exclude from CSRF
    pub exclude_paths: Vec<String>,
}

impl Default for CsrfConfig {
    fn default() -> Self {
        Self {
            cookie_name: "csrf_token".to_string(),
            header_name: "X-CSRF-Token".to_string(),
            field_name: "_csrf".to_string(),
            ttl: 3600, // 1 hour
            safe_methods: vec![Method::Get, Method::Head, Method::Options],
            exclude_paths: vec![],
        }
    }
}

impl CsrfConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cookie_name(mut self, name: impl Into<String>) -> Self {
        self.cookie_name = name.into();
        self
    }

    pub fn header_name(mut self, name: impl Into<String>) -> Self {
        self.header_name = name.into();
        self
    }

    pub fn ttl(mut self, seconds: u64) -> Self {
        self.ttl = seconds;
        self
    }

    pub fn exclude(mut self, path: impl Into<String>) -> Self {
        self.exclude_paths.push(path.into());
        self
    }
}

/// CSRF middleware
pub struct Csrf {
    config: CsrfConfig,
    secret: Vec<u8>,
}

impl Csrf {
    pub fn new(secret: impl Into<Vec<u8>>, config: CsrfConfig) -> Self {
        Self {
            config,
            secret: secret.into(),
        }
    }

    pub fn with_secret(secret: impl Into<Vec<u8>>) -> Self {
        Self::new(secret, CsrfConfig::default())
    }

    /// Generate a new CSRF token
    pub fn generate_token(&self) -> String {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Random bytes (simple PRNG for now)
        let random = pseudo_random();

        // Create token: timestamp.random.signature
        let payload = format!("{}.{}", timestamp, random);
        let signature = self.sign(&payload);

        format!("{}.{}", payload, hex_encode(&signature))
    }

    /// Verify a CSRF token
    pub fn verify_token(&self, token: &str) -> bool {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return false;
        }

        // Parse timestamp
        let timestamp: u64 = match parts[0].parse() {
            Ok(t) => t,
            Err(_) => return false,
        };

        // Check expiry
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        if now > timestamp + self.config.ttl {
            return false;
        }

        // Verify signature
        let payload = format!("{}.{}", parts[0], parts[1]);
        let expected_sig = self.sign(&payload);
        let provided_sig = match hex_decode(parts[2]) {
            Some(s) => s,
            None => return false,
        };

        constant_time_eq(&expected_sig, &provided_sig)
    }

    fn sign(&self, message: &str) -> Vec<u8> {
        hmac_sha256(message.as_bytes(), &self.secret)
    }

    fn is_safe_method(&self, method: &Method) -> bool {
        self.config.safe_methods.contains(method)
    }

    fn is_excluded_path(&self, path: &str) -> bool {
        self.config.exclude_paths.iter().any(|p| path.starts_with(p))
    }

    fn get_token_from_request(&self, req: &Request) -> Option<String> {
        // Try header first
        if let Some(token) = req.header(&self.config.header_name) {
            return Some(token.to_string());
        }

        // Try query parameter (for form submissions)
        if let Some(token) = req.query_params().get(&self.config.field_name) {
            return Some(token.clone());
        }

        None
    }

    fn get_cookie_token(&self, req: &Request) -> Option<String> {
        let cookie_header = req.header("cookie")?;
        let cookie_prefix = format!("{}=", self.config.cookie_name);

        for part in cookie_header.split(';') {
            let part = part.trim();
            if part.starts_with(&cookie_prefix) {
                return Some(part[cookie_prefix.len()..].to_string());
            }
        }

        None
    }
}

impl Middleware for Csrf {
    fn before(&self, req: &mut Request) -> Option<Response> {
        // Skip safe methods
        if self.is_safe_method(&req.method) {
            return None;
        }

        // Skip excluded paths
        if self.is_excluded_path(&req.path) {
            return None;
        }

        // Get tokens
        let request_token = match self.get_token_from_request(req) {
            Some(t) => t,
            None => {
                return Some(
                    ResponseBuilder::new(StatusCode::FORBIDDEN)
                        .body("CSRF token missing")
                        .build(),
                )
            }
        };

        let cookie_token = match self.get_cookie_token(req) {
            Some(t) => t,
            None => {
                return Some(
                    ResponseBuilder::new(StatusCode::FORBIDDEN)
                        .body("CSRF cookie missing")
                        .build(),
                )
            }
        };

        // Verify tokens match and are valid
        if request_token != cookie_token || !self.verify_token(&request_token) {
            return Some(
                ResponseBuilder::new(StatusCode::FORBIDDEN)
                    .body("CSRF token invalid")
                    .build(),
            );
        }

        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        // Set CSRF cookie for safe methods
        if self.is_safe_method(&req.method) {
            let token = self.generate_token();
            let cookie = format!(
                "{}={}; Path=/; SameSite=Strict; HttpOnly",
                self.config.cookie_name, token
            );
            res.headers.push(("Set-Cookie".to_string(), cookie));

            // Also expose token in header for JS access
            res.headers.push((self.config.header_name.clone(), token));
        }
    }
}

// Helper functions
fn pseudo_random() -> u64 {
    // Simple timestamp-based "random" - in production use proper RNG
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    now.as_nanos() as u64 ^ (now.as_secs() << 32)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        result.push(HEX[(b >> 4) as usize] as char);
        result.push(HEX[(b & 0xf) as usize] as char);
    }
    result
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }

    let mut result = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();

    for chunk in bytes.chunks(2) {
        let high = hex_char_to_val(chunk[0])?;
        let low = hex_char_to_val(chunk[1])?;
        result.push((high << 4) | low);
    }

    Some(result)
}

fn hex_char_to_val(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn hmac_sha256(message: &[u8], key: &[u8]) -> Vec<u8> {
    // Inline HMAC-SHA256 implementation
    const BLOCK_SIZE: usize = 64;
    const OUTPUT_SIZE: usize = 32;

    let mut key_block = [0u8; BLOCK_SIZE];

    if key.len() > BLOCK_SIZE {
        let hash = sha256(key);
        key_block[..OUTPUT_SIZE].copy_from_slice(&hash);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut i_key_pad = [0x36u8; BLOCK_SIZE];
    let mut o_key_pad = [0x5cu8; BLOCK_SIZE];

    for i in 0..BLOCK_SIZE {
        i_key_pad[i] ^= key_block[i];
        o_key_pad[i] ^= key_block[i];
    }

    let mut inner = Vec::with_capacity(BLOCK_SIZE + message.len());
    inner.extend_from_slice(&i_key_pad);
    inner.extend_from_slice(message);
    let inner_hash = sha256(&inner);

    let mut outer = Vec::with_capacity(BLOCK_SIZE + OUTPUT_SIZE);
    outer.extend_from_slice(&o_key_pad);
    outer.extend_from_slice(&inner_hash);
    sha256(&outer).to_vec()
}

fn sha256(input: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    let ml = (input.len() as u64) * 8;
    let mut padded = input.to_vec();
    padded.push(0x80);

    while (padded.len() % 64) != 56 {
        padded.push(0);
    }

    padded.extend_from_slice(&ml.to_be_bytes());

    for chunk in padded.chunks(64) {
        let mut w = [0u32; 64];

        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }

        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut result = [0u8; 32];
    for i in 0..8 {
        result[i * 4..i * 4 + 4].copy_from_slice(&h[i].to_be_bytes());
    }
    result
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csrf_token_generation() {
        let csrf = Csrf::with_secret("secret");
        let token = csrf.generate_token();

        assert!(csrf.verify_token(&token));
    }

    #[test]
    fn test_csrf_token_tampering() {
        let csrf = Csrf::with_secret("secret");
        let token = csrf.generate_token();

        // Tamper with token
        let mut tampered = token.clone();
        tampered.push('x');

        assert!(!csrf.verify_token(&tampered));
    }

    #[test]
    fn test_hex_roundtrip() {
        let original = vec![0x12, 0x34, 0xab, 0xcd];
        let encoded = hex_encode(&original);
        let decoded = hex_decode(&encoded).unwrap();
        assert_eq!(original, decoded);
    }
}
