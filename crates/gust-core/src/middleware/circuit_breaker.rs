//! Circuit Breaker Middleware
//!
//! Fault tolerance pattern for handling failures gracefully.
//! Implements the circuit breaker pattern with three states:
//! - Closed: Normal operation, requests pass through
//! - Open: Circuit tripped, requests fail fast
//! - Half-Open: Testing if service recovered

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// Circuit breaker state
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitState {
    /// Normal operation - requests pass through
    Closed,
    /// Circuit tripped - requests fail immediately
    Open,
    /// Testing recovery - limited requests allowed
    HalfOpen,
}

impl CircuitState {
    pub fn as_str(&self) -> &'static str {
        match self {
            CircuitState::Closed => "closed",
            CircuitState::Open => "open",
            CircuitState::HalfOpen => "half-open",
        }
    }
}

/// Circuit breaker statistics
#[derive(Debug, Clone)]
pub struct CircuitStats {
    pub state: CircuitState,
    pub failures: u32,
    pub successes: u32,
    pub total_requests: u64,
    pub total_failures: u64,
    pub total_successes: u64,
    pub last_failure_ms: Option<u64>,
    pub last_success_ms: Option<u64>,
}

/// Circuit breaker configuration
#[derive(Debug, Clone)]
pub struct CircuitBreakerConfig {
    /// Failure threshold to open circuit (default: 5)
    pub failure_threshold: u32,
    /// Success threshold to close circuit from half-open (default: 2)
    pub success_threshold: u32,
    /// Time before trying again (default: 30s)
    pub reset_timeout: Duration,
    /// Time window for counting failures (default: 60s)
    pub failure_window: Duration,
    /// Request timeout (default: 10s)
    pub timeout: Duration,
    /// Name for monitoring
    pub name: String,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 2,
            reset_timeout: Duration::from_secs(30),
            failure_window: Duration::from_secs(60),
            timeout: Duration::from_secs(10),
            name: "default".to_string(),
        }
    }
}

impl CircuitBreakerConfig {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            ..Default::default()
        }
    }

    pub fn failure_threshold(mut self, threshold: u32) -> Self {
        self.failure_threshold = threshold;
        self
    }

    pub fn success_threshold(mut self, threshold: u32) -> Self {
        self.success_threshold = threshold;
        self
    }

    pub fn reset_timeout(mut self, timeout: Duration) -> Self {
        self.reset_timeout = timeout;
        self
    }

    pub fn failure_window(mut self, window: Duration) -> Self {
        self.failure_window = window;
        self
    }

    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

/// Circuit breaker implementation
pub struct CircuitBreaker {
    config: CircuitBreakerConfig,
    state: RwLock<CircuitState>,
    /// Timestamps of recent failures (within failure window)
    failures: RwLock<Vec<Instant>>,
    /// Successes in half-open state
    half_open_successes: AtomicU32,
    /// Next attempt time (when circuit is open)
    next_attempt: RwLock<Option<Instant>>,
    /// Statistics
    total_requests: AtomicU64,
    total_failures: AtomicU64,
    total_successes: AtomicU64,
    last_failure: RwLock<Option<Instant>>,
    last_success: RwLock<Option<Instant>>,
    /// Creation time for relative timestamps
    created_at: Instant,
}

impl CircuitBreaker {
    /// Create a new circuit breaker
    pub fn new(config: CircuitBreakerConfig) -> Self {
        Self {
            config,
            state: RwLock::new(CircuitState::Closed),
            failures: RwLock::new(Vec::new()),
            half_open_successes: AtomicU32::new(0),
            next_attempt: RwLock::new(None),
            total_requests: AtomicU64::new(0),
            total_failures: AtomicU64::new(0),
            total_successes: AtomicU64::new(0),
            last_failure: RwLock::new(None),
            last_success: RwLock::new(None),
            created_at: Instant::now(),
        }
    }

    /// Get current state
    pub fn state(&self) -> CircuitState {
        *self.state.read().unwrap()
    }

    /// Get circuit breaker name
    pub fn name(&self) -> &str {
        &self.config.name
    }

    /// Get timeout duration
    pub fn timeout(&self) -> Duration {
        self.config.timeout
    }

