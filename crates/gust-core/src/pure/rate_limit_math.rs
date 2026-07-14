//! Pure fixed/sliding window decision math (parity: packages/app rateLimit checks).
//! Store side-effects stay at middleware boundary; this is the decision kernel.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimitDecision {
    pub allowed: bool,
    pub remaining: u32,
    pub reset_time_ms: u64,
}

/// Fixed-window decision given current count/reset and now (ms epoch).
/// Returns updated count when allowed (caller persists).
#[must_use]
pub fn fixed_window_decision(
    now_ms: u64,
    max: u32,
    window_ms: u64,
    existing_count: Option<u32>,
    existing_reset_ms: Option<u64>,
) -> (RateLimitDecision, u32) {
    let expired = existing_reset_ms.map(|r| r < now_ms).unwrap_or(true);
    if existing_count.is_none() || expired {
        let reset = now_ms.saturating_add(window_ms);
        return (
            RateLimitDecision {
                allowed: true,
                remaining: max.saturating_sub(1),
                reset_time_ms: reset,
            },
            1,
        );
    }
    let count = existing_count.unwrap_or(0);
    let reset = existing_reset_ms.unwrap_or(now_ms.saturating_add(window_ms));
    if count >= max {
        return (
            RateLimitDecision {
                allowed: false,
                remaining: 0,
                reset_time_ms: reset,
            },
            count,
        );
    }
    let new_count = count + 1;
    (
        RateLimitDecision {
            allowed: true,
            remaining: max.saturating_sub(new_count),
            reset_time_ms: reset,
        },
        new_count,
    )
}

/// Sliding-window decision over request timestamps (ms).
/// Returns decision + filtered+new timestamps to persist.
#[must_use]
pub fn sliding_window_decision(
    now_ms: u64,
    max: u32,
    window_ms: u64,
    prior_requests_ms: &[u64],
) -> (RateLimitDecision, Vec<u64>) {
    let window_start = now_ms.saturating_sub(window_ms);
    let mut kept: Vec<u64> = prior_requests_ms
        .iter()
        .copied()
        .filter(|t| *t > window_start)
        .collect();
    if kept.len() as u32 >= max {
        let oldest = kept.first().copied().unwrap_or(now_ms);
        let reset = oldest.saturating_add(window_ms);
        return (
            RateLimitDecision {
                allowed: false,
                remaining: 0,
                reset_time_ms: reset,
            },
            kept,
        );
    }
    kept.push(now_ms);
    let count = kept.len() as u32;
    let oldest = kept.first().copied().unwrap_or(now_ms);
    let reset = oldest.saturating_add(window_ms);
    (
        RateLimitDecision {
            allowed: true,
            remaining: max.saturating_sub(count),
            reset_time_ms: reset,
        },
        kept,
    )
}

/// Build standard rate-limit response header values (limit/remaining/reset/retry-after).
#[must_use]
pub fn rate_limit_headers(
    max: u32,
    remaining: u32,
    reset_time_ms: u64,
    now_ms: u64,
) -> [(String, String); 4] {
    let reset_s = reset_time_ms.div_ceil(1000);
    let retry_after = reset_time_ms.saturating_sub(now_ms).div_ceil(1000);
    [
        ("x-ratelimit-limit".into(), max.to_string()),
        ("x-ratelimit-remaining".into(), remaining.to_string()),
        ("x-ratelimit-reset".into(), reset_s.to_string()),
        ("retry-after".into(), retry_after.to_string()),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_window_blocks_at_max() {
        let (d1, c1) = fixed_window_decision(1000, 2, 60_000, None, None);
        assert!(d1.allowed);
        assert_eq!(c1, 1);
        let (d2, c2) = fixed_window_decision(1001, 2, 60_000, Some(c1), Some(d1.reset_time_ms));
        assert!(d2.allowed);
        assert_eq!(c2, 2);
        let (d3, _) = fixed_window_decision(1002, 2, 60_000, Some(c2), Some(d2.reset_time_ms));
        assert!(!d3.allowed);
        assert_eq!(d3.remaining, 0);
    }

    #[test]
    fn sliding_window_prunes_old() {
        let prior = vec![1000_u64, 1100];
        let (d, kept) = sliding_window_decision(70_000, 2, 60_000, &prior);
        // window_start = 10000; both prior may be pruned if < start
        // 1000 and 1100 < 10000 → pruned → allowed
        assert!(d.allowed);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0], 70_000);
    }

    #[test]
    fn headers_ceil_seconds() {
        let h = rate_limit_headers(100, 0, 1500, 0);
        assert_eq!(h[0].1, "100");
        assert_eq!(h[1].1, "0");
        assert_eq!(h[2].1, "2"); // ceil 1.5s
        assert_eq!(h[3].1, "2");
    }
}
