//! HTTP/2 support
//!
//! Provides HTTP/2 specific features:
//! - Server push
//! - Stream prioritization
//! - Flow control
//! - HPACK header compression (via hyper)

use crate::{Request, Response, ResponseBuilder, StatusCode};
use std::collections::HashMap;

/// HTTP/2 settings
#[derive(Debug, Clone)]
pub struct Http2Settings {
    /// Maximum concurrent streams (default: 100)
    pub max_concurrent_streams: u32,
    /// Initial window size (default: 65535)
    pub initial_window_size: u32,
    /// Maximum frame size (default: 16384)
    pub max_frame_size: u32,
    /// Maximum header list size (default: 16384)
    pub max_header_list_size: u32,
    /// Enable server push (default: true)
    pub enable_push: bool,
    /// Enable CONNECT protocol (default: false)
    pub enable_connect_protocol: bool,
}

impl Default for Http2Settings {
    fn default() -> Self {
        Self {
            max_concurrent_streams: 100,
            initial_window_size: 65535,
            max_frame_size: 16384,
            max_header_list_size: 16384,
            enable_push: true,
            enable_connect_protocol: false,
        }
    }
}

impl Http2Settings {
    /// Create new settings with custom max concurrent streams
    pub fn max_concurrent_streams(mut self, max: u32) -> Self {
        self.max_concurrent_streams = max;
        self
    }

    /// Set initial window size
    pub fn initial_window_size(mut self, size: u32) -> Self {
        self.initial_window_size = size;
        self
    }

    /// Set maximum frame size
    pub fn max_frame_size(mut self, size: u32) -> Self {
        self.max_frame_size = size;
        self
    }

    /// Enable/disable server push
    pub fn enable_push(mut self, enabled: bool) -> Self {
        self.enable_push = enabled;
        self
    }
}

/// HTTP/2 server push promise
#[derive(Debug, Clone)]
pub struct PushPromise {
    /// The path to push
    pub path: String,
    /// HTTP method (typically GET)
    pub method: String,
    /// Authority (host:port)
    pub authority: Option<String>,
    /// Additional headers
    pub headers: HashMap<String, String>,
}

impl PushPromise {
    /// Create a new push promise for a path
    pub fn new(path: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            method: "GET".to_string(),
            authority: None,
            headers: HashMap::new(),
        }
    }

    /// Set the HTTP method
    pub fn method(mut self, method: impl Into<String>) -> Self {
        self.method = method.into();
        self
    }

    /// Set authority (host:port)
    pub fn authority(mut self, authority: impl Into<String>) -> Self {
        self.authority = Some(authority.into());
        self
    }

    /// Add a header
    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }
}

/// HTTP/2 response with push promises
#[derive(Debug)]
pub struct Http2Response {
    /// The main response
    pub response: Response,
    /// Resources to push
    pub push_promises: Vec<PushPromise>,
}

impl Http2Response {
    /// Create from a regular response
    pub fn new(response: Response) -> Self {
        Self {
            response,
            push_promises: Vec::new(),
        }
    }

    /// Add a push promise
    pub fn push(mut self, promise: PushPromise) -> Self {
        self.push_promises.push(promise);
        self
    }

    /// Add multiple push promises
    pub fn push_all(mut self, promises: impl IntoIterator<Item = PushPromise>) -> Self {
        self.push_promises.extend(promises);
        self
    }
}

impl From<Response> for Http2Response {
    fn from(response: Response) -> Self {
        Self::new(response)
    }
}

/// Stream priority
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Priority {
    /// Stream dependency (0 = root)
    pub dependency: u32,
    /// Weight (1-256, default 16)
    pub weight: u8,
    /// Exclusive flag
    pub exclusive: bool,
}

impl Default for Priority {
    fn default() -> Self {
        Self {
            dependency: 0,
            weight: 16,
            exclusive: false,
        }
    }
}

impl Priority {
    /// Create a priority with specific weight
    pub fn with_weight(weight: u8) -> Self {
        Self {
            weight: weight.max(1), // Minimum 1
            ..Default::default()
        }
    }

    /// Set stream dependency
    pub fn depends_on(mut self, stream_id: u32) -> Self {
        self.dependency = stream_id;
        self
    }

    /// Set exclusive flag
    pub fn exclusive(mut self) -> Self {
        self.exclusive = true;
        self
    }
}

/// HTTP/2 frame types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum FrameType {
    Data = 0x0,
    Headers = 0x1,
    Priority = 0x2,
    RstStream = 0x3,
    Settings = 0x4,
    PushPromise = 0x5,
    Ping = 0x6,
    GoAway = 0x7,
    WindowUpdate = 0x8,
    Continuation = 0x9,
}

impl FrameType {
    /// Convert from u8
    pub fn from_u8(byte: u8) -> Option<Self> {
        match byte {
            0x0 => Some(FrameType::Data),
            0x1 => Some(FrameType::Headers),
            0x2 => Some(FrameType::Priority),
            0x3 => Some(FrameType::RstStream),
            0x4 => Some(FrameType::Settings),
            0x5 => Some(FrameType::PushPromise),
            0x6 => Some(FrameType::Ping),
            0x7 => Some(FrameType::GoAway),
            0x8 => Some(FrameType::WindowUpdate),
            0x9 => Some(FrameType::Continuation),
            _ => None,
        }
    }
}

