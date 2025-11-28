//! Validation Middleware
//!
//! Schema-based request validation for body, query, and params.

use std::collections::HashMap;

/// Validation error
#[derive(Debug, Clone, PartialEq)]
pub struct ValidationError {
    /// Path to the invalid field (e.g., "body.email", "query.page")
    pub path: String,
    /// Error message
    pub message: String,
    /// The invalid value (for debugging)
    pub value: Option<String>,
}

impl ValidationError {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
            value: None,
        }
    }

    pub fn with_value(mut self, value: impl ToString) -> Self {
        self.value = Some(value.to_string());
        self
    }
}

/// Validation result
pub type ValidationResult<T> = Result<T, Vec<ValidationError>>;

/// Schema types
#[derive(Debug, Clone, PartialEq)]
pub enum SchemaType {
    String,
    Number,
    Boolean,
    Object,
    Array,
    Any,
}

/// String format validators
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StringFormat {
    Email,
    Url,
    Uuid,
    Date,
    DateTime,
}

impl StringFormat {
    pub fn validate(&self, value: &str) -> bool {
        match self {
            StringFormat::Email => {
                // Simple email validation
                let parts: Vec<&str> = value.split('@').collect();
                parts.len() == 2
                    && !parts[0].is_empty()
                    && !parts[1].is_empty()
                    && parts[1].contains('.')
                    && !value.contains(char::is_whitespace)
            }
            StringFormat::Url => {
                value.starts_with("http://") || value.starts_with("https://")
            }
            StringFormat::Uuid => {
                // UUID v1-5 format
                if value.len() != 36 {
                    return false;
                }
                let parts: Vec<&str> = value.split('-').collect();
                if parts.len() != 5 {
                    return false;
                }
                parts[0].len() == 8
                    && parts[1].len() == 4
                    && parts[2].len() == 4
                    && parts[3].len() == 4
                    && parts[4].len() == 12
                    && value.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
            }
            StringFormat::Date => {
                // YYYY-MM-DD
                if value.len() != 10 {
                    return false;
                }
                let parts: Vec<&str> = value.split('-').collect();
                if parts.len() != 3 {
                    return false;
                }
                parts[0].len() == 4
                    && parts[1].len() == 2
                    && parts[2].len() == 2
                    && parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit()))
            }
            StringFormat::DateTime => {
                // ISO 8601: YYYY-MM-DDTHH:MM:SS
                value.len() >= 19
                    && value.contains('T')
                    && StringFormat::Date.validate(&value[..10])
            }
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            StringFormat::Email => "email",
            StringFormat::Url => "url",
            StringFormat::Uuid => "uuid",
            StringFormat::Date => "date",
            StringFormat::DateTime => "datetime",
        }
    }
}

/// Schema definition
#[derive(Debug, Clone)]
pub struct Schema {
    pub schema_type: SchemaType,
    pub required: bool,
    pub nullable: bool,
    // String constraints
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<String>,
    pub format: Option<StringFormat>,
    pub enum_values: Option<Vec<String>>,
    // Number constraints
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub integer: bool,
    // Object constraints
    pub properties: Option<HashMap<String, Schema>>,
    pub additional_properties: bool,
    // Array constraints
    pub items: Option<Box<Schema>>,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
    pub unique_items: bool,
}

impl Default for Schema {
    fn default() -> Self {
        Self {
            schema_type: SchemaType::Any,
            required: true,
            nullable: false,
            min_length: None,
            max_length: None,
            pattern: None,
            format: None,
            enum_values: None,
            min: None,
            max: None,
            integer: false,
            properties: None,
            additional_properties: true,
            items: None,
            min_items: None,
            max_items: None,
            unique_items: false,
        }
    }
}

// Builder methods
impl Schema {
    pub fn string() -> Self {
        Self {
            schema_type: SchemaType::String,
            ..Default::default()
        }
    }

    pub fn number() -> Self {
        Self {
            schema_type: SchemaType::Number,
            ..Default::default()
        }
    }

    pub fn integer() -> Self {
        Self {
            schema_type: SchemaType::Number,
            integer: true,
            ..Default::default()
        }
    }

    pub fn boolean() -> Self {
        Self {
            schema_type: SchemaType::Boolean,
            ..Default::default()
        }
    }

