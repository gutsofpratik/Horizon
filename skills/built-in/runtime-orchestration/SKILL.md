---
name: openclaude-runtime-orchestration
description: Coordinate multi-step Horizon tasks using deferred tool discovery, sandboxed parallel calls and isolated agents.
---

Use the existing task, user corrections and outputs. Do not ask for already supplied information. Start with a small plan for substantial work. Discover relevant categories with toolkit, then load one exact action schema with tool_action. Skills guide workflows; they do not grant runtime capabilities.

Use direct tools for a few dependent actions. For independent bulk work, discover programmatic_tools and run JavaScript inside the sandbox with an explicit tool allowlist. Use await tools.NAME(arguments) and Promise.all only for independent work. Every call retains normal permissions. Never emulate a successful call in plain text.

Delegate independent subtasks using agent.spawn. Children have isolated files; select bounded input snapshots. agent.wait reads completion, agent.result returns actual output. agent.send_message delivery=steer reaches the next model boundary; delivery=queue waits for completion. agent.interrupt stops current work without deleting the conversation; agent.followup continues it. Do not spawn indefinitely or broaden child permissions.

Use Python sessions for stateful computation, retrieval for indexed semantic file search, and templates for actual reusable Office files. Preserve current artifact IDs and versions for revisions. Tool errors are observations: correct the named fields or refresh references, do not repeat successful writes. Report unavailable configuration accurately.
