//! Native Node.js bindings for gust-core via napi-rs
//!
//! High-performance native HTTP server for Node.js/Bun.
//! Uses gust-core for shared logic.

use bytes::Bytes;
use gust_core::{Method, Response, ResponseBuilder, Router, StatusCode};
use http_body_util::Full;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Arc;
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

/// Pre-rendered static response
#[derive(Clone)]
struct StaticResponse {
    bytes: Bytes,
}

/// Server state shared across all connections
struct ServerState {
    /// Static routes (pre-rendered responses)
    static_routes: RwLock<Router<StaticResponse>>,
}

impl ServerState {
    fn new() -> Self {
        Self {
            static_routes: RwLock::new(Router::new()),
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
        let _response = Response::json(body.as_bytes().to_vec());
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
    let path = req.uri().path();

    // Try to match static route
    if let Ok(method) = Method::from_str(method_str) {
        let routes = state.static_routes.read().await;
        if let Some(matched) = routes.match_route(method, path) {
            // Return pre-rendered response as raw bytes
            // For true zero-copy, we need to return raw bytes
            // But hyper expects proper Response structure
            let response_bytes = matched.value.bytes.clone();

            // Parse the pre-rendered response to extract status/headers
            // For now, just return as 200 JSON
            return Ok(hyper::Response::builder()
                .status(200)
                .header("content-type", "application/json")
                .body(Full::new(response_bytes))
                .unwrap());
        }
    }

    // 404 Not Found
    Ok(hyper::Response::builder()
        .status(404)
        .header("content-type", "text/plain")
        .body(Full::new(Bytes::from("Not Found")))
        .unwrap())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_creation() {
        let server = GustServer::new();
        assert!(server.shutdown_tx.is_none());
    }
}
