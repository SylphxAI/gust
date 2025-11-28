//! Validation for WASM
//!
//! Schema-based validation for request data.

/// Schema type
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaType {
    String,
    Number,
    Boolean,
    Object,
    Array,
    Any,
}

/// String format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringFormat {
    Email,
    Url,
    Uuid,
    Date,
    DateTime,
}

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

    // Format checks
    if let Some(fmt) = format {
        let valid = match fmt {
            StringFormat::Email => is_valid_email(value),
            StringFormat::Url => is_valid_url(value),
            StringFormat::Uuid => is_valid_uuid(value),
            StringFormat::Date => is_valid_date(value),
            StringFormat::DateTime => is_valid_datetime(value),
        };

        if !valid {
            return ValidationResult::error(
                "",
                &format!("Invalid {:?} format", fmt),
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

// ============================================================================
// Format validators
// ============================================================================

fn is_valid_email(s: &str) -> bool {
    // Simple email validation
    let at_pos = s.find('@');
    let dot_pos = s.rfind('.');

    match (at_pos, dot_pos) {
        (Some(at), Some(dot)) => {
            at > 0 && dot > at + 1 && dot < s.len() - 1 && !s.contains(' ')
        }
        _ => false,
    }
}

fn is_valid_url(s: &str) -> bool {
    s.starts_with("http://") || s.starts_with("https://")
}

fn is_valid_uuid(s: &str) -> bool {
    if s.len() != 36 {
        return false;
    }

    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 5 {
        return false;
    }

    let expected_lens = [8, 4, 4, 4, 12];
    for (part, &expected) in parts.iter().zip(&expected_lens) {
        if part.len() != expected {
            return false;
        }
        if !part.chars().all(|c| c.is_ascii_hexdigit()) {
            return false;
        }
    }

    true
}

fn is_valid_date(s: &str) -> bool {
    // YYYY-MM-DD format
    if s.len() != 10 {
        return false;
    }

    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 3 {
        return false;
    }

    parts[0].len() == 4 && parts[1].len() == 2 && parts[2].len() == 2
        && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
}

fn is_valid_datetime(s: &str) -> bool {
    // ISO 8601 format: YYYY-MM-DDTHH:MM:SS
    if s.len() < 19 {
        return false;
    }

    // Check date part
    if !is_valid_date(&s[..10]) {
        return false;
    }

    // Check separator
    if s.as_bytes()[10] != b'T' {
        return false;
    }

    // Check time part (basic validation)
    let time = &s[11..19];
    let parts: Vec<&str> = time.split(':').collect();
    parts.len() == 3 && parts.iter().all(|p| p.len() == 2 && p.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_validation() {
        assert!(is_valid_email("test@example.com"));
        assert!(is_valid_email("user.name@domain.co.uk"));
        assert!(!is_valid_email("invalid"));
        assert!(!is_valid_email("@example.com"));
        assert!(!is_valid_email("test@"));
    }

    #[test]
    fn test_uuid_validation() {
        assert!(is_valid_uuid("550e8400-e29b-41d4-a716-446655440000"));
        assert!(!is_valid_uuid("550e8400-e29b-41d4-a716"));
        assert!(!is_valid_uuid("not-a-uuid"));
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
