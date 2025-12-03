//! Validation for WASM
//!
//! Schema-based validation for request data.
//! Uses gust_core::middleware::validate for format validation (SSOT).

// Re-export types from gust-core (SSOT)
pub use gust_core::middleware::validate::{SchemaType, StringFormat};

/// Validation error
#[derive(Debug, Clone)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
    pub code: String,
}

/// Validation result
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
}

impl ValidationResult {
    pub fn ok() -> Self {
        Self { valid: true, errors: Vec::new() }
    }

    pub fn error(path: &str, message: &str, code: &str) -> Self {
        Self {
            valid: false,
            errors: vec![ValidationError {
                path: path.to_string(),
                message: message.to_string(),
                code: code.to_string(),
            }],
        }
    }
}

/// Validate a JSON string value
pub fn validate_string(
    value: &str,
    min_length: Option<usize>,
    max_length: Option<usize>,
    format: Option<StringFormat>,
) -> ValidationResult {
    // Length checks
    if let Some(min) = min_length {
        if value.len() < min {
            return ValidationResult::error(
                "",
                &format!("String length {} is less than minimum {}", value.len(), min),
                "min_length",
            );
        }
    }

    if let Some(max) = max_length {
        if value.len() > max {
            return ValidationResult::error(
                "",
                &format!("String length {} is greater than maximum {}", value.len(), max),
                "max_length",
            );
        }
    }

    // Format checks - use gust_core StringFormat.validate() (SSOT)
    if let Some(fmt) = format {
        if !fmt.validate(value) {
            return ValidationResult::error(
                "",
                &format!("Invalid {} format", fmt.name()),
                "format",
            );
        }
    }

    ValidationResult::ok()
}

/// Validate a number
pub fn validate_number(
    value: f64,
    min: Option<f64>,
    max: Option<f64>,
    is_integer: bool,
) -> ValidationResult {
    if is_integer && value.fract() != 0.0 {
        return ValidationResult::error("", "Value must be an integer", "integer");
    }

    if let Some(min_val) = min {
        if value < min_val {
            return ValidationResult::error(
                "",
                &format!("Value {} is less than minimum {}", value, min_val),
                "min",
            );
        }
    }

    if let Some(max_val) = max {
        if value > max_val {
            return ValidationResult::error(
                "",
                &format!("Value {} is greater than maximum {}", value, max_val),
                "max",
            );
        }
    }

    ValidationResult::ok()
}

// Format validators moved to gust_core::middleware::validate::StringFormat (SSOT)

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_validation() {
        // Use StringFormat.validate() from gust-core (SSOT)
        assert!(StringFormat::Email.validate("test@example.com"));
        assert!(StringFormat::Email.validate("user.name@domain.co.uk"));
        assert!(!StringFormat::Email.validate("invalid"));
        assert!(!StringFormat::Email.validate("@example.com"));
        assert!(!StringFormat::Email.validate("test@"));
    }

    #[test]
    fn test_uuid_validation() {
        // Use StringFormat.validate() from gust-core (SSOT)
        assert!(StringFormat::Uuid.validate("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!StringFormat::Uuid.validate("550e8400-e29b-41d4-a716"));
        assert!(!StringFormat::Uuid.validate("not-a-uuid"));
    }

    #[test]
    fn test_string_validation() {
        let result = validate_string("hello", Some(1), Some(10), None);
        assert!(result.valid);

        let result = validate_string("hi", Some(5), None, None);
        assert!(!result.valid);
    }

    #[test]
    fn test_number_validation() {
        let result = validate_number(5.0, Some(0.0), Some(10.0), false);
        assert!(result.valid);

        let result = validate_number(5.5, None, None, true);
        assert!(!result.valid);
    }
}
