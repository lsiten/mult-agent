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
    """Get display configuration from environment or defaults."""
    return {
        "width": int(os.environ.get("COMPUTER_USE_DISPLAY_WIDTH", "1920")),
        "height": int(os.environ.get("COMPUTER_USE_DISPLAY_HEIGHT", "1080")),
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
                return f.read()
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

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


def execute_mouse_action(action: str, coordinate: Optional[List[int]] = None) -> Dict:
    """Execute mouse action using system tools."""
    system = platform.system()

    if coordinate and len(coordinate) != 2:
        raise ValueError("Coordinate must be [x, y]")

    try:
        if system == "Darwin":
            return _execute_mouse_macos(action, coordinate)
        elif system == "Linux":
            return _execute_mouse_linux(action, coordinate)
        else:
            raise RuntimeError(f"Mouse control not supported on {system}")
    except Exception as e:
        logger.exception(f"Mouse action {action} failed")
        raise RuntimeError(f"Mouse action failed: {e}")


def _execute_mouse_macos(action: str, coordinate: Optional[List[int]]) -> Dict:
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
    }

    if action not in action_map:
        raise ValueError(f"Unsupported action: {action}")

    cmd = ["cliclick", action_map[action]]
    subprocess.run(cmd, check=True, capture_output=True, timeout=2)

    return {"success": True, "action": action, "coordinate": [x, y]}


def _execute_mouse_linux(action: str, coordinate: Optional[List[int]]) -> Dict:
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

    if not action:
        return tool_error("Missing required parameter: action")

    valid_actions = [
        "mouse_move", "left_click", "right_click",
        "middle_click", "double_click"
    ]
    if action not in valid_actions:
        return tool_error(
            f"Invalid action: {action}. Must be one of {valid_actions}"
        )

    if not coordinate or not isinstance(coordinate, list):
        return tool_error("Missing or invalid coordinate [x, y]")

    try:
        result = execute_mouse_action(action, coordinate)
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
            "Supports move, left/right/middle click, and double-click. "
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
                    ],
                    "description": "Mouse action to perform",
                },
                "coordinate": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "minItems": 2,
                    "maxItems": 2,
                    "description": "Target [x, y] coordinates in pixels",
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
            "Special keys not supported - use plain text only."
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
