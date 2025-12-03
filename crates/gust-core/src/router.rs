//! Router - Re-exports from gust-router (SSOT)
//!
//! This module re-exports the router from `gust-router` crate.
//! The actual implementation lives in gust-router to ensure
//! Single Source of Truth (SSOT) across native and WASM builds.

pub use gust_router::{Match, Router};
