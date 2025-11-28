//! Static file serving handler
//!
//! Efficient static file serving with caching and range support.

use crate::{Request, Response, ResponseBuilder, StatusCode, Method};
use std::path::{Path, PathBuf};
use std::collections::HashMap;

/// Static file configuration
#[derive(Clone)]
pub struct StaticFileConfig {
    /// Root directory
    pub root: PathBuf,
    /// Index file name
    pub index: String,
    /// Enable directory listing
    pub listing: bool,
    /// Cache max-age in seconds
    pub max_age: u32,
    /// Enable ETag
    pub etag: bool,
    /// Enable Last-Modified
    pub last_modified: bool,
    /// Custom headers
    pub headers: HashMap<String, String>,
    /// Hidden files (dot files)
    pub hidden: bool,
    /// Fallback file (for SPA)
    pub fallback: Option<String>,
}

impl Default for StaticFileConfig {
    fn default() -> Self {
        Self {
            root: PathBuf::from("."),
            index: "index.html".to_string(),
            listing: false,
            max_age: 86400, // 1 day
            etag: true,
            last_modified: true,
            headers: HashMap::new(),
            hidden: false,
            fallback: None,
        }
    }
}

impl StaticFileConfig {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            ..Default::default()
        }
    }

    pub fn index(mut self, name: impl Into<String>) -> Self {
        self.index = name.into();
        self
    }

    pub fn listing(mut self, enabled: bool) -> Self {
        self.listing = enabled;
        self
    }

    pub fn max_age(mut self, seconds: u32) -> Self {
        self.max_age = seconds;
        self
    }

    pub fn etag(mut self, enabled: bool) -> Self {
        self.etag = enabled;
        self
    }

    pub fn fallback(mut self, file: impl Into<String>) -> Self {
        self.fallback = Some(file.into());
        self
    }

    pub fn header(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.headers.insert(key.into(), value.into());
        self
    }
}

/// Static file handler
pub struct StaticFiles {
    config: StaticFileConfig,
}

impl StaticFiles {
    pub fn new(config: StaticFileConfig) -> Self {
        Self { config }
    }

    /// Serve static files from directory
    pub fn serve(root: impl Into<PathBuf>) -> Self {
        Self::new(StaticFileConfig::new(root))
    }

    /// Handle request for static file
    #[cfg(feature = "native")]
    pub async fn handle(&self, req: &Request) -> Response {
        // Only handle GET and HEAD
        if req.method != Method::Get && req.method != Method::Head {
            return ResponseBuilder::new(StatusCode::METHOD_NOT_ALLOWED)
                .body("Method not allowed")
                .build();
        }

        // Sanitize path
        let path = self.sanitize_path(&req.path);
        if path.is_none() {
            return self.not_found();
        }
        let path = path.unwrap();

        // Check if file exists
        let full_path = self.config.root.join(&path);

        match tokio::fs::metadata(&full_path).await {
            Ok(meta) => {
                if meta.is_dir() {
                    // Try index file
                    let index_path = full_path.join(&self.config.index);
                    if let Ok(index_meta) = tokio::fs::metadata(&index_path).await {
                        if index_meta.is_file() {
                            return self.serve_file(&index_path, &index_meta, req).await;
                        }
                    }

                    // Directory listing
                    if self.config.listing {
                        return self.list_directory(&full_path, &req.path).await;
                    }

                    self.not_found()
                } else {
                    self.serve_file(&full_path, &meta, req).await
                }
            }
            Err(_) => {
                // Try fallback
                if let Some(ref fallback) = self.config.fallback {
                    let fallback_path = self.config.root.join(fallback);
                    if let Ok(meta) = tokio::fs::metadata(&fallback_path).await {
                        return self.serve_file(&fallback_path, &meta, req).await;
                    }
                }
                self.not_found()
            }
        }
    }

    /// Synchronous handle (for non-native)
    #[cfg(not(feature = "native"))]
    pub fn handle(&self, req: &Request) -> Response {
        // Only handle GET and HEAD
        if req.method != Method::Get && req.method != Method::Head {
            return ResponseBuilder::new(StatusCode::METHOD_NOT_ALLOWED)
                .body("Method not allowed")
                .build();
        }

        // Sanitize path
        let path = match self.sanitize_path(&req.path) {
            Some(p) => p,
            None => return self.not_found(),
        };

        // Check if file exists
        let full_path = self.config.root.join(&path);

        match std::fs::metadata(&full_path) {
            Ok(meta) => {
                if meta.is_dir() {
                    let index_path = full_path.join(&self.config.index);
                    if let Ok(index_meta) = std::fs::metadata(&index_path) {
                        if index_meta.is_file() {
                            return self.serve_file_sync(&index_path, &index_meta, req);
                        }
                    }
                    self.not_found()
                } else {
                    self.serve_file_sync(&full_path, &meta, req)
                }
            }
            Err(_) => self.not_found(),
        }
    }

    /// Sanitize request path to prevent directory traversal
    fn sanitize_path(&self, path: &str) -> Option<PathBuf> {
        let path = path.trim_start_matches('/');

        // Check for hidden files
        if !self.config.hidden && path.split('/').any(|s| s.starts_with('.')) {
            return None;
        }

        // Normalize and check for traversal
        let mut result = PathBuf::new();
        for component in Path::new(path).components() {
            match component {
                std::path::Component::Normal(c) => result.push(c),
                std::path::Component::ParentDir => return None, // Prevent ../
                _ => {}
            }
        }

        Some(result)
    }

