---
name: openclaude-terminal-workflow
description: Use when running commands, managing an owned shell job, creating folders through a shell, diagnosing processes or reading command output.
---

# Horizon terminal workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Pick the correct operation
directory_create creates folders. files_write writes source/text. terminal_run starts a command. terminal_read reads that job's output/status. terminal_session opens a persistent interactive PTY only when an interactive program needs it. shell_script runs source in an explicit language through the actual granted runtime. Opening the terminal panel is not required for any of these tools.

## Prepare and execute
Use the current workspace and the reported OS shell. Keep cwd relative to the granted workspace. Do not guess a path under Downloads/AppData, assume a POSIX shell on Windows, or assume remote workers can see host paths.
### shell_environment
Inspect the actual runtime/platform when it is not known. Use its reported interpreters/shell.

Call the native function **shell_environment** with this argument object:

```json
{}
```

### directory_create
Prefer this direct tool for a simple directory. It does not execute arbitrary shell code.

Call the native function **directory_create** with this argument object:

```json
{
  "path": "src/components"
}
```

Native Windows PowerShell equivalent: New-Item -ItemType Directory -Force -Path 'src/components' | Out-Null. POSIX equivalent: mkdir -p src/components. Use only the command for the actual shell, and quote paths for that shell. Avoid composing file deletion/moving across shells.
### terminal_run
This example is PowerShell only. Use directory_create or the POSIX equivalent on other hosts.

Call the native function **terminal_run** with this argument object:

```json
{
  "command": "New-Item -ItemType Directory -Force -Path 'src/components' | Out-Null",
  "cwd": ".",
  "timeout_ms": 10000,
  "interactive": false
}
```

### terminal_run


Call the native function **terminal_run** with this argument object:

```json
{
  "command": "node --version",
  "cwd": ".",
  "timeout_ms": 10000,
  "interactive": false
}
```

### terminal_read
Read until completed/exited, inspect exit_code and stderr, then use next_offset for further reads. Running is not completed; a successful read does not mean the command exited 0.

Call the native function **terminal_read** with this argument object:

```json
{
  "job_id": "<job_id returned by terminal_run>",
  "offset": 0,
  "wait_ms": 1000
}
```


## Interactive jobs and scripts
### terminal_session
Retain the returned owned job_id. Do not repeatedly open empty sessions for ordinary non-interactive commands.

Call the native function **terminal_session** with this argument object:

```json
{}
```

### terminal_stdin
Only send input to the intended live program. A terminated process cannot accept more stdin.

Call the native function **terminal_stdin** with this argument object:

```json
{
  "job_id": "<owned running interactive job_id>",
  "text": "help\n"
}
```

### terminal_resize
Resizing changes the PTY grid, not the application workspace or permission scope.

Call the native function **terminal_resize** with this argument object:

```json
{
  "job_id": "<owned running interactive job_id>",
  "cols": 100,
  "rows": 30
}
```

### terminal_cancel
Cancel only the intended job and its owned children. Inspect results before replaying a command with possible filesystem/external effects.

Call the native function **terminal_cancel** with this argument object:

```json
{
  "job_id": "<owned running job_id>"
}
```

### shell_script
Use only a supported ready language runtime. Python source goes in source, not directly into PowerShell. Register/deliver actual generated files through supported file tools when required.

Call the native function **shell_script** with this argument object:

```json
{
  "language": "python",
  "source": "from pathlib import Path\np = Path(\"outputs\")\np.mkdir(exist_ok=True)\n(p / \"notes.txt\").write_text(\"Created by Horizon\\n\", encoding=\"utf-8\")\nprint(p / \"notes.txt\")",
  "cwd": ".",
  "timeout_ms": 60000
}
```


## Command hygiene and recovery
- Inspect package.json/lockfiles before npm/pnpm/yarn commands. Use existing scripts and the installed runtime; do not install a new package manager casually.
- Read file paths from actual results. On Windows, quote paths with spaces and use proper PowerShell quoting; JSON escaping is not shell escaping.
- Nonzero exit: read the actual failure, inspect implicated files, fix the cause, rerun the relevant command, and read the new job. Do not treat an older successful job as verification of new code.
- TERMINAL_EXITED/closed pipe: the job is finished. Inspect its final output, then start a new command/session only if still needed; do not send stdin repeatedly to the dead job.
- Unknown outcome after disconnect: inspect current files/process/job state before retrying writes. Do not repeat an install, deployment, Git push or other external action blindly.
- Keep process operations scoped to owned jobs. Do not kill unrelated apps or expose environment secrets in output.

## Runtime boundary
Horizon Desktop uses its connected native shell. A web host cannot manufacture a native terminal. An explicitly selected authenticated isolated worker is a separate environment; it does not imply a mandatory Docker dependency or automatic host fallback. Report the exact missing runtime/permission instead of claiming a command ran.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
