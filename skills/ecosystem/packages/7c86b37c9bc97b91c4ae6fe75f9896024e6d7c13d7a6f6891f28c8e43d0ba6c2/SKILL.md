---
name: horizon-pdf-binding
description: Horizon-specific binding for local PDF creation, reading, extraction, editing and delivery.
license: MIT
---

Use the local PDF service, separately from OfficeCLI. Do not require Docker. Select the actual offered PDF creation/read/extract/edit operation and inspect its native schema. The exact schema and calling requirements are available as `horizon/tools/TOOL_NAME.json` through `skill_read_resource` for this installed skill.

Start from the current user content or read the registered existing PDF. Use real file IDs and page numbers returned by inspection. Submit a complete object, never stringified arguments. For edits preserve page order, content and form values outside the requested change. Explicitly report unsupported operations. Keep the source and prior deliverable if conversion fails. Inspect extracted content/page count after successful creation or editing and return the registered output. Do not claim visual quality without actually viewing a render with a capable model and authorized tools. Never guess signatures, alter protected documents without permission, or replay an uncertain mutation.
