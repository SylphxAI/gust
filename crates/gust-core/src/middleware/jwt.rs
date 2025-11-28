//! JWT (JSON Web Token) middleware
//!
//! Supports HS256, HS384, HS512 signing algorithms.

use crate::{Request, Response, ResponseBuilder, StatusCode};
use super::Middleware;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// JWT Algorithm
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Algorithm {
    HS256,
    HS384,
    HS512,
}

impl Algorithm {
    pub fn as_str(&self) -> &'static str {
        match self {
            Algorithm::HS256 => "HS256",
            Algorithm::HS384 => "HS384",
            Algorithm::HS512 => "HS512",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "HS256" => Some(Algorithm::HS256),
            "HS384" => Some(Algorithm::HS384),
            "HS512" => Some(Algorithm::HS512),
            _ => None,
        }
    }
}

/// JWT Header
#[derive(Debug, Clone)]
pub struct Header {
    pub alg: Algorithm,
    pub typ: String,
}

impl Default for Header {
    fn default() -> Self {
        Self {
            alg: Algorithm::HS256,
            typ: "JWT".to_string(),
        }
    }
}

/// JWT Claims
#[derive(Debug, Clone, Default)]
pub struct Claims {
    /// Issuer
    pub iss: Option<String>,
    /// Subject
    pub sub: Option<String>,
    /// Audience
    pub aud: Option<String>,
    /// Expiration time (Unix timestamp)
    pub exp: Option<u64>,
    /// Not before (Unix timestamp)
    pub nbf: Option<u64>,
    /// Issued at (Unix timestamp)
    pub iat: Option<u64>,
    /// JWT ID
    pub jti: Option<String>,
    /// Custom claims
    pub custom: HashMap<String, String>,
}

impl Claims {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn sub(mut self, sub: impl Into<String>) -> Self {
        self.sub = Some(sub.into());
        self
    }

    pub fn iss(mut self, iss: impl Into<String>) -> Self {
        self.iss = Some(iss.into());
        self
    }

    pub fn aud(mut self, aud: impl Into<String>) -> Self {
        self.aud = Some(aud.into());
        self
    }

    pub fn exp(mut self, exp: u64) -> Self {
        self.exp = Some(exp);
        self
    }

    pub fn exp_in(mut self, seconds: u64) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.exp = Some(now + seconds);
        self
    }

    pub fn nbf(mut self, nbf: u64) -> Self {
        self.nbf = Some(nbf);
        self
    }

    pub fn iat_now(mut self) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        self.iat = Some(now);
        self
    }

    pub fn claim(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.custom.insert(key.into(), value.into());
        self
    }

    pub fn is_expired(&self) -> bool {
        if let Some(exp) = self.exp {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            return now > exp;
        }
        false
    }

    pub fn is_not_yet_valid(&self) -> bool {
        if let Some(nbf) = self.nbf {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            return now < nbf;
        }
        false
    }
}

/// JWT configuration
#[derive(Clone)]
pub struct JwtConfig {
    pub secret: Vec<u8>,
    pub algorithm: Algorithm,
    pub validate_exp: bool,
    pub validate_nbf: bool,
    pub leeway: u64, // Seconds of leeway for exp/nbf
}

impl JwtConfig {
    pub fn new(secret: impl Into<Vec<u8>>) -> Self {
        Self {
            secret: secret.into(),
            algorithm: Algorithm::HS256,
            validate_exp: true,
            validate_nbf: true,
            leeway: 0,
        }
    }

    pub fn algorithm(mut self, alg: Algorithm) -> Self {
        self.algorithm = alg;
        self
    }

    pub fn leeway(mut self, seconds: u64) -> Self {
        self.leeway = seconds;
        self
    }
}

/// JWT encoder/decoder
pub struct Jwt {
    config: JwtConfig,
}

impl Jwt {
    pub fn new(config: JwtConfig) -> Self {
        Self { config }
    }

    /// Encode claims to JWT token
    pub fn encode(&self, claims: &Claims) -> String {
        let header = Header::default();

        // Encode header
        let header_json = format!(
            r#"{{"alg":"{}","typ":"{}"}}"#,
            header.alg.as_str(),
            header.typ
        );
        let header_b64 = base64url_encode(header_json.as_bytes());

        // Encode claims
        let claims_json = self.claims_to_json(claims);
        let claims_b64 = base64url_encode(claims_json.as_bytes());

        // Create signature
        let message = format!("{}.{}", header_b64, claims_b64);
        let signature = self.sign(&message);
        let signature_b64 = base64url_encode(&signature);

        format!("{}.{}.{}", header_b64, claims_b64, signature_b64)
    }

    /// Decode and verify JWT token
    pub fn decode(&self, token: &str) -> Result<Claims, JwtError> {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err(JwtError::InvalidFormat);
        }

        // Decode header
        let header_bytes = base64url_decode(parts[0]).ok_or(JwtError::InvalidFormat)?;
        let header_str = String::from_utf8(header_bytes).map_err(|_| JwtError::InvalidFormat)?;

