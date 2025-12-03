//! HTTP Method enum - SSOT
//!
//! Single source of truth for HTTP methods across native and WASM builds.

use crate::{Error, Result};

/// HTTP Method
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum Method {
    Get = 0,
    Post = 1,
    Put = 2,
    Delete = 3,
    Patch = 4,
    Head = 5,
    Options = 6,
    Connect = 7,
    Trace = 8,
}

impl Method {
    /// Parse method from bytes - optimized with early length check
    #[inline(always)]
    pub fn parse(bytes: &[u8]) -> Option<Self> {
        // Fast path: check first byte
        match bytes.first()? {
            b'G' if bytes == b"GET" => Some(Method::Get),
            b'P' => match bytes {
                b"POST" => Some(Method::Post),
                b"PUT" => Some(Method::Put),
                b"PATCH" => Some(Method::Patch),
                _ => None,
            },
            b'D' if bytes == b"DELETE" => Some(Method::Delete),
            b'H' if bytes == b"HEAD" => Some(Method::Head),
            b'O' if bytes == b"OPTIONS" => Some(Method::Options),
            b'C' if bytes == b"CONNECT" => Some(Method::Connect),
            b'T' if bytes == b"TRACE" => Some(Method::Trace),
            _ => None,
        }
    }

    /// Parse from string (case-insensitive)
    pub fn from_str(s: &str) -> Result<Self> {
        match s.to_uppercase().as_str() {
            "GET" => Ok(Method::Get),
            "POST" => Ok(Method::Post),
            "PUT" => Ok(Method::Put),
            "DELETE" => Ok(Method::Delete),
            "PATCH" => Ok(Method::Patch),
            "HEAD" => Ok(Method::Head),
            "OPTIONS" => Ok(Method::Options),
            "CONNECT" => Ok(Method::Connect),
            "TRACE" => Ok(Method::Trace),
            _ => Err(Error::InvalidMethod(s.to_string())),
        }
    }

    /// Convert to string
    pub fn as_str(&self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Delete => "DELETE",
            Method::Patch => "PATCH",
            Method::Head => "HEAD",
            Method::Options => "OPTIONS",
            Method::Connect => "CONNECT",
            Method::Trace => "TRACE",
        }
    }

    /// Convert from u8 code
    pub fn from_u8(code: u8) -> Option<Self> {
        match code {
            0 => Some(Method::Get),
            1 => Some(Method::Post),
            2 => Some(Method::Put),
            3 => Some(Method::Delete),
            4 => Some(Method::Patch),
            5 => Some(Method::Head),
            6 => Some(Method::Options),
            7 => Some(Method::Connect),
            8 => Some(Method::Trace),
            _ => None,
        }
    }
}

impl std::fmt::Display for Method {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_method_parse_bytes() {
        assert_eq!(Method::parse(b"GET"), Some(Method::Get));
        assert_eq!(Method::parse(b"POST"), Some(Method::Post));
        assert_eq!(Method::parse(b"PUT"), Some(Method::Put));
        assert_eq!(Method::parse(b"DELETE"), Some(Method::Delete));
        assert_eq!(Method::parse(b"PATCH"), Some(Method::Patch));
        assert_eq!(Method::parse(b"HEAD"), Some(Method::Head));
        assert_eq!(Method::parse(b"OPTIONS"), Some(Method::Options));
        assert_eq!(Method::parse(b"CONNECT"), Some(Method::Connect));
        assert_eq!(Method::parse(b"TRACE"), Some(Method::Trace));
        assert_eq!(Method::parse(b"INVALID"), None);
    }

    #[test]
    fn test_method_from_str() {
        assert_eq!(Method::from_str("GET").unwrap(), Method::Get);
        assert_eq!(Method::from_str("post").unwrap(), Method::Post);
        assert!(Method::from_str("INVALID").is_err());
    }

    #[test]
    fn test_method_as_str() {
        assert_eq!(Method::Get.as_str(), "GET");
        assert_eq!(Method::Post.as_str(), "POST");
    }

    #[test]
    fn test_method_from_u8() {
        assert_eq!(Method::from_u8(0), Some(Method::Get));
        assert_eq!(Method::from_u8(1), Some(Method::Post));
        assert_eq!(Method::from_u8(9), None);
    }

    #[test]
    fn test_method_repr() {
        assert_eq!(Method::Get as u8, 0);
        assert_eq!(Method::Post as u8, 1);
        assert_eq!(Method::Trace as u8, 8);
    }
}
