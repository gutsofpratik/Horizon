---
name: horizon-frontend-design
description: Use when creating or improving HTML, SVG, interfaces, dashboards, visual roadmaps, prototypes, layouts or artifact aesthetics.
---

# Horizon frontend and artifact design

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Design brief before source
Use the user's reference, target audience, task and existing design system. Choose one coherent direction and apply it throughout. For an existing interface, preserve its typography, spacing, colors and interaction language unless asked to redesign it.

## Concrete design recipes
- Editorial/light: warm background #F8F7F3, surface #FFFFFF, text #242320, muted #6F6B64, restrained terracotta #A95743. Pair a system serif heading (Georgia, serif) with system-ui body text. Use fine borders, generous whitespace, quiet emphasis and readable line lengths.
- Minimal/product: neutral background #F6F7F9, surface #FFFFFF, text #18212F, accent #2457D6. Use system-ui throughout, a 4/8px spacing scale, clear hierarchy and compact controls. Prefer alignment and typography over decorative panels.
- Expressive/gradient: choose two related accent colors, e.g. #3156C5 to #6D5CC8, with a restrained linear gradient used in a hero/accent only. Keep body surfaces calm and text contrast high. Avoid gradients on every card or mixing unrelated glows.
- Dark: background #171817, surface #222321, text #F2F0E9, secondary #B5B0A6, accent #C6826C. Use distinct hover, focus, active and disabled states; do not rely on shadow alone for boundaries.
These are starting recipes, not mandatory branding. Do not introduce a purple/blue gradient, serif font or large hero merely because this skill lists it. Follow explicit user colors/fonts first. Prefer existing local fonts; do not claim a web font is present unless actually loaded. Keep body text around 15–18px with 1.45–1.65 line-height, content readable at narrow widths, and headings sized by hierarchy rather than arbitrary huge text.

## Structure and behavior
Use semantic landmarks, real buttons/labels, keyboard-operable controls, visible focus states and descriptive errors. Use Grid/Flexbox with min-width:0 for shrinkable regions. Prevent horizontal overflow; constrain long text/code, use wrapping and responsive columns. Test empty/loading/error/success/disabled states conceptually before source. For real repository work, add actual state handlers; an inert button is not a completed interaction.

Use a consistent spacing scale (4, 8, 12, 16, 24, 32, 48), two or three radius sizes and one primary action per region. Choose subtle 120–220ms transitions for controls and 200–320ms panel motion. Animate opacity/transform where possible, avoid layout thrashing, and respect prefers-reduced-motion. A shimmer should move through text while the operation is active, stop when complete, and never imply progress that the backend did not report.

## Artifact path
Use an artifact for a requested visual roadmap, interactive page, HTML demo, SVG or self-contained concept. A normal artifact is one artifact_save call with complete source; do not invent draft IDs or start a draft lifecycle. A native/compiled app requires actual repository/runtime work, not just this HTML preview.
### artifact_save
Replace this illustrative content with the actual requested topic. Keep a self-contained, valid document and meaningful interactions when requested.

Call the native function **artifact_save** with this argument object:

```json
{
  "title": "Project roadmap",
  "type": "html",
  "source": "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Project roadmap</title><style>:root{color-scheme:light;--bg:#f8f7f3;--ink:#242320;--accent:#a95743}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui}main{max-width:64rem;margin:auto;padding:clamp(1rem,5vw,3rem)}h1{font:500 clamp(2rem,5vw,3rem)/1.1 Georgia,serif}ol{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));gap:1rem;padding:0;list-style:none}li{padding:1.25rem;background:white;border:1px solid #e1ded6;border-radius:12px}h2{font-size:1.1rem;color:var(--accent)}</style><main><h1>Project roadmap</h1><p>Three steps to a dependable result.</p><ol><li><h2>Observe</h2><p>Understand the need and constraints.</p></li><li><h2>Implement</h2><p>Build the agreed working behavior.</p></li><li><h2>Verify</h2><p>Check the real output and edge cases.</p></li></ol></main></html>"
}
```

### artifact_read
Before revising, read current source and keep expected_version/source_hash. A version returned as 1 means expected_version=1; Horizon creates version 2.

Call the native function **artifact_read** with this argument object:

```json
{
  "artifact_id": "<artifact_id returned by artifact_save>",
  "offset": 0,
  "limit": 12000
}
```

### artifact_save
The integer 1 is illustrative: copy the CURRENT returned expected_version unchanged. For short source prefer complete source; for larger source use an exact unique find/replace patch with the returned hash. A failed patch must not be repeated unchanged.

Call the native function **artifact_save** with this argument object:

```json
{
  "artifact_id": "<same observed artifact_id>",
  "expected_version": 1,
  "source": "<complete revised source preserving the requested original content>"
}
```


## Repository and preview path
For a real frontend project, use the coding workflow: inspect package.json and existing components, implement within the established system, run its actual checks, then inspect the requested preview when authorized. Do not replace an existing framework with a standalone HTML file. Keep artifact identity and source files consistent during revisions.
### browser_open_file
Supply exactly one of artifact_id, file_id or path. This opens the local output in Horizon, not an external browser.

Call the native function **browser_open_file** with this argument object:

```json
{
  "artifact_id": "<actual saved artifact_id>"
}
```

### browser_snapshot
Verify actual visible structure; use screenshots only when the model/runtime supports interpreting them. Do not claim visual verification from source inspection alone.

Call the native function **browser_snapshot** with this argument object:

```json
{
  "tab_id": "<tab_id returned by browser_open_file>"
}
```


## Finish criteria
The preview contains the requested information, content is preserved in revisions, controls have real behavior, narrow layouts remain usable, and the final artifact/file exists. Report source-only verification when visual inspection was not run. Do not create an unnecessary new artifact on every follow-up.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
