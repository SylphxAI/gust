//! Proxy Headers Middleware
//!
//! Trust and parse proxy headers (X-Forwarded-*, etc.) from reverse proxies.

use std::net::IpAddr;
use std::str::FromStr;

/// Proxy information extracted from headers
#[derive(Debug, Clone, PartialEq)]
pub struct ProxyInfo {
    /// Client IP address
    pub ip: String,
    /// Original host
    pub host: String,
    /// Original protocol (http/https)
    pub protocol: Protocol,
    /// Original port
    pub port: u16,
    /// Forwarded IPs chain
    pub ips: Vec<String>,
}

impl ProxyInfo {
    /// Get the full URL
    pub fn url(&self, path: &str) -> String {
        let port_suffix = match (self.protocol, self.port) {
            (Protocol::Http, 80) | (Protocol::Https, 443) => String::new(),
            _ => format!(":{}", self.port),
        };
        format!("{}://{}{}{}", self.protocol.as_str(), self.host, port_suffix, path)
    }
}

/// Protocol (http or https)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    Http,
    Https,
}

impl Protocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            Protocol::Http => "http",
            Protocol::Https => "https",
        }
    }

    pub fn default_port(&self) -> u16 {
        match self {
            Protocol::Http => 80,
            Protocol::Https => 443,
        }
    }
}

impl FromStr for Protocol {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "http" => Ok(Protocol::Http),
            "https" => Ok(Protocol::Https),
            _ => Err(()),
        }
    }
}

/// Proxy trust configuration
#[derive(Debug, Clone)]
pub enum TrustProxy {
    /// Don't trust any proxy
    None,
    /// Trust all proxies
    All,
    /// Trust first N proxies
    Count(usize),
    /// Trust specific IPs/subnets
    Addresses(Vec<TrustedAddress>),
}

impl Default for TrustProxy {
    fn default() -> Self {
        TrustProxy::None
    }
}

/// Trusted address (IP or CIDR subnet)
#[derive(Debug, Clone)]
pub enum TrustedAddress {
    /// Single IP address
    Ip(IpAddr),
    /// IPv4 subnet in CIDR notation
    Subnet { network: u32, mask: u32 },
}

impl TrustedAddress {
    /// Parse from string (IP or CIDR notation)
    pub fn parse(s: &str) -> Option<Self> {
        if let Some((ip_str, bits_str)) = s.split_once('/') {
            // CIDR notation
            let ip: IpAddr = ip_str.parse().ok()?;
            let bits: u8 = bits_str.parse().ok()?;

            match ip {
                IpAddr::V4(ipv4) => {
                    if bits > 32 {
                        return None;
                    }
                    let network = u32::from(ipv4);
                    let mask = if bits == 0 { 0 } else { !0u32 << (32 - bits) };
                    Some(TrustedAddress::Subnet { network, mask })
                }
                IpAddr::V6(_) => {
                    // IPv6 CIDR not fully supported, just match exact IP
                    Some(TrustedAddress::Ip(ip))
                }
            }
        } else {
            // Single IP
            let ip: IpAddr = s.parse().ok()?;
            Some(TrustedAddress::Ip(ip))
        }
    }

    /// Check if an IP matches this trusted address
    pub fn matches(&self, ip: &str) -> bool {
        let parsed: IpAddr = match ip.parse() {
            Ok(ip) => ip,
            Err(_) => return false,
        };

        match self {
            TrustedAddress::Ip(trusted) => &parsed == trusted,
            TrustedAddress::Subnet { network, mask } => {
                if let IpAddr::V4(ipv4) = parsed {
                    let ip_num = u32::from(ipv4);
                    (ip_num & mask) == (network & mask)
                } else {
                    false
                }
            }
        }
    }
}

/// Proxy headers configuration
#[derive(Debug, Clone)]
pub struct ProxyConfig {
    /// Trust configuration
    pub trust: TrustProxy,
    /// Header for client IP (default: x-forwarded-for)
    pub ip_header: String,
    /// Header for host (default: x-forwarded-host)
    pub host_header: String,
    /// Header for protocol (default: x-forwarded-proto)
    pub proto_header: String,
    /// Header for port (default: x-forwarded-port)
    pub port_header: String,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            trust: TrustProxy::None,
            ip_header: "x-forwarded-for".to_string(),
            host_header: "x-forwarded-host".to_string(),
            proto_header: "x-forwarded-proto".to_string(),
            port_header: "x-forwarded-port".to_string(),
        }
    }
}