    pub fn object() -> Self {
        Self {
            schema_type: SchemaType::Object,
            properties: Some(HashMap::new()),
            ..Default::default()
        }
    }

    pub fn array(items: Schema) -> Self {
        Self {
            schema_type: SchemaType::Array,
            items: Some(Box::new(items)),
            ..Default::default()
        }
    }

    pub fn any() -> Self {
        Self {
            schema_type: SchemaType::Any,
            ..Default::default()
        }
    }

    pub fn required(mut self, required: bool) -> Self {
        self.required = required;
        self
    }

    pub fn optional(mut self) -> Self {
        self.required = false;
        self
    }

    pub fn nullable(mut self, nullable: bool) -> Self {
        self.nullable = nullable;
        self
    }

    pub fn min_length(mut self, len: usize) -> Self {
        self.min_length = Some(len);
        self
    }

    pub fn max_length(mut self, len: usize) -> Self {
        self.max_length = Some(len);
        self
    }

    pub fn pattern(mut self, pattern: impl Into<String>) -> Self {
        self.pattern = Some(pattern.into());
        self
    }

    pub fn format(mut self, format: StringFormat) -> Self {
        self.format = Some(format);
        self
    }

    pub fn email() -> Self {
        Self::string().format(StringFormat::Email)
    }

    pub fn url() -> Self {
        Self::string().format(StringFormat::Url)
    }

    pub fn uuid() -> Self {
        Self::string().format(StringFormat::Uuid)
    }

    pub fn enum_values(mut self, values: Vec<String>) -> Self {
        self.enum_values = Some(values);
        self
    }

    pub fn min(mut self, min: f64) -> Self {
        self.min = Some(min);
        self
    }

    pub fn max(mut self, max: f64) -> Self {
        self.max = Some(max);
        self
    }

    pub fn property(mut self, name: impl Into<String>, schema: Schema) -> Self {
        if self.properties.is_none() {
            self.properties = Some(HashMap::new());
        }
        self.properties.as_mut().unwrap().insert(name.into(), schema);
        self
    }

    pub fn additional_properties(mut self, allow: bool) -> Self {
        self.additional_properties = allow;
        self
    }

    pub fn min_items(mut self, min: usize) -> Self {
        self.min_items = Some(min);
        self
    }

    pub fn max_items(mut self, max: usize) -> Self {
        self.max_items = Some(max);
        self
    }

    pub fn unique_items(mut self, unique: bool) -> Self {
        self.unique_items = unique;
        self
    }
}

/// JSON-like value for validation
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    Object(HashMap<String, Value>),
}

impl Value {
    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(arr) => Some(arr),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&HashMap<String, Value>> {
        match self {
            Value::Object(obj) => Some(obj),
            _ => None,
        }
    }

    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "boolean",
            Value::Number(_) => "number",
            Value::String(_) => "string",
            Value::Array(_) => "array",
            Value::Object(_) => "object",
        }
    }
}

/// Validate a value against a schema
pub fn validate(value: &Value, schema: &Schema, path: &str) -> Vec<ValidationError> {
    let mut errors = Vec::new();

    // Handle null
    if value.is_null() {
        if schema.nullable {
            return errors;
        }
        errors.push(ValidationError::new(path, "Value cannot be null"));
        return errors;
    }

    // Type validation
    match schema.schema_type {
        SchemaType::String => {
            if let Some(s) = value.as_str() {
                validate_string(s, schema, path, &mut errors);
            } else {
                errors.push(ValidationError::new(
                    path,
                    format!("Expected string, got {}", value.type_name()),
                ));
            }
        }
        SchemaType::Number => {
            if let Some(n) = value.as_f64() {
                validate_number(n, schema, path, &mut errors);
            } else {
                errors.push(ValidationError::new(
                    path,
                    format!("Expected number, got {}", value.type_name()),
                ));
            }
        }
        SchemaType::Boolean => {
            if value.as_bool().is_none() {
                errors.push(ValidationError::new(
                    path,
                    format!("Expected boolean, got {}", value.type_name()),
                ));
            }
        }
        SchemaType::Object => {
            if let Some(obj) = value.as_object() {
                validate_object(obj, schema, path, &mut errors);
            } else {
                errors.push(ValidationError::new(
                    path,
                    format!("Expected object, got {}", value.type_name()),
                ));
            }
        }
        SchemaType::Array => {
            if let Some(arr) = value.as_array() {
                validate_array(arr, schema, path, &mut errors);
            } else {
                errors.push(ValidationError::new(
                    path,
                    format!("Expected array, got {}", value.type_name()),
                ));
            }
        }
        SchemaType::Any => {
            // Any type is valid
        }
    }

    errors
}

