---
name: openclaude-runtime-orchestration
description: Use when managing tasks, explicit goals, authorized agents, schedules, environments, connectors, retrieval, data analysis or multi-step runtime work.
---

# Horizon orchestration workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Establish the live contract
Read the actual task, current host/backend, offered tools, runtime readiness and permissions. Keep those layers separate: a listed tool or installed skill is not proof its runtime is available; model vision is not equivalent to browser DOM access. Use only task-relevant operations. Never start Docker, another worker, a cloud fallback or an external agent merely because one action failed.
### runtime_capabilities
Use when capability/readiness is genuinely unclear, not before every operation. Explain the returned concrete blocker without inventing access.

Call the native function **runtime_capabilities** with this argument object:

```json
{}
```


## Track and execute a multi-step task
Use task_create/task_update for progress, plan_create only for the explicit approval workflow, and goal only for a user-requested persistent objective. These records do not execute the work. A task marked running is not a tool result or approval.
### task_create


Call the native function **task_create** with this argument object:

```json
{
  "title": "Create and inspect the requested deliverable",
  "description": "Read inputs, create the real output, inspect it and return its actual link."
}
```

### task_update
Do not mark completion on timeout, a prose promise, a queued job or a failed dependency.

Call the native function **task_update** with this argument object:

```json
{
  "task_id": "<task_id from task_create>",
  "status": "completed",
  "note": "<actual output and successful check>"
}
```


## Authorized agents and teams
Use child agents only for user-authorized work and honor an explicit instruction not to launch agents. Split independent bounded tasks, give each a concrete deliverable and permissions, and avoid concurrent edits to the same files. A child has its own workspace; copying inputs is a snapshot, not a shared live directory. Team-level controls do not manufacture member permissions.
### agent_spawn
Only when delegation is authorized. This starts a real child, not a local function call; retain its actual agent_id.

Call the native function **agent_spawn** with this argument object:

```json
{
  "task": "Review the supplied module for edge cases and return findings only. Do not edit files or contact external services.",
  "tools": [
    "files_read",
    "files_search"
  ],
  "files": [
    "src/add.mjs"
  ]
}
```

### agent_wait
Wait in bounded intervals. Cancellation of waiting is not cancellation of the child.

Call the native function **agent_wait** with this argument object:

```json
{
  "agent_ids": [
    "<agent_id returned by agent_spawn>"
  ],
  "timeout_ms": 30000
}
```

### agent_result
Read the completed result and inspect any delivered files before integrating. Do not describe a running agent as finished.

Call the native function **agent_result** with this argument object:

```json
{
  "agent_id": "<actual agent_id>"
}
```


## Programmatic tool composition
### programmatic_tools
Only on a ready explicitly selected isolated runtime. Call existing allowed tools through await tools.NAME(args). Do not evaluate tool output as code, call gateways recursively, or bypass approvals. Independent read-only calls may use Promise.all; dependent writes stay sequential.

Call the native function **programmatic_tools** with this argument object:

```json
{
  "tools": [
    "calculate"
  ],
  "code": "const first = await tools.calculate({expression: \"10+20\"}); return first;",
  "timeout_ms": 30000
}
```


## Time, schedules and memory
### clock_now
Read actual time before computing a schedule. The timezone here is illustrative; use the user/application zone.

Call the native function **clock_now** with this argument object:

```json
{
  "time_zone": "Asia/Kolkata"
}
```

### schedule_create
This timestamp is illustrative, never a default to copy. Compute the requested future ISO timestamp from clock_now and the real user request. Ask for an ambiguous time. Scheduling requires Horizon/background workers running and does not authorize external messages.

Call the native function **schedule_create** with this argument object:

```json
{
  "name": "Review the project",
  "prompt": "Review the saved project status and summarize new actionable changes.",
  "run_at": "2030-01-01T09:00:00+05:30",
  "time_zone": "Asia/Kolkata"
}
```

### memory_search
Search durable user facts/preferences, not an unlimited model context. Use next_offset for more entries.

Call the native function **memory_search** with this argument object:

```json
{
  "query": "preferred report format",
  "offset": 0,
  "limit": 10
}
```

### memory_save
Respect memory-off/incognito. Do not save secrets, guesses, fictional examples or duplicate facts. Use the real current fact; this example is not a fact to store.

Call the native function **memory_save** with this argument object:

```json
{
  "text": "<useful fact or preference actually provided by the user>",
  "global": true,
  "key": "preferences.report_format"
}
```


## Connectors, HTTP and execution environments
List saved connections with mcp_connections/http_list_connections, then use their returned IDs. For MCP, mcp_list_tools supplies the external function's exact input schema; call mcp_call_tool only with that schema. For HTTP, use the saved connection, allowed method/path and typed body from its exact contract. Do not invent tokens, endpoints or connection IDs. A bot/connector token is not permission for arbitrary external actions.

Use environment_sync only for the explicitly selected environment and direction, with expected hashes for changed content. Do not silently push files to another host or fall back from a denied isolated operation to the local machine. Queues, schedules, hooks and notifications must preserve conversation, destination and permission scope across restart/recovery.

## Failure and continuation rules
Retain successful results and their IDs. Correct invalid fields once using concrete returned feedback. A stale browser/screen observation needs a new observation. A stopped process needs a new owned job only when necessary. An unknown write outcome requires inspecting effects before retry. Break repeated identical errors/discovery cycles instead of consuming the entire run. Preserve pending approvals/questions and unresolved work when stopping or compacting. State exactly what succeeded and what remains; no silent permission escalation or replay of uncertain external actions.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