impl ProxyConfig {
    pub fn new() -> Self {
        Self::default()
    }

    /// Trust all proxies
    pub fn trust_all(mut self) -> Self {
        self.trust = TrustProxy::All;
        self
    }

    /// Trust first N proxies
    pub fn trust_count(mut self, n: usize) -> Self {
        self.trust = TrustProxy::Count(n);
        self
    }

    /// Trust specific addresses
    pub fn trust_addresses(mut self, addresses: Vec<&str>) -> Self {
        let trusted: Vec<TrustedAddress> = addresses
            .into_iter()
            .filter_map(TrustedAddress::parse)
            .collect();
        self.trust = TrustProxy::Addresses(trusted);
        self
    }

    /// Trust localhost/loopback
    pub fn trust_loopback(self) -> Self {
        self.trust_addresses(vec![
            "127.0.0.1",
            "::1",
            "10.0.0.0/8",
            "172.16.0.0/12",
            "192.168.0.0/16",
        ])
    }

    /// Custom IP header
    pub fn ip_header(mut self, header: impl Into<String>) -> Self {
        self.ip_header = header.into();
        self
    }

    /// Custom host header
    pub fn host_header(mut self, header: impl Into<String>) -> Self {
        self.host_header = header.into();
        self
    }

    /// Custom protocol header
    pub fn proto_header(mut self, header: impl Into<String>) -> Self {
        self.proto_header = header.into();
        self
    }
}

