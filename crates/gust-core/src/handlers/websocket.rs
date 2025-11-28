//! WebSocket handler
//!
//! Full WebSocket implementation with upgrade handling.

use crate::{Request, Response, ResponseBuilder, StatusCode};

/// WebSocket message types
#[derive(Debug, Clone)]
pub enum WebSocketMessage {
    Text(String),
    Binary(Vec<u8>),
    Ping(Vec<u8>),
    Pong(Vec<u8>),
    Close(Option<CloseFrame>),
}

/// WebSocket close frame
#[derive(Debug, Clone)]
pub struct CloseFrame {
    pub code: u16,
    pub reason: String,
}

impl CloseFrame {
    pub fn normal() -> Self {
        Self { code: 1000, reason: "Normal closure".to_string() }
    }

    pub fn going_away() -> Self {
        Self { code: 1001, reason: "Going away".to_string() }
    }

    pub fn protocol_error() -> Self {
        Self { code: 1002, reason: "Protocol error".to_string() }
    }
}

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

/// WebSocket frame
#[derive(Debug, Clone)]
pub struct Frame {
    pub fin: bool,
    pub opcode: Opcode,
    pub mask: Option<[u8; 4]>,
    pub payload: Vec<u8>,
}

impl Frame {
    /// Create a text frame
    pub fn text(data: impl Into<String>) -> Self {
        Self {
            fin: true,
            opcode: Opcode::Text,
            mask: None,
            payload: data.into().into_bytes(),
        }
    }

    /// Create a binary frame
    pub fn binary(data: impl Into<Vec<u8>>) -> Self {
        Self {
            fin: true,
            opcode: Opcode::Binary,
            mask: None,
            payload: data.into(),
        }
    }

    /// Create a ping frame
    pub fn ping(data: impl Into<Vec<u8>>) -> Self {
        Self {
            fin: true,
            opcode: Opcode::Ping,
            mask: None,
            payload: data.into(),
        }
    }

    /// Create a pong frame
    pub fn pong(data: impl Into<Vec<u8>>) -> Self {
        Self {
            fin: true,
            opcode: Opcode::Pong,
            mask: None,
            payload: data.into(),
        }
    }

    /// Create a close frame
    pub fn close(code: u16, reason: &str) -> Self {
        let mut payload = Vec::with_capacity(2 + reason.len());
        payload.extend_from_slice(&code.to_be_bytes());
        payload.extend_from_slice(reason.as_bytes());

        Self {
            fin: true,
            opcode: Opcode::Close,
            mask: None,
            payload,
        }
    }

    /// Encode frame to bytes
    pub fn encode(&self) -> Vec<u8> {
        let mut buf = Vec::new();

        // First byte: FIN + opcode
        let first_byte = if self.fin { 0x80 } else { 0x00 } | (self.opcode as u8);
        buf.push(first_byte);

        // Second byte: MASK + payload length
        let len = self.payload.len();
        let mask_bit = if self.mask.is_some() { 0x80 } else { 0x00 };

        if len < 126 {
            buf.push(mask_bit | (len as u8));
        } else if len < 65536 {
            buf.push(mask_bit | 126);
            buf.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            buf.push(mask_bit | 127);
            buf.extend_from_slice(&(len as u64).to_be_bytes());
        }

        // Mask key (if present)
        if let Some(mask) = self.mask {
            buf.extend_from_slice(&mask);

            // Masked payload
            for (i, byte) in self.payload.iter().enumerate() {
                buf.push(byte ^ mask[i % 4]);
            }
        } else {
            buf.extend_from_slice(&self.payload);
        }

        buf
    }

    /// Decode frame from bytes
    pub fn decode(data: &[u8]) -> Option<(Self, usize)> {
        if data.len() < 2 {
            return None;
        }

        let fin = (data[0] & 0x80) != 0;
        let opcode = Opcode::from_u8(data[0])?;
        let masked = (data[1] & 0x80) != 0;
        let mut payload_len = (data[1] & 0x7F) as usize;
        let mut offset = 2;

        // Extended payload length
        if payload_len == 126 {
            if data.len() < 4 {
                return None;
            }
            payload_len = u16::from_be_bytes([data[2], data[3]]) as usize;
            offset = 4;
        } else if payload_len == 127 {
            if data.len() < 10 {
                return None;
            }
            payload_len = u64::from_be_bytes([
                data[2], data[3], data[4], data[5],
                data[6], data[7], data[8], data[9],
            ]) as usize;
            offset = 10;
        }

        // Mask key
        let mask = if masked {
            if data.len() < offset + 4 {
                return None;
            }
            let mask = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
            offset += 4;
            Some(mask)
        } else {
            None
        };

        // Payload
        if data.len() < offset + payload_len {
            return None;
        }

        let mut payload = data[offset..offset + payload_len].to_vec();

        // Unmask if needed
        if let Some(mask) = mask {
            for (i, byte) in payload.iter_mut().enumerate() {
                *byte ^= mask[i % 4];
            }
        }

        let frame = Frame {
            fin,
            opcode,
            mask,
            payload,
        };

        Some((frame, offset + payload_len))
    }
}

