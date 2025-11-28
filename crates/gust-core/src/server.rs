//! Native HTTP server implementation
//!
//! High-performance server using hyper with:
//! - Multi-threaded tokio runtime
//! - Per-method routing for O(1) dispatch
//! - SO_REUSEPORT for load balancing
//! - TCP_NODELAY for low latency

use crate::{Method, Request, Response, Router, StatusCode};
use bytes::Bytes;
use http_body_util::Full;
use hyper::body::Incoming;
use parking_lot::RwLock;
use socket2::{Domain, Protocol, Socket, Type};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

/// Server configuration
#[derive(Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub hostname: String,
    pub workers: usize,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3000,
            hostname: "0.0.0.0".to_string(),
            workers: num_cpus::get(),
        }
    }
}

/// Static route configuration
#[derive(Clone)]
pub struct StaticRoute {
    pub method: String,
    pub path: String,
    pub status: u16,
    pub content_type: String,
    pub body: String,
}

impl StaticRoute {
    /// Convert to pre-rendered HTTP/1.1 response bytes
    pub fn to_response_bytes(&self) -> Bytes {
        let _response = Response::json(self.body.as_bytes().to_vec());
        let res = crate::ResponseBuilder::new(StatusCode(self.status))
            .header("content-type", &self.content_type)
            .body(self.body.clone())
            .build();
        res.to_http1_bytes()
    }
}

/// Dynamic route handler type
pub type DynamicHandler = Arc<
    dyn Fn(Request) -> std::pin::Pin<Box<dyn std::future::Future<Output = Response> + Send>>
        + Send
        + Sync,
>;

/// Server state shared across all connections
pub struct ServerState {
    /// Static routes (pre-rendered responses)
    pub static_routes: RwLock<Router<Bytes>>,
    /// Dynamic routes
    pub dynamic_routes: RwLock<Router<DynamicHandler>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            static_routes: RwLock::new(Router::new()),
            dynamic_routes: RwLock::new(Router::new()),
        }
    }

    /// Add a static route
    pub fn add_static(&self, route: StaticRoute) -> crate::Result<()> {
        let method = Method::from_str(&route.method)?;
        let response_bytes = route.to_response_bytes();
        self.static_routes
            .write()
            .route(method, &route.path, response_bytes)
    }

    /// Add a dynamic route
    pub fn add_dynamic(&self, method: &str, path: &str, handler: DynamicHandler) -> crate::Result<()> {
        let method = Method::from_str(method)?;
        self.dynamic_routes.write().route(method, path, handler)
    }

    /// Match and handle a request
    pub async fn handle(&self, req: Request) -> Response {
        // Try static routes first (fastest path)
        if let Some(_matched) = self.static_routes.read().match_route(req.method, &req.path) {
            // Static route - return pre-rendered response
            // Note: For static routes, we bypass normal response building
            // The caller will use the raw bytes directly
            return Response::ok(); // Placeholder - actual bytes handled separately
        }

        // Try dynamic routes
        if let Some(matched) = self.dynamic_routes.read().match_route(req.method, &req.path) {
            let mut request = req;
            request.params = matched.params;
            return (matched.value)(request).await;
        }

        // 404 Not Found
        Response::not_found()
    }

    /// Get pre-rendered static response if available
    pub fn get_static_response(&self, method: Method, path: &str) -> Option<Bytes> {
        self.static_routes
            .read()
            .match_route(method, path)
            .map(|m| m.value)
    }
}

impl Default for ServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Create a TCP socket with optimizations
pub fn create_optimized_socket(addr: &SocketAddr) -> std::io::Result<Socket> {
    let domain = if addr.is_ipv4() {
        Domain::IPV4
    } else {
        Domain::IPV6
    };

    let socket = Socket::new(domain, Type::STREAM, Some(Protocol::TCP))?;

    // SO_REUSEADDR - allow binding to address in TIME_WAIT
    socket.set_reuse_address(true)?;

    // SO_REUSEPORT - enable kernel load balancing across threads
    #[cfg(unix)]
    socket.set_reuse_port(true)?;

    // TCP_NODELAY - disable Nagle's algorithm for lower latency
    socket.set_nodelay(true)?;

    // Bind
    socket.bind(&(*addr).into())?;

    // Listen with backlog
    socket.listen(1024)?;

    Ok(socket)
}

/// Convert hyper request to our Request type
pub fn from_hyper_request(
    req: hyper::Request<Incoming>,
    params: HashMap<String, String>,
) -> Request {
    let method = Method::from_str(req.method().as_str()).unwrap_or(Method::Get);
    let uri = req.uri();
    let path = uri.path().to_string();
    let query = uri.query().map(|s| s.to_string());

    let mut request = Request::new(method, path);
    request.query = query;
    request.params = params;

    // Copy headers
    for (name, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            request.headers.push((name.to_string(), v.to_string()));
        }
    }

    request
}

/// Convert our Response to hyper Response
pub fn to_hyper_response(res: Response) -> hyper::Response<Full<Bytes>> {
    let mut builder = hyper::Response::builder().status(res.status.as_u16());

    for (name, value) in &res.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }

    builder.body(Full::new(res.body)).unwrap()
}

/// Create a hyper Response from pre-rendered bytes
pub fn bytes_to_hyper_response(bytes: Bytes) -> hyper::Response<Full<Bytes>> {
    // For maximum performance, we could send raw bytes directly
    // But hyper expects a proper Response structure
    // TODO: Consider using a custom body type for zero-copy

    hyper::Response::builder()
        .status(200)
        .header("content-type", "application/json")
        .body(Full::new(bytes))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_static_route_to_bytes() {
        let route = StaticRoute {
            method: "GET".to_string(),
            path: "/".to_string(),
            status: 200,
            content_type: "application/json".to_string(),
            body: r#"{"hello":"world"}"#.to_string(),
        };

        let bytes = route.to_response_bytes();
        let s = std::str::from_utf8(&bytes).unwrap();
        assert!(s.contains("HTTP/1.1 200"));
        assert!(s.contains("content-type: application/json"));
    }

    #[test]
    fn test_server_state() {
        let state = ServerState::new();

        state.add_static(StaticRoute {
            method: "GET".to_string(),
            path: "/health".to_string(),
            status: 200,
            content_type: "application/json".to_string(),
            body: r#"{"status":"ok"}"#.to_string(),
        }).unwrap();

        let response = state.get_static_response(Method::Get, "/health");
        assert!(response.is_some());
    }
}