/// Parse X-Forwarded-For header
pub fn parse_forwarded_for(header: &str) -> Vec<String> {
    header
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Check if IP should be trusted
pub fn is_trusted(ip: &str, trust: &TrustProxy) -> bool {
    match trust {
        TrustProxy::None => false,
        TrustProxy::All => true,
        TrustProxy::Count(_) => true, // Handled in chain processing
        TrustProxy::Addresses(addresses) => addresses.iter().any(|a| a.matches(ip)),
    }
}

/// Extract proxy info from request headers
pub fn extract_proxy_info(
    config: &ProxyConfig,
    socket_ip: &str,
    headers: &[(String, String)],
    host_header: Option<&str>,
) -> ProxyInfo {
    let get_header = |name: &str| -> Option<&str> {
        headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    };

    // Check if we should trust proxy headers
    if !is_trusted(socket_ip, &config.trust) {
        return ProxyInfo {
            ip: socket_ip.to_string(),
            host: host_header.unwrap_or("localhost").to_string(),
            protocol: Protocol::Http,
            port: 80,
            ips: vec![socket_ip.to_string()],
        };
    }

    // Parse forwarded IPs
    let forwarded_ips = get_header(&config.ip_header)
        .map(parse_forwarded_for)
        .unwrap_or_default();

    let mut all_ips = forwarded_ips.clone();
    all_ips.push(socket_ip.to_string());

    // Determine client IP based on trust config
    let client_ip = match &config.trust {
        TrustProxy::Count(n) => {
            // Get IP from (N+1)th position from end
            let index = all_ips.len().saturating_sub(*n + 1);
            all_ips.get(index).cloned().unwrap_or_else(|| socket_ip.to_string())
        }
        _ => {
            // Use first forwarded IP or socket IP
            forwarded_ips.first().cloned().unwrap_or_else(|| socket_ip.to_string())
        }
    };

    // Parse other headers
    let host = get_header(&config.host_header)
        .or(host_header)
        .unwrap_or("localhost")
        .to_string();

    let protocol = get_header(&config.proto_header)
        .and_then(|p| p.parse().ok())
        .unwrap_or(Protocol::Http);

    let port = get_header(&config.port_header)
        .and_then(|p| p.parse().ok())
        .unwrap_or_else(|| protocol.default_port());

    ProxyInfo {
        ip: client_ip,
        host,
        protocol,
        port,
        ips: all_ips,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_forwarded_for() {
        let ips = parse_forwarded_for("1.1.1.1, 2.2.2.2, 3.3.3.3");
        assert_eq!(ips, vec!["1.1.1.1", "2.2.2.2", "3.3.3.3"]);

        let single = parse_forwarded_for("1.1.1.1");
        assert_eq!(single, vec!["1.1.1.1"]);

        let empty = parse_forwarded_for("");
        assert!(empty.is_empty());
    }

    #[test]
    fn test_trusted_address_ip() {
        let addr = TrustedAddress::parse("127.0.0.1").unwrap();
        assert!(addr.matches("127.0.0.1"));
        assert!(!addr.matches("127.0.0.2"));
    }

    #[test]
    fn test_trusted_address_subnet() {
        let addr = TrustedAddress::parse("10.0.0.0/8").unwrap();
        assert!(addr.matches("10.0.0.1"));
        assert!(addr.matches("10.255.255.255"));
        assert!(!addr.matches("11.0.0.1"));
    }

    #[test]
    fn test_trusted_address_subnet_24() {
        let addr = TrustedAddress::parse("192.168.1.0/24").unwrap();
        assert!(addr.matches("192.168.1.1"));
        assert!(addr.matches("192.168.1.255"));
        assert!(!addr.matches("192.168.2.1"));
    }

    #[test]
    fn test_extract_proxy_info_untrusted() {
        let config = ProxyConfig::new();
        let headers = vec![
            ("x-forwarded-for".to_string(), "1.1.1.1".to_string()),
        ];

        let info = extract_proxy_info(&config, "10.0.0.1", &headers, Some("example.com"));

        // Should ignore forwarded headers since not trusted
        assert_eq!(info.ip, "10.0.0.1");
        assert_eq!(info.host, "example.com");
    }

    #[test]
    fn test_extract_proxy_info_trusted() {
        let config = ProxyConfig::new().trust_all();
        let headers = vec![
            ("x-forwarded-for".to_string(), "1.1.1.1, 2.2.2.2".to_string()),
            ("x-forwarded-proto".to_string(), "https".to_string()),
            ("x-forwarded-host".to_string(), "api.example.com".to_string()),
        ];

        let info = extract_proxy_info(&config, "10.0.0.1", &headers, Some("proxy.internal"));

        assert_eq!(info.ip, "1.1.1.1");
        assert_eq!(info.host, "api.example.com");
        assert_eq!(info.protocol, Protocol::Https);
        assert_eq!(info.ips, vec!["1.1.1.1", "2.2.2.2", "10.0.0.1"]);
    }

    #[test]
    fn test_extract_proxy_info_trust_count() {
        let config = ProxyConfig::new().trust_count(1);
        let headers = vec![
            ("x-forwarded-for".to_string(), "1.1.1.1, 2.2.2.2".to_string()),
        ];

        let info = extract_proxy_info(&config, "10.0.0.1", &headers, None);

        // Trust 1 proxy, so get 2nd from end
        assert_eq!(info.ip, "2.2.2.2");
    }

    #[test]
    fn test_protocol() {
        assert_eq!(Protocol::Http.as_str(), "http");
        assert_eq!(Protocol::Https.as_str(), "https");
        assert_eq!(Protocol::Http.default_port(), 80);
        assert_eq!(Protocol::Https.default_port(), 443);
    }

    #[test]
    fn test_proxy_info_url() {
        let info = ProxyInfo {
            ip: "1.1.1.1".to_string(),
            host: "example.com".to_string(),
            protocol: Protocol::Https,
            port: 443,
            ips: vec!["1.1.1.1".to_string()],
        };

        assert_eq!(info.url("/api/users"), "https://example.com/api/users");

        let info_custom_port = ProxyInfo {
            ip: "1.1.1.1".to_string(),
            host: "example.com".to_string(),
            protocol: Protocol::Http,
            port: 8080,
            ips: vec!["1.1.1.1".to_string()],
        };

        assert_eq!(info_custom_port.url("/api"), "http://example.com:8080/api");
    }
}
