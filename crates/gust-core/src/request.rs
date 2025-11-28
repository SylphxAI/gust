//! HTTP Request types

use crate::{Error, Result};
use smallvec::SmallVec;
use std::collections::HashMap;

/// HTTP Methods
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Method {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
    Connect,
    Trace,
}

impl Method {
    /// Parse from string
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
}

impl std::fmt::Display for Method {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// HTTP Request
#[derive(Debug, Clone)]
pub struct Request {
    /// HTTP method
    pub method: Method,
    /// Request path (without query string)
    pub path: String,
    /// Query string (without leading ?)
    pub query: Option<String>,
    /// Request headers (stack-allocated for small header counts)
    pub headers: SmallVec<[(String, String); 16]>,
    /// Request body
    pub body: bytes::Bytes,
    /// Route parameters (populated by router)
    pub params: HashMap<String, String>,
}

impl Request {
    /// Create a new request
    pub fn new(method: Method, path: impl Into<String>) -> Self {
        Self {
            method,
            path: path.into(),
            query: None,
            headers: SmallVec::new(),
            body: bytes::Bytes::new(),
            params: HashMap::new(),
        }
    }

    /// Get a header value (case-insensitive)
    pub fn header(&self, name: &str) -> Option<&str> {
        let name_lower = name.to_lowercase();
        self.headers
            .iter()
            .find(|(k, _)| k.to_lowercase() == name_lower)
            .map(|(_, v)| v.as_str())
    }

    /// Get content-type header
    pub fn content_type(&self) -> Option<&str> {
        self.header("content-type")
    }

    /// Get content-length header
    pub fn content_length(&self) -> Option<usize> {
        self.header("content-length")
            .and_then(|v| v.parse().ok())
    }

    /// Check if request accepts JSON
    pub fn accepts_json(&self) -> bool {
        self.header("accept")
            .map(|v| v.contains("application/json") || v.contains("*/*"))
            .unwrap_or(true)
    }

    /// Get a route parameter
    pub fn param(&self, name: &str) -> Option<&str> {
        self.params.get(name).map(|s| s.as_str())
    }

    /// Parse query string into key-value pairs
    pub fn query_params(&self) -> HashMap<String, String> {
        let mut params = HashMap::new();
        if let Some(query) = &self.query {
            for pair in query.split('&') {
                if let Some((key, value)) = pair.split_once('=') {
                    params.insert(
                        urlencoding_decode(key),
                        urlencoding_decode(value),
                    );
                }
            }
        }
        params
    }
}

/// Builder for constructing requests
pub struct RequestBuilder {
    request: Request,
}

impl RequestBuilder {
    /// Create a new builder
    pub fn new(method: Method, path: impl Into<String>) -> Self {
        Self {
            request: Request::new(method, path),
        }
    }

    /// Set query string
    pub fn query(mut self, query: impl Into<String>) -> Self {
        self.request.query = Some(query.into());
        self
    }

    /// Add a header
    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.request.headers.push((name.into(), value.into()));
        self
    }

    /// Set body
    pub fn body(mut self, body: impl Into<bytes::Bytes>) -> Self {
        self.request.body = body.into();
        self
    }

    /// Set route params
    pub fn params(mut self, params: HashMap<String, String>) -> Self {
        self.request.params = params;
        self
    }

    /// Build the request
    pub fn build(self) -> Request {
        self.request
    }
}

/// Simple URL decoding (no external dependency)
fn urlencoding_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if hex.len() == 2 {
                if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                    result.push(byte as char);
                    continue;
                }
            }
            result.push('%');
            result.push_str(&hex);
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_method_parse() {
        assert_eq!(Method::from_str("GET").unwrap(), Method::Get);
        assert_eq!(Method::from_str("post").unwrap(), Method::Post);
        assert!(Method::from_str("INVALID").is_err());
    }

    #[test]
    fn test_request_header() {
        let req = RequestBuilder::new(Method::Get, "/")
            .header("Content-Type", "application/json")
            .build();

        assert_eq!(req.header("content-type"), Some("application/json"));
        assert_eq!(req.header("CONTENT-TYPE"), Some("application/json"));
    }

    #[test]
    fn test_query_params() {
        let req = RequestBuilder::new(Method::Get, "/")
            .query("foo=bar&baz=qux%20quux")
            .build();

        let params = req.query_params();
        assert_eq!(params.get("foo"), Some(&"bar".to_string()));
        assert_eq!(params.get("baz"), Some(&"qux quux".to_string()));
    }
}
