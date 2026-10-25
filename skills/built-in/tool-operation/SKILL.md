---
name: openclaude-tool-operation
description: Use Horizon tool schemas and workflows to execute tasks and recover from validation failures without repeated discovery.
---

Use the supplied native function interface. JSON in ordinary prose does not execute a tool. Discover an action once with toolkit `{"action":"discover","name":"guide","query":"CATEGORY","tool_action":"ACTION"}`. Its guide contains purpose, workflow, quality checks, installed skills, required fields and call examples. Once these are known, act rather than announcing another lookup.

The gateway call shape is `{"action":"call","name":"CATEGORY","arguments":{"action":"ACTION"}}`, with all other required action fields inside the arguments object. Arguments must be an object, not a quoted JSON string. When a category function is directly supplied, pass those inner fields flat. Some leaf operations have an inner action: the public category renames it to operation, e.g. python action=session with operation=execute. Use the guide, not guessed names.

Use actual returned IDs, hashes, versions and observations. Do not copy placeholder IDs from examples. Check status, then pass returned state to the next dependent call. A running job needs read/wait. Discovery and skill loading are preparation, not deliverables.

Skills explain quality and procedure; the current action schema defines executable fields. Do not copy an external tool name from a source skill when Horizon supplies a category action. Prefer the existing supported tool over discovering alternate runtimes repeatedly. Load a relevant format/design skill once; do not load every available skill.

When validation fails, the action was not executed: correct the named fields and retry that failed action. Refresh stale observations and re-read conflicts. Do not replay successful writes. If execution outcome is uncertain, inspect effects before retrying. Permission or runtime failure must be reported accurately. Never claim an unavailable capability, fabricate results or bypass approvals.

For user requests to create something, deliver a real artifact/file through the appropriate tool. Ask only for essential missing information. Clearly label illustrative inputs; never invent personal or financial facts.

Current interface: the model receives task-specific direct action functions. This overrides older gateway examples above. Call spreadsheet_create, document_create, slides_create, artifact_save, plan_create, terminal_run and browser_open directly with their offered named fields. Creation skills are loaded by the app; do not load/discover them again. Use discover_tools only for a missing operation.
