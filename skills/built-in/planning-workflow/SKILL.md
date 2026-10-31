---
name: horizon-planning-workflow
description: Use when the user asks to brainstorm, compare approaches, clarify requirements, plan work, approve a plan or pursue an explicit goal.
---

# Horizon planning and brainstorming

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Decision sequence
1. Identify the desired output, the user's constraints and what is already approved. Reuse conversation answers and saved files.
2. Brainstorm only when design/requirements have a meaningful choice: compare two or three approaches, state the concrete trade-off, and recommend one. Do not spend rounds asking optional preferences when sensible defaults work.
3. Ask one focused round with ask_user when an answer changes the work. Avoid asking for information the user already gave. The question tool waits for a real answer; a proposed option is not a submitted answer.
4. Explicit Plan mode or approval request uses plan_create. A normal request for a visual roadmap or written plan uses artifact_save; it must not silently lock unrelated work behind an approval gate.
5. After the authoritative approval result, use returned task IDs and perform the approved scope. Do not approve the plan through another tool or a text claim.

### ask_user


Call the native function **ask_user** with this argument object:

```json
{
  "questions": [
    {
      "id": "goal",
      "question": "Which outcome matters most?",
      "options": [
        {
          "label": "Fast first version",
          "description": "Deliver a small working result first."
        },
        {
          "label": "Complete feature set",
          "description": "Design the full workflow before implementation."
        }
      ]
    }
  ]
}
```

### plan_create


Call the native function **plan_create** with this argument object:

```json
{
  "title": "Deliver the requested feature",
  "tasks": [
    "Inspect existing behavior and constraints",
    "Implement the approved approach",
    "Verify the requested outcome",
    "Deliver files and any remaining limitations"
  ]
}
```

### plan_read
After approval/reconnect, inspect the saved plan and exact IDs.

Call the native function **plan_read** with this argument object:

```json
{}
```

### plan_update
Only after this task actually succeeded; use blocked for an unresolved dependency. Do not confuse task_update statuses with plan_update statuses.

Call the native function **plan_update** with this argument object:

```json
{
  "plan_id": "<observed plan_id>",
  "task_id": "<observed task_id>",
  "status": "completed"
}
```

### artifact_save
Use for a normal saved written plan. Include actual details instead of copying this illustrative topic.

Call the native function **artifact_save** with this argument object:

```json
{
  "title": "Feature roadmap",
  "type": "markdown",
  "source": "# Feature roadmap\n\n## Outcome\nA working feature matching the stated user requirements.\n\n## Steps\n1. Observe existing behavior.\n2. Implement the agreed approach.\n3. Verify the outcome.\n\n## Acceptance\nThe requested workflow succeeds and saved work is preserved.\n"
}
```


## Persistent goals
Only create/start a goal when the user explicitly requests a persistent objective. A generic “continue” does not authorize a new goal or new background work. Keep a goal separate from plan approval and ordinary to-dos.
### goal
Creates a draft goal; retain its actual goal_id.

Call the native function **goal** with this argument object:

```json
{
  "action": "create",
  "objective": "<user-authorized objective>",
  "success_criteria": [
    "<observable completion criterion>"
  ],
  "run_limit": 5
}
```

### goal
Only when the latest user request explicitly authorizes starting it. A run limit is a pause boundary, not success.

Call the native function **goal** with this argument object:

```json
{
  "action": "start",
  "goal_id": "<goal_id returned by goal create>"
}
```

### goal


Call the native function **goal** with this argument object:

```json
{
  "action": "update",
  "goal_id": "<actual goal_id>",
  "progress": "<specific completed step and remaining work>"
}
```

### goal
Do not mark completion because the model ran out of time or tokens.

Call the native function **goal** with this argument object:

```json
{
  "action": "complete",
  "goal_id": "<actual goal_id>",
  "summary": "<verified outcome and delivered result>"
}
```


## Quality and blockers
Make steps independently checkable. Preserve IDs, open questions, acceptance criteria and user restrictions across revisions/compaction. If a service is missing, name it and preserve finished work; do not repeatedly rediscover it. Ask another question only for newly required information. Never turn a brainstorming choice into unrequested edits, purchases, messages or deployment.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
