//! Pure CORS origin allow-check — mirrors `packages/app/src/cors.ts`
//! `isOriginAllowed` / `getAllowedOrigin` (string/list/`*` only; no JS callbacks).
//! FLEET-PRODUCTS-WAVE5. NO authority_rust.

/// Check if origin is allowed by a list (empty list / missing ⇒ allow all).
#[must_use]
pub fn is_origin_allowed(origin: &str, allowed: Option<&[&str]>) -> bool {
    match allowed {
        None => true,
        Some(list) if list.is_empty() => true,
        Some(list) if list.iter().any(|a| *a == "*") => true,
        Some(list) => list.iter().any(|a| *a == origin),
    }
}

/// Resolve Access-Control-Allow-Origin response value.
/// Returns `*` when open, the request origin when listed, or empty when denied.
#[must_use]
pub fn get_allowed_origin(origin: &str, allowed: Option<&[&str]>) -> String {
    match allowed {
        None => "*".into(),
        Some(list) if list.iter().any(|a| *a == "*") => "*".into(),
        Some(_) if is_origin_allowed(origin, allowed) => origin.into(),
        Some(_) => String::new(),
    }
}

/// Build CORS response headers for a simple (non-preflight) response.
#[must_use]
pub fn create_cors_headers(
    origin: &str,
    allowed: Option<&[&str]>,
    credentials: bool,
    exposed_headers: &[&str],
) -> Vec<(String, String)> {
    let mut headers = Vec::new();
    let allowed_origin = get_allowed_origin(origin, allowed);
    if !allowed_origin.is_empty() {
        headers.push((
            "access-control-allow-origin".into(),
            allowed_origin.clone(),
        ));
    }
    if credentials {
        headers.push(("access-control-allow-credentials".into(), "true".into()));
    }
    if !exposed_headers.is_empty() {
        headers.push((
            "access-control-expose-headers".into(),
            exposed_headers.join(", "),
        ));
    }
    if !allowed_origin.is_empty() && allowed_origin != "*" {
        headers.push(("vary".into(), "Origin".into()));
    }
    headers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_allow() {
        assert!(is_origin_allowed("https://a.com", None));
        assert_eq!(get_allowed_origin("https://a.com", None), "*");
    }

    #[test]
    fn list_allow_deny() {
        let allowed = ["https://a.com", "https://b.com"];
        assert!(is_origin_allowed("https://a.com", Some(&allowed)));
        assert!(!is_origin_allowed("https://c.com", Some(&allowed)));
        assert_eq!(
            get_allowed_origin("https://a.com", Some(&allowed)),
            "https://a.com"
        );
        assert_eq!(get_allowed_origin("https://c.com", Some(&allowed)), "");
    }

    #[test]
    fn star() {
        let allowed = ["*"];
        assert!(is_origin_allowed("https://any", Some(&allowed)));
        assert_eq!(get_allowed_origin("https://any", Some(&allowed)), "*");
    }

    #[test]
    fn headers_vary() {
        let allowed = ["https://a.com"];
        let h = create_cors_headers("https://a.com", Some(&allowed), true, &["X-Req"]);
        assert!(h.iter().any(|(k, v)| k == "access-control-allow-origin" && v == "https://a.com"));
        assert!(h.iter().any(|(k, v)| k == "access-control-allow-credentials" && v == "true"));
        assert!(h.iter().any(|(k, v)| k == "vary" && v == "Origin"));
    }
}
