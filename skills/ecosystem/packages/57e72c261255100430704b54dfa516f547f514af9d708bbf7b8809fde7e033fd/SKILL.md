---
name: horizon-interaction-binding
description: Horizon-specific browser, computer, files and terminal bindings for an installed upstream workflow.
license: MIT
---

Use only the functions actually offered for this task. This binding does not grant computer, browser or terminal permission. A closed panel does not itself end a service.

- Inspect the workspace with `files_list` before scaffolding. For an existing project read its manifests, source, lockfile and Git status; preserve user changes. Use `directory_create` and `files_write` only for missing requested files. `files_patch` requires the observed source/hash; on a mismatch read current content before repairing.
- Run the real command with `terminal_run` in the actual workspace and shell. Retain the returned job ID; use `terminal_read` until its real exit state is known. Existing npm test scripts can use `code_test`; it is not a universal arbitrary-language runner. A started command is not a passed check. Never install dependencies or push merely because an upstream example does so.
- Open a page with `browser_open`, then `browser_snapshot`. For a local output use `browser_open_file` with exactly one of `path`, `file_id`, or `artifact_id`. Click/fill/scroll/press with the actual observed tab/snapshot/reference. `browser_type` fills; do not assume it appends. Refresh stale observations after navigation. `browser_read_diagnostics` accepts its actual console/network source. Web fetching is not browser interaction.
- Computer actions use actual screen/window IDs and coordinates from fresh observations. A text-only model must not claim to see pixels. Use UI tree tools when supported. Observe after an action and recover stale state; do not keep clicking unknown targets.
- `ask_user` takes a questions array with IDs, question text and labeled options. Wait for the answer. `plan_create` waits for UI approval; do not edit until that real approval is returned. Use observed plan/task IDs with updates. Create a persistent goal only when requested.
- Delegation uses the actual offered `agent_*` operations only with user authorization. No subagent or external-agent subprocess is a workaround for a user prohibition.

For coding tasks, use the selected upstream planning/debugging/TDD guidance and this concrete execution sequence:

1. List and read the actual workspace. Reuse existing files. Ask only for missing decisions with `ask_user`, and wait if the user requested a pause after answering. Do not treat a question answer as plan approval.
2. Write the smallest requested source and meaningful tests. For `.mjs`, use ES module imports. Test hooks are imported explicitly: `import {test, beforeEach, afterEach} from 'node:test'`. Do not invent global hooks or use unsupported bundler helpers in a Node-only project.
3. Persistent-data tests need an isolated temporary directory or uniquely scoped test records with cleanup. They must pass against an existing populated workspace without deleting user data. Preserve the application's records when repairing it; changing an assertion to match broken behavior is not a fix.
4. Assert actual behavior: after adding a unique note/item, the matching search contains that same item; a nonexistent query returns an empty result. `length >= 0`, checking only that an array exists, or catching and ignoring every exception cannot verify a search. Test a persisted record from a fresh Node process when persistence is requested. Do not replace a real assertion with a vacuous check to get a green result.
5. Call `terminal_run` with `{"command":"node --test notes.test.mjs","cwd":"."}` for the actual requested test filename, then `terminal_read` with the returned `job_id` and `wait_ms:1000`. Continue reading a running job. A terminal session alone has not executed a command. Read the implicated source after a failure, repair it, and run again.
6. For disk-backed tests run the same test command a second time without clearing the application's stored data. Both executions need a completed zero exit status. If the second fails, fix fixture isolation and teardown rather than erasing the user's data. Return actual filenames and check results; report remaining failure clearly instead of claiming completion.

For any operation's exact required fields, call `skill_read_resource` with this skill ID and `relative_path: "horizon/tools/TOOL_NAME.json"`. It returns the registered schema and prerequisites. Use that function directly with a complete argument object. Never guess IDs, stringify nested objects, or recursively call a toolkit wrapper. Retain successes and correct a rejected call from its field feedback; stop repeating an identical failing action.

Original ECC agents, commands, rules and hook definitions are available through `horizon/frameworks/ecc/index.json` and its declared paths using `skill_read_resource`. Read only the relevant role/rule, not the entire framework. Original role instructions are installed as agent templates; listing them does not authorize spawning. Commands can be selected explicitly by their slash name. Upstream shell hook definitions are retained for review, not automatically enabled as host commands.
