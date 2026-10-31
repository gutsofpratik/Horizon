---
name: openclaude-presentation-workflow
description: Use when making or revising actual PowerPoint decks, slide narratives, speaker notes, tables or slide layouts.
---

# Horizon presentation workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Build a real deck
Extract the topic, audience, purpose, desired slide count and source material. If optional visual preferences are absent, choose a clear restrained design; if the topic itself is absent, ask_user rather than inventing one from personal memory. Match an explicit slide count exactly. A concept outline is not the requested PPTX.

1. Outline the narrative in the working task: opening/context, key ideas/evidence, conclusion/action.
2. Use slides_create once with complete slides. Each slide has one main message; use concise bullets or a supported table, with delivery details in notes.
3. Use the returned PPTX file_id with slides_inspect. Count slides and inspect actual content/shape IDs.
4. For a revision, use slides_edit against those observed identities and return its latest file_id. Preserve all unrelated slides and original deck versions.

### slides_create
Themes use actual supported color/font fields. Supported create layouts are section/content. Do not invent images, arbitrary layout types, gradient fields or unsupported charts.

Call the native function **slides_create** with this argument object:

```json
{
  "output_name": "project-review.pptx",
  "theme": {
    "background": "FFFFFF",
    "foreground": "172033",
    "accent": "315D95",
    "font": "Aptos"
  },
  "slides": [
    {
      "title": "Reliable project delivery",
      "body": "Observe, implement and verify",
      "layout": "section",
      "notes": "Introduce the actual project purpose."
    },
    {
      "title": "Observe",
      "bullets": [
        "Capture the user requirement",
        "Inspect current behavior"
      ],
      "notes": "Explain the actual evidence and constraints."
    },
    {
      "title": "Implement and verify",
      "bullets": [
        "Make the agreed change",
        "Check the real outcome"
      ],
      "notes": "End with concrete next steps."
    }
  ]
}
```

### slides_inspect
Use the actual returned slide number and shape_id for an edit. A guessed shape ID may edit the wrong object.

Call the native function **slides_inspect** with this argument object:

```json
{
  "file_id": "<PPTX file_id returned by slides_create>"
}
```

### slides_edit
The shape_id 1 is illustrative; replace it with the actual title/content shape from slides_inspect. Changing text may require visual text-fit review.

Call the native function **slides_edit** with this argument object:

```json
{
  "file_id": "<latest PPTX file_id>",
  "output_name": "project-review-revised.pptx",
  "changes": [
    {
      "slide": 2,
      "shape_id": 1,
      "text": "Observe the current workflow"
    }
  ],
  "notes": [
    {
      "slide": 2,
      "text": "Explain the captured requirement and known constraints."
    }
  ]
}
```

### slides_edit
Append the requested slide without recreating the deck or discarding earlier slides. Inspect the returned deck and verify the new count.

Call the native function **slides_edit** with this argument object:

```json
{
  "file_id": "<latest PPTX file_id>",
  "output_name": "project-review-with-summary.pptx",
  "add_slides": [
    {
      "title": "Summary",
      "body": "State the verified result and next action."
    }
  ]
}
```


## Content and visual quality
Use a consistent theme, font and title hierarchy; keep strong text/background contrast and generous whitespace. Prefer a few concrete bullets to paragraph walls. Use section slides only for meaningful transitions, not every slide. Tables need short headers, consistent units and readable cell content. Label illustrative values; do not invent data, sources or stock images. Add notes for detail instead of shrinking body text until it is unreadable.

The runtime uses pinned OfficeCLI, not Python Office generation, and Docker is not required. The current adapter can create decks, inspect shapes, change text/notes and append slides. If it returns OFFICE_OPERATION_UNSUPPORTED for selection/reordering or another operation, report the limitation rather than claiming the order changed or switching engines silently.

## Checks and recovery
Verify the final slide count, exact requested titles/content, preserved earlier slides, correct file type and actual file link. Inspect layout/overflow only when a preview/render was genuinely inspected; a ZIP/text check is not visual verification. For a missing shape, inspect again; for a wrong file_id, use the registered PPTX rather than its HTML preview. Do not repeatedly create a brand-new deck to perform a small edit. Deliver the latest PPTX, noting any unverified visual review.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
