//! Pure residual helpers extracted from portable app-layer policies.
//! No I/O, no middleware side effects. FLEET-PRODUCTS-WAVE3.

pub mod client_ip;
pub mod rate_limit_math;

pub use client_ip::parse_client_ip;
pub use rate_limit_math::{
    fixed_window_decision, rate_limit_headers, sliding_window_decision, RateLimitDecision,
};