/// HTTP/2 error codes
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum ErrorCode {
    NoError = 0x0,
    ProtocolError = 0x1,
    InternalError = 0x2,
    FlowControlError = 0x3,
    SettingsTimeout = 0x4,
    StreamClosed = 0x5,
    FrameSizeError = 0x6,
    RefusedStream = 0x7,
    Cancel = 0x8,
    CompressionError = 0x9,
    ConnectError = 0xa,
    EnhanceYourCalm = 0xb,
    InadequateSecurity = 0xc,
    Http11Required = 0xd,
}

impl ErrorCode {
    /// Convert to u32
    pub fn as_u32(&self) -> u32 {
        *self as u32
    }

    /// Convert from u32
    pub fn from_u32(code: u32) -> Option<Self> {
        match code {
            0x0 => Some(ErrorCode::NoError),
            0x1 => Some(ErrorCode::ProtocolError),
            0x2 => Some(ErrorCode::InternalError),
            0x3 => Some(ErrorCode::FlowControlError),
            0x4 => Some(ErrorCode::SettingsTimeout),
            0x5 => Some(ErrorCode::StreamClosed),
            0x6 => Some(ErrorCode::FrameSizeError),
            0x7 => Some(ErrorCode::RefusedStream),
            0x8 => Some(ErrorCode::Cancel),
            0x9 => Some(ErrorCode::CompressionError),
            0xa => Some(ErrorCode::ConnectError),
            0xb => Some(ErrorCode::EnhanceYourCalm),
            0xc => Some(ErrorCode::InadequateSecurity),
            0xd => Some(ErrorCode::Http11Required),
            _ => None,
        }
    }
}

/// HTTP/2 preface (client sends this first)
pub const CLIENT_PREFACE: &[u8] = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n";

/// Check if request is HTTP/2 upgrade
pub fn is_http2_upgrade(req: &Request) -> bool {
    let upgrade = req.header("upgrade").unwrap_or("");
    let http2_settings = req.header("http2-settings");
    let connection = req.header("connection").unwrap_or("");

    upgrade.eq_ignore_ascii_case("h2c")
        && http2_settings.is_some()
        && connection.to_lowercase().contains("upgrade")
        && connection.to_lowercase().contains("http2-settings")
}

/// Create HTTP/2 upgrade response (for h2c)
pub fn http2_upgrade_response() -> Response {
    ResponseBuilder::new(StatusCode(101))
        .header("Connection", "Upgrade")
        .header("Upgrade", "h2c")
        .body("")
        .build()
}

/// HTTP/2 connection info
#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    /// Whether using TLS (h2 vs h2c)
    pub secure: bool,
    /// Negotiated ALPN protocol
    pub alpn_protocol: Option<String>,
    /// Server settings
    pub settings: Http2Settings,
    /// Number of active streams
    pub active_streams: u32,
}

impl ConnectionInfo {
    /// Create a new connection info
    pub fn new(secure: bool) -> Self {
        Self {
            secure,
            alpn_protocol: None,
            settings: Http2Settings::default(),
            active_streams: 0,
        }
    }

    /// Check if connection is using HTTP/2 over TLS
    pub fn is_h2(&self) -> bool {
        self.secure && self.alpn_protocol.as_deref() == Some("h2")
    }

    /// Check if connection is using HTTP/2 cleartext
    pub fn is_h2c(&self) -> bool {
        !self.secure || self.alpn_protocol.as_deref() == Some("h2c")
    }
}

/// Common HTTP/2 pseudo-headers
pub mod pseudo_headers {
    /// :method pseudo-header
    pub const METHOD: &str = ":method";
    /// :scheme pseudo-header
    pub const SCHEME: &str = ":scheme";
    /// :authority pseudo-header
    pub const AUTHORITY: &str = ":authority";
    /// :path pseudo-header
    pub const PATH: &str = ":path";
    /// :status pseudo-header (response only)
    pub const STATUS: &str = ":status";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_http2_settings() {
        let settings = Http2Settings::default()
            .max_concurrent_streams(200)
            .initial_window_size(131072);

        assert_eq!(settings.max_concurrent_streams, 200);
        assert_eq!(settings.initial_window_size, 131072);
    }

    #[test]
    fn test_push_promise() {
        let promise = PushPromise::new("/style.css")
            .header("content-type", "text/css");

        assert_eq!(promise.path, "/style.css");
        assert_eq!(promise.method, "GET");
        assert_eq!(promise.headers.get("content-type"), Some(&"text/css".to_string()));
    }

    #[test]
    fn test_priority() {
        let priority = Priority::with_weight(32)
            .depends_on(1)
            .exclusive();

        assert_eq!(priority.weight, 32);
        assert_eq!(priority.dependency, 1);
        assert!(priority.exclusive);
    }

    #[test]
    fn test_frame_types() {
        assert_eq!(FrameType::from_u8(0x0), Some(FrameType::Data));
        assert_eq!(FrameType::from_u8(0x1), Some(FrameType::Headers));
        assert_eq!(FrameType::from_u8(0x4), Some(FrameType::Settings));
        assert_eq!(FrameType::from_u8(0xFF), None);
    }

    #[test]
    fn test_error_codes() {
        assert_eq!(ErrorCode::NoError.as_u32(), 0);
        assert_eq!(ErrorCode::from_u32(0x1), Some(ErrorCode::ProtocolError));
        assert_eq!(ErrorCode::from_u32(0xb), Some(ErrorCode::EnhanceYourCalm));
    }

    #[test]
    fn test_client_preface() {
        assert_eq!(CLIENT_PREFACE.len(), 24);
        assert!(CLIENT_PREFACE.starts_with(b"PRI"));
    }
}