    #[cfg(feature = "native")]
    async fn serve_file(
        &self,
        path: &Path,
        meta: &std::fs::Metadata,
        req: &Request,
    ) -> Response {
        // Check ETag
        if self.config.etag {
            let etag = self.generate_etag(meta);
            if let Some(if_none_match) = req.header("if-none-match") {
                if if_none_match == etag {
                    return ResponseBuilder::new(StatusCode::NOT_MODIFIED).body("").build();
                }
            }
        }

        // Read file
        let content = match tokio::fs::read(path).await {
            Ok(c) => c,
            Err(_) => return self.not_found(),
        };

        // Build response
        let mut builder = ResponseBuilder::new(StatusCode::OK)
            .header("Content-Type", self.mime_type(path))
            .header("Content-Length", &content.len().to_string());

        if self.config.etag {
            builder = builder.header("ETag", &self.generate_etag(meta));
        }

        if self.config.max_age > 0 {
            builder = builder.header("Cache-Control", &format!("max-age={}", self.config.max_age));
        }

        for (k, v) in &self.config.headers {
            builder = builder.header(k, v);
        }

        // HEAD request - no body
        if req.method == Method::Head {
            builder.body("").build()
        } else {
            builder.body(content).build()
        }
    }

    #[cfg(not(feature = "native"))]
    fn serve_file_sync(
        &self,
        path: &Path,
        meta: &std::fs::Metadata,
        req: &Request,
    ) -> Response {
        let content = match std::fs::read(path) {
            Ok(c) => c,
            Err(_) => return self.not_found(),
        };

        let mut builder = ResponseBuilder::new(StatusCode::OK)
            .header("Content-Type", self.mime_type(path))
            .header("Content-Length", &content.len().to_string());

        if self.config.etag {
            builder = builder.header("ETag", &self.generate_etag(meta));
        }

        if req.method == Method::Head {
            builder.body("").build()
        } else {
            builder.body(content).build()
        }
    }

    #[cfg(feature = "native")]
    async fn list_directory(&self, path: &Path, request_path: &str) -> Response {
        let mut entries = Vec::new();

        let mut dir = match tokio::fs::read_dir(path).await {
            Ok(d) => d,
            Err(_) => return self.not_found(),
        };

        while let Ok(Some(entry)) = dir.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            if !self.config.hidden && name.starts_with('.') {
                continue;
            }

            let is_dir = entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false);
            entries.push((name, is_dir));
        }

        entries.sort_by(|a, b| {
            match (a.1, b.1) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.0.cmp(&b.0),
            }
        });

        let html = self.render_listing(request_path, &entries);
        ResponseBuilder::new(StatusCode::OK)
            .header("Content-Type", "text/html; charset=utf-8")
            .body(html)
            .build()
    }

    fn render_listing(&self, path: &str, entries: &[(String, bool)]) -> String {
        let mut html = String::from("<!DOCTYPE html><html><head><meta charset=\"utf-8\">");
        html.push_str(&format!("<title>Index of {}</title>", path));
        html.push_str("<style>body{font-family:monospace;padding:20px}a{text-decoration:none}a:hover{text-decoration:underline}</style>");
        html.push_str("</head><body>");
        html.push_str(&format!("<h1>Index of {}</h1>", path));
        html.push_str("<hr><pre>");

        if path != "/" {
            html.push_str("<a href=\"..\">..</a>\n");
        }

        for (name, is_dir) in entries {
            let display = if *is_dir {
                format!("{}/", name)
            } else {
                name.clone()
            };
            html.push_str(&format!("<a href=\"{}\">{}</a>\n", name, display));
        }

        html.push_str("</pre><hr></body></html>");
        html
    }

    fn not_found(&self) -> Response {
        ResponseBuilder::new(StatusCode::NOT_FOUND)
            .header("Content-Type", "text/plain")
            .body("Not Found")
            .build()
    }

    fn generate_etag(&self, meta: &std::fs::Metadata) -> String {
        use std::time::UNIX_EPOCH;

        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let size = meta.len();
        format!("\"{:x}-{:x}\"", mtime, size)
    }

    fn mime_type(&self, path: &Path) -> &'static str {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        match ext.to_lowercase().as_str() {
            // Text
            "html" | "htm" => "text/html; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "json" => "application/json",
            "xml" => "application/xml",
            "txt" => "text/plain; charset=utf-8",
            "md" => "text/markdown; charset=utf-8",
            "csv" => "text/csv",

            // Images
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "ico" => "image/x-icon",
            "webp" => "image/webp",
            "avif" => "image/avif",

            // Audio/Video
            "mp3" => "audio/mpeg",
            "ogg" => "audio/ogg",
            "wav" => "audio/wav",
            "mp4" => "video/mp4",
            "webm" => "video/webm",

            // Fonts
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "ttf" => "font/ttf",
            "otf" => "font/otf",
            "eot" => "application/vnd.ms-fontobject",

            // Archives
            "zip" => "application/zip",
            "gz" | "gzip" => "application/gzip",
            "tar" => "application/x-tar",

            // Documents
            "pdf" => "application/pdf",

            // WebAssembly
            "wasm" => "application/wasm",

            // Default
            _ => "application/octet-stream",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_path() {
        let handler = StaticFiles::serve(".");

        assert!(handler.sanitize_path("/index.html").is_some());
        assert!(handler.sanitize_path("/css/style.css").is_some());
        assert!(handler.sanitize_path("/../etc/passwd").is_none());
        assert!(handler.sanitize_path("/.hidden").is_none());
    }

    #[test]
    fn test_mime_type() {
        let handler = StaticFiles::serve(".");

        assert_eq!(handler.mime_type(Path::new("index.html")), "text/html; charset=utf-8");
        assert_eq!(handler.mime_type(Path::new("style.css")), "text/css; charset=utf-8");
        assert_eq!(handler.mime_type(Path::new("image.png")), "image/png");
        assert_eq!(handler.mime_type(Path::new("unknown")), "application/octet-stream");
    }
}
