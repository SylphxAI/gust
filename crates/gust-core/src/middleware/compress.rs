//! Compression middleware
//!
//! Supports gzip, brotli, and deflate compression.

use crate::{Request, Response};
use super::Middleware;

/// Compression encoding
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoding {
    Gzip,
    Brotli,
    Deflate,
    Identity,
}

impl Encoding {
    pub fn as_str(&self) -> &'static str {
        match self {
            Encoding::Gzip => "gzip",
            Encoding::Brotli => "br",
            Encoding::Deflate => "deflate",
            Encoding::Identity => "identity",
        }
    }

    /// Parse from Accept-Encoding header
    pub fn from_accept_encoding(header: &str) -> Self {
        // Priority: br > gzip > deflate > identity
        if header.contains("br") {
            Encoding::Brotli
        } else if header.contains("gzip") {
            Encoding::Gzip
        } else if header.contains("deflate") {
            Encoding::Deflate
        } else {
            Encoding::Identity
        }
    }
}

/// Compression level
#[derive(Debug, Clone, Copy)]
pub enum CompressionLevel {
    Fast,
    Default,
    Best,
}

impl CompressionLevel {
    #[cfg_attr(not(feature = "compress"), allow(dead_code))]
    fn gzip_level(&self) -> u32 {
        match self {
            CompressionLevel::Fast => 1,
            CompressionLevel::Default => 6,
            CompressionLevel::Best => 9,
        }
    }

    #[cfg_attr(not(feature = "compress"), allow(dead_code))]
    fn brotli_level(&self) -> u32 {
        match self {
            CompressionLevel::Fast => 1,
            CompressionLevel::Default => 4,
            CompressionLevel::Best => 11,
        }
    }
}

/// Compress middleware
pub struct Compress {
    level: CompressionLevel,
    min_size: usize,
}

impl Compress {
    pub fn new() -> Self {
        Self {
            level: CompressionLevel::Default,
            min_size: 1024, // Don't compress < 1KB
        }
    }

    pub fn level(mut self, level: CompressionLevel) -> Self {
        self.level = level;
        self
    }

    pub fn min_size(mut self, size: usize) -> Self {
        self.min_size = size;
        self
    }

    fn should_compress(&self, content_type: &str, size: usize) -> bool {
        if size < self.min_size {
            return false;
        }

        // Compress text-based content
        content_type.starts_with("text/")
            || content_type.contains("json")
            || content_type.contains("xml")
            || content_type.contains("javascript")
            || content_type.contains("css")
    }

    #[cfg(feature = "compress")]
    fn compress_gzip(&self, data: &[u8]) -> Vec<u8> {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = GzEncoder::new(Vec::new(), Compression::new(self.level.gzip_level()));
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    #[cfg(feature = "compress")]
    fn compress_brotli(&self, data: &[u8]) -> Vec<u8> {
        let mut output = Vec::new();
        let params = brotli::enc::BrotliEncoderParams {
            quality: self.level.brotli_level() as i32,
            ..Default::default()
        };
        brotli::enc::BrotliCompress(&mut std::io::Cursor::new(data), &mut output, &params).unwrap();
        output
    }

    #[cfg(feature = "compress")]
    fn compress_deflate(&self, data: &[u8]) -> Vec<u8> {
        use flate2::write::DeflateEncoder;
        use flate2::Compression;
        use std::io::Write;

        let mut encoder = DeflateEncoder::new(Vec::new(), Compression::new(self.level.gzip_level()));
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap()
    }

    #[cfg(not(feature = "compress"))]
    fn compress_gzip(&self, data: &[u8]) -> Vec<u8> {
        data.to_vec()
    }

    #[cfg(not(feature = "compress"))]
    fn compress_brotli(&self, data: &[u8]) -> Vec<u8> {
        data.to_vec()
    }

    #[cfg(not(feature = "compress"))]
    fn compress_deflate(&self, data: &[u8]) -> Vec<u8> {
        data.to_vec()
    }
}

impl Default for Compress {
    fn default() -> Self {
        Self::new()
    }
}

impl Middleware for Compress {
    fn before(&self, _req: &mut Request) -> Option<Response> {
        // Store accepted encoding for after()
        None
    }

    fn after(&self, req: &Request, res: &mut Response) {
        // Check Accept-Encoding
        let accept = req.header("accept-encoding").unwrap_or("");
        if accept.is_empty() {
            return;
        }

        // Get content type
        let content_type = res
            .headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("content-type"))
            .map(|(_, v)| v.as_str())
            .unwrap_or("");

        // Check if we should compress
        let body_len = res.body.len();
        if !self.should_compress(content_type, body_len) {
            return;
        }

        // Determine encoding
        let encoding = Encoding::from_accept_encoding(accept);
        if encoding == Encoding::Identity {
            return;
        }

        // Compress body
        let compressed = match encoding {
            Encoding::Gzip => self.compress_gzip(&res.body),
            Encoding::Brotli => self.compress_brotli(&res.body),
            Encoding::Deflate => self.compress_deflate(&res.body),
            Encoding::Identity => return,
        };

        // Only use compressed if smaller
        if compressed.len() < body_len {
            res.body = bytes::Bytes::from(compressed);
            res.headers.push((
                "Content-Encoding".to_string(),
                encoding.as_str().to_string(),
            ));
            // Update content-length
            res.headers.retain(|(k, _)| !k.eq_ignore_ascii_case("content-length"));
            res.headers.push((
                "Content-Length".to_string(),
                res.body.len().to_string(),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encoding_parse() {
        assert_eq!(
            Encoding::from_accept_encoding("gzip, deflate, br"),
            Encoding::Brotli
        );
        assert_eq!(
            Encoding::from_accept_encoding("gzip, deflate"),
            Encoding::Gzip
        );
        assert_eq!(
            Encoding::from_accept_encoding("deflate"),
            Encoding::Deflate
        );
        assert_eq!(
            Encoding::from_accept_encoding(""),
            Encoding::Identity
        );
    }

    #[test]
    fn test_should_compress() {
        let compress = Compress::new();

        assert!(compress.should_compress("text/html", 2000));
        assert!(compress.should_compress("application/json", 2000));
        assert!(!compress.should_compress("image/png", 2000));
        assert!(!compress.should_compress("text/html", 500)); // Too small
    }
}
