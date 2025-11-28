//! TLS support using rustls
//!
//! Provides secure HTTPS connections with:
//! - Modern TLS 1.2/1.3 only
//! - Certificate and key loading from PEM files
//! - ALPN negotiation (HTTP/1.1, HTTP/2)

use crate::{Error, Result};
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Arc;

/// TLS configuration
#[derive(Clone)]
pub struct TlsConfig {
    pub cert_path: String,
    pub key_path: String,
    /// ALPN protocols (default: ["h2", "http/1.1"])
    pub alpn_protocols: Vec<Vec<u8>>,
}

impl TlsConfig {
    /// Create a new TLS config
    pub fn new(cert_path: impl Into<String>, key_path: impl Into<String>) -> Self {
        Self {
            cert_path: cert_path.into(),
            key_path: key_path.into(),
            alpn_protocols: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
        }
    }

    /// Build rustls ServerConfig
    pub fn build_server_config(&self) -> Result<Arc<rustls::ServerConfig>> {
        let certs = load_certs(&self.cert_path)?;
        let key = load_private_key(&self.key_path)?;

        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(certs, key)
            .map_err(|e| Error::Tls(e.to_string()))?;

        let mut config = config;
        config.alpn_protocols = self.alpn_protocols.clone();

        Ok(Arc::new(config))
    }
}

/// Load certificates from PEM file
pub fn load_certs(path: &str) -> Result<Vec<CertificateDer<'static>>> {
    let file = File::open(Path::new(path))
        .map_err(|e| Error::Tls(format!("Failed to open cert file: {}", e)))?;
    let mut reader = BufReader::new(file);

    let certs = rustls_pemfile::certs(&mut reader)
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|e| Error::Tls(format!("Failed to parse certs: {}", e)))?;

    if certs.is_empty() {
        return Err(Error::Tls("No certificates found in file".to_string()));
    }

    Ok(certs)
}

/// Load private key from PEM file
pub fn load_private_key(path: &str) -> Result<PrivateKeyDer<'static>> {
    let file = File::open(Path::new(path))
        .map_err(|e| Error::Tls(format!("Failed to open key file: {}", e)))?;
    let mut reader = BufReader::new(file);

    loop {
        match rustls_pemfile::read_one(&mut reader)
            .map_err(|e| Error::Tls(format!("Failed to parse key: {}", e)))?
        {
            Some(rustls_pemfile::Item::Pkcs1Key(key)) => {
                return Ok(PrivateKeyDer::Pkcs1(key));
            }
            Some(rustls_pemfile::Item::Pkcs8Key(key)) => {
                return Ok(PrivateKeyDer::Pkcs8(key));
            }
            Some(rustls_pemfile::Item::Sec1Key(key)) => {
                return Ok(PrivateKeyDer::Sec1(key));
            }
            None => break,
            _ => continue,
        }
    }

    Err(Error::Tls("No private key found in file".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tls_config_creation() {
        let config = TlsConfig::new("cert.pem", "key.pem");
        assert_eq!(config.cert_path, "cert.pem");
        assert_eq!(config.key_path, "key.pem");
        assert_eq!(config.alpn_protocols.len(), 2);
    }
}
