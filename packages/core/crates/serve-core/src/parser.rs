//! Zero-copy HTTP/1.1 request parser
//! Optimized for minimal allocations and SIMD acceleration

use memchr::{memchr, memchr2};

/// HTTP Method
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

/// Maximum number of headers to parse
pub const MAX_HEADERS: usize = 64;

/// Header offsets: [name_start, name_end, value_start, value_end]
pub type HeaderOffsets = [u32; MAX_HEADERS * 4];

/// Parsed request result - all offsets, no allocations
#[derive(Debug, Clone, Copy)]
pub struct ParsedRequest {
    /// Parse state: 0=incomplete, 1=complete, 2=error
    pub state: u8,
    /// HTTP method
    pub method: Method,
    /// Path start offset
    pub path_start: u32,
    /// Path end offset
    pub path_end: u32,
    /// Query start offset (0 if none)
    pub query_start: u32,
    /// Query end offset (0 if none)
    pub query_end: u32,
    /// Number of headers parsed
    pub headers_count: u32,
    /// Body start offset
    pub body_start: u32,
}

impl Default for ParsedRequest {
    fn default() -> Self {
        Self {
            state: 0,
            method: Method::Get,
            path_start: 0,
            path_end: 0,
            query_start: 0,
            query_end: 0,
            headers_count: 0,
            body_start: 0,
        }
    }
}

/// Parse HTTP request - returns all data in one pass
/// header_offsets is filled with [name_start, name_end, value_start, value_end] for each header
#[inline]
pub fn parse_request(buf: &[u8], header_offsets: &mut HeaderOffsets) -> ParsedRequest {
    let len = buf.len();
    let mut result = ParsedRequest::default();

    // Minimum request: "GET / HTTP/1.1\r\n\r\n" = 18 bytes
    if len < 18 {
        return result; // state = 0 (incomplete)
    }

    // Parse method (SIMD-accelerated memchr)
    let method_end = match memchr(b' ', buf) {
        Some(i) if i < 8 => i, // Methods are max 7 chars
        _ => return result,
    };

    result.method = match Method::parse(&buf[..method_end]) {
        Some(m) => m,
        None => {
            result.state = 2; // error
            return result;
        }
    };

    let mut pos = method_end + 1;

    // Parse path and query
    result.path_start = pos as u32;

    // Find end of request line (SIMD-accelerated)
    let line_end = match memchr2(b'\r', b'\n', &buf[pos..]) {
        Some(i) => pos + i,
        None => return result, // incomplete
    };

    // Find space before HTTP version, parsing path/query
    let mut path_end = pos;
    let mut query_start: u32 = 0;
    let mut query_end: u32 = 0;
    let mut found_space = false;

    // Use SIMD to find '?' or ' '
    for i in pos..line_end {
        let b = buf[i];
        if b == b' ' {
            if query_start == 0 {
                path_end = i;
            } else {
                query_end = i as u32;
            }
            found_space = true;
            break;
        } else if b == b'?' && query_start == 0 {
            path_end = i;
            query_start = (i + 1) as u32;
        }
    }

    if !found_space {
        return result; // malformed
    }

    result.path_end = path_end as u32;
    result.query_start = query_start;
    result.query_end = query_end;

    // Skip to end of request line
    pos = line_end;
    if pos + 1 >= len {
        return result;
    }

    // Skip \r\n or \n
    if buf[pos] == b'\r' {
        pos += 2;
    } else {
        pos += 1;
    }

    // Parse headers
    let mut header_count: u32 = 0;
    let max_headers = MAX_HEADERS as u32;

    loop {
        if pos >= len {
            return result;
        }

        // Check for end of headers
        if buf[pos] == b'\r' {
            if pos + 1 >= len {
                return result;
            }
            if buf[pos + 1] == b'\n' {
                pos += 2;
                break;
            }
        } else if buf[pos] == b'\n' {
            pos += 1;
            break;
        }

        // Find colon (SIMD-accelerated)
        let name_start = pos;
        let colon = match memchr(b':', &buf[pos..]) {
            Some(i) => pos + i,
            None => return result,
        };
        let name_end = colon;

        // Skip colon and whitespace
        pos = colon + 1;
        while pos < len && (buf[pos] == b' ' || buf[pos] == b'\t') {
            pos += 1;
        }

        // Find end of header value (SIMD-accelerated)
        let value_start = pos;
        let line_end = match memchr2(b'\r', b'\n', &buf[pos..]) {
            Some(i) => pos + i,
            None => return result,
        };
        let value_end = line_end;

        // Store header offsets
        if header_count < max_headers {
            let idx = (header_count * 4) as usize;
            header_offsets[idx] = name_start as u32;
            header_offsets[idx + 1] = name_end as u32;
            header_offsets[idx + 2] = value_start as u32;
            header_offsets[idx + 3] = value_end as u32;
            header_count += 1;
        }

        // Skip to next line
        pos = line_end;
        if pos < len && buf[pos] == b'\r' {
            pos += 1;
        }
        if pos < len && buf[pos] == b'\n' {
            pos += 1;
        }
    }

    result.headers_count = header_count;
    result.body_start = pos as u32;
    result.state = 1; // complete

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_get() {
        let req = b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let mut offsets: HeaderOffsets = [0; MAX_HEADERS * 4];

        let result = parse_request(req, &mut offsets);
        assert_eq!(result.state, 1);
        assert_eq!(result.method, Method::Get);
        assert_eq!(result.headers_count, 1);
    }

    #[test]
    fn test_parse_with_query() {
        let req = b"GET /users?page=1&limit=10 HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let mut offsets: HeaderOffsets = [0; MAX_HEADERS * 4];

        let result = parse_request(req, &mut offsets);
        assert_eq!(result.state, 1);
        assert!(result.query_start > 0);
    }

    #[test]
    fn test_incomplete() {
        let req = b"GET / HTTP/1.1\r\n";
        let mut offsets: HeaderOffsets = [0; MAX_HEADERS * 4];

        let result = parse_request(req, &mut offsets);
        assert_eq!(result.state, 0);
    }

    #[test]
    fn test_method_parse() {
        assert_eq!(Method::parse(b"GET"), Some(Method::Get));
        assert_eq!(Method::parse(b"POST"), Some(Method::Post));
        assert_eq!(Method::parse(b"PUT"), Some(Method::Put));
        assert_eq!(Method::parse(b"DELETE"), Some(Method::Delete));
        assert_eq!(Method::parse(b"PATCH"), Some(Method::Patch));
    }
}
