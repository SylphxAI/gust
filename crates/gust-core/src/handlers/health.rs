//! Health check handler
//!
//! Provides liveness, readiness, and startup probes.

use crate::{Response, ResponseBuilder, StatusCode};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Health status
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthStatus {
    Healthy,
    Unhealthy,
    Degraded,
}

impl HealthStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            HealthStatus::Healthy => "healthy",
            HealthStatus::Unhealthy => "unhealthy",
            HealthStatus::Degraded => "degraded",
        }
    }

    pub fn status_code(&self) -> StatusCode {
        match self {
            HealthStatus::Healthy => StatusCode::OK,
            HealthStatus::Unhealthy => StatusCode::SERVICE_UNAVAILABLE,
            HealthStatus::Degraded => StatusCode::OK, // Still serving
        }
    }
}

/// Health check result
#[derive(Debug, Clone)]
pub struct HealthCheckResult {
    pub name: String,
    pub status: HealthStatus,
    pub message: Option<String>,
    pub duration: Duration,
}

/// Health check function type
pub type HealthCheckFn = Box<dyn Fn() -> HealthCheckResult + Send + Sync>;

/// Individual health check
pub struct HealthCheck {
    pub name: String,
    pub check: HealthCheckFn,
    pub critical: bool,
}

impl HealthCheck {
    pub fn new(name: impl Into<String>, check: impl Fn() -> HealthCheckResult + Send + Sync + 'static) -> Self {
        Self {
            name: name.into(),
            check: Box::new(check),
            critical: true,
        }
    }

    pub fn non_critical(mut self) -> Self {
        self.critical = false;
        self
    }

    pub fn run(&self) -> HealthCheckResult {
        let start = Instant::now();
        let mut result = (self.check)();
        result.duration = start.elapsed();
        result
    }
}

/// Health handler
pub struct Health {
    checks: Vec<HealthCheck>,
    ready: Arc<AtomicBool>,
    started: Arc<AtomicBool>,
}

impl Health {
    pub fn new() -> Self {
        Self {
            checks: Vec::new(),
            ready: Arc::new(AtomicBool::new(true)),
            started: Arc::new(AtomicBool::new(true)),
        }
    }

    /// Add a health check
    pub fn check(mut self, check: HealthCheck) -> Self {
        self.checks.push(check);
        self
    }

    /// Add a simple check
    pub fn add_check(
        mut self,
        name: impl Into<String>,
        check: impl Fn() -> bool + Send + Sync + 'static,
    ) -> Self {
        let name = name.into();
        let name_clone = name.clone();
        self.checks.push(HealthCheck::new(name, move || {
            HealthCheckResult {
                name: name_clone.clone(),
                status: if check() { HealthStatus::Healthy } else { HealthStatus::Unhealthy },
                message: None,
                duration: Duration::ZERO,
            }
        }));
        self
    }

