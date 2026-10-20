---
name: openclaude-data-and-creative-workflows
description: Produce and revise real documents, spreadsheets, presentations, visual artifacts and data-analysis outputs in OpenClaude.
---

Choose the actual output format and load matching installed design/format skills. Use artifact actions for interactive HTML/SVG, documents for PDF/DOCX, sheets for XLSX, slides for PPTX, pdf for existing PDF edits, and image for actual configured image generation/editing. Do not rename text to an Office extension or claim a concept is a compiled app.

For existing files inspect them first. Use observed slide/shape/page/cell references and preserve unrelated content. Formula creation does not imply recalculation; disclose when a spreadsheet engine is needed. PDF text overlays do not securely redact original text.

For analysis create a Python session once and execute subsequent code in the same namespace. Inspect stdout, stderr, execution status, plots and actual output files. Close sessions when finished. A timeout terminates state; do not blindly repeat filesystem effects.

For large file corpora, configure an embedding model, index registered text/extracted files, then use retrieval.search with vector_store_ids and metadata filters. Cite returned source file IDs and offsets. Unsupported document binaries require extraction first. Persistent storage is not unlimited model context.

For reusable layouts use template.create and template.apply, then fill/edit the returned copy. For artifacts use artifact_save with complete source. For updates read with artifact_read, then artifact_save using the same artifact_id and returned expected_version. Normal creation does not require draft_start/write/finish. Partial drafts are checkpoints, not final deliverables. Confirm the returned files/artifacts before claiming completion.
