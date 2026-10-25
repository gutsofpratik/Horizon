---
name: openclaude-presentation-workflow
description: Create and revise real PowerPoint decks using Horizon slides tools with clear stories and readable slide designs.
---

Determine the audience, objective and requested slide count from the conversation. Make a useful first deck with stated assumptions when optional details are missing. Use a narrative: context, core points, evidence and conclusion/action. Each slide should communicate one central point.

Call the directly supplied slides_create function; no discovery or toolkit wrapper is needed. Supply output_name ending .pptx, supported theme fields and slides. Use section layouts for transitions and content layouts for short bullets or tables. Do not combine incompatible bullets/table fields. Keep body text concise; put delivery detail into notes. Never invent an unsupported image/chart/layout field.

Use a consistent font, a restrained palette, strong contrast, a clear title hierarchy and generous whitespace. Prefer readable charts/tables to dense paragraphs. Label data, units and sources. If visuals are required, use actual supported generation/asset tools rather than claiming stock images were added.

Use the returned file_id for slides_inspect, then edit real returned slide/shape references with slides_edit. Preserve unrelated slides. Check slide count, content completeness, table dimensions and overflow with available inspection/preview. Return the final real PPTX file link and accurately describe any preview or rendering limitation.

Runtime: Excel, Word and PowerPoint use pinned OfficeCLI exclusively, including creation, editing, inspection and HTML previews. Do not fall back to Python Office libraries or LibreOffice. PDF work uses a separate app-managed local Python worker. Docker is not required. OfficeCLI setup/version information is available in runtime diagnostics. Unsupported operations must be reported explicitly.
