//! gust-router: Zero-dependency Radix Trie HTTP Router
//!
//! Single Source of Truth (SSOT) router used by both gust-core (native)
//! and gust-wasm (WebAssembly) builds.
//!
//! ## Features
//! - O(k) path lookup where k = path length
//! - Static paths: `/users`, `/api/v1/health`
//! - Parameters: `/users/:id`, `/posts/:postId/comments/:commentId`
//! - Wildcards: `/files/*path`, `/static/*`
//! - Zero external dependencies
//!
//! ## Path Syntax
//! - `:name` - Named parameter (captures one segment)
//! - `*` or `*name` - Wildcard (captures remaining path)
//!
//! ## Priority
//! 1. Exact static match (highest)
//! 2. Parameter match
//! 3. Wildcard match (lowest)
//!
//! ## Example
//! ```
//! use gust_router::Router;
//!
//! let mut router = Router::new();
//! router.insert("GET", "/users", 0);
//! router.insert("GET", "/users/:id", 1);
//! router.insert("GET", "/files/*path", 2);
//!
//! let m = router.find("GET", "/users/123").unwrap();
//! assert_eq!(m.handler_id, 1);
//! assert_eq!(m.params, vec![("id".to_string(), "123".to_string())]);
//! ```

use std::collections::HashMap;

/// Route match result
#[derive(Debug, Clone, PartialEq)]
pub struct Match {
    /// The matched handler ID
    pub handler_id: u32,
    /// Captured path parameters as (name, value) pairs
    pub params: Vec<(String, String)>,
}

impl Match {
    /// Get params as HashMap for convenient access
    pub fn params_map(&self) -> HashMap<String, String> {
        self.params.iter().cloned().collect()
    }
}

/// Trie node for path segment matching
#[derive(Debug, Default)]
struct Node {
    /// Static children (key = path segment)
    children: HashMap<String, Node>,
    /// Parameter child (:id)
    param_child: Option<Box<ParamNode>>,
    /// Wildcard child (*path)
    wildcard_child: Option<Box<WildcardNode>>,
    /// Handler ID if this is a terminal node
    handler_id: Option<u32>,
}

#[derive(Debug)]
struct ParamNode {
    name: String,
    node: Node,
}

#[derive(Debug)]
struct WildcardNode {
    name: String,
    handler_id: u32,
}

/// Zero-dependency Radix Trie HTTP Router
///
/// Routes are organized by HTTP method for O(1) method dispatch,
/// then matched using a radix trie for O(k) path matching.
#[derive(Debug, Default)]
pub struct Router {
    /// Method -> Trie root
    trees: HashMap<String, Node>,
}

impl Router {
    /// Create a new router
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert a route
    ///
    /// # Arguments
    /// * `method` - HTTP method (GET, POST, etc.)
    /// * `path` - URL path with optional params (:id) and wildcards (*)
    /// * `handler_id` - Unique identifier for the handler
    ///
    /// # Example
    /// ```
    /// use gust_router::Router;
    ///
    /// let mut router = Router::new();
    /// router.insert("GET", "/users/:id", 0);
    /// router.insert("POST", "/users", 1);
    /// ```
    pub fn insert(&mut self, method: &str, path: &str, handler_id: u32) {
        let tree = self.trees.entry(method.to_uppercase()).or_default();
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        Self::insert_node(tree, &segments, handler_id);
    }

