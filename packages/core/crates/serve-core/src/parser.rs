//! Zero-copy HTTP/1.1 request parser
//! Parses raw bytes into structured request data without allocations

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
    /// Parse method from bytes (zero-copy)
    #[inline]
    pub fn parse(bytes: &[u8]) -> Option<Self> {
        match bytes {
            b"GET" => Some(Method::Get),
            b"POST" => Some(Method::Post),
            b"PUT" => Some(Method::Put),
            b"DELETE" => Some(Method::Delete),
            b"PATCH" => Some(Method::Patch),
            b"HEAD" => Some(Method::Head),
            b"OPTIONS" => Some(Method::Options),
            b"CONNECT" => Some(Method::Connect),
            b"TRACE" => Some(Method::Trace),
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

/// Parsed HTTP header (zero-copy references into original buffer)
#[derive(Debug, Clone, Copy)]
pub struct Header<'a> {
    pub name: &'a [u8],
    pub value: &'a [u8],
}

/// Parsed HTTP request (zero-copy)
#[derive(Debug)]
pub struct Request<'a> {
    pub method: Method,
    pub path: &'a [u8],
    pub query: Option<&'a [u8]>,
    pub version: &'a [u8],
    pub headers: &'a [Header<'a>],
    pub body_start: usize,
}

/// Parser state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseState {
    /// Need more data
    Incomplete,
    /// Successfully parsed, contains body start offset
    Complete(usize),
    /// Parse error
    Error,
}

/// Maximum number of headers to parse
pub const MAX_HEADERS: usize = 64;

/// Parse HTTP request from raw bytes
/// Returns (state, method, path_start, path_end, query_start, query_end, headers_count, body_start)
#[inline]
pub fn parse_request<'a>(buf: &'a [u8], headers: &mut [Header<'a>]) -> ParseState {
    let len = buf.len();
    if len < 16 {
        // Minimum: "GET / HTTP/1.1\r\n"
        return ParseState::Incomplete;
    }

    #[allow(unused_assignments)]
    let mut pos;

    // Parse method
    let method_end = match memchr(b' ', buf) {
        Some(i) => i,
        None => return ParseState::Incomplete,
    };

    if Method::parse(&buf[..method_end]).is_none() {
        return ParseState::Error;
    }

    pos = method_end + 1;

    // Parse path
    let path_start = pos;
    let request_line_end = match memchr2(b'\r', b'\n', &buf[pos..]) {
        Some(i) => pos + i,
        None => return ParseState::Incomplete,
    };

    // Find space before HTTP version (parse path and query)
    #[allow(unused_assignments)]
    let mut path_end = path_start;
    let mut query_start = None;

    for i in path_start..request_line_end {
        match buf[i] {
            b' ' => {
                if query_start.is_none() {
                    path_end = i;
                }
                break;
            }
            b'?' if query_start.is_none() => {
                path_end = i;
                query_start = Some(i + 1);
            }
            _ => {
                if query_start.is_none() {
                    path_end = i + 1;
                }
            }
        }
    }

    // Skip to end of request line
    pos = request_line_end;
    if pos + 1 >= len {
        return ParseState::Incomplete;
    }

    // Skip \r\n or \n
    if buf[pos] == b'\r' {
        pos += 2;
    } else {
        pos += 1;
    }

    // Parse headers
    let mut header_count = 0;

    loop {
        if pos >= len {
            return ParseState::Incomplete;
        }

        // Check for end of headers
        if buf[pos] == b'\r' {
            if pos + 1 >= len {
                return ParseState::Incomplete;
            }
            if buf[pos + 1] == b'\n' {
                pos += 2;
                break;
            }
        } else if buf[pos] == b'\n' {
            pos += 1;
            break;
        }

        // Find header name end (colon)
        let name_start = pos;
        let colon = match memchr(b':', &buf[pos..]) {
            Some(i) => pos + i,
            None => return ParseState::Incomplete,
        };
        let name_end = colon;

        // Skip colon and optional whitespace
        pos = colon + 1;
        while pos < len && (buf[pos] == b' ' || buf[pos] == b'\t') {
            pos += 1;
        }

        // Find header value end
        let value_start = pos;
        let line_end = match memchr2(b'\r', b'\n', &buf[pos..]) {
            Some(i) => pos + i,
            None => return ParseState::Incomplete,
        };
        let value_end = line_end;

        // Store header
        if header_count < headers.len() {
            headers[header_count] = Header {
                name: &buf[name_start..name_end],
                value: &buf[value_start..value_end],
            };
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

    ParseState::Complete(pos)
}

/// Simple memchr implementation
#[inline]
fn memchr(needle: u8, haystack: &[u8]) -> Option<usize> {
    haystack.iter().position(|&b| b == needle)
}

/// Find first occurrence of either byte
#[inline]
fn memchr2(a: u8, b: u8, haystack: &[u8]) -> Option<usize> {
    haystack.iter().position(|&byte| byte == a || byte == b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_get() {
        let req = b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let mut headers = [Header { name: &[], value: &[] }; MAX_HEADERS];

        let state = parse_request(req, &mut headers);
        assert!(matches!(state, ParseState::Complete(_)));
    }

    #[test]
    fn test_parse_with_query() {
        let req = b"GET /users?page=1&limit=10 HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let mut headers = [Header { name: &[], value: &[] }; MAX_HEADERS];

        let state = parse_request(req, &mut headers);
        assert!(matches!(state, ParseState::Complete(_)));
    }

    #[test]
    fn test_incomplete() {
        let req = b"GET / HTTP/1.1\r\n";
        let mut headers = [Header { name: &[], value: &[] }; MAX_HEADERS];

        let state = parse_request(req, &mut headers);
        assert_eq!(state, ParseState::Incomplete);
    }
}
