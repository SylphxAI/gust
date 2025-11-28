//! Native Node.js bindings for gust-core via napi-rs
//!
//! High-performance native HTTP server for Node.js/Bun.
//! Uses gust-core for shared logic.

use bytes::Bytes;
use gust_core::{
    Method, Request, Response, ResponseBuilder, Router, StatusCode,
    middleware::MiddlewareChain,
};
use http_body_util::Full;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

// Use mimalloc for better performance
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// Request context passed to JS handlers
#[napi(object)]
#[derive(Clone)]
pub struct RequestContext {
    pub method: String,
    pub path: String,
    pub params: HashMap<String, String>,
    pub query: Option<String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// Response from JS handler
#[napi(object)]
pub struct ResponseData {
    pub status: u32,
    pub headers: HashMap<String, String>,
    pub body: String,
}

/// CORS configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct CorsConfig {
    /// Allowed origins (use "*" for any, or specify domains)
    pub origins: Option<Vec<String>>,
    /// Allowed HTTP methods
    pub methods: Option<Vec<String>>,
    /// Allowed headers
    pub allowed_headers: Option<Vec<String>>,
    /// Exposed headers
    pub exposed_headers: Option<Vec<String>>,
    /// Allow credentials
    pub credentials: Option<bool>,
    /// Max age in seconds
    pub max_age: Option<u32>,
}

/// Rate limiting configuration
#[napi(object)]
#[derive(Clone)]
pub struct RateLimitConfig {
    /// Maximum requests per window
    pub max_requests: u32,
    /// Window size in seconds
    pub window_seconds: u32,
    /// Key extractor: "ip", "header:X-Api-Key", etc.
    pub key_by: Option<String>,
}

/// Security headers configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct SecurityConfig {
    /// Enable HSTS (default: true)
    pub hsts: Option<bool>,
    /// HSTS max-age in seconds (default: 31536000 = 1 year)
    pub hsts_max_age: Option<u32>,
    /// X-Frame-Options: "DENY", "SAMEORIGIN"
    pub frame_options: Option<String>,
    /// X-Content-Type-Options: nosniff
    pub content_type_options: Option<bool>,
    /// X-XSS-Protection
    pub xss_protection: Option<bool>,
    /// Referrer-Policy
    pub referrer_policy: Option<String>,
}

/// Compression configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct CompressionConfig {
    /// Enable gzip
    pub gzip: Option<bool>,
    /// Enable brotli
    pub brotli: Option<bool>,
    /// Minimum size to compress (bytes)
    pub threshold: Option<u32>,
    /// Compression level (1-9 for gzip, 1-11 for brotli)
    pub level: Option<u32>,
}

/// Server configuration
#[napi(object)]
#[derive(Clone, Default)]
pub struct ServerConfig {
    /// Port to listen on
    pub port: Option<u32>,
    /// Hostname to bind to
    pub hostname: Option<String>,
    /// Number of worker threads
    pub workers: Option<u32>,
    /// CORS configuration
    pub cors: Option<CorsConfig>,
    /// Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,
    /// Security headers configuration
    pub security: Option<SecurityConfig>,
    /// Compression configuration
    pub compression: Option<CompressionConfig>,
}

/// Pre-rendered static response
#[derive(Clone)]
struct StaticResponse {
    bytes: Bytes,
}

/// Server state shared across all connections
struct ServerState {
    /// Static routes (pre-rendered responses)
    static_routes: RwLock<Router<StaticResponse>>,
    /// Middleware chain
    middleware: RwLock<MiddlewareChain>,
}

impl ServerState {
    fn new() -> Self {
        Self {
            static_routes: RwLock::new(Router::new()),
            middleware: RwLock::new(MiddlewareChain::new()),
        }
    }
}

/// Native HTTP server
#[napi]
pub struct GustServer {
    state: Arc<ServerState>,
    shutdown_tx: Arc<RwLock<Option<tokio::sync::oneshot::Sender<()>>>>,
}

