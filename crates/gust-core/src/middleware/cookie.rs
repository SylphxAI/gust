//! Cookie middleware
//!
//! Parse and serialize HTTP cookies.

use crate::{Request, Response};
use super::Middleware;
use smallvec::SmallVec;
use std::collections::HashMap;

/// Cookie SameSite attribute
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SameSite {
    Strict,
    Lax,
    None,
}

impl SameSite {
    pub fn as_str(&self) -> &'static str {
        match self {
            SameSite::Strict => "Strict",
            SameSite::Lax => "Lax",
            SameSite::None => "None",
        }
    }
}

/// HTTP Cookie
#[derive(Debug, Clone)]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub path: Option<String>,
    pub domain: Option<String>,
    pub expires: Option<u64>, // Unix timestamp
    pub max_age: Option<i64>, // Seconds
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<SameSite>,
}

impl Cookie {
    pub fn new(name: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            value: value.into(),
            path: None,
            domain: None,
            expires: None,
            max_age: None,
            secure: false,
            http_only: false,
            same_site: None,
        }
    }

    pub fn path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn domain(mut self, domain: impl Into<String>) -> Self {
        self.domain = Some(domain.into());
        self
    }

    pub fn max_age(mut self, seconds: i64) -> Self {
        self.max_age = Some(seconds);
        self
    }

    pub fn secure(mut self) -> Self {
        self.secure = true;
        self
    }

    pub fn http_only(mut self) -> Self {
        self.http_only = true;
        self
    }

    pub fn same_site(mut self, same_site: SameSite) -> Self {
        self.same_site = Some(same_site);
        self
    }

    /// Serialize to Set-Cookie header value
    pub fn to_header_value(&self) -> String {
        let mut parts = vec![format!("{}={}", self.name, self.value)];

        if let Some(ref path) = self.path {
            parts.push(format!("Path={}", path));
        }
        if let Some(ref domain) = self.domain {
            parts.push(format!("Domain={}", domain));
        }
        if let Some(max_age) = self.max_age {
            parts.push(format!("Max-Age={}", max_age));
        }
        if self.secure {
            parts.push("Secure".to_string());
        }
        if self.http_only {
            parts.push("HttpOnly".to_string());
        }
        if let Some(same_site) = self.same_site {
            parts.push(format!("SameSite={}", same_site.as_str()));
        }

        parts.join("; ")
    }

    /// Create a deletion cookie (max-age=0)
    pub fn delete(name: impl Into<String>) -> Self {
        Self::new(name, "").max_age(0)
    }
}

/// Cookie jar for managing multiple cookies
#[derive(Debug, Default)]
pub struct CookieJar {
    cookies: HashMap<String, Cookie>,
    pending: SmallVec<[Cookie; 4]>,
}

impl CookieJar {
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse cookies from Cookie header
    pub fn parse(header: &str) -> Self {
        let mut jar = Self::new();

        for part in header.split(';') {
            let part = part.trim();
            if let Some((name, value)) = part.split_once('=') {
                let cookie = Cookie::new(name.trim(), value.trim());
                jar.cookies.insert(cookie.name.clone(), cookie);
            }
        }

        jar
    }

    /// Get a cookie by name
    pub fn get(&self, name: &str) -> Option<&Cookie> {
        self.cookies.get(name)
    }

    /// Get cookie value by name
    pub fn get_value(&self, name: &str) -> Option<&str> {
        self.cookies.get(name).map(|c| c.value.as_str())
    }

    /// Add a cookie to be set
    pub fn set(&mut self, cookie: Cookie) {
        self.pending.push(cookie);
    }

    /// Remove a cookie
    pub fn remove(&mut self, name: &str) {
        self.pending.push(Cookie::delete(name));
    }

    /// Get all pending Set-Cookie headers
    pub fn pending_headers(&self) -> impl Iterator<Item = String> + '_ {
        self.pending.iter().map(|c| c.to_header_value())
    }

    /// Check if jar has a cookie
    pub fn contains(&self, name: &str) -> bool {
        self.cookies.contains_key(name)
    }

    /// Get all cookie names
    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.cookies.keys().map(|s| s.as_str())
    }
}

/// Cookie middleware - parses cookies into request
pub struct Cookies;

impl Cookies {
    pub fn new() -> Self {
        Self
    }
}

impl Default for Cookies {
    fn default() -> Self {
        Self::new()
    }
}

impl Middleware for Cookies {
    fn before(&self, _req: &mut Request) -> Option<Response> {
        // Parse cookies - would need to store in request extensions
        // For now, parsing is done on-demand via CookieJar::parse
        None
    }

    fn after(&self, _req: &Request, _res: &mut Response) {
        // Apply pending cookies from jar
        // Would need access to cookie jar from request
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cookie_serialize() {
        let cookie = Cookie::new("session", "abc123")
            .path("/")
            .secure()
            .http_only()
            .same_site(SameSite::Strict);

        let header = cookie.to_header_value();
        assert!(header.contains("session=abc123"));
        assert!(header.contains("Path=/"));
        assert!(header.contains("Secure"));
        assert!(header.contains("HttpOnly"));
        assert!(header.contains("SameSite=Strict"));
    }

    #[test]
    fn test_cookie_jar_parse() {
        let jar = CookieJar::parse("session=abc123; theme=dark; lang=en");

        assert_eq!(jar.get_value("session"), Some("abc123"));
        assert_eq!(jar.get_value("theme"), Some("dark"));
        assert_eq!(jar.get_value("lang"), Some("en"));
        assert_eq!(jar.get_value("missing"), None);
    }

    #[test]
    fn test_cookie_delete() {
        let cookie = Cookie::delete("session");
        assert_eq!(cookie.max_age, Some(0));
    }
}
