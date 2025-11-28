//! High-performance radix trie router
//!
//! Uses matchit for efficient path matching with support for:
//! - Static paths: /users
//! - Dynamic segments: /users/:id
//! - Wildcards: /files/*path

use crate::{Error, Method, Result};
use std::collections::HashMap;

/// Route match result
#[derive(Debug, Clone)]
pub struct RouteMatch<T> {
    /// The matched handler/value
    pub value: T,
    /// Captured path parameters
    pub params: HashMap<String, String>,
}

/// Per-method router using matchit
struct MethodRouter<T> {
    router: matchit::Router<T>,
}

impl<T: Clone> MethodRouter<T> {
    fn new() -> Self {
        Self {
            router: matchit::Router::new(),
        }
    }

    fn insert(&mut self, path: &str, value: T) -> Result<()> {
        self.router
            .insert(path, value)
            .map_err(|e| Error::InvalidPath(e.to_string()))
    }

    fn at(&self, path: &str) -> Option<RouteMatch<T>> {
        self.router.at(path).ok().map(|matched| {
            let params = matched
                .params
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect();
            RouteMatch {
                value: matched.value.clone(),
                params,
            }
        })
    }
}

/// High-performance HTTP router
///
/// Routes are organized by HTTP method for O(1) method dispatch,
/// then matched using a radix trie for efficient path matching.
pub struct Router<T> {
    // Per-method routers for O(1) method dispatch
    get: MethodRouter<T>,
    post: MethodRouter<T>,
    put: MethodRouter<T>,
    delete: MethodRouter<T>,
    patch: MethodRouter<T>,
    head: MethodRouter<T>,
    options: MethodRouter<T>,
}

impl<T: Clone> Router<T> {
    /// Create a new router
    pub fn new() -> Self {
        Self {
            get: MethodRouter::new(),
            post: MethodRouter::new(),
            put: MethodRouter::new(),
            delete: MethodRouter::new(),
            patch: MethodRouter::new(),
            head: MethodRouter::new(),
            options: MethodRouter::new(),
        }
    }

    /// Add a route
    pub fn route(&mut self, method: Method, path: &str, value: T) -> Result<()> {
        match method {
            Method::Get => self.get.insert(path, value),
            Method::Post => self.post.insert(path, value),
            Method::Put => self.put.insert(path, value),
            Method::Delete => self.delete.insert(path, value),
            Method::Patch => self.patch.insert(path, value),
            Method::Head => self.head.insert(path, value),
            Method::Options => self.options.insert(path, value),
            _ => Err(Error::InvalidMethod(method.to_string())),
        }
    }

    /// Add a GET route
    pub fn get(&mut self, path: &str, value: T) -> Result<()> {
        self.route(Method::Get, path, value)
    }

    /// Add a POST route
    pub fn post(&mut self, path: &str, value: T) -> Result<()> {
        self.route(Method::Post, path, value)
    }

    /// Add a PUT route
    pub fn put(&mut self, path: &str, value: T) -> Result<()> {
        self.route(Method::Put, path, value)
    }

    /// Add a DELETE route
    pub fn delete(&mut self, path: &str, value: T) -> Result<()> {
        self.route(Method::Delete, path, value)
    }

    /// Add a PATCH route
    pub fn patch(&mut self, path: &str, value: T) -> Result<()> {
        self.route(Method::Patch, path, value)
    }

    /// Match a request
    pub fn match_route(&self, method: Method, path: &str) -> Option<RouteMatch<T>> {
        match method {
            Method::Get => self.get.at(path),
            Method::Post => self.post.at(path),
            Method::Put => self.put.at(path),
            Method::Delete => self.delete.at(path),
            Method::Patch => self.patch.at(path),
            Method::Head => self.head.at(path).or_else(|| self.get.at(path)),
            Method::Options => self.options.at(path),
            _ => None,
        }
    }

    /// Match using string method
    pub fn match_str(&self, method: &str, path: &str) -> Result<Option<RouteMatch<T>>> {
        let method = Method::from_str(method)?;
        Ok(self.match_route(method, path))
    }
}

impl<T: Clone> Default for Router<T> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_static_routes() {
        let mut router: Router<&str> = Router::new();
        router.get("/", "home").unwrap();
        router.get("/users", "users").unwrap();
        router.post("/users", "create_user").unwrap();

        let m = router.match_route(Method::Get, "/").unwrap();
        assert_eq!(m.value, "home");

        let m = router.match_route(Method::Get, "/users").unwrap();
        assert_eq!(m.value, "users");

        let m = router.match_route(Method::Post, "/users").unwrap();
        assert_eq!(m.value, "create_user");

        assert!(router.match_route(Method::Delete, "/users").is_none());
    }

    #[test]
    fn test_dynamic_routes() {
        let mut router: Router<&str> = Router::new();
        router.get("/users/{id}", "get_user").unwrap();
        router.get("/users/{id}/posts/{post_id}", "get_post").unwrap();

        let m = router.match_route(Method::Get, "/users/123").unwrap();
        assert_eq!(m.value, "get_user");
        assert_eq!(m.params.get("id"), Some(&"123".to_string()));

        let m = router.match_route(Method::Get, "/users/456/posts/789").unwrap();
        assert_eq!(m.value, "get_post");
        assert_eq!(m.params.get("id"), Some(&"456".to_string()));
        assert_eq!(m.params.get("post_id"), Some(&"789".to_string()));
    }

    #[test]
    fn test_wildcard_routes() {
        let mut router: Router<&str> = Router::new();
        router.get("/files/{*path}", "serve_file").unwrap();

        let m = router.match_route(Method::Get, "/files/docs/readme.md").unwrap();
        assert_eq!(m.value, "serve_file");
        assert_eq!(m.params.get("path"), Some(&"docs/readme.md".to_string()));
    }

    #[test]
    fn test_head_fallback() {
        let mut router: Router<&str> = Router::new();
        router.get("/resource", "get_resource").unwrap();

        // HEAD should fallback to GET
        let m = router.match_route(Method::Head, "/resource").unwrap();
        assert_eq!(m.value, "get_resource");
    }
}
