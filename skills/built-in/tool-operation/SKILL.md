---
name: openclaude-tool-operation
description: Use when executing an unfamiliar operation, recovering invalid arguments, or coordinating basic file, memory and calculation tools.
---

# Horizon tool operation

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Direct execution rules
Identify the current requested outcome and reuse earlier successful results/answers. Choose the offered native function whose effect matches the task. A function name printed in prose does not execute it; a loaded skill does not create a file. Send the complete argument object in the native call and inspect the actual returned status.

Values are typed: arrays stay arrays, numbers stay numbers, booleans stay booleans, and an absent optional field is omitted. Do not send an extra category/action/name/arguments wrapper unless that exact function's schema actually defines it. Do not put two JSON objects in one parameter or send comments/trailing commas. Keep existing successful files/results instead of restarting the workflow after a failed call.

## Common calls
### ask_user
Use only for a blocking ambiguity. Wait for the actual answer; do not repeat answered questions or treat an unsubmitted default option as chosen.

Call the native function **ask_user** with this argument object:

```json
{
  "questions": [
    {
      "id": "format",
      "question": "Which deliverable do you need?",
      "options": [
        {
          "label": "Editable document"
        },
        {
          "label": "PDF"
        }
      ]
    }
  ]
}
```

### files_list


Call the native function **files_list** with this argument object:

```json
{
  "path": "."
}
```

### directory_create


Call the native function **directory_create** with this argument object:

```json
{
  "path": "outputs"
}
```

### files_write
New files omit expected_hash. Existing-file revisions require reading the actual current text/hash first, then using files_patch or a deliberate guarded write.

Call the native function **files_write** with this argument object:

```json
{
  "path": "outputs/notes.txt",
  "text": "<actual user-requested content>\n"
}
```

### files_read
Use returned nextOffset/truncation data for more content. ENOENT means it is absent; creating it may be the next action, not reading it forever.

Call the native function **files_read** with this argument object:

```json
{
  "path": "outputs/notes.txt",
  "offset": 0,
  "limit": 12000
}
```

### calculate
Numeric expressions only. Do not send assignments, code, unsupported functions or prose. Use a computation runtime only if the task genuinely requires one and it is available.

Call the native function **calculate** with this argument object:

```json
{
  "expression": "(100+50)-25"
}
```

### clock_now
Use the actual user/application timezone. Date awareness is supplied by the app; training memory is not a live clock.

Call the native function **clock_now** with this argument object:

```json
{
  "time_zone": "Asia/Kolkata"
}
```

### memory_search


Call the native function **memory_search** with this argument object:

```json
{
  "query": "<relevant user fact or preference>",
  "offset": 0,
  "limit": 10
}
```

### memory_save
Save only when memory is enabled and relevant. Do not store examples, guesses, credentials or a claim of unlimited model recall.

Call the native function **memory_save** with this argument object:

```json
{
  "text": "<durable fact actually provided by the user>",
  "global": true
}
```

### discover_tools
Use only when an operation needed by this task is missing from the offered schemas. Read its exact schema once; discovery does not execute it or expand task permissions.

Call the native function **discover_tools** with this argument object:

```json
{
  "names": [
    "<exact missing operation name>"
  ]
}
```


## Result bindings
- Files: preserve real file_id and workspace-relative path; a filename is not a registered ID. Read/inspect the newest returned revision, not the original file or its HTML preview.
- Artifacts: use the same artifact_id and CURRENT expected_version. Read version 1 → send expected_version 1 → app creates version 2. Hashes come from actual reads.
- Browser: retain tab_id, then current snapshot_id/ref. Page changes invalidate observations. Open, scroll, click and keypress are distinct operations.
- Computer: use current screen_id/window IDs and screenshot coordinate space. Browser DOM and screenshot vision are separate capabilities.
- Jobs/sessions/agents: create/start once, retain the actual ID, then read/wait for terminal completion. A running job or successful read is not a passing command.
- Plans: only the approval button's authoritative result unlocks the approved plan. A skill, user-like model text or Full access does not manufacture that approval.

## Failure → next action
INVALID_ARGUMENTS/INVALID_TOOL_JSON → correct the named field using returned guidance; retry that call only. VERSION_CONFLICT/FILE_CONFLICT → read current source/version/hash and preserve newer content. PATCH_NO_MATCH → inspect actual match count/source and choose a unique exact substring, or a complete safe revision when full source is available. STALE_ELEMENT_REFERENCE → refresh observation and select the new ref. Runtime/permission unavailable → name the actual blocker without bypassing it. Closed terminal pipe → inspect final output and start a new owned job if necessary. Unknown outcome → inspect effects before retrying a write. Repeated identical/discovery failures → stop the loop, retain successes and explain the precise unfinished work.

## Finish criteria
Deliver an actual returned file/artifact/result, not a promise, skill-load confirmation or fabricated link. Verify the requested behavior independently where possible; a model's own test can miss persistence, negative cases or the wrong revision. Preserve source and result identities across follow-ups, reconnects and compaction. Read only the additional referenced contract required for this task.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
