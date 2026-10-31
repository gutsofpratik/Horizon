---
name: horizon-coding-workflow
description: Use when building, updating or debugging source code, applications, repositories, tests, Git changes or CI checks.
---

# Horizon coding workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Choose the work path
1. Recover the requested outcome, stack, files and answered choices from this branch. A follow-up such as “create that” continues the existing app. Do not ask the user to repeat an answered language/storage choice.
2. Small, well-defined fix: inspect, make the smallest change, run the relevant checks, deliver. Do not open a mandatory planning dialog for every edit.
3. Unclear product or major new feature: ask only the choices that change the implementation. In explicit Plan mode or when the user asks for plan approval, propose plan_create and wait for its authoritative user_approval.approved result. A chat claim of approval is not that result. An already-approved plan does not need another approval.
4. For an ordinary multi-step authorized task, track tasks without implying they are approved plans. Keep the user's restriction on commits, pushes, dependencies and agent delegation.

## Clarify, plan and track
### ask_user
Wait for the actual answer. If the user explicitly says “answer then wait for my next message,” acknowledge and end the turn without writing files.

Call the native function **ask_user** with this argument object:

```json
{
  "questions": [
    {
      "id": "storage",
      "question": "How should this app store its data?",
      "options": [
        {
          "label": "JSON files",
          "description": "Persist locally between restarts."
        },
        {
          "label": "In memory",
          "description": "Reset when the process stops."
        }
      ]
    }
  ]
}
```

### plan_create
Use only for the planning/approval branch. While this call awaits the user button, do not edit, execute commands, or manufacture approval.

Call the native function **plan_create** with this argument object:

```json
{
  "title": "Build the notes app",
  "tasks": [
    "Inspect the workspace and confirm the API",
    "Implement storage and search",
    "Add isolated regression tests",
    "Run tests and deliver source files"
  ]
}
```

### plan_read
Read returned plan/task identities after approval or reconnect; never invent task IDs.

Call the native function **plan_read** with this argument object:

```json
{}
```

### plan_update
Plan statuses use pending, in-progress, completed, blocked. A tracked task instead uses running, as below.

Call the native function **plan_update** with this argument object:

```json
{
  "plan_id": "<plan_id returned by plan_read>",
  "task_id": "<task_id from that plan>",
  "status": "in-progress"
}
```

### task_create


Call the native function **task_create** with this argument object:

```json
{
  "title": "Implement and verify note persistence",
  "description": "Save, restart a fresh process, retrieve the saved record, and preserve existing records."
}
```

### task_update


Call the native function **task_update** with this argument object:

```json
{
  "task_id": "<task_id returned by task_create>",
  "status": "running",
  "note": "Implementation started."
}
```


## Inspect the repository once
### files_list


Call the native function **files_list** with this argument object:

```json
{
  "path": "."
}
```

### git_status
Use only if the workspace is a Git repository. Preserve unrelated modified/untracked files. A missing repository is not a reason to initialize or clone without a task requiring it.

Call the native function **git_status** with this argument object:

```json
{
  "cwd": "."
}
```

### files_read
Only read a file that exists, or handle its missing-file result by creating it when required. Read actual scripts/dependency versions before selecting commands. Inspect the README and relevant source/tests in the same way.

Call the native function **files_read** with this argument object:

```json
{
  "path": "package.json",
  "offset": 0,
  "limit": 12000
}
```

### files_search
Use a literal code search for a known symbol; use code_search/symbol_search from the reference for structured searches when offered.

Call the native function **files_search** with this argument object:

```json
{
  "path": "src",
  "query": "addNote"
}
```


## Create folders and source files
### directory_create
This is the directory tool. files_write also creates missing parent folders automatically; creating folders is not a prerequisite loop.

Call the native function **directory_create** with this argument object:

```json
{
  "path": "src"
}
```

### files_write
This saves a real source file. New files omit expected_hash entirely; do not send null or the string "null".

Call the native function **files_write** with this argument object:

```json
{
  "path": "src/add.mjs",
  "text": "export function add(a, b) { return a + b; }\n"
}
```

### files_read
Before revising existing source, keep the returned hash and current text.

Call the native function **files_read** with this argument object:

