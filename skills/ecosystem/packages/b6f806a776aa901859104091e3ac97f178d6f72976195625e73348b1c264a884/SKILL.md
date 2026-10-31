---
name: horizon-office-binding
description: Horizon-specific operation binding for creating, inspecting and revising Excel workbooks, Word documents and PowerPoint presentations with OfficeCLI.
license: MIT
---

This is the Horizon engine binding, not a replacement for a specialist's design or content instructions. Use the selected upstream domain guidance together with this binding. Office files use OfficeCLI; do not substitute openpyxl, python-docx or python-pptx.

1. Read the user's current request and existing conversation deliverables. If revising, reuse the returned registered file ID. Do not ask for a topic already provided or invent a topic from unrelated personal memory.
2. Choose `spreadsheet_create`, `document_create`, or `slides_create` for a new deliverable. For existing files use `spreadsheet_inspect`/`spreadsheet_edit`, `document_edit`, or `slides_edit`, as actually offered. Get exact input fields from `skill_read_resource` with `horizon/tools/TOOL_NAME.json` if they are not supplied in the current native schema. Resource reading does not execute the operation.
3. Send one complete object of correctly typed arguments to the actual native function. Nested objects/arrays are objects/arrays, never JSON strings. Do not send an empty object, a tool name alone, a category wrapper, or another discovery call when the exact schema is already available.
4. Populate the real requested content. A workbook needs cells and formulas, not only formats. Use numeric values for amounts and a complete `=` formula string for formulas. Word needs useful document content. Slides need a coherent sequence of actual slides. Preserve the user's requested totals, units, audience and constraints.
5. Inspect the successful result's `files` and file IDs, then read/inspect the saved deliverable using offered tools. A started job, loaded skill, announced intention or generated script is not the file. Surface real unsupported OfficeCLI operations; do not claim a reordering or layout edit succeeded when the service rejects it.
6. Register and show the resulting file in the conversation. Preserve its identity for revisions; return the newest successful version, not an older preview. If an operation reports no changes, do not create a duplicate deliverable.
7. Correct validation failures using returned field feedback and the exact native schema. Keep successful steps. For runtime failures report the actual readiness problem. Do not loop through skill discovery, switch to an unoffered tool, or replay a write whose outcome is unknown.

For workbooks, inspect the current `file_id` before changing cells, including a follow-up in the same conversation. Use the observed occupied range to choose an empty row. Adding a row means writing its actual label and value/formula; `null` clears a cell and is never a placeholder for an intended value. Preserve totals and other existing content when the user asks to add information. Example sequence (replace the file IDs and addresses with actual observed values):

```json
{"file_id":"<latest workbook ID>","sheet":"Budget","max_rows":30}
```

Call `spreadsheet_inspect` with that object. If rows 1–4 are occupied, append with `spreadsheet_edit`:

```json
{"file_id":"<latest workbook ID>","output_name":"budget.xlsx","sheets":[{"name":"Budget","cells":[{"cell":"A5","value":"Summary"},{"cell":"B5","value":"=COUNTA(A2:A3)"}]}]}
```

Inspect the newly returned workbook ID again before replying. Confirm both the original formula and the new formula are present. If another write is still necessary, execute it now; do not end with “now I need to add the formula.” Combine related formats and cell changes in one edit of the latest file rather than issuing parallel edits of an older version. `freeze_panes` takes one cell address such as `A2`, not a range or colon-separated coordinates.

For a presentation, send every slide in one `slides_create` call. Each array item is one slide; separate calls create separate decks. Put visible content in `body`, `bullets` or `table`. `notes` are speaker notes, not visible bullets. Omit unused fields rather than inserting empty placeholder slides. For example, adapt the following complete object to the user's actual subject and requested count:

```json
{"output_name":"overview.pptx","slides":[{"title":"The problem","bullets":["Describe the current obstacle","Explain its impact"]},{"title":"The approach","bullets":["Present the proposed solution","Explain how it addresses the obstacle"]},{"title":"Next steps","bullets":["Assign the first concrete action","Define how success will be checked"]}]}
```

Inspect that returned deck before any revision. A revision needs real edits using observed slide/shape IDs, a requested order, or appended slides. Never submit `changes: []` as the only edit or create a replacement deck merely because the saved revision has a different download filename.
