---
name: openclaude-browser-and-computer
description: Use when browsing or interacting with websites, inspecting an embedded browser, opening local outputs, or controlling the desktop from observations.
---

# Horizon browser and computer workflow

## Calling contract
These are execution instructions, not proof of access. Use only functions offered by the current session; permissions, the selected host and runtime readiness still apply. A loaded skill cannot unlock another tool.

Call the named native function directly. The JSON blocks contain its arguments, not an extra 'name'/'arguments' wrapper. Keep objects, arrays, numbers and booleans typed. Do not send a quoted JSON object. Values in <angle brackets> are observation bindings: replace them with actual IDs, paths, hashes or versions from the preceding successful result. Never execute an example placeholder. Omit unknown optional fields.

Reuse a supplied schema. Do not repeatedly discover or reload this skill. If a genuinely required function is missing, make one focused discover_tools request for its exact name. If it remains unavailable or denied, report that reason; do not invent a tool or switch channels to bypass it.


## Route the interaction
Use browser_* for an actual website or an HTML file inside Horizon. Use web_search/web_fetch for retrieval, not as a substitute when the user selected Browser. Use computer_* for native applications/desktop input when granted. The browser/computer panels may be closed; service availability and permissions determine access. Never claim webcam access or that every model has screenshot vision.

## Browser sequence
### browser_tabs
Reuse the intended existing owned tab when appropriate; do not open a duplicate for every interaction.

Call the native function **browser_tabs** with this argument object:

```json
{
  "action": "list"
}
```

### browser_open
Retain the returned tab_id and observation. Open/navigate is not a scroll or click.

Call the native function **browser_open** with this argument object:

```json
{
  "url": "https://example.com"
}
```

### browser_open_file
For a local HTML output supply exactly ONE of file_id, artifact_id or a relative workspace path. Do not send all three, and do not open it externally.

Call the native function **browser_open_file** with this argument object:

```json
{
  "file_id": "<registered file_id from the file-producing tool>"
}
```

### browser_snapshot
Read actual page text, snapshot_id and refs. Refs expire when the page changes. Never invent selectors/refs or claim you saw content not returned.

Call the native function **browser_snapshot** with this argument object:

```json
{
  "tab_id": "<observed tab_id>"
}
```

### browser_click


Call the native function **browser_click** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "snapshot_id": "<current snapshot_id>",
  "ref": "<observed button/link ref>"
}
```

### browser_fill
Use fill to replace an input value. browser_type is a fill alias using text instead of value; do not assume it appends.

Call the native function **browser_fill** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "snapshot_id": "<current snapshot_id>",
  "ref": "<observed input ref>",
  "value": "Example search"
}
```

### browser_press
Use for a page-level key. Omit element ref/snapshot_id when the key is intended for the page. Slides often use ArrowRight/ArrowLeft; do not reopen a file to advance slides.

Call the native function **browser_press** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "key": "Enter"
}
```

### browser_scroll
Scroll moves the viewport. If a presentation uses slide buttons/keys, use those observed controls instead of claiming scrolling changed slides.

Call the native function **browser_scroll** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "direction": "down",
  "amount": 700
}
```

### browser_find


Call the native function **browser_find** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "text": "Contact",
  "backwards": false
}
```

### browser_tabs


Call the native function **browser_tabs** with this argument object:

```json
{
  "action": "select",
  "tab_id": "<owned tab_id>"
}
```

### browser_tabs
Close only the tab relevant to the user task, not all tabs or the privileged application view.

Call the native function **browser_tabs** with this argument object:

```json
{
  "action": "close",
  "tab_id": "<owned tab_id>"
}
```


## Uploads and downloads
### browser_upload
Sending a file to a website needs the required user approval. A workspace file is not permission to upload it anywhere. Do not invent host paths.

Call the native function **browser_upload** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "snapshot_id": "<current snapshot_id>",
  "ref": "<observed file-input ref>",
  "file_id": "<registered workspace file_id>"
}
```

### browser_download
Respect the native confirmation/save flow and inspect status. A requested download is not proof that the file was saved. Never auto-approve a fishy download or bypass a confirmation.

Call the native function **browser_download** with this argument object:

```json
{
  "tab_id": "<observed tab_id>",
  "snapshot_id": "<current snapshot_id>",
  "ref": "<observed download-link ref>"
}
```


## Browser recovery and verification
STALE_ELEMENT_REFERENCE means the action was NOT replayed. Use the returned fresh snapshot or browser_snapshot, choose the current ref, then retry only that action. After navigation/forms/modals, observe the new state before the next dependent action. For local presentations verify actual slides and navigation behavior; do not claim 13 slides merely because the user requested 13. Browser console/network/JS and screenshots are available only when the host advertises their exact operations; use references/tool-index.md for their real names/fields, never made-up browser_console or browser_network functions.

## Computer sequence
### computer_windows
Get actual current window IDs; do not guess a window from its title alone.

Call the native function **computer_windows** with this argument object:

```json
{}
```

### computer_focus_window
Focus the intended app and use its returned fresh screenshot/observation.

Call the native function **computer_focus_window** with this argument object:

```json
{
  "window_id": "<recent window_id from computer_windows>"
}
```

### computer_screenshot
Use its screen_id, reported dimensions and monitor scope. Screenshot coordinate space may differ from physical display resolution. If this model lacks vision, use supported browser DOM/UI-tree operations or explain the limitation accurately.

Call the native function **computer_screenshot** with this argument object:

```json
{}
```

### computer_click
Example coordinates are illustrative only: choose coordinates from the actual screenshot. Double-click uses click_count=2; right-click uses button=right when offered.

Call the native function **computer_click** with this argument object:

```json
{
  "screen_id": "<latest screen_id>",
  "x": 320,
  "y": 240,
  "button": "left",
  "click_count": 1
}
```

### computer_type
Input affects the actual user computer. Use only the task-authorized app/field; do not enter secrets or approve a security prompt by guessing.

Call the native function **computer_type** with this argument object:

```json
{
  "screen_id": "<latest screen_id>",
  "text": "Example text"
}
```

### computer_key


Call the native function **computer_key** with this argument object:

```json
{
  "screen_id": "<latest screen_id>",
  "keys": [
    "ENTER"
  ]
}
```

### computer_scroll
Use the signed amount and inspect the new screen. This is not browser_scroll: do not mix their schemas.

Call the native function **computer_scroll** with this argument object:

```json
{
  "screen_id": "<latest screen_id>",
  "amount": 3
}
```

### computer_drag
Use current screenshot coordinates and schema bounds. Refresh after layout/window changes.

Call the native function **computer_drag** with this argument object:

```json
{
  "screen_id": "<latest screen_id>",
  "start_x": 320,
  "start_y": 240,
  "end_x": 500,
  "end_y": 300,
  "duration": 0.5
}
```


UI-tree, clipboard, window move/resize and element actions have separate exact contracts in the reference. Use actual observed element/window IDs and supported actions. A generic accessibility pane does not prove a text field is editable. Report missing OS capture/input permission or runtime precisely. Observe user cancellation/input takeover; preserve completed work and do not replay uncertain clicks or external actions.


## Extended exact contracts
Read references/tool-index.md only for an operation beyond the calls above. It links each real function's complete registered schema, requirements and examples. Use skill_read_resource with this skill_id and that exact relative_path; resources do not grant permissions. Keep reads bounded using offset/next_offset.