fn validate_string(value: &str, schema: &Schema, path: &str, errors: &mut Vec<ValidationError>) {
    if let Some(min) = schema.min_length {
        if value.len() < min {
            errors.push(ValidationError::new(path, format!("Minimum length is {}", min)));
        }
    }

    if let Some(max) = schema.max_length {
        if value.len() > max {
            errors.push(ValidationError::new(path, format!("Maximum length is {}", max)));
        }
    }

    if let Some(ref pattern) = schema.pattern {
        // Simple pattern matching (would need regex crate for full support)
        if !simple_pattern_match(value, pattern) {
            errors.push(ValidationError::new(path, format!("Does not match pattern {}", pattern)));
        }
    }

    if let Some(format) = &schema.format {
        if !format.validate(value) {
            errors.push(ValidationError::new(path, format!("Invalid {} format", format.name())));
        }
    }

    if let Some(ref enum_values) = schema.enum_values {
        if !enum_values.contains(&value.to_string()) {
            errors.push(ValidationError::new(
                path,
                format!("Must be one of: {}", enum_values.join(", ")),
            ));
        }
    }
}

fn validate_number(value: f64, schema: &Schema, path: &str, errors: &mut Vec<ValidationError>) {
    if schema.integer && value.fract() != 0.0 {
        errors.push(ValidationError::new(path, "Must be an integer"));
    }

    if let Some(min) = schema.min {
        if value < min {
            errors.push(ValidationError::new(path, format!("Minimum value is {}", min)));
        }
    }

    if let Some(max) = schema.max {
        if value > max {
            errors.push(ValidationError::new(path, format!("Maximum value is {}", max)));
        }
    }
}

fn validate_object(
    obj: &HashMap<String, Value>,
    schema: &Schema,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    if let Some(ref properties) = schema.properties {
        // Check defined properties
        for (key, prop_schema) in properties {
            let prop_path = if path.is_empty() {
                key.clone()
            } else {
                format!("{}.{}", path, key)
            };

            if let Some(value) = obj.get(key) {
                errors.extend(validate(value, prop_schema, &prop_path));
            } else if prop_schema.required {
                errors.push(ValidationError::new(&prop_path, "Value is required"));
            }
        }

        // Check additional properties
        if !schema.additional_properties {
            for key in obj.keys() {
                if !properties.contains_key(key) {
                    let prop_path = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{}.{}", path, key)
                    };
                    errors.push(ValidationError::new(&prop_path, "Additional property not allowed"));
                }
            }
        }
    }
}

fn validate_array(
    arr: &[Value],
    schema: &Schema,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    if let Some(min) = schema.min_items {
        if arr.len() < min {
            errors.push(ValidationError::new(path, format!("Minimum items is {}", min)));
        }
    }

    if let Some(max) = schema.max_items {
        if arr.len() > max {
            errors.push(ValidationError::new(path, format!("Maximum items is {}", max)));
        }
    }

    if schema.unique_items {
        let mut seen = std::collections::HashSet::new();
        for item in arr {
            let key = format!("{:?}", item);
            if !seen.insert(key) {
                errors.push(ValidationError::new(path, "Array items must be unique"));
                break;
            }
        }
    }

    if let Some(ref items_schema) = schema.items {
        for (i, item) in arr.iter().enumerate() {
            let item_path = format!("{}[{}]", path, i);
            errors.extend(validate(item, items_schema, &item_path));
        }
    }
}

/// Simple pattern matching (limited regex-like support)
fn simple_pattern_match(value: &str, pattern: &str) -> bool {
    // Handle simple cases without full regex
    if pattern.starts_with('^') && pattern.ends_with('$') {
        // Exact match (minus anchors)
        let inner = &pattern[1..pattern.len()-1];
        value == inner
    } else if pattern.starts_with('^') {
        value.starts_with(&pattern[1..])
    } else if pattern.ends_with('$') {
        value.ends_with(&pattern[..pattern.len()-1])
    } else {
        value.contains(pattern)
    }
}

