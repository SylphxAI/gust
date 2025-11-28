//! Authentication middleware
//!
//! Supports Basic, Bearer, and API Key authentication.

use crate::{Request, Response, ResponseBuilder, StatusCode};
use super::Middleware;

/// Authentication result
#[derive(Debug, Clone)]
pub enum AuthResult {
    /// Authenticated with identity
    Authenticated(String),
    /// Not authenticated
    Unauthenticated,
    /// Invalid credentials
    Invalid(String),
}

/// Basic authentication credentials
#[derive(Debug, Clone)]
pub struct BasicCredentials {
    pub username: String,
    pub password: String,
}

impl BasicCredentials {
    /// Parse from Authorization header
    pub fn parse(header: &str) -> Option<Self> {
        let header = header.strip_prefix("Basic ")?;
        let decoded = base64_decode(header)?;
        let (username, password) = decoded.split_once(':')?;

        Some(Self {
            username: username.to_string(),
            password: password.to_string(),
        })
    }

    /// Encode to Authorization header value
    pub fn encode(&self) -> String {
        let combined = format!("{}:{}", self.username, self.password);
        format!("Basic {}", base64_encode(&combined))
    }
}

/// Bearer token
#[derive(Debug, Clone)]
pub struct BearerToken(pub String);

impl BearerToken {
    /// Parse from Authorization header
    pub fn parse(header: &str) -> Option<Self> {
        let token = header.strip_prefix("Bearer ")?;
        Some(Self(token.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// API Key location
#[derive(Debug, Clone)]
pub enum ApiKeyLocation {
    Header(String),
    Query(String),
}

/// Basic authentication middleware
pub struct BasicAuth<F>
where
    F: Fn(&str, &str) -> bool + Send + Sync,
{
    realm: String,
    validator: F,
}

impl<F> BasicAuth<F>
where
    F: Fn(&str, &str) -> bool + Send + Sync,
{
    pub fn new(realm: impl Into<String>, validator: F) -> Self {
        Self {
            realm: realm.into(),
            validator,
        }
    }

    fn unauthorized_response(&self) -> Response {
        ResponseBuilder::new(StatusCode::UNAUTHORIZED)
            .header("WWW-Authenticate", &format!("Basic realm=\"{}\"", self.realm))
            .body("Unauthorized")
            .build()
    }
}

impl<F> Middleware for BasicAuth<F>
where
    F: Fn(&str, &str) -> bool + Send + Sync,
{
    fn before(&self, req: &mut Request) -> Option<Response> {
        let auth_header = req.header("authorization")?;

        match BasicCredentials::parse(auth_header) {
            Some(creds) => {
                if (self.validator)(&creds.username, &creds.password) {
                    // Store authenticated user in request
                    req.params.insert("_auth_user".to_string(), creds.username);
                    None
                } else {
                    Some(self.unauthorized_response())
                }
            }
            None => Some(self.unauthorized_response()),
        }
    }

    fn after(&self, _req: &Request, _res: &mut Response) {}
}

/// Bearer token authentication middleware
pub struct BearerAuth<F>
where
    F: Fn(&str) -> Option<String> + Send + Sync,
{
    validator: F,
}

impl<F> BearerAuth<F>
where
    F: Fn(&str) -> Option<String> + Send + Sync,
{
    pub fn new(validator: F) -> Self {
        Self { validator }
    }
}

impl<F> Middleware for BearerAuth<F>
where
    F: Fn(&str) -> Option<String> + Send + Sync,
{
    fn before(&self, req: &mut Request) -> Option<Response> {
        let auth_header = match req.header("authorization") {
            Some(h) => h,
            None => {
                return Some(
                    ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                        .header("WWW-Authenticate", "Bearer")
                        .body("Unauthorized")
                        .build(),
                )
            }
        };

        match BearerToken::parse(auth_header) {
            Some(token) => {
                if let Some(identity) = (self.validator)(token.as_str()) {
                    req.params.insert("_auth_user".to_string(), identity);
                    None
                } else {
                    Some(
                        ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                            .body("Invalid token")
                            .build(),
                    )
                }
            }
            None => Some(
                ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                    .header("WWW-Authenticate", "Bearer")
                    .body("Invalid authorization header")
                    .build(),
            ),
        }
    }

    fn after(&self, _req: &Request, _res: &mut Response) {}
}

/// API Key authentication middleware
pub struct ApiKeyAuth<F>
where
    F: Fn(&str) -> bool + Send + Sync,
{
    location: ApiKeyLocation,
    validator: F,
}

impl<F> ApiKeyAuth<F>
where
    F: Fn(&str) -> bool + Send + Sync,
{
    pub fn header(name: impl Into<String>, validator: F) -> Self {
        Self {
            location: ApiKeyLocation::Header(name.into()),
            validator,
        }
    }

    pub fn query(name: impl Into<String>, validator: F) -> Self {
        Self {
            location: ApiKeyLocation::Query(name.into()),
            validator,
        }
    }
}

impl<F> Middleware for ApiKeyAuth<F>
where
    F: Fn(&str) -> bool + Send + Sync,
{
    fn before(&self, req: &mut Request) -> Option<Response> {
        let api_key = match &self.location {
            ApiKeyLocation::Header(name) => req.header(name).map(|s| s.to_string()),
            ApiKeyLocation::Query(name) => {
                req.query_params().get(name).cloned()
            }
        };

        match api_key {
            Some(key) if (self.validator)(&key) => None,
            _ => Some(
                ResponseBuilder::new(StatusCode::UNAUTHORIZED)
                    .body("Invalid or missing API key")
                    .build(),
            ),
        }
    }

    fn after(&self, _req: &Request, _res: &mut Response) {}
}

/// Generic Auth enum for dynamic dispatch
pub enum Auth {
    Basic(Box<dyn Fn(&str, &str) -> bool + Send + Sync>),
    Bearer(Box<dyn Fn(&str) -> Option<String> + Send + Sync>),
    ApiKey {
        location: ApiKeyLocation,
        validator: Box<dyn Fn(&str) -> bool + Send + Sync>,
    },
}

// Base64 encoding/decoding (minimal implementation)
fn base64_encode(input: &str) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let bytes = input.as_bytes();
    let mut output = String::new();

    for chunk in bytes.chunks(3) {
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

fn base64_decode(input: &str) -> Option<String> {
    const DECODE: [i8; 256] = {
        let mut table = [-1i8; 256];
        let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < alphabet.len() {
            table[alphabet[i] as usize] = i as i8;
            i += 1;
        }
        table
    };

    let input = input.trim_end_matches('=');
    let mut output = Vec::new();

    for chunk in input.as_bytes().chunks(4) {
        if chunk.len() < 2 {
            return None;
        }

        let b0 = DECODE[chunk[0] as usize];
        let b1 = DECODE[chunk[1] as usize];
        let b2 = chunk.get(2).map(|&c| DECODE[c as usize]).unwrap_or(0);
        let b3 = chunk.get(3).map(|&c| DECODE[c as usize]).unwrap_or(0);

        if b0 < 0 || b1 < 0 || (chunk.len() > 2 && b2 < 0) || (chunk.len() > 3 && b3 < 0) {
            return None;
        }

        let triple = ((b0 as u32) << 18) | ((b1 as u32) << 12) | ((b2 as u32) << 6) | (b3 as u32);

        output.push((triple >> 16) as u8);
        if chunk.len() > 2 {
            output.push((triple >> 8) as u8);
        }
        if chunk.len() > 3 {
            output.push(triple as u8);
        }
    }

    String::from_utf8(output).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_credentials_parse() {
        // "user:pass" = "dXNlcjpwYXNz"
        let creds = BasicCredentials::parse("Basic dXNlcjpwYXNz").unwrap();
        assert_eq!(creds.username, "user");
        assert_eq!(creds.password, "pass");
    }

    #[test]
    fn test_basic_credentials_encode() {
        let creds = BasicCredentials {
            username: "user".to_string(),
            password: "pass".to_string(),
        };
        assert_eq!(creds.encode(), "Basic dXNlcjpwYXNz");
    }

    #[test]
    fn test_bearer_token_parse() {
        let token = BearerToken::parse("Bearer abc123").unwrap();
        assert_eq!(token.as_str(), "abc123");
    }

    #[test]
    fn test_base64_roundtrip() {
        let original = "Hello, World!";
        let encoded = base64_encode(original);
        let decoded = base64_decode(&encoded).unwrap();
        assert_eq!(decoded, original);
    }
}
