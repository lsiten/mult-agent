---
name: mano-cua
description: Use when you need to control the desktop GUI (click, type, open apps, navigate visual interfaces). This is a local-only computer control tool - no remote API calls. Use whenever the user asks you to interact with graphical applications, open files, click buttons, or perform visual automation tasks. For AI-powered desktop automation with vision models, use the turix-cua skill instead.
author: Hermes Agent
hermes:
  requires_toolsets: [computer]
---

# Mano-CUA Desktop Control

## Overview

Mano-CUA is a **local-only desktop automation tool** that provides GUI control capabilities. It acts as the "eyes and hands" for Hermes Agent.

**Architecture (local-only, no remote API):**
```
┌─────────────┐    Tool Calls    ┌──────────────────┐
│   Hermes    │ ──────────────► │  mano_cua_tool   │
│   Agent     │                 │  (CLI Executor)  │
│ (Decisions) │ ◄────────────── │                  │
└─────────────┘   Screenshot     └──────────────────┘
                                         │
                                         ▼
                                ┌──────────────────┐
                                │  TaskOverlayView │
                                │  (GUI + Actions) │
                                └──────────────────┘
```

**Key principles:**
- **Hermes makes all decisions** - analyzes screenshots, determines actions
- **Mano-CUA executes only** - no AI inference, no remote calls
- **Screenshot-driven loop** - each action followed by screenshot to verify

## Tool Usage Rule

- This skill must use **only** Mano-CUA tools: `mano_screenshot`, `mano_click`, `mano_right_click`, `mano_double_click`, `mano_move`, `mano_drag`, `mano_type`, `mano_key`, `mano_scroll`, `mano_open_app`, `mano_open_url`.
- Do **not** switch to `terminal`, `execute_code`, AppleScript, browser tools, or any other non-Mano tool to complete desktop actions while this skill is active.
- If a Mano tool fails, report the failure clearly and ask the user how to proceed instead of silently falling back to scripts or other tools.

## TuriX-CUA vs Mano-CUA

There are two desktop automation options available:

| Feature | Mano-CUA | TuriX-CUA |
|---------|----------|-----------|
| **Remote API** | ❌ None | ⚠️ Required |
| **AI Inference** | ❌ None (Hermes decisions) | ✅ Built-in |
| **Platform** | macOS, Windows | macOS, Windows, Linux |
| **Control Method** | Tool calls | Skill invocation |
| **Based on** | TuriX-CUA architecture | TuriX-CUA original |

### When to Use

- **Use Mano-CUA**: Need local control, fully offline, cost-saving
- **Use TuriX-CUA**: Need AI vision understanding, complex task automation

## Platform Support

| Feature | macOS | Windows |
|---------|-------|---------|
| Click/Type/Move | ✅ | ✅ |
| Screenshot | ✅ | ✅ |
| App Launch | ✅ | ✅ |
| URL Open | ✅ | ✅ |
| Hotkeys | ✅ | ✅ |
| GUI Overlay | ✅ | ✅ |

### Windows Notes

- **Screenshot path**: Uses `%TEMP%` instead of `/tmp/`
- **App launch**: Uses PowerShell `Start-Process`
- **Clipboard**: Uses `clip` command
- **Administrator**: Some actions may require elevation

## Workflow

### Step 1: Capture Screen

```python
result = await context.call_tool("mano_screenshot", {
    "task": "User's task description",
    "step": 1,
    "reasoning": "First, I need to see the current screen state"
})
# Returns: screenshot_base64 for vision analysis
```

### Step 2: Analyze & Plan

Use the screenshot to understand the current state and determine the next action.

### Step 3: Execute Action

```python
# Click at coordinates
result = await context.call_tool("mano_click", {
    "x": 400, "y": 300,
    "task": "User's task",
    "step": 2,
    "reasoning": "Click the submit button"
})

# Type text
result = await context.call_tool("mano_type", {
    "text": "Hello World",
    "task": "User's task",
    "step": 3,
    "reasoning": "Enter the search query"
})

# Press key
result = await context.call_tool("mano_key", {
    "key": "enter",
    "task": "User's task",
    "step": 4,
    "reasoning": "Submit the form"
})
```

### Step 4: Verify & Repeat

Capture screenshot again to verify the action succeeded, then continue as needed.