    fn insert_node(node: &mut Node, segments: &[&str], handler_id: u32) {
        if segments.is_empty() {
            node.handler_id = Some(handler_id);
            return;
        }

        let segment = segments[0];
        let rest = &segments[1..];

        if let Some(name) = segment.strip_prefix(':') {
            // Parameter segment (:id, :userId, etc.)
            if node.param_child.is_none() {
                node.param_child = Some(Box::new(ParamNode {
                    name: name.to_string(),
                    node: Node::default(),
                }));
            }
            let param = node.param_child.as_mut().unwrap();
            Self::insert_node(&mut param.node, rest, handler_id);
        } else if let Some(name) = segment.strip_prefix('*') {
            // Wildcard segment (*path or bare *)
            let wildcard_name = if name.is_empty() { "*" } else { name };
            node.wildcard_child = Some(Box::new(WildcardNode {
                name: wildcard_name.to_string(),
                handler_id,
            }));
        } else {
            // Static segment
            let child = node.children.entry(segment.to_string()).or_default();
            Self::insert_node(child, rest, handler_id);
        }
    }

    /// Find a matching route
    ///
    /// # Arguments
    /// * `method` - HTTP method
    /// * `path` - URL path to match
    ///
    /// # Returns
    /// `Some(Match)` with handler_id and captured params, or `None` if no match
    ///
    /// # Example
    /// ```
    /// use gust_router::Router;
    ///
    /// let mut router = Router::new();
    /// router.insert("GET", "/users/:id", 0);
    ///
    /// let m = router.find("GET", "/users/42").unwrap();
    /// assert_eq!(m.handler_id, 0);
    /// assert_eq!(m.params[0], ("id".to_string(), "42".to_string()));
    /// ```
    pub fn find(&self, method: &str, path: &str) -> Option<Match> {
        let tree = self.trees.get(&method.to_uppercase())?;
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut params = Vec::new();
        Self::find_node(tree, &segments, &mut params)
    }

    fn find_node(
        node: &Node,
        segments: &[&str],
        params: &mut Vec<(String, String)>,
    ) -> Option<Match> {
        if segments.is_empty() {
            return node.handler_id.map(|id| Match {
                handler_id: id,
                params: params.clone(),
            });
        }

        let segment = segments[0];
        let rest = &segments[1..];

        // Priority 1: Try exact static match (highest priority)
        if let Some(child) = node.children.get(segment) {
            if let Some(m) = Self::find_node(child, rest, params) {
                return Some(m);
            }
        }

        // Priority 2: Try parameter match
        if let Some(ref param) = node.param_child {
            params.push((param.name.clone(), segment.to_string()));
            if let Some(m) = Self::find_node(&param.node, rest, params) {
                return Some(m);
            }
            params.pop();
        }

        // Priority 3: Try wildcard match (lowest priority, captures everything)
        if let Some(ref wildcard) = node.wildcard_child {
            let rest_path = segments.join("/");
            params.push((wildcard.name.clone(), rest_path));
            return Some(Match {
                handler_id: wildcard.handler_id,
                params: params.clone(),
            });
        }

        None
    }

    /// Check if a method has any routes registered
    pub fn has_method(&self, method: &str) -> bool {
        self.trees.contains_key(&method.to_uppercase())
    }