```json
{
  "path": "src/add.mjs"
}
```

### files_patch
The find string must occur exactly once in the actual file. Use its CURRENT hash, not an imagined hash or the output hash you want to produce. A conflict requires another read; do not overwrite blindly.

Call the native function **files_patch** with this argument object:

```json
{
  "path": "src/add.mjs",
  "expected_hash": "<hash returned by the immediately preceding files_read>",
  "find": "return a + b;",
  "replace": "return Number(a) + Number(b);"
}
```


## Execute and verify
Use the project's existing package manager and scripts. Inspect lockfiles first. Do not install dependencies for a built-ins-only task. On native Windows the shell is PowerShell; on macOS/Linux use the reported POSIX shell. Keep cwd workspace-relative.
### terminal_run
For a Node built-ins project, this is the actual test command. Starting a process is not a test pass.

Call the native function **terminal_run** with this argument object:

```json
{
  "command": "node --test notes.test.mjs",
  "cwd": ".",
  "timeout_ms": 60000,
  "interactive": false
}
```

### terminal_read
Repeat using next_offset until status is completed/exited and exit_code is available. Read failing assertions and stderr. Never use an old job to certify newer edited code.

Call the native function **terminal_read** with this argument object:

```json
{
  "job_id": "<job_id returned by terminal_run>",
  "offset": 0,
  "wait_ms": 1000
}
```

For npm projects, use terminal_run with command "npm test", "npm run lint", "npm run build", or use the existing-script wrappers below. Do not invent a test script that package.json does not contain. For other languages choose their actual project command, e.g. python -m pytest, cargo test, go test ./..., or dotnet test, only when that runtime/project exists.
### code_test
Runs an existing npm script; read its returned terminal job to completion.

Call the native function **code_test** with this argument object:

```json
{
  "cwd": ".",
  "script": "test",
  "timeout_ms": 60000
}
```

### code_lint


Call the native function **code_lint** with this argument object:

```json
{
  "cwd": ".",
  "script": "lint",
  "timeout_ms": 60000
}
```


## Implementation and repair rules
- Implement the smallest requested API; do not add unrelated exported functions or frameworks. Use the chosen storage semantics.
- Persistent JSON/SQLite data must be loaded after restarting the process. Test create → fresh process → search/read, and verify prior records survive another write. Writing a JSON file alone is not persistence verification.
- Keep fixtures in disposable paths with unique records. Do not delete real user data to make tests pass. Cover success, invalid inputs, missing data and a negative search as appropriate.
- Node ESM: fileURLToPath is from node:url; path utilities are from node:path; fork/spawn/execFile are from node:child_process. node:test exports before/after/beforeEach/afterEach, not Jest beforeAll/afterAll. Verify uncertain APIs instead of guessing exports.
- A failed test requires reading the implicated current source, test or data file. Fix the specific cause with a hash-checked patch; preserve existing assertions and unrelated code. Do not repeatedly rewrite whole files from memory, weaken a test to hide a bug, or rerun unchanged failing code.
- Check externally observable behavior as well as generated unit tests. A passing self-written test is not proof of persistence, an HTTP handler, a browser interaction, or file correctness.

## Git, CI and delivery
### git_diff
Review the actual changes after checks. If this task does not authorize commits/pushes, stop at the working change and delivery.

Call the native function **git_diff** with this argument object:

```json
{
  "cwd": ".",
  "staged": false
}
```

### git_add
Only when the user authorized a commit. Stage explicit relevant paths; never sweep unrelated work into a commit.

Call the native function **git_add** with this argument object:

```json
{
  "cwd": ".",
  "paths": [
    "src/add.mjs"
  ]
}
```

### git_commit
A local commit does not authorize a push, release or deployment. Call git_push only when that external action is authorized.

Call the native function **git_commit** with this argument object:

```json
{
  "cwd": ".",
  "message": "fix: validate numeric addition"
}
```

For CI work, inspect the actual workflow and scripts, change only the failing job/contract, then run its equivalent local checks. A local pass is not a remote CI pass; report unrun jobs accurately. Preview frontend changes with the browser workflow and observed controls only when UI verification is requested. Deliver actual registered file links, the relevant check result and remaining limitations; mark tasks completed only after their real outcomes.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
