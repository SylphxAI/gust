//! Session Middleware
//!
//! Cookie-based session management with pluggable stores.
//! Supports memory store (development) and custom backends.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

// ============================================================================
// Cryptography (zero-dependency implementations)
// ============================================================================

/// Generate random bytes
fn generate_random_bytes(len: usize) -> Vec<u8> {
    // Simple PRNG based on system time for session IDs
    // In production, this should use a proper CSPRNG
    use std::time::SystemTime;

    let seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    let mut state = seed;
    let mut result = Vec::with_capacity(len);

    for _ in 0..len {
        // xorshift64
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        result.push((state & 0xFF) as u8);
    }

    result
}

/// HMAC-SHA256 implementation
fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    const BLOCK_SIZE: usize = 64;
    const HASH_SIZE: usize = 32;

    // Prepare key
    let mut key_block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let hash = sha256(key);
        key_block[..HASH_SIZE].copy_from_slice(&hash);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    // Inner padding
    let mut inner = Vec::with_capacity(BLOCK_SIZE + message.len());
    for i in 0..BLOCK_SIZE {
        inner.push(key_block[i] ^ 0x36);
    }
    inner.extend_from_slice(message);
    let inner_hash = sha256(&inner);

    // Outer padding
    let mut outer = Vec::with_capacity(BLOCK_SIZE + HASH_SIZE);
    for i in 0..BLOCK_SIZE {
        outer.push(key_block[i] ^ 0x5c);
    }
    outer.extend_from_slice(&inner_hash);

    sha256(&outer)
}

/// SHA-256 implementation
fn sha256(data: &[u8]) -> Vec<u8> {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
        0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
        0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
        0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
        0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
        0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    // Pre-processing: adding padding bits
    let ml = (data.len() as u64) * 8;
    let mut padded = data.to_vec();
    padded.push(0x80);

    while (padded.len() % 64) != 56 {
        padded.push(0);
    }

    padded.extend_from_slice(&ml.to_be_bytes());

    // Process each 512-bit chunk
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
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
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
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
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

    let mut result = Vec::with_capacity(32);
    for word in &h {
        result.extend_from_slice(&word.to_be_bytes());
    }
    result
}

/// Constant-time comparison
fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// Session data type alias
pub type SessionData = HashMap<String, SessionValue>;

/// Session value types
#[derive(Debug, Clone, PartialEq)]
pub enum SessionValue {
    String(String),
    Number(f64),
    Bool(bool),
    Array(Vec<SessionValue>),
    Object(HashMap<String, SessionValue>),
    Null,
}

impl SessionValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            SessionValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            SessionValue::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            SessionValue::Number(n) => Some(*n as i64),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            SessionValue::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn is_null(&self) -> bool {
        matches!(self, SessionValue::Null)
    }
}

impl From<String> for SessionValue {
    fn from(s: String) -> Self {
        SessionValue::String(s)
    }
}

impl From<&str> for SessionValue {
    fn from(s: &str) -> Self {
        SessionValue::String(s.to_string())
    }
}

impl From<f64> for SessionValue {
    fn from(n: f64) -> Self {
        SessionValue::Number(n)
    }
}

impl From<i64> for SessionValue {
    fn from(n: i64) -> Self {
        SessionValue::Number(n as f64)
    }
}

impl From<bool> for SessionValue {
    fn from(b: bool) -> Self {
        SessionValue::Bool(b)
    }
}

/// Session configuration
#[derive(Debug, Clone)]
pub struct SessionConfig {
    /// Cookie name (default: "sid")
    pub cookie_name: String,
    /// Secret for signing session ID
    pub secret: String,
    /// Max age in milliseconds (default: 24 hours)
    pub max_age: Duration,
    /// Cookie path
    pub path: String,
    /// Cookie domain
    pub domain: Option<String>,
    /// Secure flag
    pub secure: bool,
    /// HttpOnly flag
    pub http_only: bool,
    /// SameSite attribute
    pub same_site: SameSite,
    /// Rolling sessions (reset maxAge on each request)
    pub rolling: bool,
    /// Save uninitialized sessions
    pub save_uninitialized: bool,
    /// Resave unchanged sessions
    pub resave: bool,
}

/// SameSite cookie attribute
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SameSite {
    Strict,
    Lax,
    None,
}

impl SameSite {
    pub fn as_str(&self) -> &'static str {
        match self {
            SameSite::Strict => "Strict",
            SameSite::Lax => "Lax",
            SameSite::None => "None",
        }
    }
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            cookie_name: "sid".to_string(),
            secret: String::new(),
            max_age: Duration::from_secs(24 * 60 * 60),
            path: "/".to_string(),
            domain: None,
            secure: false,
            http_only: true,
            same_site: SameSite::Lax,
            rolling: false,
            save_uninitialized: false,
            resave: false,
        }
    }
}

