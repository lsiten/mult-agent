---
name: Mano-CUA Direct Computer Control
description: Mano-CUA GUI automation with Hermes direct control - no remote model calls, Hermes makes all decisions, Mano-CUA provides GUI and action execution
author: Hermes Agent
---

# Mano-CUA Direct Computer Control

## Overview

This is a fork/extraction of the Mano-CUA (Mano-P) project that **removes all remote model/API inference capabilities**, keeping only:
- ✅ Complete original GUI (VLA Task Monitor floating window in top-right corner)
- ✅ Complete computer action execution capabilities (click, type, scroll, drag, open app, screenshot, etc.)
- ✅ **Hermes Agent makes all decisions** - calls CLI actions one-by-one based on screenshot analysis
- ✅ One task/step → one GUI instance, GUI auto-closes after 5 seconds (same as original Mano-CUA design)
- ✅ Exact same styling and interaction as original Mano-CUA

This matches the requirement: "don't use Mano-P's model, let Hermes control directly".

## Project Location

Full source code is at:
```
tools/mano_cua/
```

## Requirements

All dependencies are already installed in `/opt/homebrew/Cellar/mano-cua/.../libexec/venv` (from Homebrew installation). The launcher automatically activates this venv.

## Usage

### Basic Command Structure

```bash
./tools/mano_cua/mano-direct --task "Task description" --step N --reasoning "Hermes reasoning for this step" <command> [options]
```

- `--task`: Task name displayed in GUI
- `--step`: Step number (1-based)
- `--reasoning`: Hermes reasoning text displayed in GUI
- `command`: Action to execute (see below)

### Available Commands

| Command | Options | Description |
|---------|---------|-------------|
| `click` | `--x X --y Y` | Left click at normalized (1280x720) coordinates |
| `right_click` | `--x X --y Y` | Right click at normalized coordinates |
| `double_click` | `--x X --y Y` | Double click at normalized coordinates |
| `move` | `--x X --y Y` | Move mouse to normalized coordinates |
| `drag` | `--x1 X1 --y1 Y1 --x2 X2 --y2 Y2` | Left click drag from (x1,y1) to (x2,y2) |
| `type` | `--text "text"` | Type text |
| `key` | `--key enter` | Press keyboard key (enter, esc, tab, up, down, etc.) |
| `scroll` | `--direction down` | Scroll (up/down/left/right) |
| `open_app` | `--text "Google Chrome"` | Open application by name |
| `open_url` | `--text "https://example.com"` | Open URL in default browser |
| `screenshot` | (none) | Capture full screen and save to `/tmp/mano-direct-screenshot.png` |

### Coordinate System

All coordinates are **normalized to 1280x720 resolution**:
- `(0, 0)` = top-left corner
- `(1280, 720)` = bottom-right corner
- The code automatically scales to your actual screen resolution

This matches the original Mano-CUA coordinate system design.

## Typical Workflow (for Hermes Agent)

1. **Screenshot** - `./tools/mano_cua/mano-direct --task "..." --step 1 screenshot`
2. **Vision Analysis** - Analyze screenshot with vision AI, determine what to do next, get coordinates
3. **Execute Action** - Call the corresponding CLI command (click, type, etc.)
4. **Wait for completion** - GUI executes, shows step info, auto-closes after 5 seconds
5. **Repeat** - Go back to step 1 until task is complete

All decision making is done by Hermes - Mano-CUA only does GUI display and action execution. No remote API calls, no model inference.

## Example: Open Chrome and Search "mono"

```bash
# Step 1: Open Chrome
./tools/mano_cua/mano-direct --task "Open browser and search mono" --step 1 \
  --reasoning "First step: open Google Chrome browser" \
  open_app --text "Google Chrome"

# Wait for GUI to auto-close, then...

# Step 2: Click address bar (coordinates need to be determined from screenshot)
./tools/mano_cua/mano-direct --task "Open browser and search mono" --step 2 \
  --reasoning "Click on address bar to activate it" \
  click --x 435 --y 70

# Step 3: Type search term
./tools/mano_cua/mano-direct --task "Open browser and search mono" --step 3 \
  --reasoning "Input search keyword 'mono'" \
  type --text "mono"

# Step 4: Press Enter
./tools/mano_cua/mano-direct --task "Open browser and search mono" --step 4 \
  --reasoning "Submit search by pressing Enter" \
  key --key enter

# Step 5: Capture result
./tools/mano_cua/mano-direct --task "Open browser and search mono" --step 5 \
  --reasoning "Verify search result" \
  screenshot
```

## GUI Behavior (matches original Mano-CUA)

- ✅ One launch = one GUI instance (per step)
- ✅ Floating window in **top-right corner**
- ✅ Dark theme (#1e1e1e background, 92% opacity, 14px corner radius)
- ✅ Shows: Task name, Step number, Action description, Hermes reasoning
- ✅ Red **Stop** button to stop immediately
- ✅ `-` minimize button to collapse to corner
- ✅ Draggable anywhere on screen
- ✅ Title flashes when running
- ✅ **Auto-closes 5 seconds after action completes**

## Python API (Runtime Integration)

For integration within Hermes mult-agent, use the `ManoRuntimeController`:

```python
from tools.mano_cua.runtime import get_runtime

# Get or create persistent runtime (starts GUI in background thread)
runtime = get_runtime(task_name="My Task")

# Execute an action
result = runtime.execute_action({
    "action": "click",
    "x": 400,
    "y": 100
}, reasoning="Click the button")

# Capture screenshot
screenshot_result = runtime.capture_screenshot()
# Returns: {"bytes": png_bytes, "base64": base64_str, "path": screenshot_path}

# Close when done
runtime.close()
```

## Development Notes

- This extraction intentionally removes all model calling API code (`vla.py` kept but unused)
- Uses the **original** `TaskOverlayView` from Mano-CUA - styles are exactly the same
- Depends on the Homebrew-installed mano-cua venv for dependencies (mss, pynput, customtkinter, etc.)
- All actions are executed through the original `ComputerActionExecutor`
- Fixed the original bug: `root.withdraw()` but never `deiconify()` to show window
- Fixed step number not updating bug: `model.init_task` calls `update_progress(0)` which overwrites step, now we overwrite it back immediately

## Troubleshooting

- **GUI not appearing**: Make sure you're running on macOS with display, Tkinter requires a window server
- **Module not found**: Check that mano-cua is installed via Homebrew at `/opt/homebrew/Cellar/mano-cua/`
- **Coordinates wrong**: Remember all coordinates are normalized to 1280x720, not your actual screen resolution

## Credits

Original Mano-CUA/Mano-P project: https://github.com/Mininglamp-AI/Mano-P

This is just a cleaned-up extraction that removes the model inference part for direct Hermes control.

## Update Log

- 2026-04-25: Initial creation
- 2026-04-25: Refactored to match original Mano-CUA GUI style - one step = one GUI, auto-close after completion
- 2026-04-25: **Fixed GUI not showing bug** - added `root.deiconify()` in `_update_status_ui`
- 2026-04-25: **Fixed step number not updating** - Now correctly calls `model.init_task` and `update_progress`, Task/Step/Action/Reasoning all display properly
