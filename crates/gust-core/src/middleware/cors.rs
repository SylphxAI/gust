//! CORS (Cross-Origin Resource Sharing) middleware
//!
//! Handles preflight requests and adds CORS headers.

use crate::{Request, Response, ResponseBuilder, StatusCode, Method};
use super::Middleware;
use smallvec::SmallVec;

/// CORS configuration
#[derive(Clone)]
pub struct CorsConfig {
    /// Allowed origins (empty = all)
    pub origins: SmallVec<[String; 4]>,
    /// Allowed methods
    pub methods: SmallVec<[Method; 8]>,
    /// Allowed headers
    pub headers: SmallVec<[String; 8]>,
    /// Exposed headers
    pub expose_headers: SmallVec<[String; 4]>,
    /// Allow credentials
    pub credentials: bool,
    /// Max age (seconds)
    pub max_age: u32,
}

impl Default for CorsConfig {
    fn default() -> Self {
        Self {
            origins: SmallVec::new(), // Empty = allow all
            methods: smallvec::smallvec![
                Method::Get,
                Method::Post,
                Method::Put,
                Method::Delete,
                Method::Patch,
                Method::Head,
                Method::Options,
            ],
            headers: smallvec::smallvec![
                "Content-Type".to_string(),
                "Authorization".to_string(),
                "X-Requested-With".to_string(),
            ],
            expose_headers: SmallVec::new(),
            credentials: false,
            max_age: 86400, // 24 hours
        }
    }
}

impl CorsConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn allow_origin(mut self, origin: impl Into<String>) -> Self {
        self.origins.push(origin.into());
        self
    }

    pub fn allow_all_origins(mut self) -> Self {
        self.origins.clear();
        self
    }

    pub fn allow_method(mut self, method: Method) -> Self {
        if !self.methods.contains(&method) {
            self.methods.push(method);
        }
        self
    }

    pub fn allow_header(mut self, header: impl Into<String>) -> Self {
        self.headers.push(header.into());
        self
    }

    pub fn expose_header(mut self, header: impl Into<String>) -> Self {
        self.expose_headers.push(header.into());
        self
    }

    pub fn allow_credentials(mut self) -> Self {
        self.credentials = true;
        self
    }

    pub fn max_age(mut self, seconds: u32) -> Self {
        self.max_age = seconds;
        self
    }
}

/// CORS middleware
pub struct Cors {
    config: CorsConfig,
}

impl Cors {
    pub fn new(config: CorsConfig) -> Self {
        Self { config }
    }

    /// Simple CORS - allow all origins
    pub fn permissive() -> Self {
        Self::new(CorsConfig::default().allow_all_origins())
    }

    fn is_origin_allowed(&self, origin: &str) -> bool {
        if self.config.origins.is_empty() {
            return true; // Allow all
        }
        self.config.origins.iter().any(|o| o == origin || o == "*")
    }

    fn methods_string(&self) -> String {
        self.config
            .methods
            .iter()
            .map(|m| m.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }

    fn headers_string(&self) -> String {
        self.config.headers.join(", ")
    }

    fn add_cors_headers(&self, res: &mut Response, origin: &str) {
        // Origin
        let origin_value = if self.config.origins.is_empty() {
            "*".to_string()
        } else {
            origin.to_string()
        };
        res.headers.push(("Access-Control-Allow-Origin".to_string(), origin_value));

        // Methods
        res.headers.push((
            "Access-Control-Allow-Methods".to_string(),
            self.methods_string(),
        ));

        // Headers
        if !self.config.headers.is_empty() {
            res.headers.push((
                "Access-Control-Allow-Headers".to_string(),
                self.headers_string(),
            ));
        }

        // Expose headers
        if !self.config.expose_headers.is_empty() {
            res.headers.push((
                "Access-Control-Expose-Headers".to_string(),
                self.config.expose_headers.join(", "),
            ));
        }

        // Credentials
        if self.config.credentials {
            res.headers.push((
                "Access-Control-Allow-Credentials".to_string(),
                "true".to_string(),
            ));
        }

        // Max age
        res.headers.push((
            "Access-Control-Max-Age".to_string(),
            self.config.max_age.to_string(),
        ));
    }
}

impl Middleware for Cors {
    fn before(&self, req: &mut Request) -> Option<Response> {
        let origin = req.header("origin").unwrap_or("");

        // No origin header = same-origin request, skip CORS
        if origin.is_empty() {
            return None;
        }

        // Check if origin is allowed
        if !self.is_origin_allowed(origin) {
            return Some(
                ResponseBuilder::new(StatusCode::FORBIDDEN)
                    .body("CORS: Origin not allowed")
                    .build(),
            );
        }

        // Handle preflight (OPTIONS)
        if req.method == Method::Options {
            let mut res = ResponseBuilder::new(StatusCode::NO_CONTENT)
                .body("")
                .build();
            self.add_cors_headers(&mut res, origin);
            return Some(res);
        }

        // Store origin for after() - use extension or similar
        // For now we'll re-extract in after()
        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        let origin = req.header("origin").unwrap_or("");
        if !origin.is_empty() && self.is_origin_allowed(origin) {
            self.add_cors_headers(res, origin);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cors_permissive() {
        let cors = Cors::permissive();
        assert!(cors.is_origin_allowed("https://example.com"));
        assert!(cors.is_origin_allowed("http://localhost:3000"));
    }

    #[test]
    fn test_cors_specific_origin() {
        let config = CorsConfig::new()
            .allow_origin("https://example.com");
        let cors = Cors::new(config);

        assert!(cors.is_origin_allowed("https://example.com"));
        assert!(!cors.is_origin_allowed("https://other.com"));
    }

    #[test]
    fn test_cors_methods() {
        let config = CorsConfig::new();
        let cors = Cors::new(config);

        assert!(cors.methods_string().contains("GET"));
        assert!(cors.methods_string().contains("POST"));
    }
}
