---
name: openclaude-tool-author
description: Create a reusable typed tool from a verified sequence of existing Horizon tools when no existing leaf tool already does the job.
---

Discover existing tools before adding one; prefer a direct tool call for one-off work. custom_tool_list finds saved workflows. Use custom_tool_create for a named reusable sequence. Names start user_. Describe its precise purpose and define typed parameters with names, types, descriptions and required flags. Supported types are string, number, boolean, object and array.

Each step needs a unique id, an existing leaf tool name, and arguments matching that tool's schema. In arguments, {"$input":"expression"} substitutes a named input. {"$step":"earlier_step","path":"result"} reads an earlier step's data.result. Other JSON is literal. References must point backwards; check the real result shape first. Optional inputs need fixed literals in any step that requires them, or should be required inputs instead.

Example: parameters [{"name":"expression","type":"string","description":"Numeric arithmetic","required":true}], steps [{"id":"answer","tool":"calculate","arguments":{"expression":{"$input":"expression"}}}]. Discover calculate first, then create and test with harmless input.

New tools are immediately discoverable and survive app restart. Workflows execute through the existing registry: grants, memory-off/incognito, edition restrictions, cancellation and runtime availability still apply. A failed step stops execution and returns completed_steps plus the error to you; inspect side effects before retrying. Never repeat a completed external action blindly. Gateways, other workflows and authoring tools cannot be steps. For new executable logic, create and test a workspace script with permitted file/terminal tools, then wrap the real terminal call; this is desktop-only where terminal access is available. Do not claim a skill or JSON definition creates a new native capability. Delete obsolete tools only when requested using custom_tool_delete.
