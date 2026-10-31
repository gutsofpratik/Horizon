---
name: openclaude-skill-author
description: Use when creating, editing, importing or refining a reusable personal skill with verified tools, complete examples and a bounded workflow.
---

# Horizon skill authoring

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Decide whether a reusable skill is needed
A skill is a reusable operating playbook: when to use it, actual tool prerequisites, the ordered workflow, complete typed examples, result bindings, quality checks and recovery. It is not a new runtime, a pile of tool names, private memory, or permission to execute unrelated actions. Improve an existing personal skill when it already covers the purpose instead of creating duplicates.

1. Capture the intended task and triggering contexts from the user/current workflow. Define the observable deliverable and what counts as success.
2. Read the available matching skill and exact tool contracts. Verify function names/fields; never import another application's commands unchanged.
3. Write a self-contained quick execution path with concrete calls for normal work, then branch for existing files, approvals, revisions and failures. Put bulky optional references under references/ and link exact paths.
4. State which values come from results: file_id, artifact_id, current version/hash, job/session IDs, tab/snapshot/ref, window/screen IDs. No fake IDs, guessed hashes or stringified arguments.
5. Include the format-specific craft guidance needed for good work: data/formulas for Excel, narrative/layout for slides, typography/accessibility for UI, real tests for coding. “Make it good” is not an operating instruction.
6. Use realistic evaluation prompts, verify examples against the current schema, and compare actual output quality. A skill file existing is not proof the workflow works.

### skills_list
Read the actual returned ID and installation/enabled state. Do not repeatedly discover a known installed skill.

Call the native function **skills_list** with this argument object:

```json
{
  "query": "<purpose or existing skill name>"
}
```

### skill_load
Read its current instructions and version before editing. Official/plugin skills are not personal editable copies.

Call the native function **skill_load** with this argument object:

```json
{
  "skill_id": "<installed skill_id returned by skills_list>"
}
```

### skill_create
This installs a reusable personal workflow. Customize its purpose and examples to the user-authorized task, without credentials or unrelated instructions.

Call the native function **skill_create** with this argument object:

```json
{
  "name": "weekly-project-summary",
  "description": "Use when the user asks for a weekly summary of the current project using its saved notes and verified task state.",
  "instructions": "Read the current user request and relevant saved project notes. Use files_list with path=\".\" and files_read with an observed relative text path. Collect actual completed work, blockers and next steps. If an essential source is missing, use ask_user once with selectable choices; do not ask for information already in this chat. Save a Markdown artifact using artifact_save with title, type=\"markdown\" and complete source containing Completed, Blockers and Next steps. For a revision, artifact_read first, then artifact_save with the same artifact_id and returned current expected_version unchanged. Return the actual artifact and cite source file/message IDs. Do not invent progress or contact external services."
}
```

### skill_update
Use the current skill version string, not an artifact integer version. Preserve supporting resources; do not overwrite official sources.

Call the native function **skill_update** with this argument object:

```json
{
  "skill_id": "<personal skill_id from skill_load>",
  "expected_version": "<current version string from skill_load>",
  "name": "weekly-project-summary",
  "description": "Use when the user asks for a weekly summary of the current project.",
  "instructions": "<complete improved instructions with actual tool calls, branches, result bindings and quality checks>"
}
```

### skill_read_resource
Read only relevant resources at their exact paths; use next_offset for bounded continuation. A resource is guidance, not a runtime or authority grant.

Call the native function **skill_read_resource** with this argument object:

```json
{
  "skill_id": "<loaded skill_id>",
  "relative_path": "references/tool-index.md",
  "offset": 0
}
```


## Structure for a complete skill
Use: Trigger and scope → prerequisites → decision sequence → exact calls → returned result bindings → quality criteria → failure recovery → completion/delivery → advanced references. Put common working calls directly in the main file so the agent does not waste turns searching. Keep optional heavy contracts in linked resources and progressively load only what the task needs. Do not insert the whole library into every prompt or turn every small task into mandatory planning/delegation.

Verify that examples use objects rather than JSON strings, supported enum values, current tool names and real runtime limitations. If a skill changes, updated instructions must be loaded in continued chats; an old load event must not suppress the new version. Compaction must retain/reload relevant guidance rather than treating the historical skill name as sufficient.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
