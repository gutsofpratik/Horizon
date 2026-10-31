---
name: horizon-verification-workflow
description: Use when verifying completed work, interpreting tests, checking a saved deliverable or deciding whether success can be claimed.
---

# Superpowers · Verification (Horizon adapter)

Adapt the bundled Superpowers evidence-before-completion method to the current Horizon task. Run appropriate checks for changed behavior; do not run unrelated suites or UI automation the user excluded. Tools, skills, queued jobs and a saved file record are not proof of the requested outcome.

## Select evidence for the actual deliverable
- Code: use the project's real tests/build/lint where applicable. Read the exact new job until completion and exit status. Also check externally observable behavior: request/response, fresh-process persistence, negative inputs, and preservation of data when those are requirements.
- Excel: inspect the final XLSX. Check actual cells, formulas, ranges, values, sheet names and preservation. State when formulas were not recalculated. A formatting-only copy is not a new row.
- Word/PDF: extract/read the final content and inspect actual structure/pages/forms. Check required sections and prior content. An overlay is not secure redaction.
- Slides: inspect the final PPTX, exact slide count, titles, requested content and preserved earlier slides. A text/ZIP check is not visual overflow verification.
- Artifact: read the current saved source/version and verify identity is preserved. Check real requested content and interactions. A partial draft is not a published artifact.
- Browser/computer: observe the result after the action; confirm the intended page/window/control changed. A requested download or opened print dialog is not a completed save/print.
- Agents/automation: inspect actual completed status and delivered results. Running, queued, scheduled and requested are different states.

## Concrete calls
Use `terminal_run` with `{"command":"npm test","cwd":".","timeout_ms":60000,"interactive":false}` only when that project's package.json defines the test script. Use the correct actual command for other runtimes. Then `terminal_read({"job_id":"<new test job_id>","offset":0,"wait_ms":1000})` until completed. Inspect nonzero exits and failing assertions; do not use an earlier pass after another edit.

Use `spreadsheet_inspect({"file_id":"<latest XLSX file_id>","max_rows":30,"max_columns":10})`, `document_extract({"file_id":"<latest document file_id>"})`, `slides_inspect({"file_id":"<latest PPTX file_id>"})`, or `pdf_inspect({"file_id":"<latest PDF file_id>"})` for the actual output format.

Use `artifact_read({"artifact_id":"<actual artifact_id>","offset":0,"limit":12000})` and bounded continuation for larger source. Use `browser_snapshot({"tab_id":"<actual owned tab_id>"})` only when browser verification is requested/permitted; do not claim it is a screenshot inspection.

## Before claiming completion
1. Match every requested acceptance criterion to an observed result.
2. Make sure it is the final revision, current source and current test job.
3. Keep failed/blocked/unrun checks explicit. A controlled fixture is not a live external account check; a code assertion is not hundreds of real-model workflows.
4. Fix a discovered failure through the debugging/domain workflow, then rerun the relevant check. Do not remove or weaken assertions just to get green output.
5. Deliver actual file/artifact/result links and a concise accurate outcome. Preserve work when a dependency blocks further verification; never label that blocker as completed.

Exact schemas and result prerequisites: `references/tool-index.md`. Load only what is needed for this task.
