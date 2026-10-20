use serde_json::Value;

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("API error {status}: {message}")]
    Api { status: u16, message: String },
    #[error("SSE parse error: {0}")]
    Parse(String),
    // Display intentionally omits `body` — it may contain provider response
    // payload (potentially sensitive) and would leak into logs via
    // `tracing::error!("{err}")`. Consumers that need the body must pattern
    // match on the variant explicitly.
    #[error("Rate limited, retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64, body: Option<String> },
    #[error("Prompt too long: {0}")]
    PromptTooLong(String),
    #[error("Connection error: {0}")]
    Connection(String),
}

impl ProviderError {
    pub fn is_retryable(&self) -> bool {
        matches!(self, ProviderError::RateLimited { .. } | ProviderError::Connection(_))
    }
}

/// Map a provider JSON error payload to a `ProviderError`.
///
/// Covers error bodies delivered with a successful HTTP status: whole-body
/// JSON errors on non-streaming responses and `data: {"error": ...}` frames
/// embedded in SSE streams. Returns `None` when the body does not look like
/// an error payload.
pub(crate) fn provider_error_from_json_body(body: &Value, body_bytes: &[u8]) -> Option<ProviderError> {
    // Some gateways include `"error": null` in perfectly normal responses;
    // treat a null error field the same as an absent one.
    let error_field = body.get("error").filter(|error| !error.is_null());
    let error = error_field.unwrap_or(body);
    let status = [
        error.get("code"),
        error.get("status"),
        body.get("code"),
        body.get("status"),
    ]
    .into_iter()
    .flatten()
    .find_map(json_http_status_code);
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| error.as_str())
        .or_else(|| body.get("message").and_then(Value::as_str))
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .unwrap_or("Provider returned a JSON error response without a message")
        .to_string();

    match status {
        Some(429) => Some(ProviderError::RateLimited {
            retry_after_ms: 5000,
            body: (!body_bytes.is_empty()).then(|| String::from_utf8_lossy(body_bytes).into_owned()),
        }),
        Some(status) => Some(ProviderError::Api { status, message }),
        None if error_field.is_some() => Some(ProviderError::Parse(format!(
            "Provider returned a JSON error response without an HTTP status: {message}"
        ))),
        None => None,
    }
}

fn json_http_status_code(value: &Value) -> Option<u16> {
    value
        .as_u64()
        .and_then(|status| u16::try_from(status).ok())
        .or_else(|| value.as_str().and_then(|status| status.parse().ok()))
        .filter(|status| (400..=599).contains(status))
}

#[cfg(test)]
#[path = "error_test.rs"]
mod error_test;