impl SessionConfig {
    pub fn new(secret: impl Into<String>) -> Self {
        Self {
            secret: secret.into(),
            ..Default::default()
        }
    }

    pub fn cookie_name(mut self, name: impl Into<String>) -> Self {
        self.cookie_name = name.into();
        self
    }

    pub fn max_age(mut self, duration: Duration) -> Self {
        self.max_age = duration;
        self
    }

    pub fn secure(mut self, secure: bool) -> Self {
        self.secure = secure;
        self
    }

    pub fn same_site(mut self, same_site: SameSite) -> Self {
        self.same_site = same_site;
        self
    }

    pub fn rolling(mut self, rolling: bool) -> Self {
        self.rolling = rolling;
        self
    }
}

/// Session store trait
pub trait SessionStore: Send + Sync {
    /// Get session data by ID
    fn get(&self, id: &str) -> Option<SessionData>;
    /// Set session data
    fn set(&self, id: &str, data: SessionData, max_age: Duration);
    /// Delete session
    fn destroy(&self, id: &str);
    /// Touch session (update expiry)
    fn touch(&self, id: &str, max_age: Duration);
}

/// In-memory session store (not for production)
pub struct MemoryStore {
    sessions: RwLock<HashMap<String, StoredSession>>,
}

struct StoredSession {
    data: SessionData,
    expires: Instant,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Clear all sessions
    pub fn clear(&self) {
        self.sessions.write().unwrap().clear();
    }

    /// Get session count
    pub fn len(&self) -> usize {
        self.sessions.read().unwrap().len()
    }

    /// Check if empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Cleanup expired sessions
    pub fn cleanup(&self) {
        let now = Instant::now();
        self.sessions.write().unwrap().retain(|_, session| {
            session.expires > now
        });
    }
}

impl Default for MemoryStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionStore for MemoryStore {
    fn get(&self, id: &str) -> Option<SessionData> {
        let sessions = self.sessions.read().unwrap();
        sessions.get(id).and_then(|session| {
            if session.expires > Instant::now() {
                Some(session.data.clone())
            } else {
                None
            }
        })
    }

    fn set(&self, id: &str, data: SessionData, max_age: Duration) {
        let mut sessions = self.sessions.write().unwrap();
        sessions.insert(id.to_string(), StoredSession {
            data,
            expires: Instant::now() + max_age,
        });
    }

    fn destroy(&self, id: &str) {
        self.sessions.write().unwrap().remove(id);
    }

    fn touch(&self, id: &str, max_age: Duration) {
        let mut sessions = self.sessions.write().unwrap();
        if let Some(session) = sessions.get_mut(id) {
            session.expires = Instant::now() + max_age;
        }
    }
}

/// Generate a secure session ID
pub fn generate_session_id() -> String {
    let bytes = generate_random_bytes(24);
    base64_url_encode(&bytes)
}

/// Sign session ID with secret
pub fn sign_session_id(id: &str, secret: &str) -> String {
    let signature = hmac_sha256(secret.as_bytes(), id.as_bytes());
    let sig_encoded = base64_url_encode(&signature);
    format!("{}.{}", id, sig_encoded)
}

/// Verify and extract session ID
pub fn verify_session_id(signed: &str, secret: &str) -> Option<String> {
    let dot_index = signed.rfind('.')?;
    let id = &signed[..dot_index];
    let signature = &signed[dot_index + 1..];

    let expected = hmac_sha256(secret.as_bytes(), id.as_bytes());
    let expected_encoded = base64_url_encode(&expected);

    if constant_time_compare(signature.as_bytes(), expected_encoded.as_bytes()) {
        Some(id.to_string())
    } else {
        None
    }
}

/// Base64 URL-safe encoding
fn base64_url_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    let mut result = String::new();
    let mut buffer = 0u32;
    let mut bits = 0;

    for &byte in data {
        buffer = (buffer << 8) | byte as u32;
        bits += 8;

        while bits >= 6 {
            bits -= 6;
            let index = ((buffer >> bits) & 0x3F) as usize;
            result.push(ALPHABET[index] as char);
        }
    }

    if bits > 0 {
        let index = ((buffer << (6 - bits)) & 0x3F) as usize;
        result.push(ALPHABET[index] as char);
    }

    result
}

/// Session handle for request context
pub struct Session {
    pub id: String,
    pub data: SessionData,
    pub is_new: bool,
    modified: bool,
    destroyed: bool,
    touched: bool,
    regenerated: bool,
    new_id: Option<String>,
}

impl Session {
    pub fn new(id: String, data: SessionData, is_new: bool) -> Self {
        Self {
            id,
            data,
            is_new,
            modified: false,
            destroyed: false,
            touched: false,
            regenerated: false,
            new_id: None,
        }
    }

