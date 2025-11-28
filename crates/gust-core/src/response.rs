//! HTTP Response types

use smallvec::SmallVec;

/// HTTP Status Code
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StatusCode(pub u16);

impl StatusCode {
    // 2xx Success
    pub const OK: StatusCode = StatusCode(200);
    pub const CREATED: StatusCode = StatusCode(201);
    pub const ACCEPTED: StatusCode = StatusCode(202);
    pub const NO_CONTENT: StatusCode = StatusCode(204);

    // 3xx Redirection
    pub const MOVED_PERMANENTLY: StatusCode = StatusCode(301);
    pub const FOUND: StatusCode = StatusCode(302);
    pub const SEE_OTHER: StatusCode = StatusCode(303);
    pub const NOT_MODIFIED: StatusCode = StatusCode(304);
    pub const TEMPORARY_REDIRECT: StatusCode = StatusCode(307);
    pub const PERMANENT_REDIRECT: StatusCode = StatusCode(308);

    // 4xx Client Errors
    pub const BAD_REQUEST: StatusCode = StatusCode(400);
    pub const UNAUTHORIZED: StatusCode = StatusCode(401);
    pub const FORBIDDEN: StatusCode = StatusCode(403);
    pub const NOT_FOUND: StatusCode = StatusCode(404);
    pub const METHOD_NOT_ALLOWED: StatusCode = StatusCode(405);
    pub const CONFLICT: StatusCode = StatusCode(409);
    pub const GONE: StatusCode = StatusCode(410);
    pub const UNPROCESSABLE_ENTITY: StatusCode = StatusCode(422);
    pub const TOO_MANY_REQUESTS: StatusCode = StatusCode(429);

    // 5xx Server Errors
    pub const INTERNAL_SERVER_ERROR: StatusCode = StatusCode(500);
    pub const NOT_IMPLEMENTED: StatusCode = StatusCode(501);
    pub const BAD_GATEWAY: StatusCode = StatusCode(502);
    pub const SERVICE_UNAVAILABLE: StatusCode = StatusCode(503);
    pub const GATEWAY_TIMEOUT: StatusCode = StatusCode(504);

    /// Get the numeric code
    pub fn as_u16(&self) -> u16 {
        self.0
    }

    /// Get the reason phrase
    pub fn reason_phrase(&self) -> &'static str {
        match self.0 {
            200 => "OK",
            201 => "Created",
            202 => "Accepted",
            204 => "No Content",
            301 => "Moved Permanently",
            302 => "Found",
            303 => "See Other",
            304 => "Not Modified",
            307 => "Temporary Redirect",
            308 => "Permanent Redirect",
            400 => "Bad Request",
            401 => "Unauthorized",
            403 => "Forbidden",
            404 => "Not Found",
            405 => "Method Not Allowed",
            409 => "Conflict",
            410 => "Gone",
            422 => "Unprocessable Entity",
            429 => "Too Many Requests",
            500 => "Internal Server Error",
            501 => "Not Implemented",
            502 => "Bad Gateway",
            503 => "Service Unavailable",
            504 => "Gateway Timeout",
            _ => "Unknown",
        }
    }

    /// Check if this is a success status (2xx)
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.0)
    }

    /// Check if this is a redirect status (3xx)
    pub fn is_redirect(&self) -> bool {
        (300..400).contains(&self.0)
    }

    /// Check if this is a client error status (4xx)
    pub fn is_client_error(&self) -> bool {
        (400..500).contains(&self.0)
    }

    /// Check if this is a server error status (5xx)
    pub fn is_server_error(&self) -> bool {
        (500..600).contains(&self.0)
    }
}

impl From<u16> for StatusCode {
    fn from(code: u16) -> Self {
        StatusCode(code)
    }
}

impl std::fmt::Display for StatusCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.0, self.reason_phrase())
    }
}

/// HTTP Response
#[derive(Debug, Clone)]
pub struct Response {
    /// Status code
    pub status: StatusCode,
    /// Response headers (stack-allocated for small header counts)
    pub headers: SmallVec<[(String, String); 8]>,
    /// Response body
    pub body: bytes::Bytes,
}

impl Response {
    /// Create a new response
    pub fn new(status: StatusCode) -> Self {
        Self {
            status,
            headers: SmallVec::new(),
            body: bytes::Bytes::new(),
        }
    }

    /// Create a 200 OK response
    pub fn ok() -> Self {
        Self::new(StatusCode::OK)
    }

    /// Create a JSON response
    pub fn json(body: impl Into<bytes::Bytes>) -> Self {
        ResponseBuilder::new(StatusCode::OK)
            .header("content-type", "application/json")
            .body(body)
            .build()
    }

