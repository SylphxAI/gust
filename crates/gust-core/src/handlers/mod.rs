//! Built-in request handlers
//!
//! Ready-to-use handlers for common use cases.

pub mod websocket;
pub mod sse;
pub mod static_files;
pub mod health;

pub use websocket::{
    WebSocket, WebSocketMessage, WebSocketHandler,
    Frame, Opcode, CloseFrame,
    is_websocket_upgrade, generate_accept_key, upgrade_response,
};
pub use sse::{Sse, SseEvent, SseStream};
pub use static_files::{StaticFiles, StaticFileConfig};
pub use health::{Health, HealthCheck, HealthStatus};