    /// Get statistics
    pub fn stats(&self) -> CircuitStats {
        let failures = self.failures.read().unwrap();
        let last_failure = self.last_failure.read().unwrap();
        let last_success = self.last_success.read().unwrap();

        CircuitStats {
            state: self.state(),
            failures: failures.len() as u32,
            successes: self.half_open_successes.load(Ordering::Relaxed),
            total_requests: self.total_requests.load(Ordering::Relaxed),
            total_failures: self.total_failures.load(Ordering::Relaxed),
            total_successes: self.total_successes.load(Ordering::Relaxed),
            last_failure_ms: last_failure.map(|t| t.duration_since(self.created_at).as_millis() as u64),
            last_success_ms: last_success.map(|t| t.duration_since(self.created_at).as_millis() as u64),
        }
    }

    /// Check if request can proceed
    pub fn can_request(&self) -> bool {
        let state = self.state();
        match state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                // Check if we can try again
                let next = self.next_attempt.read().unwrap();
                if let Some(next_time) = *next {
                    if Instant::now() >= next_time {
                        drop(next);
                        self.to_half_open();
                        return true;
                    }
                }
                false
            }
            CircuitState::HalfOpen => true,
        }
    }

    /// Record a successful request
    pub fn record_success(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_successes.fetch_add(1, Ordering::Relaxed);
        *self.last_success.write().unwrap() = Some(Instant::now());

        let state = self.state();
        if state == CircuitState::HalfOpen {
            let successes = self.half_open_successes.fetch_add(1, Ordering::Relaxed) + 1;
            if successes >= self.config.success_threshold {
                self.to_closed();
            }
        }
    }

    /// Record a failed request
    pub fn record_failure(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_failures.fetch_add(1, Ordering::Relaxed);
        *self.last_failure.write().unwrap() = Some(Instant::now());

        let state = self.state();
        match state {
            CircuitState::HalfOpen => {
                // Any failure in half-open immediately opens circuit
                self.to_open();
            }
            CircuitState::Closed => {
                // Add failure timestamp
                let now = Instant::now();
                let mut failures = self.failures.write().unwrap();
                failures.push(now);

                // Remove old failures outside window
                let window_start = now - self.config.failure_window;
                failures.retain(|t| *t > window_start);

                if failures.len() as u32 >= self.config.failure_threshold {
                    drop(failures);
                    self.to_open();
                }
            }
            CircuitState::Open => {
                // Already open, nothing to do
            }
        }
    }

    /// Force open the circuit
    pub fn open(&self) {
        self.to_open();
    }

    /// Force close the circuit
    pub fn close(&self) {
        self.to_closed();
    }

    /// Reset the circuit
    pub fn reset(&self) {
        *self.state.write().unwrap() = CircuitState::Closed;
        self.failures.write().unwrap().clear();
        self.half_open_successes.store(0, Ordering::Relaxed);
        *self.next_attempt.write().unwrap() = None;
    }

    fn to_open(&self) {
        let mut state = self.state.write().unwrap();
        if *state != CircuitState::Open {
            *state = CircuitState::Open;
            *self.next_attempt.write().unwrap() = Some(Instant::now() + self.config.reset_timeout);
            self.half_open_successes.store(0, Ordering::Relaxed);
        }
    }

    fn to_half_open(&self) {
        let mut state = self.state.write().unwrap();
        if *state != CircuitState::HalfOpen {
            *state = CircuitState::HalfOpen;
            self.half_open_successes.store(0, Ordering::Relaxed);
        }
    }

    fn to_closed(&self) {
        let mut state = self.state.write().unwrap();
        if *state != CircuitState::Closed {
            *state = CircuitState::Closed;
            self.failures.write().unwrap().clear();
            self.half_open_successes.store(0, Ordering::Relaxed);
        }
    }
}

/// Bulkhead configuration (concurrency limiter)
#[derive(Debug, Clone)]
pub struct BulkheadConfig {
    /// Maximum concurrent requests
    pub max_concurrent: u32,
    /// Maximum queue size
    pub max_queue: u32,
    /// Queue timeout
    pub queue_timeout: Duration,
}

impl Default for BulkheadConfig {
    fn default() -> Self {
        Self {
            max_concurrent: 10,
            max_queue: 100,
            queue_timeout: Duration::from_secs(30),
        }
    }
}