        // Parse algorithm from header
        let alg = self.parse_algorithm(&header_str)?;
        if alg != self.config.algorithm {
            return Err(JwtError::AlgorithmMismatch);
        }

        // Verify signature
        let message = format!("{}.{}", parts[0], parts[1]);
        let signature = base64url_decode(parts[2]).ok_or(JwtError::InvalidSignature)?;
        let expected = self.sign(&message);

        if !constant_time_eq(&signature, &expected) {
            return Err(JwtError::InvalidSignature);
        }

        // Decode claims
        let claims_bytes = base64url_decode(parts[1]).ok_or(JwtError::InvalidFormat)?;
        let claims_str = String::from_utf8(claims_bytes).map_err(|_| JwtError::InvalidFormat)?;
        let claims = self.parse_claims(&claims_str)?;

        // Validate exp/nbf
        if self.config.validate_exp && claims.is_expired() {
            return Err(JwtError::Expired);
        }
        if self.config.validate_nbf && claims.is_not_yet_valid() {
            return Err(JwtError::NotYetValid);
        }

        Ok(claims)
    }

    fn sign(&self, message: &str) -> Vec<u8> {
        hmac_sha256(message.as_bytes(), &self.config.secret)
    }

    fn claims_to_json(&self, claims: &Claims) -> String {
        let mut parts = Vec::new();

        if let Some(ref iss) = claims.iss {
            parts.push(format!(r#""iss":"{}""#, iss));
        }
        if let Some(ref sub) = claims.sub {
            parts.push(format!(r#""sub":"{}""#, sub));
        }
        if let Some(ref aud) = claims.aud {
            parts.push(format!(r#""aud":"{}""#, aud));
        }
        if let Some(exp) = claims.exp {
            parts.push(format!(r#""exp":{}"#, exp));
        }
        if let Some(nbf) = claims.nbf {
            parts.push(format!(r#""nbf":{}"#, nbf));
        }
        if let Some(iat) = claims.iat {
            parts.push(format!(r#""iat":{}"#, iat));
        }
        if let Some(ref jti) = claims.jti {
            parts.push(format!(r#""jti":"{}""#, jti));
        }
        for (k, v) in &claims.custom {
            parts.push(format!(r#""{}":"{}""#, k, v));
        }

        format!("{{{}}}", parts.join(","))
    }

    fn parse_algorithm(&self, header: &str) -> Result<Algorithm, JwtError> {
        // Simple JSON parsing for "alg" field
        if let Some(start) = header.find(r#""alg":""#) {
            let start = start + 7;
            if let Some(end) = header[start..].find('"') {
                let alg = &header[start..start + end];
                return Algorithm::from_str(alg).ok_or(JwtError::UnsupportedAlgorithm);
            }
        }
        Err(JwtError::InvalidFormat)
    }

    fn parse_claims(&self, json: &str) -> Result<Claims, JwtError> {
        let mut claims = Claims::new();

        // Simple JSON parsing
        claims.iss = extract_string_field(json, "iss");
        claims.sub = extract_string_field(json, "sub");
        claims.aud = extract_string_field(json, "aud");
        claims.jti = extract_string_field(json, "jti");
        claims.exp = extract_number_field(json, "exp");
        claims.nbf = extract_number_field(json, "nbf");
        claims.iat = extract_number_field(json, "iat");

        Ok(claims)
    }
}

/// JWT middleware for request authentication
pub struct JwtMiddleware {
    jwt: Jwt,
}

impl JwtMiddleware {
    pub fn new(config: JwtConfig) -> Self {
        Self {
            jwt: Jwt::new(config),
        }
    }
}

impl Middleware for JwtMiddleware {
    fn before(&self, req: &mut Request) -> Option<Response> {
        let auth_header = match req.header("authorization") {
            Some(h) => h,
            None => {
                return Some(
                    ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                        .header("WWW-Authenticate", "Bearer")
                        .body(r#"{"error":"Missing authorization header"}"#)
                        .build(),
                )
            }
        };

        let token = match auth_header.strip_prefix("Bearer ") {
            Some(t) => t,
            None => {
                return Some(
                    ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                        .body(r#"{"error":"Invalid authorization header"}"#)
                        .build(),
                )
            }
        };

        match self.jwt.decode(token) {
            Ok(claims) => {
                // Store claims in request
                if let Some(sub) = &claims.sub {
                    req.params.insert("_jwt_sub".to_string(), sub.clone());
                }
                None
            }
            Err(e) => Some(
                ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                    .body(format!(r#"{{"error":"{}"}}"#, e))
                    .build(),
            ),
        }
    }

    fn after(&self, _req: &Request, _res: &mut Response) {}
}

/// JWT Error
#[derive(Debug)]
pub enum JwtError {
    InvalidFormat,
    InvalidSignature,
    AlgorithmMismatch,
    UnsupportedAlgorithm,
    Expired,
    NotYetValid,
}

impl std::fmt::Display for JwtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JwtError::InvalidFormat => write!(f, "Invalid token format"),
            JwtError::InvalidSignature => write!(f, "Invalid signature"),
            JwtError::AlgorithmMismatch => write!(f, "Algorithm mismatch"),
            JwtError::UnsupportedAlgorithm => write!(f, "Unsupported algorithm"),
            JwtError::Expired => write!(f, "Token expired"),
            JwtError::NotYetValid => write!(f, "Token not yet valid"),
        }
    }
}

// Base64URL encoding (no padding, URL-safe)
fn base64url_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    let mut output = String::new();

    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;

        let triple = (b0 << 16) | (b1 << 8) | b2;

        output.push(ALPHABET[(triple >> 18) as usize & 0x3F] as char);
        output.push(ALPHABET[(triple >> 12) as usize & 0x3F] as char);

        if chunk.len() > 1 {
            output.push(ALPHABET[(triple >> 6) as usize & 0x3F] as char);
        }

        if chunk.len() > 2 {
            output.push(ALPHABET[triple as usize & 0x3F] as char);
        }
    }

    output
}

fn base64url_decode(input: &str) -> Option<Vec<u8>> {
    const DECODE: [i8; 256] = {
        let mut table = [-1i8; 256];
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let mut i = 0;
        while i < alphabet.len() {
            table[alphabet[i] as usize] = i as i8;
            i += 1;
        }
        // Also accept + and / for compatibility
        table[b'+' as usize] = 62;
        table[b'/' as usize] = 63;
        table
    };

    let mut output = Vec::new();
    let input = input.trim_end_matches('=');
    let bytes = input.as_bytes();

    let mut i = 0;
    while i < bytes.len() {
        let b0 = DECODE[bytes[i] as usize];
        let b1 = bytes.get(i + 1).map(|&c| DECODE[c as usize]).unwrap_or(0);
        let b2 = bytes.get(i + 2).map(|&c| DECODE[c as usize]).unwrap_or(0);
        let b3 = bytes.get(i + 3).map(|&c| DECODE[c as usize]).unwrap_or(0);

        if b0 < 0 || b1 < 0 {
            return None;
        }

        let triple = ((b0 as u32) << 18) | ((b1 as u32) << 12) | ((b2 as u32) << 6) | (b3 as u32);

        output.push((triple >> 16) as u8);
        if i + 2 < bytes.len() && b2 >= 0 {
            output.push((triple >> 8) as u8);
        }
        if i + 3 < bytes.len() && b3 >= 0 {
            output.push(triple as u8);
        }

        i += 4;
    }

    Some(output)
}

// HMAC-SHA256 implementation
fn hmac_sha256(message: &[u8], key: &[u8]) -> Vec<u8> {
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

// SHA-256 implementation
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

    // Padding
    let ml = (input.len() as u64) * 8;
    let mut padded = input.to_vec();
    padded.push(0x80);

    while (padded.len() % 64) != 56 {
        padded.push(0);
    }

    padded.extend_from_slice(&ml.to_be_bytes());

    // Process blocks
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

// Constant-time comparison
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

// Helper functions for JSON parsing
fn extract_string_field(json: &str, field: &str) -> Option<String> {
    let pattern = format!(r#""{}":""#, field);
    if let Some(start) = json.find(&pattern) {
        let start = start + pattern.len();
        if let Some(end) = json[start..].find('"') {
            return Some(json[start..start + end].to_string());
        }
    }
    None
}

fn extract_number_field(json: &str, field: &str) -> Option<u64> {
    let pattern = format!(r#""{}":"#, field);
    if let Some(start) = json.find(&pattern) {
        let start = start + pattern.len();
        let rest = &json[start..];
        let end = rest.find(|c: char| !c.is_ascii_digit()).unwrap_or(rest.len());
        return rest[..end].parse().ok();
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jwt_encode_decode() {
        let config = JwtConfig::new("secret");
        let jwt = Jwt::new(config);

        let claims = Claims::new()
            .sub("user123")
            .exp_in(3600)
            .iat_now();

        let token = jwt.encode(&claims);
        let decoded = jwt.decode(&token).unwrap();

        assert_eq!(decoded.sub, Some("user123".to_string()));
    }

    #[test]
    fn test_jwt_invalid_signature() {
        let jwt1 = Jwt::new(JwtConfig::new("secret1"));
        let jwt2 = Jwt::new(JwtConfig::new("secret2"));

        let claims = Claims::new().sub("user");
        let token = jwt1.encode(&claims);

        assert!(matches!(jwt2.decode(&token), Err(JwtError::InvalidSignature)));
    }

    #[test]
    fn test_sha256() {
        let hash = sha256(b"hello");
        // Known SHA-256 hash of "hello"
        let expected = [
            0x2c, 0xf2, 0x4d, 0xba, 0x5f, 0xb0, 0xa3, 0x0e,
            0x26, 0xe8, 0x3b, 0x2a, 0xc5, 0xb9, 0xe2, 0x9e,
            0x1b, 0x16, 0x1e, 0x5c, 0x1f, 0xa7, 0x42, 0x5e,
            0x73, 0x04, 0x33, 0x62, 0x93, 0x8b, 0x98, 0x24,
        ];
        assert_eq!(hash, expected);
    }
}
