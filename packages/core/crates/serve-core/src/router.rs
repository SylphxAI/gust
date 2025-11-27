//! Radix Trie Router - O(k) path lookup
//! Supports static paths, parameters (:id), and wildcards (*)

use std::collections::HashMap;

/// Route match result
#[derive(Debug, Clone)]
pub struct Match {
    pub handler_id: u32,
    pub params: Vec<(String, String)>,
}

/// Trie node
#[derive(Debug, Default)]
struct Node {
    /// Static children (key = path segment)
    children: HashMap<String, Node>,
    /// Parameter child (:id)
    param_child: Option<Box<ParamNode>>,
    /// Wildcard child (*)
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

/// Radix Trie Router
#[derive(Debug, Default)]
pub struct Router {
    /// Method -> Trie root
    trees: HashMap<String, Node>,
}

impl Router {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert a route
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

        if segment.starts_with(':') {
            // Parameter
            let name = segment[1..].to_string();
            if node.param_child.is_none() {
                node.param_child = Some(Box::new(ParamNode {
                    name: name.clone(),
                    node: Node::default(),
                }));
            }
            let param = node.param_child.as_mut().unwrap();
            Self::insert_node(&mut param.node, rest, handler_id);
        } else if segment == "*" {
            // Wildcard - captures rest of path
            node.wildcard_child = Some(Box::new(WildcardNode {
                name: "*".to_string(),
                handler_id,
            }));
        } else {
            // Static segment
            let child = node.children.entry(segment.to_string()).or_default();
            Self::insert_node(child, rest, handler_id);
        }
    }

    /// Find a route
    pub fn find(&self, method: &str, path: &str) -> Option<Match> {
        let tree = self.trees.get(&method.to_uppercase())?;
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        let mut params = Vec::new();
        Self::find_node(tree, &segments, &mut params)
    }

    fn find_node(node: &Node, segments: &[&str], params: &mut Vec<(String, String)>) -> Option<Match> {
        if segments.is_empty() {
            return node.handler_id.map(|id| Match {
                handler_id: id,
                params: params.clone(),
            });
        }

        let segment = segments[0];
        let rest = &segments[1..];

        // Try exact match first (highest priority)
        if let Some(child) = node.children.get(segment) {
            if let Some(m) = Self::find_node(child, rest, params) {
                return Some(m);
            }
        }

        // Try parameter match
        if let Some(ref param) = node.param_child {
            params.push((param.name.clone(), segment.to_string()));
            if let Some(m) = Self::find_node(&param.node, rest, params) {
                return Some(m);
            }
            params.pop();
        }

        // Try wildcard match (lowest priority, captures everything)
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

        assert_eq!(router.find("GET", "/").unwrap().handler_id, 0);
        assert_eq!(router.find("GET", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("GET", "/users/list").unwrap().handler_id, 2);
        assert!(router.find("GET", "/unknown").is_none());
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
        assert_eq!(m.params, vec![
            ("id".to_string(), "42".to_string()),
            ("post_id".to_string(), "99".to_string()),
        ]);
    }

    #[test]
    fn test_wildcard_routes() {
        let mut router = Router::new();
        router.insert("GET", "/static/*", 1);

        let m = router.find("GET", "/static/js/app.js").unwrap();
        assert_eq!(m.handler_id, 1);
        assert_eq!(m.params, vec![("*".to_string(), "js/app.js".to_string())]);
    }

    #[test]
    fn test_priority() {
        let mut router = Router::new();
        router.insert("GET", "/users/:id", 1);
        router.insert("GET", "/users/me", 2);

        // Exact match should win
        assert_eq!(router.find("GET", "/users/me").unwrap().handler_id, 2);
        assert_eq!(router.find("GET", "/users/123").unwrap().handler_id, 1);
    }

    #[test]
    fn test_methods() {
        let mut router = Router::new();
        router.insert("GET", "/users", 1);
        router.insert("POST", "/users", 2);

        assert_eq!(router.find("GET", "/users").unwrap().handler_id, 1);
        assert_eq!(router.find("POST", "/users").unwrap().handler_id, 2);
        assert!(router.find("DELETE", "/users").is_none());
    }
}
