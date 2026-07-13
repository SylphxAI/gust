//! Range-header pure corpus (ADR-168 rust_impl deepen for napi-native-bindings surface).

use gust_core::middleware::{content_range, parse_range};

#[test]
fn parse_range_bytes_suffix_and_open_end() {
    let full = parse_range("bytes=0-499", 1000).expect("full");
    assert!(full.is_single());
    assert_eq!(full.ranges[0].start, 0);
    assert_eq!(full.ranges[0].end, 499);

    let open = parse_range("bytes=500-", 1000).expect("open");
    assert_eq!(open.ranges[0].start, 500);
    assert_eq!(open.ranges[0].end, 999);

    let suffix = parse_range("bytes=-200", 1000).expect("suffix");
    assert_eq!(suffix.ranges[0].start, 800);
    assert_eq!(suffix.ranges[0].end, 999);
}

#[test]
fn content_range_format() {
    assert_eq!(content_range(0, 499, 1000), "bytes 0-499/1000");
}

#[test]
fn unsatisfiable_returns_none() {
    assert!(parse_range("bytes=2000-3000", 1000).is_none());
}