/// Validation configuration for middleware
#[derive(Debug, Clone, Default)]
pub struct ValidateConfig {
    pub body: Option<Schema>,
    pub query: Option<Schema>,
    pub params: Option<Schema>,
}

impl ValidateConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn body(mut self, schema: Schema) -> Self {
        self.body = Some(schema);
        self
    }

    pub fn query(mut self, schema: Schema) -> Self {
        self.query = Some(schema);
        self
    }

    pub fn params(mut self, schema: Schema) -> Self {
        self.params = Some(schema);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_string_validation() {
        let schema = Schema::string().min_length(3).max_length(10);

        let valid = Value::String("hello".to_string());
        assert!(validate(&valid, &schema, "").is_empty());

        let too_short = Value::String("hi".to_string());
        assert!(!validate(&too_short, &schema, "").is_empty());

        let too_long = Value::String("hello world!".to_string());
        assert!(!validate(&too_long, &schema, "").is_empty());
    }

    #[test]
    fn test_email_validation() {
        let schema = Schema::email();

        assert!(validate(&Value::String("test@example.com".to_string()), &schema, "").is_empty());
        assert!(!validate(&Value::String("invalid".to_string()), &schema, "").is_empty());
        assert!(!validate(&Value::String("@example.com".to_string()), &schema, "").is_empty());
    }

    #[test]
    fn test_uuid_validation() {
        let schema = Schema::uuid();

        let valid = Value::String("550e8400-e29b-41d4-a716-446655440000".to_string());
        assert!(validate(&valid, &schema, "").is_empty());

        let invalid = Value::String("not-a-uuid".to_string());
        assert!(!validate(&invalid, &schema, "").is_empty());
    }

    #[test]
    fn test_number_validation() {
        let schema = Schema::number().min(0.0).max(100.0);

        assert!(validate(&Value::Number(50.0), &schema, "").is_empty());
        assert!(!validate(&Value::Number(-1.0), &schema, "").is_empty());
        assert!(!validate(&Value::Number(101.0), &schema, "").is_empty());
    }

    #[test]
    fn test_integer_validation() {
        let schema = Schema::integer();

        assert!(validate(&Value::Number(42.0), &schema, "").is_empty());
        assert!(!validate(&Value::Number(3.14), &schema, "").is_empty());
    }

    #[test]
    fn test_object_validation() {
        let schema = Schema::object()
            .property("name", Schema::string())
            .property("age", Schema::integer().optional())
            .additional_properties(false);

        let mut obj = HashMap::new();
        obj.insert("name".to_string(), Value::String("Alice".to_string()));

        assert!(validate(&Value::Object(obj.clone()), &schema, "").is_empty());

        obj.insert("extra".to_string(), Value::Bool(true));
        assert!(!validate(&Value::Object(obj), &schema, "").is_empty());
    }

    #[test]
    fn test_array_validation() {
        let schema = Schema::array(Schema::string()).min_items(1).max_items(3);

        let valid = Value::Array(vec![Value::String("a".to_string())]);
        assert!(validate(&valid, &schema, "").is_empty());

        let empty = Value::Array(vec![]);
        assert!(!validate(&empty, &schema, "").is_empty());

        let too_many = Value::Array(vec![
            Value::String("a".to_string()),
            Value::String("b".to_string()),
            Value::String("c".to_string()),
            Value::String("d".to_string()),
        ]);
        assert!(!validate(&too_many, &schema, "").is_empty());
    }

    #[test]
    fn test_nullable() {
        let schema = Schema::string().nullable(true);

        assert!(validate(&Value::Null, &schema, "").is_empty());
        assert!(validate(&Value::String("hello".to_string()), &schema, "").is_empty());
    }

    #[test]
    fn test_enum_values() {
        let schema = Schema::string().enum_values(vec!["a".to_string(), "b".to_string()]);

        assert!(validate(&Value::String("a".to_string()), &schema, "").is_empty());
        assert!(!validate(&Value::String("c".to_string()), &schema, "").is_empty());
    }
}
