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
import tempfile
import time
from io import BytesIO
from pathlib import Path
from typing import Dict, List, Optional

from tools.mano_cua.runtime import get_runtime, normalize_coordinate
from tools.registry import registry, tool_error, tool_result

logger = logging.getLogger(__name__)


def get_display_config() -> Dict[str, int]:
    """Get display configuration from environment, auto-detect, or defaults."""
    # Check environment first
    width_env = os.environ.get("COMPUTER_USE_DISPLAY_WIDTH")
    height_env = os.environ.get("COMPUTER_USE_DISPLAY_HEIGHT")
    x_offset_env = os.environ.get("COMPUTER_USE_DISPLAY_X_OFFSET")
    y_offset_env = os.environ.get("COMPUTER_USE_DISPLAY_Y_OFFSET")
    
    if width_env and height_env:
        return {
            "width": int(width_env),
            "height": int(height_env),
            "x_offset": int(x_offset_env) if x_offset_env else 0,
            "y_offset": int(y_offset_env) if y_offset_env else 0,
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
            match = re.search(r'Resolution:\\s*(\\d+)\\s*x\\s*(\\d+)', output)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
                return {
                    "width": width, 
                    "height": height,
                    "x_offset": 0,
                    "y_offset": 0,
                }
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
            match = re.search(r'\\*(\\d+)x(\\d+)', output)
            if match:
                width = int(match.group(1))
                height = int(match.group(2))
                return {
                    "width": width, 
                    "height": height,
                    "x_offset": 0,
                    "y_offset": 0,
                }
    except Exception as e:
        logger.debug(f"Failed to auto-detect display: {e}")
    
    # Fallback to defaults
    logger.debug("Using default display resolution 1920x1080")
    return {
        "width": 1920,
        "height": 1080,
        "x_offset": 0,
        "y_offset": 0,
    }


def _check_computer_use_available() -> bool:
    """Check if Computer Use is available on this system."""
    try:
        import mss  # noqa: F401
        import pynput  # noqa: F401
    except ImportError:
        logger.debug("Computer Use unavailable: missing Mano runtime deps")
        return False

    system = platform.system()
    if system not in ["Darwin", "Linux"]:
        logger.debug(f"Computer Use unavailable: unsupported platform {system}")
        return False

    return True


def _capture_screenshot_macos() -> bytes:
    """Capture screenshot on macOS using screencapture or PIL."""
    # Try PIL ImageGrab first - better at capturing all windows including foreground
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()
    except Exception as e:
        # Fallback to screencapture if PIL fails (missing permissions)
        logger.debug(f"PIL ImageGrab failed: {e}, falling back to screencapture")
        pass
    
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        # Use -x (no sound) and -C include cursor, capture entire main screen
        subprocess.run(
            ["screencapture", "-x", "-C", tmp_path],
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
    """Capture current screen as PNG bytes through Mano runtime."""
    try:
        return get_runtime().capture_screenshot()["bytes"]
    except Exception as e:
        logger.exception("Screenshot capture failed")
        raise RuntimeError(f"Screenshot capture failed: {e}")


def execute_mouse_action(action: str, coordinate: Optional[List[int]] = None, target_coordinate: Optional[List[int]] = None) -> Dict:
    """Execute mouse action through Mano runtime."""
    if coordinate and len(coordinate) != 2:
        raise ValueError("Coordinate must be [x, y]")
    if target_coordinate and len(target_coordinate) != 2:
        raise ValueError("Target coordinate must be [x, y]")

    config = get_display_config()
    normalized_coordinate = normalize_coordinate(
        coordinate or [0, 0],
        config["width"],
        config["height"],
        config.get("x_offset", 0),
        config.get("y_offset", 0),
    )
    runtime = get_runtime()

    if action == "drag":
        normalized_target = normalize_coordinate(
            target_coordinate or [0, 0],
            config["width"],
            config["height"],
            config.get("x_offset", 0),
            config.get("y_offset", 0),
        )
        payload = {
            "name": "computer",
            "input": {
                "action": "left_click_drag",
                "start_coordinate": normalized_coordinate,
                "coordinate": normalized_target,
            },
        }
    elif action in ("scroll_up", "scroll_down"):
        payload = {
            "name": "computer",
            "input": {
                "action": "scroll",
                "scroll_direction": "up" if action == "scroll_up" else "down",
                "scroll_amount": 10,
                "coordinate": normalized_coordinate,
            },
        }
    else:
        payload = {
            "name": "computer",
            "input": {
                "action": action,
                "coordinate": normalized_coordinate,
            },
        }

    result = runtime.execute_action(payload)
    if not result.get("ok"):
        raise RuntimeError(result.get("message", f"Mouse action failed: {action}"))
    response = {
        "success": True,
        "action": action,
    }
    if action == "drag":
        response["start_coordinate"] = coordinate
        response["target_coordinate"] = target_coordinate
    else:
        response["coordinate"] = coordinate
    response["meta"] = result.get("meta", {})
    return response


def _execute_mouse_macos(action: str, coordinate: Optional[List[int]], target_coordinate: Optional[List[int]]) -> Dict:
    """Execute mouse action on macOS using cliclick."""
    try:
        subprocess.run(["which", "cliclick"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "cliclick not installed. Install: brew install cliclick"
        )
    
    # Get display offset and apply to coordinates
    config = get_display_config()
    x_offset = config.get("x_offset", 0)
    y_offset = config.get("y_offset", 0)

    x, y = coordinate if coordinate else [0, 0]
    # Apply display offset
    x += x_offset
    y += y_offset

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
        # Apply display offset to target
        tx += x_offset
        ty += y_offset
        # cliclick: d for down at start, m to move to end, u to up
        cmd = ["cliclick", f"d:{x},{y}", f"m:{tx},{ty}", f"u:{tx},{ty}"]
        subprocess.run(cmd, check=True, capture_output=True, timeout=2)
        return {"success": True, "action": action, "start_coordinate": [x, y], "target_coordinate": [tx, ty]}

    if action not in action_map:
        raise ValueError(f"Unsupported action: {action}")

    # Always move to coordinate first for consistency with Linux
    cmd = ["cliclick", f"m:{x},{y}", action_map[action]]
    subprocess.run(cmd, check=True, capture_output=True, timeout=2)

    return {"success": True, "action": action, "coordinate": [x - x_offset, y - y_offset], "actual_coordinate": [x, y]}


def _execute_mouse_linux(action: str, coordinate: Optional[List[int]], target_coordinate: Optional[List[int]]) -> Dict:
    """Execute mouse action on Linux using xdotool."""
    try:
        subprocess.run(["which", "xdotool"], check=True, capture_output=True)
    except subprocess.CalledProcessError:
        raise RuntimeError(
            "xdotool not installed. Install: sudo apt-get install xdotool"
        )

    # Get display offset and apply to coordinates
    config = get_display_config()
    x_offset = config.get("x_offset", 0)
    y_offset = config.get("y_offset", 0)

    x, y = coordinate if coordinate else [0, 0]
    # Apply display offset
    x += x_offset
    y += y_offset

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
        # Apply display offset to target
        tx += x_offset
        ty += y_offset
        # xdotool: mousedown 1, mousemove, mouseup 1
        subprocess.run(["xdotool", "mousedown", "1"], check=True)
        subprocess.run(["xdotool", "mousemove", str(tx), str(ty)], check=True)
        subprocess.run(["xdotool", "mouseup", "1"], check=True)
        return {"success": True, "action": action, "start_coordinate": [x - x_offset, y - y_offset], "target_coordinate": [tx - x_offset, ty - y_offset], "actual_start": [x, y], "actual_target": [tx, ty]}
    else:
        raise ValueError(f"Unsupported action: {action}")
    return {"success": True, "action": action, "coordinate": [x - x_offset, y - y_offset], "actual_coordinate": [x, y]}


def execute_keyboard_action(text: str) -> Dict:
    """Type text through Mano runtime."""
    result = get_runtime().execute_action(
        {
            "name": "computer",
            "input": {
                "action": "type",
                "text": text,
            },
        }
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("message", "Keyboard action failed"))
    return {"success": True, "text": text, "meta": result.get("meta", {})}


def execute_special_key(key: str, modifiers: Optional[List[str]] = None) -> Dict:
    """Execute special key press through Mano runtime."""
    modifiers = modifiers or []
    result = get_runtime().execute_action(
        {
            "name": "computer",
            "input": {
                "action": "key",
                "modifiers": modifiers,
                "mains": [key],
            },
        }
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("message", f"Special key failed: {key}"))
    return {"success": True, "key": key, "modifiers": modifiers, "meta": result.get("meta", {})}


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
    
    # cliclick doesn't support modifier-key in a single 'k:' command properly
    # Correct approach: kd: (key down) for modifiers, kp: (key press) for main key, ku: (key up) for modifiers
    cmds = []
    # Press modifiers down
    for mod in modifiers:
        mod_lower = mod.lower()
        if mod_lower in CLICLICK_MODIFIER_MAP:
            mapped_mod = CLICLICK_MODIFIER_MAP[mod_lower]
            cmds.append(f"kd:{mapped_mod}")
    # Press and release the actual key
    cmds.append(f"kp:{mapped_key}")
    # Release modifiers
    for mod in modifiers:
        mod_lower = mod.lower()
        if mod_lower in CLICLICK_MODIFIER_MAP:
            mapped_mod = CLICLICK_MODIFIER_MAP[mod_lower]
            cmds.append(f"ku:{mapped_mod}")
    
    # Execute all commands in sequence
    for cmd_arg in cmds:
        cmd = ["cliclick", cmd_arg]
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
        screenshot_dir = Path(tempfile.gettempdir()) / "hermes-computer-use"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        screenshot_path = screenshot_dir / f"screenshot-{int(time.time() * 1000)}.png"
        screenshot_path.write_bytes(png_data)

        config = get_display_config()

        return tool_result(
            success=True,
            image=b64_data,
            format="png",
            path=str(screenshot_path),
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


def execute_open_app(app_name: str) -> Dict:
    """Open a desktop application through Mano runtime."""
    result = get_runtime(task_name=f"Open {app_name}").execute_action(
        {"name": "open_app", "input": {"app_name": app_name}}
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("message", f"Failed to open app: {app_name}"))
    return {"success": True, "app_name": app_name, "meta": result.get("meta", {})}


def execute_open_url(url: str) -> Dict:
    """Open a URL through Mano runtime."""
    result = get_runtime(task_name=f"Open {url}").execute_action(
        {"name": "open_url", "input": {"url": url}}
    )
    if not result.get("ok"):
        raise RuntimeError(result.get("message", f"Failed to open URL: {url}"))
    return {"success": True, "url": url, "meta": result.get("meta", {})}


def computer_open_app_handler(args: dict, **kwargs) -> str:
    app_name = args.get("app_name")
    if not app_name or not isinstance(app_name, str):
        return tool_error("Missing required parameter: app_name")
    try:
        return tool_result(**execute_open_app(app_name))
    except Exception as e:
        logger.exception("Open app failed")
        return tool_error(f"Open app failed: {e}")


def computer_open_url_handler(args: dict, **kwargs) -> str:
    url = args.get("url")
    if not url or not isinstance(url, str):
        return tool_error("Missing required parameter: url")
    try:
        return tool_result(**execute_open_url(url))
    except Exception as e:
        logger.exception("Open URL failed")
        return tool_error(f"Open URL failed: {e}")



registry.register(
    name="computer_screenshot",
    toolset="computer-use",
    schema={
        "name": "computer_screenshot",
        "description": (
            "Capture the current desktop screen as a PNG image. "
            "Returns base64-encoded image data. Use this to see what's "
            "currently displayed on the screen before taking actions.\n\n"
            "IMPORTANT: After capturing, describe ONLY what you actually see in the image. "
            "DO NOT fill in details based on what you expect or what the user said. "
            "If the screenshot shows unexpected content (e.g., a wallpaper instead of windows), "
            "report exactly that and offer to retry the capture."
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

registry.register(
    name="computer_open_app",
    toolset="computer-use",
    schema={
        "name": "computer_open_app",
        "description": "Open a desktop application by app name using Mano's local desktop controller.",
        "parameters": {
            "type": "object",
            "properties": {
                "app_name": {
                    "type": "string",
                    "description": "Application name, for example WeChat or Safari",
                },
            },
            "required": ["app_name"],
        },
    },
    handler=computer_open_app_handler,
    check_fn=_check_computer_use_available,
    description="Open a desktop app",
)

registry.register(
    name="computer_open_url",
    toolset="computer-use",
    schema={
        "name": "computer_open_url",
        "description": "Open a URL in the system browser using Mano's local desktop controller.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Fully-qualified URL to open",
                },
            },
            "required": ["url"],
        },
    },
    handler=computer_open_url_handler,
    check_fn=_check_computer_use_available,
    description="Open a URL",
)
