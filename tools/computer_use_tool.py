#!/usr/bin/env python3
"""
Computer Use Tool - Desktop Automation

Provides desktop automation capabilities:
- Screen capture and analysis
- Mouse operations (move, click, drag)
- Keyboard input simulation
- Cross-application GUI control

Environment Variables:
- COMPUTER_USE_DISPLAY_WIDTH: Screen width (default: 1920)
- COMPUTER_USE_DISPLAY_HEIGHT: Screen height (default: 1080)

Dependencies:
- macOS: cliclick (brew install cliclick)
- Linux: xdotool, scrot (apt install xdotool scrot)
- Python: pillow

Security Note:
Computer Use has system-level privileges. All actions are logged.
"""

import base64
import logging
import os
import platform
import subprocess
import time
from io import BytesIO
from typing import Dict, List, Optional

from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)


def get_display_config() -> Dict[str, int]:
    """Get display configuration from environment, auto-detect, or defaults."""
    # Check environment first
    width_env = os.environ.get("COMPUTER_USE_DISPLAY_WIDTH")
    height_env = os.environ.get("COMPUTER_USE_DISPLAY_HEIGHT")
    
    if width_env and height_env:
        return {
            "width": int(width_env),
            "height": int(height_env),
        }
    
    # Try to auto-detect
    try:
        system = platform.system()
        if system == "Darwin":
            # macOS: use system_profiler to get display resolution
            result = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True,
                text=True,
                timeout=5
            )
            output = result.stdout
            # Find resolution line like "Resolution: 1920 x 1080"
            import re
            match = re.search(r'Resolution:\s*(\d+)\s*x\s*(\d+)', output)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
                return {"width": width, "height": height}
        elif system == "Linux":
            # Linux: try xrandr
            result = subprocess.run(
                ["xrandr"],
                capture_output=True,
                text=True,
                timeout=5
            )
            output = result.stdout
            import re
            # Find current resolution like "*1920x1080"
            match = re.search(r'\*(\d+)x(\d+)', output)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
                return {"width": width, "height": height}
    except Exception as e:
        logger.debug(f"Failed to auto-detect display: {e}")
    
    # Fallback to defaults
    logger.debug("Using default display resolution 1920x1080")
    return {
        "width": 1920,
        "height": 1080,
    }


def _check_computer_use_available() -> bool:
    """Check if Computer Use is available on this system."""
    try:
        import PIL.Image
    except ImportError:
        logger.debug("Computer Use unavailable: missing pillow")
        return False

    system = platform.system()
    if system not in ["Darwin", "Linux"]:
        logger.debug(f"Computer Use unavailable: unsupported platform {system}")
        return False

    return True


