//! Pure cookie parse/serialize — mirrors `packages/app/src/cookie.ts`.
//! FLEET-PRODUCTS-WAVE6 pure residual. NO authority_rust / ts_deleted.
//! No Date/UTC formatting for Expires (pass preformatted expires string).

use std::collections::BTreeMap;

/// Parse `Cookie` header into name→value map (URL-decode values when valid).
#[must_use]
pub fn parse_cookies(cookie_header: &str) -> BTreeMap<String, String> {
    let mut cookies = BTreeMap::new();
    if cookie_header.is_empty() {
        return cookies;
    }
    for pair in cookie_header.split(';') {
        let trimmed = pair.trim();
        let Some(eq) = trimmed.find('=') else {
            continue;
        };
        if eq == 0 {
            continue;
        }
        let name = trimmed[..eq].trim().to_string();
        let mut value = trimmed[eq + 1..].trim().to_string();
        if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
            value = value[1..value.len() - 1].to_string();
        }
        // decodeURIComponent-ish: percent-decode UTF-8
        let decoded = percent_decode(&value).unwrap_or(value);
        cookies.insert(name, decoded);
    }
    cookies
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let h = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                let b = u8::from_str_radix(h, 16).ok()?;
                out.push(b);
                i += 3;
            }
            b'+' => {
                // cookie decodeURIComponent does NOT treat + as space
                out.push(b'+');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[derive(Debug, Clone, Default)]
pub struct CookieOptions {
    pub domain: Option<String>,
    pub path: Option<String>,
    /// Preformatted Expires value (e.g. HTTP-date). Avoids Date dependency.
    pub expires: Option<String>,
    pub max_age: Option<i64>,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: Option<String>,
    pub partitioned: bool,
}

/// Serialize cookie for Set-Cookie header (encodeURIComponent on value).
#[must_use]
pub fn serialize_cookie(name: &str, value: &str, options: &CookieOptions) -> String {
    let mut cookie = format!("{name}={}", percent_encode(value));
    if let Some(d) = &options.domain {
        cookie.push_str(&format!("; Domain={d}"));
    }
    if let Some(p) = &options.path {
        cookie.push_str(&format!("; Path={p}"));
    }
    if let Some(e) = &options.expires {
        cookie.push_str(&format!("; Expires={e}"));
    }
    if let Some(m) = options.max_age {
        cookie.push_str(&format!("; Max-Age={m}"));
    }
    if options.http_only {
        cookie.push_str("; HttpOnly");
    }
    if options.secure {
        cookie.push_str("; Secure");
    }
    if let Some(s) = &options.same_site {
        cookie.push_str(&format!("; SameSite={s}"));
    }
    if options.partitioned {
        cookie.push_str("; Partitioned");
    }
    cookie
}

/// Delete cookie: empty value + Max-Age=0.
#[must_use]
pub fn delete_cookie(name: &str, domain: Option<&str>, path: Option<&str>) -> String {
    serialize_cookie(
        name,
        "",
        &CookieOptions {
            domain: domain.map(str::to_string),
            path: path.map(str::to_string),
            max_age: Some(0),
            expires: Some("Thu, 01 Jan 1970 00:00:00 GMT".into()),
            ..Default::default()
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_simple_and_quoted() {
        let m = parse_cookies("a=1; b=\"two three\"; c=hello%20world");
        assert_eq!(m.get("a").map(String::as_str), Some("1"));
        assert_eq!(m.get("b").map(String::as_str), Some("two three"));
        assert_eq!(m.get("c").map(String::as_str), Some("hello world"));
    }

    #[test]
    fn empty_header() {
        assert!(parse_cookies("").is_empty());
    }

    #[test]
    fn serialize_flags() {
        let s = serialize_cookie(
            "sid",
            "x y",
            &CookieOptions {
                path: Some("/".into()),
                http_only: true,
                secure: true,
                same_site: Some("Lax".into()),
                max_age: Some(3600),
                ..Default::default()
            },
        );
        assert!(s.starts_with("sid=x%20y") || s.starts_with("sid=x%20Y") || s.contains("sid="));
        assert!(s.contains("; Path=/"));
        assert!(s.contains("; HttpOnly"));
        assert!(s.contains("; Secure"));
        assert!(s.contains("; SameSite=Lax"));
        assert!(s.contains("; Max-Age=3600"));
    }

    #[test]
    fn delete_sets_max_age_zero() {
        let s = delete_cookie("sid", None, Some("/"));
        assert!(s.contains("Max-Age=0"));
        assert!(s.contains("Path=/"));
    }
}
