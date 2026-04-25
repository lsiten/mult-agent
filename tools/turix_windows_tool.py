#!/usr/bin/env python3
"""
Turix-CUA Tool Module for Hermes Agent

Cross-platform desktop automation based on TuriX-CUA source code.
Supports macOS and Windows without remote API dependencies.

Usage via Hermes tool calling:
    turix_screenshot(task="My Task", step=1, reasoning="Capture screen")
    turix_click(x=400, y=300, task="My Task", step=1, reasoning="Click button")
    turix_type(text="Hello", task="My Task", step=2, reasoning="Type text")
    turix_open_app(app_name="Chrome", task="My Task", step=3, reasoning="Open Chrome")
"""

import asyncio
import base64
import logging
import os
import platform
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

TOOLS_DIR = Path(__file__).resolve().parent
TURIX_SRC_DIR = TOOLS_DIR / "turix_windows" / "src"


def _get_cross_platform_temp_path(filename: str) -> str:
    """Get cross-platform temp file path"""
    if platform.system() == "Windows":
        return os.path.join(tempfile.gettempdir(), filename)
    return f"/tmp/{filename}"


def _get_platform_actions():
    """Get the appropriate platform-specific actions handler"""
    current_platform = platform.system()
    turix_src = TOOLS_DIR / "turix_windows" / "src"

    if current_platform == "Windows":
        import sys
        sys.path.insert(0, str(turix_src))
        from windows.actions import WindowsActions
        return WindowsActions()

    elif current_platform == "Darwin":
        import sys
        sys.path.insert(0, str(turix_src))
        from mac.actions import (
            left_click_pixel,
            right_click_pixel,
            move_to,
            drag_pixel,
            press,
            type_into,
            press_combination,
            scroll_up,
            scroll_down,
        )

        class MacOSActions:
            def left_click_pixel(self, pos):
                return left_click_pixel(pos)
            def right_click_pixel(self, pos):
                return right_click_pixel(pos)
            def move_to(self, pos):
                return move_to(pos)
            def drag_pixel(self, start, end):
                return drag_pixel(start, end)
            def press(self, key):
                return press(key)
            def type_into(self, text):
                return type_into(text)
            def press_combination(self, key1, key2, key3=None):
                return press_combination(key1, key2, key3)
            def scroll_up(self, amount):
                return scroll_up(amount)
            def scroll_down(self, amount):
                return scroll_down(amount)

        return MacOSActions()

    else:
        raise RuntimeError(f"Unsupported platform: {current_platform}")


def _get_platform_openapp():
    """Get the appropriate platform-specific openapp handler"""
    current_platform = platform.system()
    turix_src = TOOLS_DIR / "turix_windows" / "src"

    if current_platform == "Windows":
        import sys
        sys.path.insert(0, str(turix_src))
        from windows.openapp import open_application_by_name
        return open_application_by_name

    elif current_platform == "Darwin":
        import sys
        sys.path.insert(0, str(turix_src))
        from mac.openapp import open_application_by_name
        return open_application_by_name

    else:
        raise RuntimeError(f"Unsupported platform: {current_platform}")


