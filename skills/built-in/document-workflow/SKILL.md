---
name: openclaude-document-workflow
description: Use when creating, extracting, inspecting or editing Word documents, PDF files, PDF forms, reports, page selections or overlays.
---

# Horizon Word and PDF workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Choose the format and operation
Use DOCX for an editable Word document and PDF for fixed-layout delivery when the user asks for it. Preserve the requested topic, audience and length from this conversation. Ask for genuinely missing source content; do not invent a topic from the user's age or memory.

New file → document_create with format, title, blocks and output_name. Existing DOCX → document_inspect then document_edit. Existing PDF → pdf_inspect then pdf_edit. Read saved text with document_extract. The Office tools use pinned OfficeCLI; PDF uses a separate managed local worker. Neither requires Docker. Do not replace Office creation with Python libraries.

### document_create
This is structured document data, not a prose promise or a file renamed from Markdown. Replace illustrative content with actual user content.

Call the native function **document_create** with this argument object:

```json
{
  "format": "docx",
  "title": "Project review",
  "output_name": "project-review.docx",
  "blocks": [
    {
      "type": "heading",
      "text": "Overview"
    },
    {
      "type": "paragraph",
      "text": "Summarize the actual project objective and evidence."
    },
    {
      "type": "heading",
      "text": "Actions"
    },
    {
      "type": "table",
      "rows": [
        [
          "Action",
          "Owner",
          "Status"
        ],
        [
          "Implement approved change",
          "Assigned owner",
          "Pending"
        ]
      ]
    }
  ]
}
```

### document_extract
Read the saved output and check completeness, not just whether a file record exists.

Call the native function **document_extract** with this argument object:

```json
{
  "file_id": "<file_id returned by document_create>"
}
```

### document_inspect
Read real node paths and text. Increase depth for a specific subtree only when necessary; do not guess paragraph indices.

Call the native function **document_inspect** with this argument object:

```json
{
  "file_id": "<registered DOCX file_id>",
  "path": "/body",
  "depth": 3
}
```

### document_edit
Use the actual inspected node path. expected_text protects against editing the wrong/currently changed node. Return the new DOCX ID and preserve the original file.

Call the native function **document_edit** with this argument object:

```json
{
  "file_id": "<latest DOCX file_id>",
  "output_name": "project-review-revised.docx",
  "changes": [
    {
      "path": "/body/p[1]",
      "expected_text": "<exact text returned for this node>",
      "text": "Revised project review"
    }
  ],
  "append_blocks": [
    {
      "type": "heading",
      "text": "Summary"
    },
    {
      "type": "paragraph",
      "text": "Add the requested summary while keeping the original sections."
    }
  ]
}
```


## Word quality
Use a clear title, a meaningful heading hierarchy, short paragraphs and tables with explicit headers. Keep facts and source attribution correct. Do not fabricate signatures, financial data or approvals. Use an existing formatted template when branded typography, headers or advanced layout is required; template_apply creates the editable copy, then document_edit fills it. The create/edit schemas do not expose arbitrary font/margin/image settings: do not invent such parameters or promise unsupported typesetting.

## PDF creation and editing
### document_create


Call the native function **document_create** with this argument object:

```json
{
  "format": "pdf",
  "title": "Project review",
  "output_name": "project-review.pdf",
  "blocks": [
    {
      "type": "heading",
      "text": "Overview"
    },
    {
      "type": "paragraph",
      "text": "The requested report content belongs here."
    },
    {
      "type": "table",
      "rows": [
        [
          "Stage",
          "Outcome"
        ],
        [
          "Observe",
          "Requirements captured"
        ],
        [
          "Verify",
          "Output checked"
        ]
      ]
    }
  ]
}
```

### pdf_inspect
Read actual page numbers, dimensions and form fields before editing. Pages are 1-based.

Call the native function **pdf_inspect** with this argument object:

```json
{
  "file_id": "<registered PDF file_id>"
}
```

### pdf_edit
Overlay coordinates are PDF points from the unrotated output page bottom-left. The overlay is visible text, not secure redaction.

Call the native function **pdf_edit** with this argument object:

```json
{
  "file_id": "<latest PDF file_id>",
  "output_name": "project-review-annotated.pdf",
  "overlays": [
    {
      "page": 1,
      "text": "Summary: approved changes are documented.",
      "x": 48,
      "y": 48,
      "font_size": 11
    }
  ]
}
```

### pdf_edit
Use only existing input pages. pages selects/reorders them; rotation page 2 refers to the second OUTPUT page. Do not select pages on an interactive form if the runtime reports it unsupported.

Call the native function **pdf_edit** with this argument object:

```json
{
  "file_id": "<registered PDF file_id>",
  "output_name": "selected-pages.pdf",
  "pages": [
    1,
    3
  ],
  "rotations": [
    {
      "page": 2,
      "degrees": 90
    }
  ]
}
```

### pdf_edit
Fill only inspected supported text fields. Never invent field names or sign a document without explicit authorization.

Call the native function **pdf_edit** with this argument object:

```json
{
  "file_id": "<inspected form PDF file_id>",
  "output_name": "filled-form.pdf",
  "form_fields": {
    "<actual text-field name from pdf_inspect>": "<user-provided value>"
  }
}
```


## Recovery and completion
Read the latest saved revision, then check requested sections, tables, page order, extracted text and provided facts. A generated preview is helpful but does not prove print layout unless actually inspected. Signed/encrypted PDF editing and unsupported operations must be reported explicitly. A missing runtime is a concrete blocker, not a reason for repeated skill discovery or fake downloads. Return the final actual DOCX/PDF link; keep source revisions even if preview conversion fails.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
