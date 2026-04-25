#!/usr/bin/env python3
"""
Mano-CUA Tool Module

Provides GUI overlay and computer control capabilities for Hermes Agent.
Each action launches a single GUI instance that auto-closes after completion.

Usage via Hermes tool calling:
    mano_click(x=400, y=300, task="My Task", step=1, reasoning="Click button")
    mano_type(text="Hello", task="My Task", step=2, reasoning="Type text")
    mano_screenshot(task="My Task", step=1, reasoning="Capture screen")

Available tools:
- mano_click: Left click at normalized (1280x720) coordinates
- mano_right_click: Right click at normalized coordinates
- mano_double_click: Double click at normalized coordinates
- mano_move: Move mouse to normalized coordinates
- mano_drag: Drag from (x1,y1) to (x2,y2)
- mano_type: Type text
- mano_key: Press keyboard key
- mano_scroll: Scroll (up/down/left/right)
- mano_open_app: Open application by name
- mano_open_url: Open URL in browser
- mano_screenshot: Capture screenshot and save to /tmp/mano-cua-screenshot.png
"""

import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

MANO_CUA_DIR = Path(__file__).parent / "mano_cua"
PYTHON_BIN = sys.executable


def _run_mano_command(args: list, timeout: int = 30) -> Dict[str, Any]:
    result = subprocess.run(
        [PYTHON_BIN, str(MANO_CUA_DIR / "direct_cli.py")] + args,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=str(MANO_CUA_DIR),
    )
    return {
        "returncode": result.returncode,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "ok": result.returncode == 0,
    }


def _build_args(
    command: str,
    task: str,
    step: int,
    reasoning: str,
    extra_args: Optional[list] = None,
) -> list:
    args = [
        "--task", task,
        "--step", str(step),
        "--reasoning", reasoning,
        command,
    ]
    if extra_args:
        args.extend(extra_args)
    return args


def mano_screenshot(task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("screenshot", task, step, reasoning),
        timeout=30,
    )
    screenshot_path = "/tmp/mano-direct-screenshot.png"
    if result["ok"] and os.path.exists(screenshot_path):
        with open(screenshot_path, "rb") as f:
            import base64
            b64 = base64.b64encode(f.read()).decode("utf-8")
        return {
            "ok": True,
            "screenshot_path": screenshot_path,
            "screenshot_base64": b64,
            "stdout": result["stdout"].strip(),
        }
    return {
        "ok": False,
        "error": result["stderr"] or "Screenshot failed",
        "stdout": result["stdout"],
    }


