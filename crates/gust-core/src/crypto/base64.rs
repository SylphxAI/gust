//! Base64 encoding for WebSocket accept key
//!
//! Minimal implementation without external dependencies.

const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Encode bytes to Base64 string
pub fn base64_encode(input: &[u8]) -> String {
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
        } else {
            output.push('=');
        }

        if chunk.len() > 2 {
            output.push(ALPHABET[triple as usize & 0x3F] as char);
        } else {
            output.push('=');
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_empty() {
        assert_eq!(base64_encode(b""), "");
    }

    #[test]
    fn test_base64_f() {
        assert_eq!(base64_encode(b"f"), "Zg==");
    }

    #[test]
    fn test_base64_fo() {
        assert_eq!(base64_encode(b"fo"), "Zm8=");
    }

    #[test]
    fn test_base64_foo() {
        assert_eq!(base64_encode(b"foo"), "Zm9v");
    }

    #[test]
    fn test_base64_foob() {
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
    }

    #[test]
    fn test_base64_fooba() {
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
    }

    #[test]
    fn test_base64_foobar() {
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }
}