#[napi]
impl GustServer {
    /// Create a new server instance
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
        }
    }

    /// Create a server with configuration
    #[napi(factory)]
    pub async fn with_config(config: ServerConfig) -> Result<Self> {
        let server = Self::new();

        // Apply middleware from config
        if let Some(cors) = config.cors {
            server.enable_cors(cors).await?;
        }

        if let Some(rate_limit) = config.rate_limit {
            server.enable_rate_limit(rate_limit).await?;
        }

        if let Some(security) = config.security {
            server.enable_security(security).await?;
        }

        Ok(server)
    }

    /// Enable CORS middleware
    #[napi]
    pub async fn enable_cors(&self, config: CorsConfig) -> Result<()> {
        use gust_core::middleware::cors::{Cors, CorsConfig as CoreConfig};

        let mut core_config = if config.origins.as_ref().map(|o| o.contains(&"*".to_string())).unwrap_or(false) {
            CoreConfig::default().allow_all_origins()
        } else {
            CoreConfig::default()
        };

        // Apply origins
        if let Some(origins) = config.origins {
            for origin in origins {
                if origin != "*" {
                    core_config = core_config.allow_origin(origin);
                }
            }
        }

        // Apply methods
        if let Some(methods) = config.methods {
            for method in methods {
                if let Ok(m) = Method::from_str(&method) {
                    core_config = core_config.allow_method(m);
                }
            }
        }

        // Apply headers
        if let Some(headers) = config.allowed_headers {
            for header in headers {
                core_config = core_config.allow_header(header);
            }
        }

        // Apply exposed headers
        if let Some(headers) = config.exposed_headers {
            for header in headers {
                core_config = core_config.expose_header(header);
            }
        }

        // Apply credentials
        if let Some(true) = config.credentials {
            core_config = core_config.allow_credentials();
        }

        // Apply max age
        if let Some(max_age) = config.max_age {
            core_config = core_config.max_age(max_age);
        }

        let cors = Cors::new(core_config);
        self.state.middleware.write().await.add(cors);
        Ok(())
    }

    /// Enable rate limiting middleware
    #[napi]
    pub async fn enable_rate_limit(&self, config: RateLimitConfig) -> Result<()> {
        use gust_core::middleware::rate_limit::{RateLimit, RateLimitConfig as CoreConfig};

        let core_config = CoreConfig::new(
            config.max_requests,
            Duration::from_secs(config.window_seconds as u64),
        );

        let rate_limit = RateLimit::new(core_config);
        self.state.middleware.write().await.add(rate_limit);
        Ok(())
    }

    /// Enable security headers middleware
    #[napi]
    pub async fn enable_security(&self, config: SecurityConfig) -> Result<()> {
        use gust_core::middleware::security::{Security, SecurityConfig as CoreConfig, FrameOptions, HstsConfig};

        let frame_options = match config.frame_options.as_deref() {
            Some("DENY") => FrameOptions::Deny,
            Some("SAMEORIGIN") => FrameOptions::SameOrigin,
            _ => FrameOptions::None,
        };

        let hsts = if config.hsts.unwrap_or(false) {
            Some(HstsConfig {
                max_age: config.hsts_max_age.unwrap_or(31536000) as u64,
                include_subdomains: true,
                preload: false,
            })
        } else {
            None
        };

        let core_config = CoreConfig {
            csp: None,
            frame_options,
            content_type_options: config.content_type_options.unwrap_or(false),
            xss_protection: config.xss_protection.unwrap_or(false),
            hsts,
            referrer_policy: config.referrer_policy,
            permissions_policy: None,
            coop: None,
            coep: None,
            corp: None,
        };

        let security = Security::new(core_config);
        self.state.middleware.write().await.add(security);
        Ok(())
    }

    /// Add a static route (pre-rendered response)
    #[napi]
    pub async fn add_static_route(
        &self,
        method: String,
        path: String,
        status: u32,
        content_type: String,
        body: String,
    ) -> Result<()> {
        let method_enum = Method::from_str(&method)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        // Pre-render the HTTP/1.1 response
        let res = ResponseBuilder::new(StatusCode(status as u16))
            .header("content-type", &content_type)
            .body(body.clone())
            .build();
        let response_bytes = res.to_http1_bytes();

        let static_response = StaticResponse {
            bytes: response_bytes,
        };

        self.state
            .static_routes
            .write()
            .await
            .route(method_enum, &path, static_response)
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Start the server (non-blocking)
    #[napi]
    pub async fn serve(&self, port: u32) -> Result<()> {
        use hyper::server::conn::http1;
        use hyper::service::service_fn;
        use hyper_util::rt::TokioIo;
        use std::net::SocketAddr;
        use tokio::net::TcpListener;

        let addr: SocketAddr = format!("0.0.0.0:{}", port)
            .parse()
            .map_err(|e| Error::from_reason(format!("Invalid port: {}", e)))?;

        let state = self.state.clone();

        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        *self.shutdown_tx.write().await = Some(shutdown_tx);

        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| Error::from_reason(format!("Bind error: {}", e)))?;

        // Spawn server task
        tokio::spawn(async move {
            tokio::select! {
                _ = async {
                    loop {
                        let (stream, _) = match listener.accept().await {
                            Ok(conn) => conn,
                            Err(_) => continue,
                        };

                        let state = state.clone();
                        tokio::spawn(async move {
                            let io = TokioIo::new(stream);
                            let service = service_fn(move |req| {
                                let state = state.clone();
                                async move {
                                    handle_request(state, req).await
                                }
                            });

                            if let Err(e) = http1::Builder::new()
                                .serve_connection(io, service)
                                .await
                            {
                                eprintln!("Connection error: {}", e);
                            }
                        });
                    }
                } => {}
                _ = shutdown_rx => {
                    // Graceful shutdown
                }
            }
        });

        Ok(())
    }

    /// Shutdown the server
    #[napi]
    pub async fn shutdown(&self) {
        if let Some(tx) = self.shutdown_tx.write().await.take() {
            let _ = tx.send(());
        }
    }
}

