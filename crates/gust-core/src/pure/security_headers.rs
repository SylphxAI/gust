//! Pure security header table builder — mirrors
//! `packages/app/src/security.ts` header construction (no middleware I/O).
//! FLEET-PRODUCTS-WAVE7 pure residual. NO authority_rust / ts_deleted.

/// Options for security headers (string/bool flags only; pure).
#[derive(Debug, Clone, Default)]
pub struct SecurityOptions {
    /// None = default CSP; Some(None) disabled via false; Some(Some(s)) custom.
    pub content_security_policy: Option<Option<String>>,
    pub cross_origin_embedder_policy: Option<String>,
    pub cross_origin_opener_policy: Option<Option<String>>,
    pub cross_origin_resource_policy: Option<Option<String>>,
    pub referrer_policy: Option<Option<String>>,
    /// None = default HSTS; Some(None) = disabled; Some(Some((max_age, include_sub, preload)))
    pub hsts: Option<Option<(u64, bool, bool)>>,
    pub no_sniff: Option<bool>,
    pub dns_prefetch_control: Option<bool>,
    pub ie_no_open: Option<bool>,
    pub frameguard: Option<Option<String>>,
    pub permitted_cross_domain_policies: Option<Option<String>>,
    pub xss_filter: Option<bool>,
}

const DEFAULT_CSP: &str = "default-src 'self'";

/// Build the security header map (name, value) pairs.
#[must_use]
pub fn build_security_headers(options: &SecurityOptions) -> Vec<(String, String)> {
    let mut headers: Vec<(String, String)> = Vec::new();

    // CSP
    match &options.content_security_policy {
        Some(None) => {} // disabled
        Some(Some(s)) => headers.push(("content-security-policy".into(), s.clone())),
        None => headers.push(("content-security-policy".into(), DEFAULT_CSP.into())),
    }

    // COEP — only if explicitly set (TS: only when truthy)
    if let Some(v) = &options.cross_origin_embedder_policy {
        headers.push(("cross-origin-embedder-policy".into(), v.clone()));
    }

    // COOP
    match &options.cross_origin_opener_policy {
        Some(None) => {}
        Some(Some(s)) => headers.push(("cross-origin-opener-policy".into(), s.clone())),
        None => headers.push(("cross-origin-opener-policy".into(), "same-origin".into())),
    }

    // CORP
    match &options.cross_origin_resource_policy {
        Some(None) => {}
        Some(Some(s)) => headers.push(("cross-origin-resource-policy".into(), s.clone())),
        None => headers.push(("cross-origin-resource-policy".into(), "same-origin".into())),
    }

    // Referrer-Policy
    match &options.referrer_policy {
        Some(None) => {}
        Some(Some(s)) => headers.push(("referrer-policy".into(), s.clone())),
        None => headers.push((
            "referrer-policy".into(),
            "strict-origin-when-cross-origin".into(),
        )),
    }

    // HSTS
    match &options.hsts {
        Some(None) => {}
        Some(Some((max_age, include_sub, preload))) => {
            let mut v = format!("max-age={max_age}");
            if *include_sub {
                v.push_str("; includeSubDomains");
            }
            if *preload {
                v.push_str("; preload");
            }
            headers.push(("strict-transport-security".into(), v));
        }
        None => headers.push((
            "strict-transport-security".into(),
            "max-age=15552000".into(),
        )),
    }

    // X-Content-Type-Options
    if options.no_sniff != Some(false) {
        headers.push(("x-content-type-options".into(), "nosniff".into()));
    }

    // X-DNS-Prefetch-Control — only when set
    if let Some(on) = options.dns_prefetch_control {
        headers.push((
            "x-dns-prefetch-control".into(),
            if on { "on" } else { "off" }.into(),
        ));
    }

    // X-Download-Options
    if options.ie_no_open != Some(false) {
        headers.push(("x-download-options".into(), "noopen".into()));
    }

    // X-Frame-Options
    match &options.frameguard {
        Some(None) => {}
        Some(Some(s)) => headers.push(("x-frame-options".into(), s.clone())),
        None => headers.push(("x-frame-options".into(), "SAMEORIGIN".into())),
    }

    // X-Permitted-Cross-Domain-Policies
    match &options.permitted_cross_domain_policies {
        Some(None) => {}
        Some(Some(s)) => headers.push(("x-permitted-cross-domain-policies".into(), s.clone())),
        None => headers.push(("x-permitted-cross-domain-policies".into(), "none".into())),
    }

    // X-XSS-Protection
    if options.xss_filter != Some(false) {
        headers.push(("x-xss-protection".into(), "0".into()));
    }

    headers
}

/// Format HSTS header value.
#[must_use]
pub fn format_hsts(max_age: u64, include_sub_domains: bool, preload: bool) -> String {
    let mut v = format!("max-age={max_age}");
    if include_sub_domains {
        v.push_str("; includeSubDomains");
    }
    if preload {
        v.push_str("; preload");
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_include_core_headers() {
        let h = build_security_headers(&SecurityOptions::default());
        let map: std::collections::HashMap<_, _> = h.into_iter().collect();
        assert_eq!(map.get("content-security-policy").map(String::as_str), Some(DEFAULT_CSP));
        assert_eq!(map.get("x-content-type-options").map(String::as_str), Some("nosniff"));
        assert_eq!(map.get("x-frame-options").map(String::as_str), Some("SAMEORIGIN"));
        assert_eq!(map.get("x-xss-protection").map(String::as_str), Some("0"));
        assert_eq!(
            map.get("strict-transport-security").map(String::as_str),
            Some("max-age=15552000")
        );
        assert!(map.get("x-dns-prefetch-control").is_none());
    }

    #[test]
    fn disable_csp_and_hsts() {
        let opts = SecurityOptions {
            content_security_policy: Some(None),
            hsts: Some(None),
            ..Default::default()
        };
        let h = build_security_headers(&opts);
        let map: std::collections::HashMap<_, _> = h.into_iter().collect();
        assert!(!map.contains_key("content-security-policy"));
        assert!(!map.contains_key("strict-transport-security"));
    }

    #[test]
    fn hsts_format() {
        assert_eq!(
            format_hsts(31_536_000, true, true),
            "max-age=31536000; includeSubDomains; preload"
        );
    }
}
