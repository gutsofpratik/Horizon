---
name: horizon-artifact-binding
description: Horizon-specific binding for saving visual artifacts, streaming drafts and revising the same artifact across follow-up messages.
license: MIT
---

Pair this binding with installed frontend/design guidance. Choose the artifact save operation for ordinary complete content. Reserve draft start/update/finish for actual streaming drafts; a draft is not a published deliverable. Read the exact currently offered `artifact_save`/read/update/patch/draft schema through `horizon/tools/TOOL_NAME.json` when needed. Do not discover multiple synonymous creation tools or create a new artifact for a revision.

For new work supply the requested complete content, supported artifact type and meaningful title as a native argument object. For a continuation retain the original returned artifact ID, read its current version, and use that CURRENT expected version. Keep existing working content outside the requested change. On a conflict read the latest artifact before merging; do not guess the next version or replay an uncertain mutation. Use the latest successful published result for preview/delivery and keep an existing preview when a later operation fails. For complex code inspect and preserve actual project files; an HTML artifact does not establish that an iOS or backend application has executed. Return real saved identities/files rather than narrated code.