    /// Get all registered methods
    pub fn methods(&self) -> Vec<String> {
        self.trees.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_static_routes() {
        let mut router = Router::new();
        router.insert("GET", "/", 0);
        router.insert("GET", "/users", 1);
        router.insert("GET", "/users/list", 2);
        router.insert("POST", "/users", 3);

        assert_eq!(router.find("GET", "/").unwrap().handler_id, 0);
        assert_eq!(router.find("GET", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("GET", "/users/list").unwrap().handler_id, 2);
        assert_eq!(router.find("POST", "/users").unwrap().handler_id, 3);
        assert!(router.find("GET", "/unknown").is_none());
        assert!(router.find("DELETE", "/users").is_none());
    }

    #[test]
    fn test_param_routes() {
        let mut router = Router::new();
        router.insert("GET", "/users/:id", 1);
        router.insert("GET", "/users/:id/posts/:post_id", 2);

        let m = router.find("GET", "/users/42").unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(m.params, vec![("id".to_string(), "42".to_string())]);

        let m = router.find("GET", "/users/42/posts/99").unwrap();
        assert_eq!(m.handler_id, 2);
        assert_eq!(
            m.params,
            vec![
                ("id".to_string(), "42".to_string()),
                ("post_id".to_string(), "99".to_string()),
            ]
        );
    }

    #[test]
    fn test_named_wildcard() {
        let mut router = Router::new();
        router.insert("GET", "/files/*path", 1);

        let m = router.find("GET", "/files/docs/readme.md").unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(
            m.params,
            vec![("path".to_string(), "docs/readme.md".to_string())]
        );
    }

    #[test]
    fn test_bare_wildcard() {
        let mut router = Router::new();
        router.insert("GET", "/static/*", 1);

        let m = router.find("GET", "/static/js/app.js").unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(m.params, vec![("*".to_string(), "js/app.js".to_string())]);
    }

    #[test]
    fn test_priority_exact_over_param() {
        let mut router = Router::new();
        router.insert("GET", "/users/:id", 1);
        router.insert("GET", "/users/me", 2);

        // Exact match should win over parameter
        assert_eq!(router.find("GET", "/users/me").unwrap().handler_id, 2);
        assert_eq!(router.find("GET", "/users/123").unwrap().handler_id, 1);
    }

    #[test]
    fn test_priority_param_over_wildcard() {
        let mut router = Router::new();
        router.insert("GET", "/api/:version", 1);
        router.insert("GET", "/api/*", 2);

        // Param should match single segment
        assert_eq!(router.find("GET", "/api/v1").unwrap().handler_id, 1);
        // Wildcard should match multiple segments
        assert_eq!(
            router.find("GET", "/api/v1/users").unwrap().handler_id,
            2
        );
    }

    #[test]
    fn test_complex_nested_params() {
        let mut router = Router::new();
        router.insert(
            "GET",
            "/api/v1/orgs/:orgId/teams/:teamId/members/:memberId",
            1,
        );

        let m = router
            .find("GET", "/api/v1/orgs/org1/teams/team2/members/mem3")
            .unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(
            m.params,
            vec![
                ("orgId".to_string(), "org1".to_string()),
                ("teamId".to_string(), "team2".to_string()),
                ("memberId".to_string(), "mem3".to_string()),
            ]
        );
    }

    #[test]
    fn test_params_map() {
        let mut router = Router::new();
        router.insert("GET", "/users/:id", 1);

        let m = router.find("GET", "/users/42").unwrap();
        let map = m.params_map();
        assert_eq!(map.get("id"), Some(&"42".to_string()));
    }

    #[test]
    fn test_methods() {
        let mut router = Router::new();
        router.insert("GET", "/users", 1);
        router.insert("POST", "/users", 2);
        router.insert("DELETE", "/users/:id", 3);

        assert!(router.has_method("GET"));
        assert!(router.has_method("POST"));
        assert!(router.has_method("DELETE"));
        assert!(!router.has_method("PUT"));

        let methods = router.methods();
        assert!(methods.contains(&"GET".to_string()));
        assert!(methods.contains(&"POST".to_string()));
        assert!(methods.contains(&"DELETE".to_string()));
    }

    #[test]
    fn test_case_insensitive_method() {
        let mut router = Router::new();
        router.insert("get", "/users", 1);

        assert_eq!(router.find("GET", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("get", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("Get", "/users").unwrap().handler_id, 1);
    }

    #[test]
    fn test_root_path() {
        let mut router = Router::new();
        router.insert("GET", "/", 0);
        router.insert("GET", "/api", 1);

        assert_eq!(router.find("GET", "/").unwrap().handler_id, 0);
        assert_eq!(router.find("GET", "/api").unwrap().handler_id, 1);
    }

    #[test]
    fn test_trailing_slash() {
        let mut router = Router::new();
        router.insert("GET", "/users/", 1);

        // With current impl, trailing slash is filtered out
        assert_eq!(router.find("GET", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("GET", "/users/").unwrap().handler_id, 1);
    }
}
