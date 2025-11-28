//! Error types for gust-core

use thiserror::Error;

/// Result type alias for gust operations
pub type Result<T> = std::result::Result<T, Error>;

/// Error types for the gust HTTP server
#[derive(Debug, Error)]
pub enum Error {
    /// Invalid HTTP method
    #[error("Invalid HTTP method: {0}")]
    InvalidMethod(String),

    /// Invalid path
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    /// Route not found
    #[error("Route not found: {method} {path}")]
    RouteNotFound { method: String, path: String },

    /// Invalid header
    #[error("Invalid header: {0}")]
    InvalidHeader(String),

    /// Body too large
    #[error("Body too large: {size} bytes exceeds limit of {limit} bytes")]
    BodyTooLarge { size: usize, limit: usize },

    /// Parse error
    #[error("Parse error: {0}")]
    Parse(String),

    /// IO error (native only)
    #[cfg(feature = "native")]
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Hyper error (native only)
    #[cfg(feature = "native")]
    #[error("HTTP error: {0}")]
    Hyper(String),

    /// TLS error
    #[cfg(feature = "tls")]
    #[error("TLS error: {0}")]
    Tls(String),

    /// Internal error
    #[error("Internal error: {0}")]
    Internal(String),
}