def _run_async(coro):
    """Run async coroutine in sync context"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _scale_coordinates(x: float, y: float) -> tuple:
    """Scale normalized coordinates (0-1000) to actual screen size"""
    import pyautogui
    screen_width, screen_height = pyautogui.size()
    scaled_x = screen_width * (x / 1000)
    scaled_y = screen_height * (y / 1000)
    return scaled_x, scaled_y


def turix_screenshot(task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Capture screenshot using TuriX-CUA cross-platform"""
    logger.info(f"turix_screenshot: task={task}, step={step}")

    try:
        import mss

        screenshot_path = _get_cross_platform_temp_path("turix-screenshot.png")

        with mss.mss() as sct:
            sct.shot(output=screenshot_path)

        if os.path.exists(screenshot_path):
            with open(screenshot_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return {
                "ok": True,
                "screenshot_path": screenshot_path,
                "screenshot_base64": b64,
                "message": "Screenshot captured successfully",
            }
        return {"ok": False, "error": "Screenshot file not created"}

    except Exception as e:
        logger.error(f"turix_screenshot error: {e}")
        return {"ok": False, "error": str(e)}


def turix_click(x: float, y: float, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Left click at normalized (0-1000) coordinates. Cross-platform."""
    logger.info(f"turix_click: x={x}, y={y}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.left_click_pixel([x, y]))
        else:
            success = _run_async(actions.click(x, y, 'left'))
        return {
            "ok": success,
            "message": f"Clicked at ({x}, {y})" if success else "",
            "error": "" if success else "Click failed",
        }
    except Exception as e:
        logger.error(f"turix_click error: {e}")
        return {"ok": False, "error": str(e)}


def turix_right_click(x: float, y: float, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Right click at normalized (0-1000) coordinates. Cross-platform."""
    logger.info(f"turix_right_click: x={x}, y={y}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.right_click_pixel([x, y]))
        else:
            success = _run_async(actions.click(x, y, 'right'))
        return {
            "ok": success,
            "message": f"Right clicked at ({x}, {y})" if success else "",
            "error": "" if success else "Right click failed",
        }
    except Exception as e:
        logger.error(f"turix_right_click error: {e}")
        return {"ok": False, "error": str(e)}


def turix_double_click(x: float, y: float, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Double click at normalized (0-1000) coordinates. Cross-platform."""
    logger.info(f"turix_double_click: x={x}, y={y}, task={task}, step={step}")

    try:
        actions = _get_platform_actions()
        success = _run_async(actions.click(x, y, 'double'))
        return {
            "ok": success,
            "message": f"Double clicked at ({x}, {y})" if success else "",
            "error": "" if success else "Double click failed",
        }
    except Exception as e:
        logger.error(f"turix_double_click error: {e}")
        return {"ok": False, "error": str(e)}


def turix_move(x: float, y: float, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Move mouse to normalized (0-1000) coordinates. Cross-platform."""
    logger.info(f"turix_move: x={x}, y={y}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.move_to([x, y]))
        else:
            success = _run_async(actions.move_mouse(x, y))
        return {
            "ok": success,
            "message": f"Moved to ({x}, {y})" if success else "",
            "error": "" if success else "Move failed",
        }
    except Exception as e:
        logger.error(f"turix_move error: {e}")
        return {"ok": False, "error": str(e)}


def turix_drag(x1: float, y1: float, x2: float, y2: float, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Drag from (x1,y1) to (x2,y2) at normalized (0-1000) coordinates. Cross-platform."""
    logger.info(f"turix_drag: x1={x1}, y1={y1}, x2={x2}, y2={y2}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.drag_pixel([x1, y1], [x2, y2]))
        else:
            success = _run_async(actions.drag(x1, y1, x2, y2))
        return {
            "ok": success,
            "message": f"Dragged from ({x1},{y1}) to ({x2},{y2})" if success else "",
            "error": "" if success else "Drag failed",
        }
    except Exception as e:
        logger.error(f"turix_drag error: {e}")
        return {"ok": False, "error": str(e)}


def turix_type(text: str, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Type text using clipboard paste. Cross-platform."""
    logger.info(f"turix_type: text={text[:50]}..., task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.type_into(text))
        else:
            success = _run_async(actions.type_text(text))
        return {
            "ok": success,
            "message": f"Typed: {text[:50]}..." if success else "",
            "error": "" if success else "Type failed",
        }
    except Exception as e:
        logger.error(f"turix_type error: {e}")
        return {"ok": False, "error": str(e)}


def turix_key(key: str, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Press keyboard key. Cross-platform."""
    logger.info(f"turix_key: key={key}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()
        if current_platform == "Darwin":
            success = _run_async(actions.press(key))
        else:
            success = _run_async(actions.press_key(key))
        return {
            "ok": success,
            "message": f"Pressed key: {key}" if success else "",
            "error": "" if success else "Key press failed",
        }
    except Exception as e:
        logger.error(f"turix_key error: {e}")
        return {"ok": False, "error": str(e)}


def turix_scroll(direction: str, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Scroll screen in direction (up/down/left/right). Cross-platform."""
    logger.info(f"turix_scroll: direction={direction}, task={task}, step={step}")

    try:
        current_platform = platform.system()
        actions = _get_platform_actions()

        if current_platform == "Darwin":
            if direction.lower() not in ["up", "down"]:
                return {"ok": False, "error": f"Unsupported scroll direction on macOS: {direction}. Only 'up' and 'down' are supported."}
            
            amount = 25
            if direction.lower() == "up":
                success = _run_async(actions.scroll_up(amount))
            else:
                success = _run_async(actions.scroll_down(amount))
        else:
            direction_map = {
                "up": 100,
                "down": -100,
                "left": -100,
                "right": 100,
            }
            amount = direction_map.get(direction.lower(), 100)
            screen_width, screen_height = actions.getscreen_size()
            center_x, center_y = screen_width // 2, screen_height // 2
            success = _run_async(actions.scroll(center_x, center_y, amount))

        return {
            "ok": success,
            "message": f"Scrolled {direction}" if success else "",
            "error": "" if success else "Scroll failed",
        }
    except Exception as e:
        logger.error(f"turix_scroll error: {e}")
        return {"ok": False, "error": str(e)}


def turix_open_app(app_name: str, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Open application by name. Cross-platform."""
    logger.info(f"turix_open_app: app_name={app_name}, task={task}, step={step}")

    try:
        openapp_fn = _get_platform_openapp()
        success, message = _run_async(openapp_fn(app_name))
        return {
            "ok": success,
            "message": message if success else "",
            "error": "" if success else message,
        }
    except Exception as e:
        logger.error(f"turix_open_app error: {e}")
        return {"ok": False, "error": str(e)}


def turix_open_url(url: str, task: str = "Turix Task", step: int = 1, reasoning: str = "", **kwargs) -> Dict[str, Any]:
    """Open URL in default browser. Cross-platform."""
    logger.info(f"turix_open_url: url={url}, task={task}, step={step}")

    current_platform = platform.system()

    try:
        if current_platform == "Darwin":
            import subprocess
            subprocess.run(["open", url], check=True, capture_output=True)
        elif current_platform == "Windows":
            import subprocess
            subprocess.run(["start", "", url], shell=True, check=True, capture_output=True)
        return {
            "ok": True,
            "message": f"Opened {url}",
            "error": "",
        }
    except Exception as e:
        logger.error(f"turix_open_url error: {e}")
        return {"ok": False, "error": str(e)}


TURIX_SCREENSHOT_SCHEMA = {
    "name": "turix_screenshot",
    "description": "Capture screenshot using TuriX-CUA. Cross-platform (macOS + Windows), returns base64 encoded image.",
    "parameters": {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["task"],
    },
}

TURIX_CLICK_SCHEMA = {
    "name": "turix_click",
    "description": "Left click at normalized (0-1000) coordinates. Cross-platform (macOS + Windows).",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1000, normalized to screen)"},
            "y": {"type": "number", "description": "Y coordinate (0-1000, normalized to screen)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

TURIX_RIGHT_CLICK_SCHEMA = {
    "name": "turix_right_click",
    "description": "Right click at normalized (0-1000) coordinates. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1000, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-1000, normalized)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

TURIX_DOUBLE_CLICK_SCHEMA = {
    "name": "turix_double_click",
    "description": "Double click at normalized (0-1000) coordinates. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1000, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-1000, normalized)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

TURIX_MOVE_SCHEMA = {
    "name": "turix_move",
    "description": "Move mouse to normalized (0-1000) coordinates. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1000, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-1000, normalized)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

TURIX_DRAG_SCHEMA = {
    "name": "turix_drag",
    "description": "Drag from (x1,y1) to (x2,y2) at normalized (0-1000) coordinates. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "x1": {"type": "number", "description": "Start X coordinate (0-1000)"},
            "y1": {"type": "number", "description": "Start Y coordinate (0-1000)"},
            "x2": {"type": "number", "description": "End X coordinate (0-1000)"},
            "y2": {"type": "number", "description": "End Y coordinate (0-1000)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["x1", "y1", "x2", "y2", "task"],
    },
}

TURIX_TYPE_SCHEMA = {
    "name": "turix_type",
    "description": "Type text using clipboard paste. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "Text to type"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["text", "task"],
    },
}

TURIX_KEY_SCHEMA = {
    "name": "turix_key",
    "description": "Press keyboard key. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Key name (enter, esc, tab, up, down, left, right, etc.)"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["key", "task"],
    },
}

TURIX_SCROLL_SCHEMA = {
    "name": "turix_scroll",
    "description": "Scroll screen in direction (up/down/left/right). Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "direction": {"type": "string", "description": "Scroll direction", "enum": ["up", "down", "left", "right"]},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["direction", "task"],
    },
}

TURIX_OPEN_APP_SCHEMA = {
    "name": "turix_open_app",
    "description": "Open application by name. Cross-platform (macOS open -a, Windows Start Menu).",
    "parameters": {
        "type": "object",
        "properties": {
            "app_name": {"type": "string", "description": "Application name"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["app_name", "task"],
    },
}

TURIX_OPEN_URL_SCHEMA = {
    "name": "turix_open_url",
    "description": "Open URL in default browser. Cross-platform.",
    "parameters": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to open"},
            "task": {"type": "string", "description": "Task description for logging"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Reasoning for this action"},
        },
        "required": ["url", "task"],
    },
}


def _check_turix_requirements(**kwargs) -> tuple[bool, str]:
    current_platform = platform.system()
    if current_platform not in ["Windows", "Darwin"]:
        return False, f"Unsupported platform: {current_platform}"

    try:
        import pyautogui
        import pyperclip
        import mss
        return True, ""
    except ImportError as e:
        return False, f"Missing dependency: {e}"


try:
    from tools.registry import registry

    registry.register(
        name="turix_screenshot",
        toolset="computer",
        schema=TURIX_SCREENSHOT_SCHEMA,
        handler=turix_screenshot,
        check_fn=_check_turix_requirements,
        emoji="📸",
        max_result_size_chars=2_000_000,
    )

    registry.register(
        name="turix_click",
        toolset="computer",
        schema=TURIX_CLICK_SCHEMA,
        handler=turix_click,
        check_fn=_check_turix_requirements,
        emoji="🖱️",
    )

    registry.register(
        name="turix_right_click",
        toolset="computer",
        schema=TURIX_RIGHT_CLICK_SCHEMA,
        handler=turix_right_click,
        check_fn=_check_turix_requirements,
        emoji="🖱️",
    )

    registry.register(
        name="turix_double_click",
        toolset="computer",
        schema=TURIX_DOUBLE_CLICK_SCHEMA,
        handler=turix_double_click,
        check_fn=_check_turix_requirements,
        emoji="🖱️",
    )

    registry.register(
        name="turix_move",
        toolset="computer",
        schema=TURIX_MOVE_SCHEMA,
        handler=turix_move,
        check_fn=_check_turix_requirements,
        emoji="🖱️",
    )

    registry.register(
        name="turix_drag",
        toolset="computer",
        schema=TURIX_DRAG_SCHEMA,
        handler=turix_drag,
        check_fn=_check_turix_requirements,
        emoji="🖱️",
    )

    registry.register(
        name="turix_type",
        toolset="computer",
        schema=TURIX_TYPE_SCHEMA,
        handler=turix_type,
        check_fn=_check_turix_requirements,
        emoji="⌨️",
    )

    registry.register(
        name="turix_key",
        toolset="computer",
        schema=TURIX_KEY_SCHEMA,
        handler=turix_key,
        check_fn=_check_turix_requirements,
        emoji="⌨️",
    )

    registry.register(
        name="turix_scroll",
        toolset="computer",
        schema=TURIX_SCROLL_SCHEMA,
        handler=turix_scroll,
        check_fn=_check_turix_requirements,
        emoji="📜",
    )

    registry.register(
        name="turix_open_app",
        toolset="computer",
        schema=TURIX_OPEN_APP_SCHEMA,
        handler=turix_open_app,
        check_fn=_check_turix_requirements,
        emoji="📦",
    )

    registry.register(
        name="turix_open_url",
        toolset="computer",
        schema=TURIX_OPEN_URL_SCHEMA,
        handler=turix_open_url,
        check_fn=_check_turix_requirements,
        emoji="🌐",
    )

except ImportError:
    pass