impl Default for GustServer {
    fn default() -> Self {
        GustServer {
            state: Arc::new(ServerState::new()),
            shutdown_tx: Arc::new(RwLock::new(None)),
        }
    }
}

/// Handle incoming HTTP request
async fn handle_request(
    state: Arc<ServerState>,
    req: hyper::Request<hyper::body::Incoming>,
) -> std::result::Result<hyper::Response<Full<Bytes>>, std::convert::Infallible> {
    let method_str = req.method().as_str();
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|s| s.to_string());

    // Create our Request type
    let method = Method::from_str(method_str).unwrap_or(Method::Get);
    let mut request = Request::new(method, path.clone());
    request.query = query;

    // Copy headers
    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            request.headers.push((name.to_string(), v.to_string()));
        }
    }

    // Apply middleware chain (before)
    let middleware = state.middleware.read().await;
    if let Some(early_response) = middleware.run_before(&mut request) {
        // Middleware short-circuited - return early response
        return Ok(to_hyper_response(early_response));
    }

    // Try to match static route
    let routes = state.static_routes.read().await;
    let mut our_response = if let Some(matched) = routes.match_route(request.method, &path) {
        // Return pre-rendered response
        let response_bytes = matched.value.bytes.clone();
        Response::json(response_bytes)
    } else {
        // 404 Not Found
        Response::not_found()
    };

    // Apply middleware chain (after)
    middleware.run_after(&request, &mut our_response);

    Ok(to_hyper_response(our_response))
}

/// Convert our Response to hyper Response
fn to_hyper_response(res: Response) -> hyper::Response<Full<Bytes>> {
    let mut builder = hyper::Response::builder().status(res.status.as_u16());

    for (name, value) in &res.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }

    builder.body(Full::new(res.body)).unwrap()
}

/// Check if io_uring is available (Linux kernel 5.1+)
#[napi]
pub fn is_io_uring_available() -> bool {
    #[cfg(all(target_os = "linux", feature = "io_uring"))]
    {
        true
    }
    #[cfg(not(all(target_os = "linux", feature = "io_uring")))]
    {
        false
    }
}

/// Get the number of CPU cores
#[napi]
pub fn get_cpu_count() -> u32 {
    num_cpus::get() as u32
}

/// Create a CORS middleware with permissive settings
#[napi]
pub fn cors_permissive() -> CorsConfig {
    CorsConfig {
        origins: Some(vec!["*".to_string()]),
        methods: Some(vec!["GET".to_string(), "POST".to_string(), "PUT".to_string(), "DELETE".to_string(), "PATCH".to_string(), "OPTIONS".to_string()]),
        allowed_headers: Some(vec!["*".to_string()]),
        exposed_headers: None,
        credentials: Some(true),
        max_age: Some(86400),
    }
}

/// Create security headers with strict defaults
#[napi]
pub fn security_strict() -> SecurityConfig {
    SecurityConfig {
        hsts: Some(true),
        hsts_max_age: Some(31536000),
        frame_options: Some("DENY".to_string()),
        content_type_options: Some(true),
        xss_protection: Some(true),
        referrer_policy: Some("strict-origin-when-cross-origin".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_creation() {
        let _server = GustServer::new();
    }

    #[test]
    fn test_cors_permissive() {
        let cors = cors_permissive();
        assert_eq!(cors.origins, Some(vec!["*".to_string()]));
        assert!(cors.credentials.unwrap());
    }

    #[test]
    fn test_security_strict() {
        let security = security_strict();
        assert!(security.hsts.unwrap());
        assert_eq!(security.frame_options, Some("DENY".to_string()));
    }
}