def mano_click(x: float, y: float, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("click", task, step, reasoning, ["--x", str(x), "--y", str(y)]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_right_click(x: float, y: float, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("right_click", task, step, reasoning, ["--x", str(x), "--y", str(y)]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_double_click(x: float, y: float, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("double_click", task, step, reasoning, ["--x", str(x), "--y", str(y)]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_move(x: float, y: float, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("move", task, step, reasoning, ["--x", str(x), "--y", str(y)]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_drag(x1: float, y1: float, x2: float, y2: float, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("drag", task, step, reasoning, ["--x1", str(x1), "--y1", str(y1), "--x2", str(x2), "--y2", str(y2)]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_type(text: str, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("type", task, step, reasoning, ["--text", text]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_key(key: str, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("key", task, step, reasoning, ["--key", key]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_scroll(direction: str, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("scroll", task, step, reasoning, ["--direction", direction]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_open_app(app_name: str, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("open_app", task, step, reasoning, ["--text", app_name]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


def mano_open_url(url: str, task: str = "Mano Task", step: int = 1, reasoning: str = "") -> Dict[str, Any]:
    result = _run_mano_command(
        _build_args("open_url", task, step, reasoning, ["--text", url]),
        timeout=30,
    )
    return {"ok": result["ok"], "stdout": result["stdout"].strip(), "stderr": result["stderr"].strip()}


MANO_SCREENSHOT_SCHEMA = {
    "name": "mano_screenshot",
    "description": "Capture screenshot using Mano-CUA GUI overlay. Saves to /tmp/mano-direct-screenshot.png and returns base64 encoded image.",
    "parameters": {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["task"],
    },
}

MANO_CLICK_SCHEMA = {
    "name": "mano_click",
    "description": "Left click at normalized (1280x720) coordinates. Coordinates are scaled to actual screen resolution.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1280, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-720, normalized)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

MANO_RIGHT_CLICK_SCHEMA = {
    "name": "mano_right_click",
    "description": "Right click at normalized (1280x720) coordinates.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1280, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-720, normalized)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

MANO_DOUBLE_CLICK_SCHEMA = {
    "name": "mano_double_click",
    "description": "Double click at normalized (1280x720) coordinates.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1280, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-720, normalized)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

MANO_MOVE_SCHEMA = {
    "name": "mano_move",
    "description": "Move mouse to normalized (1280x720) coordinates.",
    "parameters": {
        "type": "object",
        "properties": {
            "x": {"type": "number", "description": "X coordinate (0-1280, normalized)"},
            "y": {"type": "number", "description": "Y coordinate (0-720, normalized)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["x", "y", "task"],
    },
}

MANO_DRAG_SCHEMA = {
    "name": "mano_drag",
    "description": "Left click drag from (x1,y1) to (x2,y2) at normalized (1280x720) coordinates.",
    "parameters": {
        "type": "object",
        "properties": {
            "x1": {"type": "number", "description": "Start X coordinate (0-1280)"},
            "y1": {"type": "number", "description": "Start Y coordinate (0-720)"},
            "x2": {"type": "number", "description": "End X coordinate (0-1280)"},
            "y2": {"type": "number", "description": "End Y coordinate (0-720)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["x1", "y1", "x2", "y2", "task"],
    },
}

MANO_TYPE_SCHEMA = {
    "name": "mano_type",
    "description": "Type text using clipboard paste (avoids input method conflicts).",
    "parameters": {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "Text to type"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["text", "task"],
    },
}

MANO_KEY_SCHEMA = {
    "name": "mano_key",
    "description": "Press keyboard key (enter, esc, tab, up, down, etc.).",
    "parameters": {
        "type": "object",
        "properties": {
            "key": {"type": "string", "description": "Key name (enter, esc, tab, up, down, left, right, etc.)"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["key", "task"],
    },
}

MANO_SCROLL_SCHEMA = {
    "name": "mano_scroll",
    "description": "Scroll screen in direction (up/down/left/right).",
    "parameters": {
        "type": "object",
        "properties": {
            "direction": {"type": "string", "description": "Scroll direction", "enum": ["up", "down", "left", "right"]},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["direction", "task"],
    },
}

MANO_OPEN_APP_SCHEMA = {
    "name": "mano_open_app",
    "description": "Open application by name (macOS Spotlight matching).",
    "parameters": {
        "type": "object",
        "properties": {
            "app_name": {"type": "string", "description": "Application name (e.g., 'Google Chrome', 'Safari')"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["app_name", "task"],
    },
}

MANO_OPEN_URL_SCHEMA = {
    "name": "mano_open_url",
    "description": "Open URL in default browser.",
    "parameters": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to open"},
            "task": {"type": "string", "description": "Task description shown in GUI"},
            "step": {"type": "integer", "description": "Step number (1-based)", "default": 1},
            "reasoning": {"type": "string", "description": "Hermes reasoning for this action"},
        },
        "required": ["url", "task"],
    },
}


def _check_mano_cua_requirements() -> tuple[bool, str]:
    venv_python = MANO_CUA_DIR / ".venv" / "bin" / "python"
    if venv_python.exists():
        return True, ""
    return True, ""


from tools.registry import registry

registry.register(
    name="mano_screenshot",
    toolset="computer",
    schema=MANO_SCREENSHOT_SCHEMA,
    handler=mano_screenshot,
    check_fn=_check_mano_cua_requirements,
    emoji="📸",
    max_result_size_chars=2_000_000,
)

registry.register(
    name="mano_click",
    toolset="computer",
    schema=MANO_CLICK_SCHEMA,
    handler=mano_click,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)

registry.register(
    name="mano_right_click",
    toolset="computer",
    schema=MANO_RIGHT_CLICK_SCHEMA,
    handler=mano_right_click,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)

registry.register(
    name="mano_double_click",
    toolset="computer",
    schema=MANO_DOUBLE_CLICK_SCHEMA,
    handler=mano_double_click,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)

registry.register(
    name="mano_move",
    toolset="computer",
    schema=MANO_MOVE_SCHEMA,
    handler=mano_move,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)

registry.register(
    name="mano_drag",
    toolset="computer",
    schema=MANO_DRAG_SCHEMA,
    handler=mano_drag,
    check_fn=_check_mano_cua_requirements,
    emoji="🖱️",
)

registry.register(
    name="mano_type",
    toolset="computer",
    schema=MANO_TYPE_SCHEMA,
    handler=mano_type,
    check_fn=_check_mano_cua_requirements,
    emoji="⌨️",
)

registry.register(
    name="mano_key",
    toolset="computer",
    schema=MANO_KEY_SCHEMA,
    handler=mano_key,
    check_fn=_check_mano_cua_requirements,
    emoji="⌨️",
)

registry.register(
    name="mano_scroll",
    toolset="computer",
    schema=MANO_SCROLL_SCHEMA,
    handler=mano_scroll,
    check_fn=_check_mano_cua_requirements,
    emoji="📜",
)

registry.register(
    name="mano_open_app",
    toolset="computer",
    schema=MANO_OPEN_APP_SCHEMA,
    handler=mano_open_app,
    check_fn=_check_mano_cua_requirements,
    emoji="📦",
)

registry.register(
    name="mano_open_url",
    toolset="computer",
    schema=MANO_OPEN_URL_SCHEMA,
    handler=mano_open_url,
    check_fn=_check_mano_cua_requirements,
    emoji="🌐",
)