    /// Set ready state
    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::SeqCst);
    }

    /// Set started state
    pub fn set_started(&self, started: bool) {
        self.started.store(started, Ordering::SeqCst);
    }

    /// Get ready state
    pub fn is_ready(&self) -> bool {
        self.ready.load(Ordering::SeqCst)
    }

    /// Get started state
    pub fn is_started(&self) -> bool {
        self.started.load(Ordering::SeqCst)
    }

    /// Run all health checks
    pub fn run_checks(&self) -> (HealthStatus, Vec<HealthCheckResult>) {
        let mut results = Vec::new();
        let mut overall_status = HealthStatus::Healthy;

        for check in &self.checks {
            let result = check.run();

            if check.critical && result.status == HealthStatus::Unhealthy {
                overall_status = HealthStatus::Unhealthy;
            } else if result.status == HealthStatus::Degraded && overall_status == HealthStatus::Healthy {
                overall_status = HealthStatus::Degraded;
            }

            results.push(result);
        }

        (overall_status, results)
    }

    /// Liveness probe - is the server alive?
    pub fn liveness(&self) -> Response {
        ResponseBuilder::new(StatusCode::OK)
            .header("Content-Type", "application/json")
            .body(r#"{"status":"alive"}"#)
            .build()
    }

    /// Readiness probe - is the server ready to receive traffic?
    pub fn readiness(&self) -> Response {
        if self.is_ready() {
            ResponseBuilder::new(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(r#"{"status":"ready"}"#)
                .build()
        } else {
            ResponseBuilder::new(StatusCode::SERVICE_UNAVAILABLE)
                .header("Content-Type", "application/json")
                .body(r#"{"status":"not_ready"}"#)
                .build()
        }
    }

    /// Startup probe - has the server started?
    pub fn startup(&self) -> Response {
        if self.is_started() {
            ResponseBuilder::new(StatusCode::OK)
                .header("Content-Type", "application/json")
                .body(r#"{"status":"started"}"#)
                .build()
        } else {
            ResponseBuilder::new(StatusCode::SERVICE_UNAVAILABLE)
                .header("Content-Type", "application/json")
                .body(r#"{"status":"starting"}"#)
                .build()
        }
    }

    /// Full health check with details
    pub fn health(&self) -> Response {
        let (status, results) = self.run_checks();

        let checks_json: Vec<String> = results
            .iter()
            .map(|r| {
                format!(
                    r#"{{"name":"{}","status":"{}","duration_ms":{}{}}}"#,
                    r.name,
                    r.status.as_str(),
                    r.duration.as_millis(),
                    r.message
                        .as_ref()
                        .map(|m| format!(r#","message":"{}""#, m))
                        .unwrap_or_default()
                )
            })
            .collect();

        let body = format!(
            r#"{{"status":"{}","checks":[{}]}}"#,
            status.as_str(),
            checks_json.join(",")
        );

        ResponseBuilder::new(status.status_code())
            .header("Content-Type", "application/json")
            .body(body)
            .build()
    }
}

impl Default for Health {
    fn default() -> Self {
        Self::new()
    }
}

/// Memory check - checks if memory usage is below threshold
pub fn memory_check(threshold_mb: u64) -> HealthCheck {
    HealthCheck::new("memory", move || {
        // Simple check - in production use proper memory metrics
        let usage = get_memory_usage_mb();
        let status = if usage < threshold_mb {
            HealthStatus::Healthy
        } else {
            HealthStatus::Degraded
        };

        HealthCheckResult {
            name: "memory".to_string(),
            status,
            message: Some(format!("{}MB used", usage)),
            duration: Duration::ZERO,
        }
    })
    .non_critical()
}

/// Event loop check - checks if event loop is responsive
pub fn event_loop_check(max_latency_ms: u64) -> HealthCheck {
    HealthCheck::new("event_loop", move || {
        let start = Instant::now();
        // Simple yield - in production measure actual event loop delay
        std::thread::yield_now();
        let latency = start.elapsed();

        let status = if latency.as_millis() < max_latency_ms as u128 {
            HealthStatus::Healthy
        } else {
            HealthStatus::Degraded
        };

        HealthCheckResult {
            name: "event_loop".to_string(),
            status,
            message: Some(format!("{}ms latency", latency.as_millis())),
            duration: latency,
        }
    })
    .non_critical()
}

fn get_memory_usage_mb() -> u64 {
    // Placeholder - would use proper memory metrics in production
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_status() {
        assert_eq!(HealthStatus::Healthy.as_str(), "healthy");
        assert_eq!(HealthStatus::Healthy.status_code(), StatusCode::OK);
        assert_eq!(HealthStatus::Unhealthy.status_code(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn test_health_probes() {
        let health = Health::new();

        let live = health.liveness();
        assert_eq!(live.status, StatusCode::OK);

        let ready = health.readiness();
        assert_eq!(ready.status, StatusCode::OK);

        health.set_ready(false);
        let not_ready = health.readiness();
        assert_eq!(not_ready.status, StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn test_health_check() {
        let health = Health::new()
            .add_check("always_healthy", || true)
            .add_check("always_unhealthy", || false);

        let (status, results) = health.run_checks();
        assert_eq!(status, HealthStatus::Unhealthy);
        assert_eq!(results.len(), 2);
    }
}