    /// Create a text response
    pub fn text(body: impl Into<bytes::Bytes>) -> Self {
        ResponseBuilder::new(StatusCode::OK)
            .header("content-type", "text/plain; charset=utf-8")
            .body(body)
            .build()
    }

    /// Create an HTML response
    pub fn html(body: impl Into<bytes::Bytes>) -> Self {
        ResponseBuilder::new(StatusCode::OK)
            .header("content-type", "text/html; charset=utf-8")
            .body(body)
            .build()
    }

    /// Create a redirect response
    pub fn redirect(location: &str, permanent: bool) -> Self {
        let status = if permanent {
            StatusCode::PERMANENT_REDIRECT
        } else {
            StatusCode::TEMPORARY_REDIRECT
        };
        ResponseBuilder::new(status)
            .header("location", location)
            .build()
    }

    /// Create a 404 Not Found response
    pub fn not_found() -> Self {
        ResponseBuilder::new(StatusCode::NOT_FOUND)
            .header("content-type", "text/plain")
            .body("Not Found")
            .build()
    }

    /// Create a 400 Bad Request response
    pub fn bad_request(message: &str) -> Self {
        ResponseBuilder::new(StatusCode::BAD_REQUEST)
            .header("content-type", "text/plain")
            .body(message.to_string())
            .build()
    }

    /// Create a 500 Internal Server Error response
    pub fn internal_error(message: &str) -> Self {
        ResponseBuilder::new(StatusCode::INTERNAL_SERVER_ERROR)
            .header("content-type", "text/plain")
            .body(message.to_string())
            .build()
    }

    /// Get a header value
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

    /// Get body as string (if UTF-8)
    pub fn body_string(&self) -> Option<String> {
        std::str::from_utf8(&self.body).ok().map(|s| s.to_string())
    }

    /// Serialize to HTTP/1.1 wire format
    pub fn to_http1_bytes(&self) -> bytes::Bytes {
        let mut buf = Vec::with_capacity(256 + self.body.len());

        // Status line
        buf.extend_from_slice(b"HTTP/1.1 ");
        buf.extend_from_slice(self.status.0.to_string().as_bytes());
        buf.push(b' ');
        buf.extend_from_slice(self.status.reason_phrase().as_bytes());
        buf.extend_from_slice(b"\r\n");

        // Headers
        for (name, value) in &self.headers {
            buf.extend_from_slice(name.as_bytes());
            buf.extend_from_slice(b": ");
            buf.extend_from_slice(value.as_bytes());
            buf.extend_from_slice(b"\r\n");
        }

        // Content-Length if body present
        if !self.body.is_empty() {
            buf.extend_from_slice(b"content-length: ");
            buf.extend_from_slice(self.body.len().to_string().as_bytes());
            buf.extend_from_slice(b"\r\n");
        }

        // End of headers
        buf.extend_from_slice(b"\r\n");

        // Body
        buf.extend_from_slice(&self.body);

        bytes::Bytes::from(buf)
    }
}

impl Default for Response {
    fn default() -> Self {
        Self::ok()
    }
}

/// Builder for constructing responses
pub struct ResponseBuilder {
    response: Response,
}

impl ResponseBuilder {
    /// Create a new builder
    pub fn new(status: StatusCode) -> Self {
        Self {
            response: Response::new(status),
        }
    }

    /// Set status code
    pub fn status(mut self, status: StatusCode) -> Self {
        self.response.status = status;
        self
    }

    /// Add a header
    pub fn header(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.response.headers.push((name.into(), value.into()));
        self
    }

    /// Set body
    pub fn body(mut self, body: impl Into<bytes::Bytes>) -> Self {
        self.response.body = body.into();
        self
    }

    /// Build the response
    pub fn build(self) -> Response {
        self.response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_code() {
        assert!(StatusCode::OK.is_success());
        assert!(StatusCode::FOUND.is_redirect());
        assert!(StatusCode::NOT_FOUND.is_client_error());
        assert!(StatusCode::INTERNAL_SERVER_ERROR.is_server_error());
    }

    #[test]
    fn test_response_json() {
        let res = Response::json(r#"{"foo":"bar"}"#);
        assert_eq!(res.status, StatusCode::OK);
        assert_eq!(res.content_type(), Some("application/json"));
    }

    #[test]
    fn test_response_to_http1() {
        let res = ResponseBuilder::new(StatusCode::OK)
            .header("x-custom", "value")
            .body("Hello")
            .build();

        let bytes = res.to_http1_bytes();
        let s = std::str::from_utf8(&bytes).unwrap();

        assert!(s.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(s.contains("x-custom: value\r\n"));
        assert!(s.contains("content-length: 5\r\n"));
        assert!(s.ends_with("\r\n\r\nHello"));
    }
}
