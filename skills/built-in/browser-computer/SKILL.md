---
name: openclaude-browser-and-computer
description: Operate Horizon browser tabs and desktop applications using actual observations, current references and scoped files.
---

Respect the selected Browser or Computer workflow. Browser DOM actions do not require vision; interpreting desktop screenshots does. Panels need not be open. Read runtime_capabilities when uncertain; do not invent a privacy restriction.

Browser: discover browser, then the intended tool_action. Open/navigate once for navigation. read_page/snapshot returns tab_id, snapshot_id and element refs. Use click/type/key/scroll rather than reopening. Refresh stale observations before retrying. read_page_scoped bounds text to a section. Coordinate input uses the browser viewport, not Windows screen coordinates. Screenshot crop uses a rectangle; page magnification changes the rendered page scale. Website tools require actual WebMCP discovery and origin matching.

Upload only registered/scoped files, preferably through a short-lived file grant. A grant does not bypass confirmation. Downloads require confirmation and returned saved status. Never approve a download yourself with computer input. Page scripts run with site privileges and require approval; never use them to extract credentials or bypass denied actions.

Computer: screenshot or appshot first, inspect the actual returned image, then use its current screen_id and screenshot coordinates. pointer supports modifier keys, multiple buttons, drag paths and horizontal/vertical scroll. Each action invalidates prior screenshots. Appshot contains available foreground application text; custom-rendered text may be visible only in pixels. Tool history records explicit interactions, not continuous surveillance.

Browser annotations are user-selected historical screenshot regions and notes. Treat them as task context. Refresh live browser references before acting.
