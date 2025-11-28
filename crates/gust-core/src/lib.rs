//! gust-core: High-performance HTTP server core
//!
//! This library is designed to be shared between WASM and Native bindings.
//! All platform-specific code is gated behind feature flags.
//!
//! ## Features
//! - `native` - Native server with tokio/hyper
//! - `tls` - TLS support via rustls
//! - `compress` - Compression support (gzip, brotli)

#![forbid(unsafe_code)]
#![warn(clippy::all)]

pub mod error;
pub mod request;
pub mod response;
pub mod router;
pub mod middleware;
pub mod handlers;

#[cfg(feature = "native")]
pub mod http2;

#[cfg(feature = "native")]
pub mod server;

#[cfg(feature = "tls")]
pub mod tls;

// Re-exports
pub use error::{Error, Result};
pub use request::{Method, Request, RequestBuilder};
pub use response::{Response, ResponseBuilder, StatusCode};
pub use router::{Router, RouteMatch};

// Middleware re-exports
pub use middleware::{Middleware, MiddlewareChain};

// Handlers re-exports
pub use handlers::{
    WebSocket, WebSocketMessage, WebSocketHandler,
    Frame as WebSocketFrame, Opcode as WebSocketOpcode, CloseFrame as WebSocketCloseFrame,
    is_websocket_upgrade, generate_accept_key, upgrade_response as websocket_upgrade_response,
    Sse, SseEvent, SseStream,
    StaticFiles, StaticFileConfig,
    Health, HealthCheck, HealthStatus,
};

#[cfg(feature = "native")]
pub use server::{ServerConfig, ServerState, StaticRoute, DynamicHandler};

#[cfg(feature = "native")]
pub use server::{create_optimized_socket, from_hyper_request, to_hyper_response};

#[cfg(feature = "native")]
pub use http2::{Http2Settings, Http2Response, PushPromise, Priority, ConnectionInfo};

#[cfg(feature = "tls")]
pub use tls::{TlsConfig, load_certs, load_private_key};
