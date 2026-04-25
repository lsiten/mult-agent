---
name: turix-windows
description: TuriX-CUA based cross-platform desktop automation tool. Supports macOS and Windows without remote API dependencies. Includes click highlight GUI overlay. Source code at tools/turix_windows/.
author: Hermes Agent
hermes:
  requires_toolsets: [computer]
---

# TuriX-CUA Integration (Hermes)

## Overview

TuriX-CUA source code has been integrated and localized for Hermes. This provides **cross-platform desktop automation** (macOS + Windows) without requiring any remote API calls.

**Source Code**: `tools/turix_windows/`
**Tool Module**: `tools/turix_windows_tool.py`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Hermes Agent                             │
│                   (Provides Decision Making)                      │
│                    No Remote API Required                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              tools/turix_windows_tool.py                         │
│  - Cross-platform action execution (macOS + Windows)              │
│  - No remote API dependencies                                   │
│  - Based on TuriX-CUA source code                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Desktop OS (macOS / Windows)                     │
│                                                                  │
│  macOS: Quartz/CoreGraphics (pyobjc) + click highlight overlay │
│  Windows: pyautogui + tkinter click highlight overlay          │
└─────────────────────────────────────────────────────────────────┘
```

## GUI Features

### Click Highlight Overlay

When a click action is executed, a visual highlight is shown at the clicked position:

| Platform | Implementation | Highlight Type |
|----------|---------------|----------------|
| macOS | Quartz/CoreGraphics | Red ring overlay |
| Windows | tkinter | Red circle overlay |

**Duration**: 1 second highlight display

This helps users visually track where clicks are being performed.

## Platform Support

| Feature | macOS | Windows |
|---------|-------|---------|
| Click with highlight | ✅ | ✅ |
| Right-click with highlight | ✅ | ✅ |
| Double-click with highlight | ✅ | ✅ |
| Type (clipboard paste) | ✅ | ✅ |
| Keyboard hotkeys | ✅ | ✅ |
| Scroll | ✅ | ✅ |
| Drag | ✅ | ✅ |
| Move cursor | ✅ | ✅ |
| Open app | ✅ | ✅ |
| Open URL | ✅ | ✅ |
| Screenshot | ✅ | ✅ |

## Available Actions

| Action | Description | GUI Highlight |
|--------|-------------|---------------|
| `turix_click` | Left click at (x, y) | ✅ Red ring/circle |
| `turix_right_click` | Right click at (x, y) | ✅ Red ring/circle |
| `turix_double_click` | Double click at (x, y) | ✅ Red ring/circle |
| `turix_move` | Move cursor to (x, y) | ❌ |
| `turix_drag` | Drag from (x1,y1) to (x2,y2) | ❌ |
| `turix_type` | Type text | ❌ |
| `turix_key` | Press keyboard key | ❌ |
| `turix_scroll` | Scroll direction | ❌ |
| `turix_open_app` | Open application | ❌ |
| `turix_open_url` | Open URL in browser | ❌ |
| `turix_screenshot` | Capture screen | ❌ |

## Coordinate System

All coordinates are normalized to **1000×1000** and automatically scaled to actual screen resolution:

```
(0, 0) ───────────────── (1000, 0)
  │                          │
  │      Screen Area         │
  │                          │
(0, 1000) ──────────── (1000, 1000)
```

## Usage Example

```python
# Screenshot first to see current state
screenshot = await context.call_tool("turix_screenshot", {
    "task": "Open Chrome and search",
    "step": 1,
    "reasoning": "Capture current screen"
})

# Open Chrome
await context.call_tool("turix_open_app", {
    "app_name": "Google Chrome",
    "task": "Open Chrome and search",
    "step": 2,
    "reasoning": "Open Chrome browser"
})

# Click address bar (at normalized 1000x1000 coordinates)
# A red highlight will appear at the clicked position
await context.call_tool("turix_click", {
    "x": 400, "y": 70,
    "task": "Open Chrome and search",
    "step": 3,
    "reasoning": "Click address bar"
})

# Type search query
await context.call_tool("turix_type", {
    "text": "Claude AI",
    "task": "Open Chrome and search",
    "step": 4,
    "reasoning": "Enter search query"
})

# Press Enter to search
await context.call_tool("turix_key", {
    "key": "enter",
    "task": "Open Chrome and search",
    "step": 5,
    "reasoning": "Submit search"
})
```

## No Remote API Dependencies

**This integration does NOT require:**
- ❌ OpenAI API
- ❌ Anthropic API
- ❌ Ollama
- ❌ Any external API service

**Hermes Agent provides all decision making** - this tool only handles action execution.

## Dependencies

| Package | Purpose | Platform |
|---------|---------|----------|
| `pyautogui` | Mouse/keyboard control | All |
| `pyperclip` | Clipboard operations | All |
| `Pillow` | Image processing | All |
| `numpy` | Numerical operations | All |
| `pydantic` | Data models | All |
| `pyobjc` | macOS native APIs | macOS only |
| `tkinter` | Click highlight overlay | Windows only |
| `pywin32` | Windows API | Windows only |
| `psutil` | Process management | Windows only |
| `rapidfuzz` | Fuzzy string matching | Windows only |

### macOS Installation

```bash
pip install pyobjc pyobjc-framework-Quartz pyobjc-framework-ApplicationServices
```

## Source Files

| File | Description |
|------|-------------|
| `tools/turix_windows/` | TuriX-CUA source code |
| `tools/turix_windows_tool.py` | Hermes tool integration |
| `tools/turix_windows/src/windows/actions.py` | Windows actions + click highlight |
| `tools/turix_windows/src/windows/openapp.py` | Windows app launching |
| `tools/turix_windows/src/mac/actions.py` | macOS actions + click highlight |
| `tools/turix_windows/src/mac/openapp.py` | macOS app launching |
| `tools/turix_windows/src/controller/service.py` | Cross-platform controller |

## Resources

- [TuriX-CUA GitHub](https://github.com/TurixAI/TuriX-CUA)
- [TuriX-CUA Windows Branch](https://github.com/TurixAI/TuriX-CUA/tree/multi-agent-windows)
- [Hermes mano-cua](../mano-skill/) - Alternative desktop automation implementation
