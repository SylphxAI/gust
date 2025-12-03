//! Native HTTP server implementation
//!
//! High-performance server using hyper with:
//! - Multi-threaded tokio runtime
//! - Per-method routing for O(1) dispatch
//! - SO_REUSEPORT for load balancing
//! - TCP_NODELAY for low latency

use crate::{Method, Request, Response, Router, Match, StatusCode};
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
    pub handler_id: u32,
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
///
/// Uses handler IDs (u32) for routing, with separate storage for:
/// - Static responses (pre-rendered bytes by handler ID)
/// - Dynamic handlers (by handler ID)
pub struct ServerState {
    /// Router using handler IDs
    pub router: RwLock<Router>,
    /// Static responses indexed by handler ID
    pub static_responses: RwLock<HashMap<u32, Bytes>>,
    /// Dynamic handlers indexed by handler ID
    pub dynamic_handlers: RwLock<HashMap<u32, DynamicHandler>>,
}

impl ServerState {
    pub fn new() -> Self {
        Self {
            router: RwLock::new(Router::new()),
            static_responses: RwLock::new(HashMap::new()),
            dynamic_handlers: RwLock::new(HashMap::new()),
        }
    }

    /// Add a static route
    pub fn add_static(&self, route: StaticRoute) -> crate::Result<()> {
        let response_bytes = route.to_response_bytes();
        self.router.write().insert(&route.method, &route.path, route.handler_id);
        self.static_responses.write().insert(route.handler_id, response_bytes);
        Ok(())
    }

    /// Add a dynamic route
    pub fn add_dynamic(&self, method: &str, path: &str, handler_id: u32, handler: DynamicHandler) -> crate::Result<()> {
        self.router.write().insert(method, path, handler_id);
        self.dynamic_handlers.write().insert(handler_id, handler);
        Ok(())
    }

    /// Match and handle a request
    pub async fn handle(&self, req: Request) -> Response {
        let method_str = req.method.to_string();

        // Find matching route
        if let Some(matched) = self.router.read().find(&method_str, &req.path) {
            let handler_id = matched.handler_id;

            // Try static response first (fastest path)
            if let Some(bytes) = self.static_responses.read().get(&handler_id).cloned() {
                // Static route - return pre-rendered response
                // For now, return ok() as placeholder since bytes are handled elsewhere
                return Response::ok();
            }

            // Try dynamic handler
            if let Some(handler) = self.dynamic_handlers.read().get(&handler_id).cloned() {
                let mut request = req;
                request.params = matched.params.into_iter().collect();
                return handler(request).await;
            }
        }

        // 404 Not Found
        Response::not_found()
    }

    /// Get pre-rendered static response if available
    pub fn get_static_response(&self, method: Method, path: &str) -> Option<Bytes> {
        let method_str = method.to_string();
        self.router
            .read()
            .find(&method_str, path)
            .and_then(|m| self.static_responses.read().get(&m.handler_id).cloned())
    }

    /// Get matched route info (handler_id and params)
    pub fn match_route(&self, method: &str, path: &str) -> Option<Match> {
        self.router.read().find(method, path)
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

// ============================================================================
// Connection Tracking for Graceful Shutdown
// ============================================================================

use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};

/// Tracks active connections for graceful shutdown
///
/// Used to:
/// - Count active connections
/// - Signal shutdown to reject new connections
/// - Wait for existing connections to drain
#[derive(Debug)]
pub struct ConnectionTracker {
    /// Active connection count
    active: AtomicU64,
    /// Shutdown signal received
    shutting_down: AtomicBool,
}

impl Default for ConnectionTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl ConnectionTracker {
    /// Create a new connection tracker
    pub fn new() -> Self {
        Self {
            active: AtomicU64::new(0),
            shutting_down: AtomicBool::new(false),
        }
    }

    /// Increment active connection count
    #[inline]
    pub fn increment(&self) {
        self.active.fetch_add(1, Ordering::SeqCst);
    }

    /// Decrement active connection count
    #[inline]
    pub fn decrement(&self) {
        self.active.fetch_sub(1, Ordering::SeqCst);
    }

    /// Get current active connection count
    #[inline]
    pub fn count(&self) -> u64 {
        self.active.load(Ordering::SeqCst)
    }

    /// Signal that shutdown is in progress
    pub fn start_shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
    }

    /// Check if shutdown is in progress
    #[inline]
    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(Ordering::SeqCst)
    }

    /// Reset shutdown state (for testing or restart)
    pub fn reset(&self) {
        self.shutting_down.store(false, Ordering::SeqCst);
        self.active.store(0, Ordering::SeqCst);
    }
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
            handler_id: 0,
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
            handler_id: 0,
        }).unwrap();

        let response = state.get_static_response(Method::Get, "/health");
        assert!(response.is_some());
    }

    #[test]
    fn test_match_route() {
        let state = ServerState::new();

        state.add_static(StaticRoute {
            method: "GET".to_string(),
            path: "/users/:id".to_string(),
            status: 200,
            content_type: "application/json".to_string(),
            body: r#"{}"#.to_string(),
            handler_id: 1,
        }).unwrap();

        let matched = state.match_route("GET", "/users/123");
        assert!(matched.is_some());
        let m = matched.unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(m.params, vec![("id".to_string(), "123".to_string())]);
    }
}
