//! Cryptographic utilities - SSOT for SHA-1, Base64, etc.
//!
//! These implementations are used by WebSocket handlers in both
//! native and WASM builds.

mod sha1;
mod base64;

pub use sha1::sha1;
pub use base64::base64_encode;

/// Generate WebSocket accept key from client key (RFC 6455)
pub fn websocket_accept_key(client_key: &str) -> String {
    const MAGIC: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    let concat = format!("{}{}", client_key, MAGIC);
    let hash = sha1(concat.as_bytes());
    base64_encode(&hash)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_websocket_accept_key() {
        // RFC 6455 test vector
        let key = "dGhlIHNhbXBsZSBub25jZQ==";
        let accept = websocket_accept_key(key);
        assert_eq!(accept, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }
}
