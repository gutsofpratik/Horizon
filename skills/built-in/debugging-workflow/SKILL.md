---
name: horizon-systematic-debugging
description: Use when a tool, test, command, integration or generated output fails and the cause needs diagnosis before another edit.
---

# Superpowers · Systematic debugging (Horizon adapter)

This playbook adapts the bundled Superpowers systematic-debugging method to Horizon's actual functions. It does not grant tools, permissions, deployment authorization or permission to launch sub-agents.

## Diagnose before changing
1. Preserve successful work and record the exact failing input, operation, error code, output and current version/ID.
2. Distinguish invalid arguments from a runtime failure, wrong observations, permission denial and an incorrect produced result. These need different fixes.
3. Reproduce the smallest failing behavior within the authorized workspace. Inspect current source and the returned error; do not rewrite files from memory.
4. Compare a working path or nearby valid call with the failing one. Form one concrete explanation grounded in that difference.
5. Make one minimal correction, rerun the relevant check, and inspect its actual completed result. If the explanation was wrong, revise it rather than stacking unrelated changes.

## Actual calls
Call `files_read` with `{"path":"src/app.mjs","offset":0,"limit":12000}` for an existing source. Use its returned current hash before `files_patch`; do not copy an example hash. Missing source may require creation, not endless reads.

Call `git_diff` with `{"cwd":".","staged":false}` to inspect the actual changes when a repository exists. Preserve unrelated user work.

Call `terminal_run` with `{"command":"node --test notes.test.mjs","cwd":".","timeout_ms":60000,"interactive":false}` only for that actual project/test. Read the returned job through `terminal_read` with `{"job_id":"<actual job_id>","offset":0,"wait_ms":1000}` until completed. A read that succeeded can still contain a failed command.

For a changed page, call `browser_snapshot` with `{"tab_id":"<actual owned tab_id>"}` and use its new snapshot/ref. For console/network diagnostics use `browser_read_diagnostics` with `{"tab_id":"<actual owned tab_id>","source":"console","limit":20}` when this host supports it. Do not invent `browser_console` or repeatedly reopen a file to scroll.

## Failure-specific paths
- Invalid JSON/fields: keep the argument object typed, use the returned required fields and retry only the failed operation. Do not call discovery again for a schema already supplied.
- Stale version/hash/ref: read a fresh observation. `expected_version` is the version that already exists, not the one to be created. Never auto-increment it or weaken conflict checks.
- Missing service/permission: report the exact dependency or grant. Do not silently start Docker, switch providers, bypass a denied tool, or claim a registered tool is ready.
- Failed code test: inspect both the implicated implementation and existing tests/data. Preserve assertions; repair the specific cause and rerun a new job. Old job output cannot verify newly edited code.
- A file exists but is wrong: inspect its real contents, counts, formulas, text, IDs and behavior. A workbook copy with no new cells, a different artifact identity, or JSON that is never reloaded is not success.
- Unknown external/write outcome: inspect effects before retrying; do not replay a purchase, upload, deployment, send, or destructive command blindly.

## Stop the loop
Repeated identical errors or unchanged reads require a different diagnosis, not another identical call. Keep completed results and explain the precise unfinished work when a bounded recovery cannot resolve it. Do not invent success or ask the user to repeat existing information. Return to the relevant domain skill for the repair, then use the verification skill for evidence.

Exact registered schemas and additional operations: `references/tool-index.md`. This is optional reference data; read only the operation needed.
