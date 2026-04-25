---
name: Mano-CUA Direct Computer Control
description: Mano-CUA GUI automation tool for Hermes Agent - provides computer control capabilities via Hermes tool calling. No remote model calls, Hermes makes all decisions, Mano-CUA provides GUI and action execution.
author: Hermes Agent
---

# Mano-CUA Direct Computer Control

## Overview

Mano-CUA provides GUI overlay and computer control capabilities for Hermes Agent. It is registered as a Hermes tool under the `computer` toolset.

**Key features:**
- ✅ Complete original GUI (VLA Task Monitor floating window in top-right corner)
- ✅ Complete computer action execution (click, type, scroll, drag, open app, screenshot, etc.)
- ✅ **Hermes Agent makes all decisions** via tool calling
- ✅ One action → one GUI instance, GUI auto-closes after completion

## Tool Registration

Tools are registered in `tools/mano_cua_tool.py` under the `computer` toolset:

```python
from tools.registry import registry

registry.register(
    name="mano_click",
    toolset="computer",
    schema=MANO_CLICK_SCHEMA,
    handler=mano_click,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)
```

## Hermes Tool Calling

All tools follow Hermes's tool calling format. Call them via the agent's tool interface:

```python
# Example: Tool call from agent
result = await context.call_tool("mano_click", {
    "x": 400,
    "y": 300,
    "task": "Open browser",
    "step": 1,
    "reasoning": "Click on Chrome icon"
})
```

## Available Tools

### mano_screenshot
Capture screenshot and save to `/tmp/mano-direct-screenshot.png`.

```python
result = await context.call_tool("mano_screenshot", {
    "task": "My Task",
    "step": 1,
    "reasoning": "Capture current screen"
})
# Returns: {"ok": true, "screenshot_path": "...", "screenshot_base64": "..."}
```

### mano_click
Left click at normalized (1280x720) coordinates.

```python
result = await context.call_tool("mano_click", {
    "x": 400, "y": 300,
    "task": "My Task",
    "step": 2,
    "reasoning": "Click submit button"
})
```

### mano_right_click
Right click at normalized coordinates.

### mano_double_click
Double click at normalized coordinates.

### mano_move
Move mouse to normalized coordinates.

### mano_drag
Left click drag from (x1,y1) to (x2,y2).

```python
result = await context.call_tool("mano_drag", {
    "x1": 100, "y1": 100, "x2": 400, "y2": 300,
    "task": "My Task",
    "step": 3,
    "reasoning": "Drag to select all"
})
```

### mano_type
Type text using clipboard paste.

```python
result = await context.call_tool("mano_type", {
    "text": "Hello, World!",
    "task": "My Task",
    "step": 4,
    "reasoning": "Type search query"
})
```

### mano_key
Press keyboard key (enter, esc, tab, up, down, left, right, etc.).

```python
result = await context.call_tool("mano_key", {
    "key": "enter",
    "task": "My Task",
    "step": 5,
    "reasoning": "Submit form"
})
```

### mano_scroll
Scroll screen in direction.

```python
result = await context.call_tool("mano_scroll", {
    "direction": "down",
    "task": "My Task",
    "step": 6,
    "reasoning": "Scroll to see more content"
})
```

### mano_open_app
Open application by name (macOS Spotlight matching).

```python
result = await context.call_tool("mano_open_app", {
    "app_name": "Google Chrome",
    "task": "My Task",
    "step": 1,
    "reasoning": "Open Chrome browser"
})
```

### mano_open_url
Open URL in default browser.

```python
result = await context.call_tool("mano_open_url", {
    "url": "https://example.com",
    "task": "My Task",
    "step": 1,
    "reasoning": "Navigate to website"
})
```

## Common Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | Yes | Task description shown in GUI |
| `step` | integer | No | Step number (default: 1) |
| `reasoning` | string | No | Hermes reasoning for this action |

## Coordinate System

All coordinates are **normalized to 1280x720 resolution**:
- `(0, 0)` = top-left corner
- `(1280, 720)` = bottom-right corner
- The code automatically scales to actual screen resolution

## Project Location

```
tools/mano_cua/
├── direct_cli.py           # CLI entry point
├── runtime.py              # Python API (ManoRuntimeController)
├── requirements.txt         # Dependencies
└── visual/
    ├── model/              # Data models
    ├── view_model/         # ViewModels
    ├── view/               # TaskOverlayView GUI
    ├── computer/           # Action executors
    └── config/            # Configuration

tools/mano_cua_tool.py      # Hermes tool registration
```

## Dependencies

All dependencies must be installed in the mano_cua venv:

```bash
cd tools/mano_cua
python3.14 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Troubleshooting

- **Tools not found**: Ensure `tools/mano_cua_tool.py` is in the tools directory
- **GUI not appearing**: Make sure you're running on macOS with a display server
- **Coordinates wrong**: Remember all coordinates are normalized to 1280x720

## Update Log

- 2026-04-25: Created Hermes tool registration format
- 2026-04-25: Registered 11 tools under `computer` toolset
- 2026-04-25: Removed TaskModel/TaskViewModel API code, keeping local-only operation