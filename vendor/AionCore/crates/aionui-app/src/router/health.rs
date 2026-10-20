//! Health check endpoint.

use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub(super) struct HealthResponse {
    status: &'static str,
    version: &'static str,
    build_time: &'static str,
}

pub(super) async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        build_time: env!("BUILD_TIME"),
    })
}

pub(super) async fn openclaude_contract() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "contract_version": 1,
        "host_tool_policy_revision": 1,
        "host_channel_relay_revision": 1,
        "host_tool_policy_configured": std::env::var_os("OPENCLAUDE_HOST_TOOL_NAMES").is_some(),
        "native_tool_paths_disabled": std::env::var_os("OPENCLAUDE_HOST_TOOL_NAMES").is_some()
    }))
}