## Available Actions

### Navigation & Cursor

| Tool | Description |
|------|-------------|
| `mano_click` | Left click at (x, y) |
| `mano_right_click` | Right click at (x, y) |
| `mano_double_click` | Double click at (x, y) |
| `mano_move` | Move cursor to (x, y) without clicking |
| `mano_drag` | Drag from (x1, y1) to (x2, y2) |

### Input

| Tool | Description |
|------|-------------|
| `mano_type` | Type text (via clipboard paste) |
| `mano_key` | Press keyboard key |
| `mano_scroll` | Scroll up/down/left/right |

### Application

| Tool | Description |
|------|-------------|
| `mano_open_app` | Open application by name |
| `mano_open_url` | Open URL in browser |
| `mano_screenshot` | Capture screen |

### All Tools Accept

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `task` | string | "Mano Task" | Task description (shown in GUI) |
| `step` | integer | 1 | Step number |
| `reasoning` | string | "" | Your reasoning for this action |

## Coordinate System

**Normalized to 1280×720** - all coordinates scale automatically to your screen:

```
(0, 0) ─────────────── (1280, 0)
  │                        │
  │    Screen Area         │
  │                        │
(0, 720) ───────────── (1280, 720)
```

## Example: Open Chrome and Search

```python
# Step 1: Open Chrome
result = await context.call_tool("mano_open_app", {
    "app_name": "Google Chrome",
    "task": "Search for information",
    "step": 1,
    "reasoning": "Open Chrome browser"
})

# Step 2: Click address bar
result = await context.call_tool("mano_click", {
    "x": 435, "y": 70,
    "task": "Search for information",
    "step": 2,
    "reasoning": "Click on the address bar"
})

# Step 3: Type search
result = await context.call_tool("mano_type", {
    "text": "Claude AI",
    "task": "Search for information",
    "step": 3,
    "reasoning": "Enter search query"
})

# Step 4: Submit
result = await context.call_tool("mano_key", {
    "key": "enter",
    "task": "Search for information",
    "step": 4,
    "reasoning": "Submit the search"
})
```

## Keyboard Keys

Common keys for `mano_key`: `enter`, `esc`, `tab`, `space`, `backspace`, `up`, `down`, `left`, `right`, `cmd` (⌘), `option` (⌥), `control` (⌃), `shift` (⇧)

## Tips

1. **Always verify** - After each action, capture a screenshot to verify success
2. **Start broad** - Open apps first, then navigate within them
3. **Be specific** - "Click the red button at (320, 450)" not just "click submit"
4. **Handle errors** - If an action fails, try again or take a new screenshot to reassess
5. **Use scroll** - For long pages, scroll to see more content before acting

## Troubleshooting

| Issue | Solution |
|-------|----------|
| GUI not appearing | Ensure macOS permissions granted (Accessibility + Screen Recording) |
| Coordinates off | Remember - coordinates are normalized to 1280×720 |
| App not opening | Use exact app name as shown in Spotlight |
| Type not working | mano_type uses clipboard - paste target must be focused |

## Technical Details

### Environment Setup

Mano-CUA requires its own Python virtual environment with GUI dependencies:

```bash
# Navigate to mano_cua directory
cd tools/mano_cua

# Create virtual environment (if not exists)
python3 -m venv .venv

# Install dependencies
.venv/bin/pip install mss pynput customtkinter Pillow pyobjc-framework-Quartz
```

**Important**: The tool automatically uses `.venv/bin/python` from the mano_cua directory. Do NOT use the system Python.

### File Locations

| Component | Path |
|-----------|------|
| Tool Module | `tools/mano_cua_tool.py` |
| CLI Entry | `tools/mano_cua/direct_cli.py` |
| GUI Overlay | `tools/mano_cua/visual/view/task_overlay_view.py` |
| Action Executor | `tools/mano_cua/visual/computer/computer_action_executor.py` |
| Dependencies | `tools/mano_cua/requirements.txt` |
| Virtual Environment | `tools/mano_cua/.venv/` |

### Permissions Required (macOS)

- **Screen Recording**: Required for screenshot capture
- **Accessibility**: Required for mouse/keyboard control

Go to System Settings → Privacy & Security → Screen Recording (or Accessibility) to grant permissions to Terminal and your IDE.