impl BulkheadConfig {
    pub fn new(max_concurrent: u32) -> Self {
        Self {
            max_concurrent,
            ..Default::default()
        }
    }

    pub fn max_queue(mut self, max: u32) -> Self {
        self.max_queue = max;
        self
    }

    pub fn queue_timeout(mut self, timeout: Duration) -> Self {
        self.queue_timeout = timeout;
        self
    }
}

/// Bulkhead (concurrency limiter)
pub struct Bulkhead {
    config: BulkheadConfig,
    running: AtomicU32,
    queued: AtomicU32,
}

impl Bulkhead {
    pub fn new(config: BulkheadConfig) -> Self {
        Self {
            config,
            running: AtomicU32::new(0),
            queued: AtomicU32::new(0),
        }
    }

    /// Try to acquire a slot
    /// Returns Ok(()) if acquired, Err(reason) if rejected
    pub fn try_acquire(&self) -> Result<BulkheadGuard<'_>, &'static str> {
        let current = self.running.load(Ordering::Relaxed);
        if current < self.config.max_concurrent {
            // Try to acquire
            if self.running.compare_exchange(
                current,
                current + 1,
                Ordering::Acquire,
                Ordering::Relaxed,
            ).is_ok() {
                return Ok(BulkheadGuard { bulkhead: self });
            }
        }

        // Check queue capacity
        let queued = self.queued.load(Ordering::Relaxed);
        if queued >= self.config.max_queue {
            return Err("Queue full");
        }

        Err("At capacity")
    }

    /// Get current running count
    pub fn running(&self) -> u32 {
        self.running.load(Ordering::Relaxed)
    }

    /// Get current queued count
    pub fn queued(&self) -> u32 {
        self.queued.load(Ordering::Relaxed)
    }
}

/// Guard that releases bulkhead slot on drop
pub struct BulkheadGuard<'a> {
    bulkhead: &'a Bulkhead,
}

impl<'a> Drop for BulkheadGuard<'a> {
    fn drop(&mut self) {
        self.bulkhead.running.fetch_sub(1, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circuit_breaker_closed() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::default());
        assert_eq!(cb.state(), CircuitState::Closed);
        assert!(cb.can_request());
    }

    #[test]
    fn test_circuit_breaker_opens_on_failures() {
        let config = CircuitBreakerConfig::default()
            .failure_threshold(3)
            .failure_window(Duration::from_secs(60));
        let cb = CircuitBreaker::new(config);

        // Record failures
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);
        assert!(!cb.can_request());
    }

    #[test]
    fn test_circuit_breaker_success_resets() {
        let config = CircuitBreakerConfig::default()
            .failure_threshold(3)
            .success_threshold(2);
        let cb = CircuitBreaker::new(config);

        // Open the circuit
        cb.record_failure();
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state(), CircuitState::Open);

        // Force to half-open for testing
        cb.close();
        cb.open();

        // Reset and verify
        cb.reset();
        assert_eq!(cb.state(), CircuitState::Closed);
    }

    #[test]
    fn test_circuit_breaker_stats() {
        let cb = CircuitBreaker::new(CircuitBreakerConfig::new("test"));

        cb.record_success();
        cb.record_failure();

        let stats = cb.stats();
        assert_eq!(stats.total_requests, 2);
        assert_eq!(stats.total_successes, 1);
        assert_eq!(stats.total_failures, 1);
    }

    #[test]
    fn test_bulkhead_capacity() {
        let bulkhead = Bulkhead::new(BulkheadConfig::new(2));

        let _g1 = bulkhead.try_acquire().unwrap();
        let _g2 = bulkhead.try_acquire().unwrap();

        // Should be at capacity
        assert!(bulkhead.try_acquire().is_err());
        assert_eq!(bulkhead.running(), 2);
    }

    #[test]
    fn test_bulkhead_release() {
        let bulkhead = Bulkhead::new(BulkheadConfig::new(1));

        {
            let _guard = bulkhead.try_acquire().unwrap();
            assert_eq!(bulkhead.running(), 1);
        }

        // Guard dropped, should be able to acquire again
        assert_eq!(bulkhead.running(), 0);
        assert!(bulkhead.try_acquire().is_ok());
    }
}
