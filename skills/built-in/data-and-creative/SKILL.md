---
name: openclaude-data-and-creative-workflows
description: Use when combining artifacts, charts, data analysis, document deliverables, templates or semantic retrieval in one user task.
---

# Horizon artifacts and data workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Select the actual deliverable
Interactive page, visual roadmap, SVG or reusable written plan → artifact_save. XLSX → spreadsheet workflow. DOCX/PDF → document workflow. PPTX → presentation workflow. Actual generated images/audio require their configured tools; do not pretend HTML/source code is a rendered image, an Office file, or a compiled native application.

For combined tasks, retain shared source facts and actual file/artifact identities. Work in dependency order: read source → analyze → create → inspect → revise → deliver. Independent read-only retrieval can run together when the backend allows it; writes that depend on earlier results must wait for those results. A skill, task record or template copy alone does not fulfill the output.

## Artifact creation and continuation
### artifact_save
A complete ordinary artifact is one publishing call, not draft_start/write/finish. Use the real requested topic.

Call the native function **artifact_save** with this argument object:

```json
{
  "title": "Project roadmap",
  "type": "markdown",
  "source": "# Project roadmap\n\n## Observe\nCapture requirements and constraints.\n\n## Implement\nBuild the agreed behavior.\n\n## Verify\nCheck the saved output and edge cases.\n"
}
```

### artifact_read
Keep the exact current expected_version and source_hash from this result.

Call the native function **artifact_read** with this argument object:

```json
{
  "artifact_id": "<artifact_id returned by artifact_save>",
  "offset": 0,
  "limit": 12000
}
```

### artifact_save
Send the CURRENT version, not the future one. If read returns 1, send 1 and Horizon creates 2. For short source use a complete revision; for long source use one exact unique patch only when you have its current text/hash.

Call the native function **artifact_save** with this argument object:

```json
{
  "artifact_id": "<same observed artifact_id>",
  "expected_version": 1,
  "source": "<complete revised source with the requested change and preserved original content>"
}
```

### artifact_save
The find string must be copied exactly and appear once. A failed patch returns current source/occurrence information; correct it or use a complete revision when full source is available. Never repeat the same no-match patch or create an unrelated replacement artifact.

Call the native function **artifact_save** with this argument object:

```json
{
  "artifact_id": "<same observed artifact_id>",
  "expected_version": 1,
  "expected_hash": "<current source_hash from artifact_read>",
  "find": "## Verify\nCheck the saved output and edge cases.",
  "replace": "## Verify\nCheck the saved output and edge cases.\n\n## Summary\nDeliver the verified outcome."
}
```

### artifact_export
Use when the user needs a downloadable source file as well as an artifact preview. Deliver the returned file identity.

Call the native function **artifact_export** with this argument object:

```json
{
  "artifact_id": "<actual saved artifact_id>"
}
```


## Data and computation
Read actual registered CSV/JSON or extracted document text before analysis. Preserve units, missing values, category definitions and time ranges. Check duplicates, sample size and invalid rows before aggregation. Do not silently treat missing data as zero or invent measurements. Use the exact data_* / chart_* schema from the operation reference for the required transformation.

### python_session
Only when an authenticated isolated execution worker is actually ready; this is not a mandatory Docker setup and cannot fall back silently to the host backend.

Call the native function **python_session** with this argument object:

```json
{
  "action": "create"
}
```

### python_session
Retain this session for related calculations. Inspect stdout/stderr, error status, plots and actual output files; do not assume execution succeeded.

Call the native function **python_session** with this argument object:

```json
{
  "action": "execute",
  "session_id": "<session_id from python_session create>",
  "code": "values = [10, 20, 30]\nprint({\"count\": len(values), \"total\": sum(values), \"mean\": sum(values)/len(values)})"
}
```

### python_session
A timed-out/restarted session may have lost variables. Inspect before replaying filesystem or external effects. Python is not an Office generation fallback.

Call the native function **python_session** with this argument object:

```json
{
  "action": "close",
  "session_id": "<owned session_id>"
}
```


## Reusable templates and retrieval
### template_create
Use only user-authorized content. This stores a protected source copy, not a global permission grant.

Call the native function **template_create** with this argument object:

```json
{
  "file_id": "<real registered DOCX/XLSX/PPTX/HTML/SVG file_id>",
  "name": "Project status template",
  "description": "Use for a recurring project status deliverable.",
  "instructions": "Preserve the layout; replace the title, dates and project facts; inspect the revised copy before delivery."
}
```

### template_apply
Choose the extension matching the actual template. Then fill/edit the returned copy with the appropriate format tool; copying is not completion.

Call the native function **template_apply** with this argument object:

```json
{
  "template_id": "<template_id returned by template_create>",
  "output_path": "outputs/project-status.docx"
}
```

### retrieval_index
Requires a configured embedding runtime. Index only permitted registered source files; retain vector_store_id. Binary Office/PDF files may need extraction first.

Call the native function **retrieval_index** with this argument object:

```json
{
  "file_ids": [
    "<registered text/extracted file_id>"
  ],
  "attributes": {
    "topic": "project-notes"
  }
}
```


## Design and checks
For an interface/artifact, load the frontend design workflow automatically when applicable; choose a coherent palette, typography, spacing, responsive structure and real interactions. For charts, use actual data with labelled axes/units and a readable legend. Respect media/tool runtime limitations. Validate the actual saved output and preserve its identity on follow-up. Report source-only checks separately from visual inspection; never claim a preview was viewed when it was not.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
