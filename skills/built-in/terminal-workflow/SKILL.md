---
name: openclaude-terminal-workflow
description: Execute commands and scripts in Horizon's real native or sandbox terminal, retaining jobs and inspecting completion.
---

Use shell.run for a command, shell.script for source in an explicit language, and shell.session/read/stdin/resize for a persistent interactive session. Use the actual function schemas already supplied. Discover only a missing operation. Panels do not need to be open for tool execution.

Use shell.environment when the platform is unknown. Native Windows uses PowerShell; the Docker sandbox uses Bash. Keep cwd within the granted workspace. Quote arguments for the actual shell. Do not assume a host path is available inside a container. Use installed interpreters or request only dependencies needed for the user's task.

Call terminal_run directly with command="node --version", cwd=".", timeout_ms=10000 and interactive=false. A source script uses shell_script with language="python" and source containing the actual Python code. Do not add action=run, a toolkit wrapper or a nested arguments field. Never run Python source as PowerShell syntax.

Capture the returned job_id. Read it with shell.read, retaining the returned output offset, until the status completes. Inspect exit_code, stdout and stderr. Running is not success. Send stdin only to the intended owned live interactive program. A timeout may leave effects or end a session: inspect before repeating writes.

For file-producing tasks, write within the workspace, inspect the real output and register/export it through supported file tools so the user receives an actual link. Do not dump environment secrets. Respect approvals, scoped permissions and explicit restrictions on Git operations or installing packages.
