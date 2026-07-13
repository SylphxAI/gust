//! Pure residual helpers extracted from portable app-layer policies.
//! No I/O, no middleware side effects. FLEET-PRODUCTS-WAVE3.

pub mod client_ip;
pub mod rate_limit_math;
pub mod body_size;
pub mod cors_origin;

pub use client_ip::parse_client_ip;
pub use rate_limit_math::{
    fixed_window_decision, rate_limit_headers, sliding_window_decision, RateLimitDecision,
};

pub use body_size::{exceeds_limit, format_size, parse_size_bytes, parse_size_str};
pub use cors_origin::{create_cors_headers, get_allowed_origin, is_origin_allowed};

pub mod cookie;
pub use cookie::{delete_cookie, parse_cookies, serialize_cookie, CookieOptions};

pub mod security_headers;
pub use security_headers::{build_security_headers, format_hsts, SecurityOptions};
