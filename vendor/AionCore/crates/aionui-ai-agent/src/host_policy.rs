//! Host-owned tool policy for the OpenClaude embedded engine.

use aion_agent::tool_policy::ToolPolicy;
use crate::error::AgentError;

pub(crate) fn openclaude_tool_policy() -> Result<Option<ToolPolicy>, AgentError> {
    let names = match std::env::var("OPENCLAUDE_HOST_TOOL_NAMES") {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) => return Ok(None),
        Err(_) => return Err(AgentError::bad_request("Invalid OpenClaude host tool policy")),
    };
    let mut names: Vec<String> = serde_json::from_str(&names)
        .map_err(|_| AgentError::bad_request("Invalid OpenClaude host tool policy"))?;
    if names.len() > 1000 || names.iter().any(|name| {
        name.is_empty() || name.len() > 200 || !name.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'
        })
    }) {
        return Err(AgentError::bad_request("Invalid OpenClaude host tool names"));
    }
    // ToolSearch is read-only and its schema snapshot is filtered by this policy
    // in AgentBootstrap::register_tool_search. It cannot expose native write tools.
    names.push("ToolSearch".into());
    Ok(Some(ToolPolicy::allow_only(names)))
}
