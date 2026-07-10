//! TRUE differential parity: TS contract oracle vs native Rust SSOT (gust-core).
//!
//! Fail-closed — no SKIP-as-pass. Oracle JSON must be present before comparison.
//! Bounded slices (rej-010):
//! - `http-core.router` — radix trie static/param/wildcard priority
//! - `http-core.parse` — Method enum SSOT (bytes/from_str/from_u8/as_str)
//! - `trace.w3c` — W3C traceparent parse/format (middleware-security-stack subset)
//!
//! See scripts/run-gust-differential.sh and docs/specs/http-core-parity-slice.json.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

use gust_core::parser::Method;
use gust_core::router::Router;
use gust_core::tracing::{format_traceparent, parse_traceparent, SpanContext};
use serde::Deserialize;
use serde_json::{json, Value};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn corpus_fixture_path() -> PathBuf {
    repo_root().join("scripts/differential/fixtures/http-core-corpus.json")
}

#[derive(Debug, Deserialize)]
struct OracleCase {
    id: String,
    domain: String,
    input: Value,
    output: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OracleCorpus {
    corpus_version: u32,
    slice: String,
    fixture_corpus_hash: String,
    behavior_spec_hash: String,
    cases: Vec<OracleCase>,
}

fn run_ts_oracle() -> OracleCorpus {
    if let Ok(path) = std::env::var("GUST_ORACLE_JSON") {
        let raw = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read oracle at {path}: {error}"));
        return serde_json::from_str(&raw).expect("oracle file must be valid JSON");
    }

    let script = repo_root().join("scripts/differential/http-core-oracle.ts");
    let output = Command::new("bun")
        .arg("run")
        .arg(&script)
        .current_dir(repo_root())
        .output()
        .unwrap_or_else(|error| panic!("spawn TS oracle at {}: {error}", script.display()));

    assert!(
        output.status.success(),
        "TS oracle failed:\nstdout: {}\nstderr: {}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    serde_json::from_slice(&output.stdout).expect("oracle output must be valid JSON")
}

fn compare_router_case(case: &OracleCase) {
    let routes = case.input["routes"]
        .as_array()
        .expect("routes array");
    let mut router = Router::new();
    for route in routes {
        let method = route["method"].as_str().expect("method");
        let path = route["path"].as_str().expect("path");
        let handler_id = route["handlerId"].as_u64().expect("handlerId") as u32;
        router.insert(method, path, handler_id);
    }
    let lookup = &case.input["lookup"];
    let method = lookup["method"].as_str().expect("lookup.method");
    let path = lookup["path"].as_str().expect("lookup.path");
    let native = match router.find(method, path) {
        Some(m) => {
            let params: Vec<Value> = m
                .params
                .iter()
                .map(|(name, value)| json!({ "name": name, "value": value }))
                .collect();
            json!({
                "found": true,
                "handlerId": m.handler_id,
                "params": params,
            })
        }
        None => json!({ "found": false }),
    };
    assert_eq!(native, case.output, "router case {}", case.id);
}

fn compare_parse_case(case: &OracleCase) {
    let kind = case.input["kind"].as_str().expect("parse kind");
    let native = match kind {
        "methodBytes" => {
            let bytes = case.input["bytes"].as_str().expect("bytes");
            match Method::parse(bytes.as_bytes()) {
                Some(m) => json!({
                    "ok": true,
                    "code": m as u8,
                    "name": m.as_str(),
                }),
                None => json!({ "ok": false }),
            }
        }
        "methodFromStr" => {
            let value = case.input["value"].as_str().expect("value");
            match Method::from_str(value) {
                Ok(m) => json!({
                    "ok": true,
                    "code": m as u8,
                    "name": m.as_str(),
                }),
                Err(_) => json!({ "ok": false }),
            }
        }
        "methodFromU8" => {
            let code = case.input["code"].as_u64().expect("code") as u8;
            match Method::from_u8(code) {
                Some(m) => json!({
                    "ok": true,
                    "code": m as u8,
                    "name": m.as_str(),
                }),
                None => json!({ "ok": false }),
            }
        }
        "methodAsStr" => {
            let code = case.input["code"].as_u64().expect("code") as u8;
            match Method::from_u8(code) {
                Some(m) => json!({ "ok": true, "name": m.as_str() }),
                None => json!({ "ok": false }),
            }
        }
        other => panic!("unsupported parse kind {other} in case {}", case.id),
    };
    assert_eq!(native, case.output, "parse case {}", case.id);
}

fn compare_trace_case(case: &OracleCase) {
    let kind = case.input["kind"].as_str().expect("trace kind");
    let native = match kind {
        "parse" => {
            let header = case.input["header"].as_str().expect("header");
            match parse_traceparent(header) {
                Some(ctx) => json!({
                    "ok": true,
                    "traceId": ctx.trace_id,
                    "spanId": ctx.span_id,
                    "traceFlags": ctx.trace_flags,
                }),
                None => json!({ "ok": false }),
            }
        }
        "format" => {
            let ctx = SpanContext {
                trace_id: case.input["traceId"]
                    .as_str()
                    .expect("traceId")
                    .to_string(),
                span_id: case.input["spanId"].as_str().expect("spanId").to_string(),
                trace_flags: case.input["traceFlags"].as_u64().expect("traceFlags") as u8,
                trace_state: None,
            };
            json!({ "header": format_traceparent(&ctx) })
        }
        other => panic!("unsupported trace kind {other} in case {}", case.id),
    };
    assert_eq!(native, case.output, "trace case {}", case.id);
}

fn compare_case(case: &OracleCase) {
    match case.domain.as_str() {
        "http-core.router" => compare_router_case(case),
        "http-core.parse" => compare_parse_case(case),
        "trace.w3c" => compare_trace_case(case),
        other => panic!("unsupported domain {other} in case {}", case.id),
    }
}

fn assert_oracle_metadata(oracle: &OracleCorpus) {
    assert_eq!(oracle.corpus_version, 1);
    assert!(!oracle.fixture_corpus_hash.is_empty());
    assert!(!oracle.behavior_spec_hash.is_empty());
    assert!(!oracle.cases.is_empty(), "oracle must emit cases");
    assert!(
        oracle.slice.contains("http-core.router"),
        "slice metadata must include http-core.router"
    );
}

#[test]
fn http_core_differential_matches_ts_oracle() {
    let _ = fs::read_to_string(corpus_fixture_path()).expect("read http-core corpus fixture");
    let oracle = run_ts_oracle();
    assert_oracle_metadata(&oracle);

    for case in &oracle.cases {
        compare_case(case);
    }
}
