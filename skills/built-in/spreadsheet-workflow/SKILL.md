---
name: openclaude-spreadsheet-workflow
description: Use when creating or revising XLSX workbooks, budgets, financial statements, formulas, spreadsheet charts or existing Excel files.
---

# Horizon Excel workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Workbook workflow
1. Read the conversation and supplied files. Determine the actual sheets, columns, units, date range, formulas and output filename. Ask only for essential missing source data. A requested blank template uses labelled empty/zero inputs; do not invent financial facts.
2. Existing workbook: spreadsheet_inspect first. New workbook: spreadsheet_create once, then use its returned XLSX file_id for styling/editing. HTML previews are not the workbook ID.
3. Create formulas as single complete strings beginning with =. Keep numbers as numbers, booleans as booleans, null as an empty cell. Never split "=" and "SUM(...)" into different cells.
4. Style with spreadsheet_edit, inspect the latest returned revision, check references and preserve original content. Return the final XLSX link, not an intermediate file or an HTML preview.

### spreadsheet_create
This is a complete minimal workbook call. Replace illustrative values with actual supplied figures. Do not add an unsupported styles field to create.

Call the native function **spreadsheet_create** with this argument object:

```json
{
  "output_name": "budget.xlsx",
  "sheets": [
    {
      "name": "Budget",
      "rows": [
        [
          "Item",
          "Amount"
        ],
        [
          "Rent",
          100
        ],
        [
          "Food",
          50
        ],
        [
          "Total",
          "=SUM(B2:B3)"
        ]
      ]
    }
  ]
}
```

### spreadsheet_inspect
Check actual sheet names, rows and formulas before selecting edit addresses.

Call the native function **spreadsheet_inspect** with this argument object:

```json
{
  "file_id": "<XLSX file_id returned by spreadsheet_create>",
  "sheet": "Budget",
  "max_rows": 30,
  "max_columns": 8
}
```

### spreadsheet_edit
Colors are exactly six hexadecimal digits without #. Use the actual sheet name; a formatting call does not add data.

Call the native function **spreadsheet_edit** with this argument object:

```json
{
  "file_id": "<latest XLSX file_id>",
  "output_name": "budget-styled.xlsx",
  "sheets": [
    {
      "name": "Budget",
      "formats": [
        {
          "range": "A1:B1",
          "bold": true,
          "font_size": 16,
          "fill": "17365D",
          "font_color": "FFFFFF"
        },
        {
          "range": "B2:B4",
          "number_format": "#,##0.00;[Red](#,##0.00)"
        },
        {
          "range": "A4:B4",
          "bold": true,
          "fill": "E8EEF5"
        }
      ],
      "column_widths": {
        "A": 30,
        "B": 20
      },
      "freeze_panes": "B2"
    }
  ]
}
```

### spreadsheet_edit
To add a row, explicitly write its cells. A5/B5 are chosen because rows 1–4 already exist in this example. Do not overwrite the Total row or send formats:[] and claim a row was added.

Call the native function **spreadsheet_edit** with this argument object:

```json
{
  "file_id": "<file_id returned by the previous edit>",
  "output_name": "budget-summary.xlsx",
  "sheets": [
    {
      "name": "Budget",
      "cells": [
        {
          "cell": "A5",
          "value": "Summary"
        },
        {
          "cell": "B5",
          "value": "=COUNTA(A2:A3)"
        }
      ]
    }
  ]
}
```

### spreadsheet_chart
The range includes a header row and category first column, then numeric series. Exclude totals from category comparisons unless intended.

Call the native function **spreadsheet_chart** with this argument object:

```json
{
  "file_id": "<latest XLSX file_id>",
  "output_name": "budget-chart.xlsx",
  "sheet": "Budget",
  "range": "A1:B3",
  "chart_type": "bar",
  "anchor": "D2",
  "title": "Expense categories"
}
```


## Financial and analytical quality
For balance sheets separate Assets, Liabilities and Equity; use SUM formulas for subtotals and Assets − Liabilities − Equity for a balance check. For budgets separate inputs, formulas, totals and variance. Put units/currency/date in labels; do not assume a currency symbol. Use one restrained accent, readable headers, enough column width, consistent decimal precision and an appropriate negative-value format. Avoid decorative merged layouts that make data unusable.

Formula verification is not just checking that a cell starts with =: verify row ranges, signs, denominators, absolute/relative references, labels and expected values from a small independent calculation. calculate can check a numeric expectation; it does not recalculate the workbook.
### calculate
Compare this expected 150 with the intended Total formula. Use actual data for real work.

Call the native function **calculate** with this argument object:

```json
{
  "expression": "100+50"
}
```


## Existing files, templates and recovery
Use exact sheet names from inspection. spreadsheet_edit preserves unspecified cells/sheets and creates a new copy; create=true adds a missing sheet only when that is intended. Keep the latest returned file_id after every edit. For a workbook template, template_apply first, then edit the copy; do not overwrite the protected template.

- INVALID_ARGUMENTS: correct the named nested field, keep arrays typed, and retry only the failed call.
- OFFICE_NO_CHANGES: no new useful workbook was delivered. Supply actual cells/formats/widths instead of copying the same empty edit.
- OFFICE_SHEET_NOT_FOUND: inspect names and correct the name; do not silently create another sheet.
- Unsupported operation: report it. Do not switch to Python Office libraries, rename CSV to XLSX, or use a browser preview as the deliverable.
- Inspect formula strings and preserved data. OfficeCLI inspection may not recalculate every formula; disclose an unverified cached value instead of inventing recalculation.

## Runtime and completion
XLSX creation/editing uses app-managed pinned OfficeCLI; Docker is not required. A skill cannot install or replace the runtime. The final registered XLSX exists, requested data/formulas are present, the revision preserved existing content, and the latest file was inspected. Mark any unperformed recalculation or visual review accurately.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
