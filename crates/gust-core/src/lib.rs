//! gust-core: High-performance HTTP server core
//!
//! This library is designed to be shared between WASM and Native bindings.
//! All platform-specific code is gated behind feature flags.

#![forbid(unsafe_code)]
#![warn(clippy::all)]

pub mod error;
pub mod request;
pub mod response;
pub mod router;

#[cfg(feature = "native")]
pub mod server;

#[cfg(feature = "tls")]
pub mod tls;

// Re-exports
pub use error::{Error, Result};
pub use request::{Method, Request, RequestBuilder};
pub use response::{Response, ResponseBuilder, StatusCode};
pub use router::{Router, RouteMatch};

#[cfg(feature = "native")]
pub use server::{ServerConfig, ServerState, StaticRoute, DynamicHandler};

#[cfg(feature = "native")]
pub use server::{create_optimized_socket, from_hyper_request, to_hyper_response};

#[cfg(feature = "tls")]
pub use tls::{TlsConfig, load_certs, load_private_key};