def _capture_screenshot_macos() -> bytes:
    """Capture screenshot on macOS using screencapture."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        subprocess.run(
            ["screencapture", "-x", tmp_path],
            check=True,
            capture_output=True,
            timeout=5
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _capture_screenshot_linux() -> bytes:
    """Capture screenshot on Linux using scrot or ImageMagick."""
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    commands = [
        ["scrot", tmp_path],
        ["import", "-window", "root", tmp_path],
    ]

    for cmd in commands:
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=5)
            with open(tmp_path, "rb") as f:
                data = f.read()
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            return data
        except (subprocess.CalledProcessError, FileNotFoundError):
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            continue

    raise RuntimeError("No screenshot tool available (tried: scrot, import)")


def _capture_screenshot_pil() -> bytes:
    """Fallback: capture screenshot using PIL."""
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()
    except ImportError:
        raise RuntimeError("PIL not available for screenshot capture")


def capture_screenshot() -> bytes:
    """Capture current screen as PNG bytes."""
    system = platform.system()

    try:
        if system == "Darwin":
            return _capture_screenshot_macos()
        elif system == "Linux":
            return _capture_screenshot_linux()
        else:
            return _capture_screenshot_pil()
    except Exception as e:
        logger.exception("Screenshot capture failed")
        raise RuntimeError(f"Screenshot capture failed: {e}")


def execute_mouse_action(action: str, coordinate: Optional[List[int]] = None, target_coordinate: Optional[List[int]] = None) -> Dict:
    """Execute mouse action using system tools."""
    system = platform.system()

    if coordinate and len(coordinate) != 2:
        raise ValueError("Coordinate must be [x, y]")
    if target_coordinate and len(target_coordinate) != 2:
        raise ValueError("Target coordinate must be [x, y]")

    try:
        if system == "Darwin":
            return _execute_mouse_macos(action, coordinate, target_coordinate)
        elif system == "Linux":
            return _execute_mouse_linux(action, coordinate, target_coordinate)
        else:
            raise RuntimeError(f"Mouse control not supported on {system}")
    except Exception as e:
        logger.exception(f"Mouse action {action} failed")
        raise RuntimeError(f"Mouse action failed: {e}")


def _execute_mouse_macos(action: str, coordinate: Optional[List[int]], target_coordinate: Optional[List[int]]) -> Dict:
    """Execute mouse action on macOS using cliclick."""
    try:
        subprocess.run(["which", "cliclick"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "cliclick not installed. Install: brew install cliclick"
        )

    x, y = coordinate if coordinate else [0, 0]

    action_map = {
        "mouse_move": f"m:{x},{y}",
        "left_click": f"c:{x},{y}",
        "right_click": f"rc:{x},{y}",
        "middle_click": f"mc:{x},{y}",
        "double_click": f"dc:{x},{y}",
        "scroll_up": f"ku:{x},{y}",
        "scroll_down": f"kd:{x},{y}",
    }

    if action == "drag":
        # Drag from starting coordinate to target coordinate
        if not target_coordinate:
            raise ValueError("drag requires target_coordinate")
        tx, ty = target_coordinate
        # cliclick: d for down at start, m to move to end, u to up
        cmd = ["cliclick", f"d:{x},{y}", f"m:{tx},{ty}", f"u:{tx},{ty}"]
        subprocess.run(cmd, check=True, capture_output=True, timeout=2)
        return {"success": True, "action": action, "start_coordinate": [x, y], "target_coordinate": [tx, ty]}

    if action not in action_map:
        raise ValueError(f"Unsupported action: {action}")

    # Always move to coordinate first for consistency with Linux
    cmd = ["cliclick", f"m:{x},{y}", action_map[action]]
    subprocess.run(cmd, check=True, capture_output=True, timeout=2)

    return {"success": True, "action": action, "coordinate": [x, y]}


def _execute_mouse_linux(action: str, coordinate: Optional[List[int]], target_coordinate: Optional[List[int]]) -> Dict:
    """Execute mouse action on Linux using xdotool."""
    try:
        subprocess.run(["which", "xdotool"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "xdotool not installed. Install: sudo apt-get install xdotool"
        )

    x, y = coordinate if coordinate else [0, 0]

    if coordinate:
        subprocess.run(["xdotool", "mousemove", str(x), str(y)], check=True)

    if action == "mouse_move":
        pass
    elif action == "left_click":
        subprocess.run(["xdotool", "click", "1"], check=True)
    elif action == "right_click":
        subprocess.run(["xdotool", "click", "3"], check=True)
    elif action == "middle_click":
        subprocess.run(["xdotool", "click", "2"], check=True)
    elif action == "double_click":
        subprocess.run(["xdotool", "click", "--repeat", "2", "1"], check=True)
    elif action == "scroll_up":
        subprocess.run(["xdotool", "click", "4"], check=True)
    elif action == "scroll_down":
        subprocess.run(["xdotool", "click", "5"], check=True)
    elif action == "drag":
        # Drag from starting coordinate to target coordinate
        if not target_coordinate:
            raise ValueError("drag requires target_coordinate")
        tx, ty = target_coordinate
        # xdotool: mousedown 1, mousemove, mouseup 1
        subprocess.run(["xdotool", "mousedown", "1"], check=True)
        subprocess.run(["xdotool", "mousemove", str(tx), str(ty)], check=True)
        subprocess.run(["xdotool", "mouseup", "1"], check=True)
        return {"success": True, "action": action, "start_coordinate": [x, y], "target_coordinate": [tx, ty]}
    else:
        raise ValueError(f"Unsupported action: {action}")
    return {"success": True, "action": action, "coordinate": [x, y]}


def execute_keyboard_action(text: str) -> Dict:
    """Type text using system keyboard simulation."""
    system = platform.system()

    try:
        if system == "Darwin":
            return _execute_keyboard_macos(text)
        elif system == "Linux":
            return _execute_keyboard_linux(text)
        else:
            raise RuntimeError(f"Keyboard control not supported on {system}")
    except Exception as e:
        logger.exception("Keyboard action failed")
        raise RuntimeError(f"Keyboard action failed: {e}")


def execute_special_key(key: str, modifiers: Optional[List[str]] = None) -> Dict:
    """Execute special key press (Enter, Escape, arrow keys, modifier combinations)."""
    system = platform.system()
    modifiers = modifiers or []
    
    try:
        if system == "Darwin":
            return _execute_special_key_macos(key, modifiers)
        elif system == "Linux":
            return _execute_special_key_linux(key, modifiers)
        else:
            raise RuntimeError(f"Special key control not supported on {system}")
    except Exception as e:
        logger.exception(f"Special key {key} failed")
        raise RuntimeError(f"Special key failed: {e}")


def _execute_keyboard_macos(text: str) -> Dict:
    """Type text on macOS using cliclick."""
    try:
        subprocess.run(["which", "cliclick"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "cliclick not installed. Install: brew install cliclick"
        )

    escaped_text = text.replace("\\", "\\\\").replace(":", "\\:")

    cmd = ["cliclick", f"t:{escaped_text}"]
    subprocess.run(cmd, check=True, capture_output=True, timeout=10)

    return {"success": True, "text": text}


def _execute_keyboard_linux(text: str) -> Dict:
    """Type text on Linux using xdotool."""
    try:
        subprocess.run(["which", "xdotool"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "xdotool not installed. Install: sudo apt-get install xdotool"
        )

    cmd = ["xdotool", "type", "--", text]
    subprocess.run(cmd, check=True, capture_output=True, timeout=10)

    return {"success": True, "text": text}


# cliclick key name mapping for common special keys
CLICLICK_KEY_MAP = {
    "enter": "return",
    "return": "return",
    "escape": "esc",
    "esc": "esc",
    "tab": "tab",
    "backspace": "bs",
    "delete": "del",
    "space": "space",
    "up": "up",
    "down": "down",
    "left": "left",
    "right": "right",
    "pageup": "pageup",
    "pagedown": "pagedown",
    "home": "home",
    "end": "end",
    "f1": "f1", "f2": "f2", "f3": "f3", "f4": "f4",
    "f5": "f5", "f6": "f6", "f7": "f7", "f8": "f8",
    "f9": "f9", "f10": "f10", "f11": "f11", "f12": "f12",
}

# cliclick modifier mapping
CLICLICK_MODIFIER_MAP = {
    "cmd": "cmd", "command": "cmd",
    "ctrl": "ctrl", "control": "ctrl",
    "alt": "alt", "option": "alt",
    "shift": "shift",
}


def _execute_special_key_macos(key: str, modifiers: List[str]) -> Dict:
    """Execute special key on macOS using cliclick."""
    try:
        subprocess.run(["which", "cliclick"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "cliclick not installed. Install: brew install cliclick"
        )

    # Normalize key name
    key_lower = key.lower()
    if key_lower not in CLICLICK_KEY_MAP:
        raise ValueError(f"Unsupported key: {key}. Supported keys: {list(CLICLICK_KEY_MAP.keys())}")
    
    mapped_key = CLICLICK_KEY_MAP[key_lower]
    
    # Build modifier chain
    modifier_parts = []
    for mod in modifiers:
        mod_lower = mod.lower()
        if mod_lower in CLICLICK_MODIFIER_MAP:
            modifier_parts.append(CLICLICK_MODIFIER_MAP[mod_lower])
    
    # cliclick format: mod-key(shift-a) or just key(return)
    if modifier_parts:
        modifiers_str = "-".join(modifier_parts)
        # Actually cliclick uses 'k' for press with modifiers: e.g. 'k:cmd-s'
        modifiers_joined = "-".join(modifier_parts)
        click_arg = f"k:{modifiers_joined}-{mapped_key}"
    else:
        click_arg = f"k:{mapped_key}"
    
    cmd = ["cliclick", click_arg]
    subprocess.run(cmd, check=True, capture_output=True, timeout=2)

    return {"success": True, "key": key, "modifiers": modifiers}


# xdotool key name mapping
XDOTOOL_KEY_MAP = {
    "enter": "Return",
    "return": "Return",
    "escape": "Escape",
    "esc": "Escape",
    "tab": "Tab",
    "backspace": "BackSpace",
    "delete": "Delete",
    "space": "space",
    "up": "Up",
    "down": "Down",
    "left": "Left",
    "right": "Right",
    "pageup": "Page_Up",
    "pagedown": "Page_Down",
    "home": "Home",
    "end": "End",
    "f1": "F1", "f2": "F2", "f3": "F3", "f4": "F4",
    "f5": "F5", "f6": "F6", "f7": "F7", "f8": "F8",
    "f9": "F9", "f10": "F10", "f11": "F11", "f12": "F12",
}

XDOTOOL_MODIFIER_MAP = {
    "cmd": "super", "command": "super",
    "ctrl": "control", "control": "control",
    "alt": "alt", "option": "alt",
    "shift": "shift",
}


def _execute_special_key_linux(key: str, modifiers: List[str]) -> Dict:
    """Execute special key on Linux using xdotool."""
    try:
        subprocess.run(["which", "xdotool"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "xdotool not installed. Install: sudo apt-get install xdotool"
        )

    # Normalize key name
    key_lower = key.lower()
    if key_lower not in XDOTOOL_KEY_MAP:
        raise ValueError(f"Unsupported key: {key}. Supported keys: {list(XDOTOOL_KEY_MAP.keys())}")
    
    mapped_key = XDOTOOL_KEY_MAP[key_lower]
    
    # Build command with modifiers
    cmd = ["xdotool"]
    for mod in modifiers:
        mod_lower = mod.lower()
        if mod_lower in XDOTOOL_MODIFIER_MAP:
            cmd.extend(["keydown", XDOTOOL_MODIFIER_MAP[mod_lower]])
    
    cmd.append("key")
    cmd.append(mapped_key)
    
    # Release modifiers in reverse order
    for mod in reversed(modifiers):
        mod_lower = mod.lower()
        if mod_lower in XDOTOOL_MODIFIER_MAP:
            cmd.extend(["keyup", XDOTOOL_MODIFIER_MAP[mod_lower]])
    
    subprocess.run(cmd, check=True, capture_output=True, timeout=2)

    return {"success": True, "key": key, "modifiers": modifiers}


def computer_screenshot_handler(args: dict, **kwargs) -> str:
    """Capture and return current screen as base64-encoded PNG."""
    try:
        png_data = capture_screenshot()
        b64_data = base64.b64encode(png_data).decode("utf-8")

        config = get_display_config()

        return tool_result(
            success=True,
            image=b64_data,
            format="png",
            width=config["width"],
            height=config["height"],
            timestamp=time.time(),
        )
    except Exception as e:
        logger.exception("Screenshot failed")
        return tool_error(f"Screenshot capture failed: {e}")


def computer_mouse_handler(args: dict, **kwargs) -> str:
    """Execute mouse action."""
    action = args.get("action")
    coordinate = args.get("coordinate")
    target_coordinate = args.get("target_coordinate")

    if not action:
        return tool_error("Missing required parameter: action")

    valid_actions = [
        "mouse_move", "left_click", "right_click",
        "middle_click", "double_click", "scroll_up", "scroll_down", "drag"
    ]
    if action not in valid_actions:
        return tool_error(
            f"Invalid action: {action}. Must be one of {valid_actions}"
        )

    if not coordinate or not isinstance(coordinate, list):
        return tool_error("Missing or invalid coordinate [x, y]")
    
    if action == "drag" and (not target_coordinate or not isinstance(target_coordinate, list)):
        return tool_error("drag requires target_coordinate [x, y]")

    try:
        result = execute_mouse_action(action, coordinate, target_coordinate)
        return tool_result(**result)
    except Exception as e:
        logger.exception(f"Mouse action {action} failed")
        return tool_error(f"Mouse action failed: {e}")


def computer_keyboard_handler(args: dict, **kwargs) -> str:
    """Type text via keyboard simulation."""
    text = args.get("text")

    if not text:
        return tool_error("Missing required parameter: text")

    if not isinstance(text, str):
        return tool_error("Parameter 'text' must be a string")

    try:
        result = execute_keyboard_action(text)
        return tool_result(**result)
    except Exception as e:
        logger.exception("Keyboard action failed")
        return tool_error(f"Keyboard action failed: {e}")


def computer_key_handler(args: dict, **kwargs) -> str:
    """Press special key or key combination."""
    key = args.get("key")
    modifiers = args.get("modifiers", [])

    if not key:
        return tool_error("Missing required parameter: key")

    if not isinstance(key, str):
        return tool_error("Parameter 'key' must be a string")

    try:
        result = execute_special_key(key, modifiers)
        return tool_result(**result)
    except Exception as e:
        logger.exception("Special key failed")
        return tool_error(f"Special key failed: {e}")



registry.register(
    name="computer_screenshot",
    toolset="computer-use",
    schema={
        "name": "computer_screenshot",
        "description": (
            "Capture the current desktop screen as a PNG image. "
            "Returns base64-encoded image data. Use this to see what's "
            "currently displayed on the screen before taking actions."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    handler=computer_screenshot_handler,
    check_fn=_check_computer_use_available,
    description="Capture desktop screenshot",
)

registry.register(
    name="computer_mouse",
    toolset="computer-use",
    schema={
        "name": "computer_mouse",
        "description": (
            "Control the mouse cursor to interact with GUI elements. "
            "Supports move, left/right/middle click, double-click, scroll, and drag. "
            "Coordinates are in pixels from top-left corner (0,0)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "mouse_move",
                        "left_click",
                        "right_click",
                        "middle_click",
                        "double_click",
                        "scroll_up",
                        "scroll_down",
                        "drag",
                    ],
                    "description": "Mouse action to perform",
                },
                "coordinate": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                    "description": "Start [x, y] coordinates in pixels",
                },
                "target_coordinate": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                    "description": "Target [x, y] coordinates for drag action (required when action=drag)",
                },
            },
            "required": ["action", "coordinate"],
        },
    },
    handler=computer_mouse_handler,
    check_fn=_check_computer_use_available,
    description="Control mouse cursor",
)

registry.register(
    name="computer_keyboard",
    toolset="computer-use",
    schema={
        "name": "computer_keyboard",
        "description": (
            "Simulate keyboard typing to input text. Use this to fill forms, "
            "type into text fields, or send keyboard input to applications. "
            "Special keys not supported here - use computer_key instead."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "Text to type",
                },
            },
            "required": ["text"],
        },
    },
    handler=computer_keyboard_handler,
    check_fn=_check_computer_use_available,
    description="Type text via keyboard",
)

registry.register(
    name="computer_key",
    toolset="computer-use",
    schema={
        "name": "computer_key",
        "description": (
            "Press a special key or keyboard shortcut with modifiers. "
            "Supports Enter, Escape, arrow keys, function keys, and combinations "
            "with Ctrl, Cmd, Alt, Shift modifiers."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Key to press: enter, escape, tab, backspace, delete, space, up, down, left, right, pageup, pagedown, home, end, f1-f12",
                },
                "modifiers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional modifier keys: cmd, ctrl, alt, shift",
                },
            },
            "required": ["key"],
        },
    },
    handler=computer_key_handler,
    check_fn=_check_computer_use_available,
    description="Press special key or keyboard shortcut",
)