/// WebSocket handler trait
pub trait WebSocketHandler: Send + Sync {
    fn on_open(&self, ws: &WebSocket);
    fn on_message(&self, ws: &WebSocket, msg: WebSocketMessage);
    fn on_close(&self, ws: &WebSocket, frame: Option<CloseFrame>);
    fn on_error(&self, ws: &WebSocket, error: &str);
}

/// WebSocket connection
pub struct WebSocket {
    /// Connection ID
    pub id: u64,
    /// Send buffer
    send_buffer: std::sync::Mutex<Vec<Frame>>,
}

impl WebSocket {
    pub fn new(id: u64) -> Self {
        Self {
            id,
            send_buffer: std::sync::Mutex::new(Vec::new()),
        }
    }

    /// Send text message
    pub fn send_text(&self, data: impl Into<String>) {
        let frame = Frame::text(data);
        self.send_frame(frame);
    }

    /// Send binary message
    pub fn send_binary(&self, data: impl Into<Vec<u8>>) {
        let frame = Frame::binary(data);
        self.send_frame(frame);
    }

    /// Send ping
    pub fn ping(&self, data: impl Into<Vec<u8>>) {
        let frame = Frame::ping(data);
        self.send_frame(frame);
    }

    /// Close connection
    pub fn close(&self, code: u16, reason: &str) {
        let frame = Frame::close(code, reason);
        self.send_frame(frame);
    }

    fn send_frame(&self, frame: Frame) {
        if let Ok(mut buf) = self.send_buffer.lock() {
            buf.push(frame);
        }
    }

    /// Take pending frames
    pub fn take_frames(&self) -> Vec<Frame> {
        if let Ok(mut buf) = self.send_buffer.lock() {
            std::mem::take(&mut *buf)
        } else {
            Vec::new()
        }
    }
}

/// Check if request is WebSocket upgrade
pub fn is_websocket_upgrade(req: &Request) -> bool {
    let upgrade = req.header("upgrade").unwrap_or("");
    let connection = req.header("connection").unwrap_or("");
    let key = req.header("sec-websocket-key");

    upgrade.eq_ignore_ascii_case("websocket")
        && connection.to_lowercase().contains("upgrade")
        && key.is_some()
}

/// Generate WebSocket accept key
pub fn generate_accept_key(key: &str) -> String {
    const MAGIC: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    let mut input = String::with_capacity(key.len() + MAGIC.len());
    input.push_str(key);
    input.push_str(MAGIC);

    let hash = sha1(input.as_bytes());
    base64_encode(&hash)
}

/// Create WebSocket upgrade response
pub fn upgrade_response(req: &Request) -> Option<Response> {
    let key = req.header("sec-websocket-key")?;
    let accept = generate_accept_key(key);

    Some(
        ResponseBuilder::new(StatusCode(101))
            .header("Upgrade", "websocket")
            .header("Connection", "Upgrade")
            .header("Sec-WebSocket-Accept", &accept)
            .body("")
            .build(),
    )
}

// SHA-1 implementation for WebSocket accept key
fn sha1(input: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

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
        let mut w = [0u32; 80];

        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }

        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
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

fn base64_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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
    fn test_accept_key() {
        // Test vector from RFC 6455
        let key = "dGhlIHNhbXBsZSBub25jZQ==";
        let accept = generate_accept_key(key);
        assert_eq!(accept, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn test_frame_encode_decode() {
        let original = Frame::text("Hello, World!");
        let encoded = original.encode();
        let (decoded, _) = Frame::decode(&encoded).unwrap();

        assert_eq!(decoded.opcode, Opcode::Text);
        assert_eq!(decoded.payload, b"Hello, World!");
    }

    #[test]
    fn test_close_frame() {
        let frame = Frame::close(1000, "Normal");
        let encoded = frame.encode();
        let (decoded, _) = Frame::decode(&encoded).unwrap();

        assert_eq!(decoded.opcode, Opcode::Close);
        assert_eq!(&decoded.payload[0..2], &[0x03, 0xE8]); // 1000 in big endian
    }
}
