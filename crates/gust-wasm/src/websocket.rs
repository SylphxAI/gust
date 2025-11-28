//! WebSocket frame encoding/decoding for WASM
//!
//! Minimal implementation for edge/browser environments.

/// WebSocket opcode
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Opcode {
    Continuation = 0x0,
    Text = 0x1,
    Binary = 0x2,
    Close = 0x8,
    Ping = 0x9,
    Pong = 0xA,
}

impl Opcode {
    pub fn from_u8(byte: u8) -> Option<Self> {
        match byte & 0x0F {
            0x0 => Some(Opcode::Continuation),
            0x1 => Some(Opcode::Text),
            0x2 => Some(Opcode::Binary),
            0x8 => Some(Opcode::Close),
            0x9 => Some(Opcode::Ping),
            0xA => Some(Opcode::Pong),
            _ => None,
        }
    }
}

/// Parsed WebSocket frame
#[derive(Debug, Clone)]
pub struct Frame {
    pub fin: bool,
    pub opcode: Opcode,
    pub payload: Vec<u8>,
    pub close_code: Option<u16>,
    pub close_reason: Option<String>,
}

/// Frame parse result
pub enum ParseResult {
    Complete(Frame, usize), // Frame and bytes consumed
    Incomplete,
    Error(&'static str),
}

/// Parse a WebSocket frame from raw bytes
pub fn parse_frame(data: &[u8]) -> ParseResult {
    if data.len() < 2 {
        return ParseResult::Incomplete;
    }

    let fin = (data[0] & 0x80) != 0;
    let opcode = match Opcode::from_u8(data[0]) {
        Some(op) => op,
        None => return ParseResult::Error("Invalid opcode"),
    };

    let masked = (data[1] & 0x80) != 0;
    let payload_len = (data[1] & 0x7F) as usize;

    let (payload_len, header_len) = if payload_len == 126 {
        if data.len() < 4 {
            return ParseResult::Incomplete;
        }
        let len = u16::from_be_bytes([data[2], data[3]]) as usize;
        (len, 4)
    } else if payload_len == 127 {
        if data.len() < 10 {
            return ParseResult::Incomplete;
        }
        let len = u64::from_be_bytes([
            data[2], data[3], data[4], data[5],
            data[6], data[7], data[8], data[9],
        ]) as usize;
        (len, 10)
    } else {
        (payload_len, 2)
    };

    let mask_len = if masked { 4 } else { 0 };
    let total_len = header_len + mask_len + payload_len;

    if data.len() < total_len {
        return ParseResult::Incomplete;
    }

    let mut payload = data[header_len + mask_len..total_len].to_vec();

    // Unmask if needed
    if masked {
        let mask = &data[header_len..header_len + 4];
        for (i, byte) in payload.iter_mut().enumerate() {
            *byte ^= mask[i % 4];
        }
    }

    // Parse close frame
    let (close_code, close_reason) = if opcode == Opcode::Close && payload.len() >= 2 {
        let code = u16::from_be_bytes([payload[0], payload[1]]);
        let reason = if payload.len() > 2 {
            String::from_utf8_lossy(&payload[2..]).to_string()
        } else {
            String::new()
        };
        (Some(code), Some(reason))
    } else {
        (None, None)
    };

    ParseResult::Complete(
        Frame {
            fin,
            opcode,
            payload,
            close_code,
            close_reason,
        },
        total_len,
    )
}

/// Encode a WebSocket frame (server -> client, no mask)
pub fn encode_frame(opcode: Opcode, payload: &[u8], fin: bool) -> Vec<u8> {
    let mut frame = Vec::with_capacity(10 + payload.len());

    // First byte: FIN + opcode
    frame.push(if fin { 0x80 } else { 0x00 } | (opcode as u8));

    // Payload length (no mask for server -> client)
    if payload.len() < 126 {
        frame.push(payload.len() as u8);
    } else if payload.len() < 65536 {
        frame.push(126);
        frame.extend_from_slice(&(payload.len() as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(payload.len() as u64).to_be_bytes());
    }

    frame.extend_from_slice(payload);
    frame
}

/// Encode a text frame
pub fn encode_text(text: &str, fin: bool) -> Vec<u8> {
    encode_frame(Opcode::Text, text.as_bytes(), fin)
}

/// Encode a binary frame
pub fn encode_binary(data: &[u8], fin: bool) -> Vec<u8> {
    encode_frame(Opcode::Binary, data, fin)
}

/// Encode a ping frame
pub fn encode_ping(data: &[u8]) -> Vec<u8> {
    encode_frame(Opcode::Ping, data, true)
}

/// Encode a pong frame
pub fn encode_pong(data: &[u8]) -> Vec<u8> {
    encode_frame(Opcode::Pong, data, true)
}

/// Encode a close frame
pub fn encode_close(code: Option<u16>, reason: Option<&str>) -> Vec<u8> {
    let payload = match (code, reason) {
        (Some(c), Some(r)) => {
            let mut p = c.to_be_bytes().to_vec();
            p.extend_from_slice(r.as_bytes());
            p
        }
        (Some(c), None) => c.to_be_bytes().to_vec(),
        _ => Vec::new(),
    };
    encode_frame(Opcode::Close, &payload, true)
}

/// Generate WebSocket accept key from client key
/// Uses SHA-1 (implemented inline for no-std compatibility)
pub fn generate_accept_key(key: &str) -> String {
    const MAGIC: &[u8] = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    let mut input = key.as_bytes().to_vec();
    input.extend_from_slice(MAGIC);

    let hash = sha1(&input);
    base64_encode(&hash)
}

/// Check if headers indicate WebSocket upgrade
pub fn is_websocket_upgrade(headers: &[(String, String)]) -> bool {
    let mut has_upgrade = false;
    let mut has_connection = false;
    let mut has_key = false;
    let mut has_version = false;

    for (name, value) in headers {
        let name_lower = name.to_lowercase();
        let value_lower = value.to_lowercase();

        match name_lower.as_str() {
            "upgrade" => has_upgrade = value_lower == "websocket",
            "connection" => has_connection = value_lower.contains("upgrade"),
            "sec-websocket-key" => has_key = !value.is_empty(),
            "sec-websocket-version" => has_version = value == "13",
            _ => {}
        }
    }

    has_upgrade && has_connection && has_key && has_version
}

// ============================================================================
// SHA-1 implementation (minimal, for WebSocket accept key)
// ============================================================================

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    // Pre-processing: adding padding bits
    let ml = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);

