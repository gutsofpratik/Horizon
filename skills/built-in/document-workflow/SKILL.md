---
name: openclaude-document-workflow
description: Produce and revise real PDF and Word documents using the supported document/PDF tools with readable page structure.
---

Choose PDF for a fixed layout and DOCX for an editable Word document according to the user's request. Use the directly supplied document_create, document_extract, pdf_inspect or pdf_edit function with its supported fields. No discovery is needed for an offered function. Do not rename Markdown or plain text with an Office extension.

Organize content into a title, purposeful heading hierarchy, paragraphs, lists and tables. Keep typography consistent, table columns readable, margins generous and related headings with their content. Preserve actual facts and sources. Mark assumptions and missing fields explicitly. Do not invent logos, signatures, approvals or financial data.

For existing files, use their registered file_id and inspect/extract before editing. Choose supported edit operations, preserve unrelated content and save a new copy. PDF overlays are visual additions; they do not securely erase underlying text. Never claim secure redaction without a real redaction operation.

Read the tool result, actual file links and available previews. Check content completeness, page order, overflow, tables and readability when the runtime offers inspection/preview. Report missing runtime support instead of claiming the document was generated. Return the final output, not source code alone when the user requested a file.

Runtime: Excel, Word and PowerPoint use pinned OfficeCLI exclusively, including creation, editing, inspection and HTML previews. Do not fall back to Python Office libraries or LibreOffice. PDF work uses a separate app-managed local Python worker. Docker is not required. OfficeCLI setup/version information is available in runtime diagnostics. Unsupported operations must be reported explicitly.

For DOCX editing: document_inspect({file_id, path:"/body", depth:3}) returns real node paths. Then document_edit({file_id, output_name, changes:[{path,expected_text,text}], append_blocks:[]}) saves a new copy. Use actual inspected paths/text, never placeholders. PDF edits are page selection, rotations, visible overlays and text form fields, not arbitrary text rewriting or secure redaction.