    /// Get a value from session
    pub fn get(&self, key: &str) -> Option<&SessionValue> {
        self.data.get(key)
    }

    /// Set a value in session
    pub fn set(&mut self, key: impl Into<String>, value: impl Into<SessionValue>) {
        self.data.insert(key.into(), value.into());
        self.modified = true;
    }

    /// Remove a value from session
    pub fn remove(&mut self, key: &str) -> Option<SessionValue> {
        self.modified = true;
        self.data.remove(key)
    }

    /// Check if modified
    pub fn is_modified(&self) -> bool {
        self.modified
    }

    /// Check if destroyed
    pub fn is_destroyed(&self) -> bool {
        self.destroyed
    }

    /// Mark session for destruction
    pub fn destroy(&mut self) {
        self.destroyed = true;
    }

    /// Touch session (update expiry)
    pub fn touch(&mut self) {
        self.touched = true;
    }

    /// Regenerate session ID (for security after login)
    pub fn regenerate(&mut self) {
        self.new_id = Some(generate_session_id());
        self.regenerated = true;
        self.modified = true;
    }

    /// Get the current session ID (may be new if regenerated)
    pub fn current_id(&self) -> &str {
        self.new_id.as_ref().unwrap_or(&self.id)
    }

    /// Should save session
    pub fn should_save(&self, config: &SessionConfig) -> bool {
        if self.destroyed {
            return false;
        }
        self.modified || self.regenerated || (self.is_new && config.save_uninitialized) || config.resave
    }

    /// Should touch session
    pub fn should_touch(&self, config: &SessionConfig) -> bool {
        !self.destroyed && (self.touched || config.rolling)
    }
}

/// Flash message support
impl Session {
    /// Set a flash message (one-time message)
    pub fn flash_set(&mut self, key: &str, message: impl Into<String>) {
        let flash_key = format!("_flash_{}", key);
        let message = message.into();

        if let Some(SessionValue::Array(arr)) = self.data.get_mut(&flash_key) {
            arr.push(SessionValue::String(message));
        } else {
            self.data.insert(flash_key, SessionValue::Array(vec![SessionValue::String(message)]));
        }
        self.modified = true;
    }

    /// Get and clear flash messages
    pub fn flash_get(&mut self, key: &str) -> Vec<String> {
        let flash_key = format!("_flash_{}", key);

        if let Some(SessionValue::Array(arr)) = self.data.remove(&flash_key) {
            self.modified = true;
            arr.into_iter()
                .filter_map(|v| {
                    if let SessionValue::String(s) = v {
                        Some(s)
                    } else {
                        None
                    }
                })
                .collect()
        } else {
            Vec::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_id_generation() {
        let id1 = generate_session_id();
        let id2 = generate_session_id();

        assert_ne!(id1, id2);
        assert!(!id1.is_empty());
    }

    #[test]
    fn test_session_signing() {
        let id = "test-session-id";
        let secret = "my-secret-key";

        let signed = sign_session_id(id, secret);
        assert!(signed.contains('.'));

        let verified = verify_session_id(&signed, secret);
        assert_eq!(verified, Some(id.to_string()));
    }

    #[test]
    fn test_session_signing_invalid() {
        let id = "test-session-id";
        let secret = "my-secret-key";

        let signed = sign_session_id(id, secret);

        // Wrong secret
        assert_eq!(verify_session_id(&signed, "wrong-secret"), None);

        // Tampered signature
        let tampered = format!("{}.invalid", id);
        assert_eq!(verify_session_id(&tampered, secret), None);
    }

    #[test]
    fn test_memory_store() {
        let store = MemoryStore::new();
        let id = "session-1";

        let mut data = SessionData::new();
        data.insert("user".to_string(), SessionValue::String("alice".to_string()));

        store.set(id, data.clone(), Duration::from_secs(3600));

        let retrieved = store.get(id);
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().get("user"), Some(&SessionValue::String("alice".to_string())));

        store.destroy(id);
        assert!(store.get(id).is_none());
    }

    #[test]
    fn test_session_operations() {
        let mut session = Session::new("test".to_string(), SessionData::new(), true);

        assert!(session.is_new);
        assert!(!session.is_modified());

        session.set("key", "value");
        assert!(session.is_modified());

        assert_eq!(
            session.get("key"),
            Some(&SessionValue::String("value".to_string()))
        );
    }

    #[test]
    fn test_flash_messages() {
        let mut session = Session::new("test".to_string(), SessionData::new(), true);

        session.flash_set("info", "Hello");
        session.flash_set("info", "World");

        let messages = session.flash_get("info");
        assert_eq!(messages, vec!["Hello", "World"]);

        // Should be empty after get
        let messages = session.flash_get("info");
        assert!(messages.is_empty());
    }
}