    while (msg.len() % 64) != 56 {
        msg.push(0);
    }

    msg.extend_from_slice(&ml.to_be_bytes());

    // Process each 512-bit chunk
    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];

        for (i, bytes) in chunk.chunks(4).enumerate() {
            w[i] = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
        }

        for i in 16..80 {
            w[i] = (w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16]).rotate_left(1);
        }

        let mut a = h0;
        let mut b = h1;
        let mut c = h2;
        let mut d = h3;
        let mut e = h4;

        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1u32),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDCu32),
                _ => (b ^ c ^ d, 0xCA62C1D6u32),
            };

            let temp = a.rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut result = [0u8; 20];
    result[0..4].copy_from_slice(&h0.to_be_bytes());
    result[4..8].copy_from_slice(&h1.to_be_bytes());
    result[8..12].copy_from_slice(&h2.to_be_bytes());
    result[12..16].copy_from_slice(&h3.to_be_bytes());
    result[16..20].copy_from_slice(&h4.to_be_bytes());
    result
}

// ============================================================================
// Base64 encoding (minimal)
// ============================================================================

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(data: &[u8]) -> String {
    let mut result = String::new();
    let mut i = 0;

    while i < data.len() {
        let b0 = data[i];
        let b1 = if i + 1 < data.len() { data[i + 1] } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] } else { 0 };

        result.push(BASE64_CHARS[(b0 >> 2) as usize] as char);
        result.push(BASE64_CHARS[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);

        if i + 1 < data.len() {
            result.push(BASE64_CHARS[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            result.push('=');
        }

        if i + 2 < data.len() {
            result.push(BASE64_CHARS[(b2 & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }

        i += 3;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_accept_key() {
        // RFC 6455 example
        let key = "dGhlIHNhbXBsZSBub25jZQ==";
        let accept = generate_accept_key(key);
        assert_eq!(accept, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn test_encode_text() {
        let frame = encode_text("Hello", true);
        assert_eq!(frame[0], 0x81); // FIN + Text
        assert_eq!(frame[1], 5);    // Length
        assert_eq!(&frame[2..], b"Hello");
    }

    #[test]
    fn test_parse_frame() {
        let data = [0x81, 0x05, b'H', b'e', b'l', b'l', b'o'];
        match parse_frame(&data) {
            ParseResult::Complete(frame, len) => {
                assert!(frame.fin);
                assert_eq!(frame.opcode, Opcode::Text);
                assert_eq!(frame.payload, b"Hello");
                assert_eq!(len, 7);
            }
            _ => panic!("Expected complete frame"),
        }
    }
}
