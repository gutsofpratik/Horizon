---
name: openclaude-spreadsheet-workflow
description: Create and revise designed Excel workbooks using Horizon sheets actions, formulas and supported cell formatting.
---

Use for Excel, XLSX, financial statements, budgets and trackers. Use the directly supplied spreadsheet_create function; do not discover it again. Create accepts output_name and an array of sheets, each with name and rows. Rows are cell arrays; numbers stay numbers, formulas are strings beginning with =, and empty cells use null. Do not put an extra arguments wrapper into a directly supplied sheets function.

For a new balance sheet, create a clear title and as-of date if supplied. Group assets, liabilities and equity. Use rows for individual inputs and SUM formulas for group totals. Include assets minus liabilities minus equity as a balance check. If figures were not provided, create a labelled blank/zero template; do not make up actual figures. Keep calculations as formulas rather than hard-coded totals.

Creation builds the workbook; design is a second supported step. Use the returned file_id in spreadsheet_edit with a new output_name. Give sheets by exact name. Supported edits include cells, formats, column_widths, freeze_panes and auto_filter. Each format specifies range and supported properties such as bold, font_size, font_color, fill, number_format, alignment and wrap_text. Colors use six hexadecimal digits without a # prefix, e.g. 17365D. Do not invent a styles field on spreadsheet_create.

Example formatting: A1:B1 uses a dark fill, white bold text and 16-point font; A labels are around 30 characters wide and B amounts around 20. Monetary cells use a readable number format, totals have stronger weight, and blank spacer rows separate sections. Apply currency symbols only when the currency is known. Use one restrained accent color, consistent decimal precision and appropriate negative-value formatting.

Inspect the final returned file with spreadsheet_inspect. Check formulas, row references, balance check, labels, sheet names and file existence. Inspection does not recalculate formulas; Excel/LibreOffice or an available actual calculation engine is needed to validate calculated values. Explain any such limitation accurately. Return the final styled file link, not an earlier intermediate file.

For an existing workbook, inspect first and use spreadsheet_edit to preserve unmentioned content. Use Python only when the requested operation genuinely exceeds the sheets schema and the appropriate runtime is available. Do not spend multiple rounds discovering Python when create/edit already meet the task.

Runtime: Excel, Word and PowerPoint use pinned OfficeCLI exclusively, including creation, editing, inspection and HTML previews. Do not fall back to Python Office libraries or LibreOffice. PDF work uses a separate app-managed local Python worker. Docker is not required. OfficeCLI setup/version information is available in runtime diagnostics. Unsupported operations must be reported explicitly.
