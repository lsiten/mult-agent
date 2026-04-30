#!/usr/bin/env python3
"""
Browser Tool Module - Page Agent Extension Bridge

This module provides browser automation tools through the Page Agent Chrome
Extension via WebSocket bridge. This is the DEFAULT and ONLY supported browser backend.

Key features:
- Inherits user's login sessions and browser state
- Uses real Chrome browser with user's profile and extensions
- No separate browser instance needed
- All operations execute in the user's daily browsing environment

**Important**: The browser extension MUST be installed and connected before use.
If not installed, the tool will provide step-by-step installation instructions.

Environment Variables:
- EXTENSION_BRIDGE_ENABLED: Set to 'false' to disable (default: true)
- EXTENSION_BRIDGE_HOST: Bridge server host (default: 127.0.0.1)
- EXTENSION_BRIDGE_PORT: Bridge server port (default: 18765)

Usage:
    from tools.browser_tool import browser_navigate, browser_snapshot, browser_click

    # Navigate to a page (uses user's Chrome browser with existing login state)
    result = browser_navigate("https://example.com", task_id="task_123")

    # Get page snapshot
    snapshot = browser_snapshot(task_id="task_123")

    # Click an element
    browser_click("@e5", task_id="task_123")
"""

import json
import logging
from typing import Dict, Any, Optional

from agent.auxiliary_client import call_llm

try:
    from tools.website_policy import check_website_access
except Exception:
    check_website_access = lambda url: None  # noqa: E731

try:
    from tools.url_safety import is_safe_url as _is_safe_url
except Exception:
    _is_safe_url = lambda url: False  # noqa: E731

# Page Agent Extension Bridge - Default and ONLY supported backend
try:
    from tools.browser_extension_bridge import (
        is_extension_bridge_mode as _is_extension_bridge_mode,
        check_extension_bridge_available as _check_bridge_available,
        extension_bridge_navigate,
        extension_bridge_snapshot,
        extension_bridge_click,
        extension_bridge_type,
        extension_bridge_scroll,
        extension_bridge_back,
        extension_bridge_press,
        extension_bridge_get_images,
        extension_bridge_vision,
        extension_bridge_console,
        extension_bridge_close,
    )
except ImportError:
    _is_extension_bridge_mode = lambda: True  # Always enabled by default
    _check_bridge_available = lambda: False

logger = logging.getLogger(__name__)

# ============================================================================
# Installation & Status Check
# ============================================================================

def get_installation_status() -> Dict[str, Any]:
    """Check the installation status of the extension bridge.

    Returns a detailed status report with actionable installation instructions
    if any component is missing or not connected.
    """
    status = {
        "bridge_server_running": False,
        "ready": False,
        "installation_steps": [],
    }

    # Check if bridge server is running
    try:
        status["bridge_server_running"] = _check_bridge_available()
    except Exception:
        status["bridge_server_running"] = False

    # Determine installation steps needed
    steps = []

    if not status["bridge_server_running"]:
        steps.extend([
            {
                "step": 1,
                "title": "启动桥接服务器",
                "action": "在 page-agent 项目目录中运行以下命令：",
                "command": "npm run bridge:server",
                "verify": "看到 'WebSocket server running on ws://127.0.0.1:18765' 消息"
            },
            {
                "step": 2,
                "title": "安装 Chrome 扩展",
                "action": "1. 解压扩展压缩包\n"
                         "   扩展包位置：`skills/page-agent-extension-bridge/assets/page-agent-ext-*-chrome.zip`\n"
                         "   解压到任意目录，得到 `chrome-mv3/` 文件夹\n"
                         "\n"
                         "2. 打开 Chrome 浏览器，访问 chrome://extensions/\n"
                         "3. 启用右上角的 '开发者模式'\n"
                         "4. 点击 '加载已解压的扩展程序'\n"
                         "5. 选择刚才解压得到的 `chrome-mv3` 目录",
                "verify": "在扩展列表中看到 'Page Agent' 扩展"
            },
            {
                "step": 3,
                "title": "连接扩展到桥接服务器",
                "action": "1. 点击 Chrome 工具栏中的 Page Agent 扩展图标\n"
                         "2. 确认 Endpoint 设置为: ws://127.0.0.1:18765\n"
                         "3. 点击 'Connect' 按钮\n"
                         "4. 状态应显示为 'Connected'",
                "verify": "扩展弹出窗口显示绿色的 'Connected' 状态"
            },
        ])

    status["installation_steps"] = steps
    status["ready"] = status["bridge_server_running"]

    return status


def _get_installation_guide() -> str:
    """Generate a human-readable installation guide."""
    status = get_installation_status()

    if status["ready"]:
        return "✅ 浏览器扩展桥接已就绪"

    guide = [
        "⚠️  浏览器扩展桥接未就绪",
        "",
        "请按照以下步骤完成安装：",
        "",
    ]

    for step in status["installation_steps"]:
        guide.append(f"## 步骤 {step['step']}: {step['title']}")
        guide.append(f"")
        guide.append(f"{step['action']}")
        if "command" in step:
            guide.append(f"")
            guide.append(f"```bash")
            guide.append(f"{step['command']}")
            guide.append(f"```")
        guide.append(f"")
        guide.append(f"验证: {step.get('verify', step.get('expected', ''))}")
        guide.append(f"")

    guide.append("")
    guide.append("完成所有步骤后，重新运行浏览器命令。")
    guide.append("")
    guide.append("详细文档: skills/page-agent-extension-bridge/README.md")

    return "\n".join(guide)


def _not_ready_result(action: str) -> str:
    """Generate a JSON result indicating the bridge is not ready."""
    guide = _get_installation_guide()
    return json.dumps({
        "success": False,
        "error": f"浏览器扩展桥接未就绪。无法执行 '{action}'。",
        "installation_guide": guide,
        "help": "请按照上述安装指南完成配置后重试",
    }, ensure_ascii=False)


# ============================================================================
# Tool Schemas
# ============================================================================

BROWSER_TOOL_SCHEMAS = [
    {
        "name": "browser_navigate",
        "description": "Navigate to a URL in the user's Chrome browser. Inherits existing login sessions and browser state. Must be called before other browser tools. Returns a page snapshot with DOM elements and their indices for subsequent operations.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to navigate to (e.g., 'https://example.com')"
                }
            },
            "required": ["url"]
        }
    },
    {
        "name": "browser_snapshot",
        "description": "Get a text-based snapshot of the current page's DOM structure. Returns interactive elements with indices for browser_click and browser_type. Call this after navigation or page changes to get updated element indices.",
        "parameters": {
            "type": "object",
            "properties": {
                "full": {
                    "type": "boolean",
                    "description": "If true, returns complete page content. If false (default), returns compact view with interactive elements only.",
                    "default": False
                }
            },
            "required": []
        }
    },
    {
        "name": "browser_click",
        "description": "Click on an element identified by its index from the snapshot. Requires browser_navigate and browser_snapshot to be called first to get valid element indices.",
        "parameters": {
            "type": "object",
            "properties": {
                "ref": {
                    "type": "string",
                    "description": "The element reference from the snapshot (e.g., '@e5', '@e12')"
                }
            },
            "required": ["ref"]
        }
    },
    {
        "name": "browser_type",
        "description": "Type text into an input field identified by its index. Clears the field first, then types the new text. Requires browser_navigate and browser_snapshot to be called first.",
        "parameters": {
            "type": "object",
            "properties": {
                "ref": {
                    "type": "string",
                    "description": "The element reference from the snapshot (e.g., '@e3')"
                },
                "text": {
                    "type": "string",
                    "description": "The text to type into the field"
                }
            },
            "required": ["ref", "text"]
        }
    },
    {
        "name": "browser_scroll",
        "description": "Scroll the page in a direction. Use this to reveal more content that may be below or above the current viewport. Requires browser_navigate to be called first.",
        "parameters": {
            "type": "object",
            "properties": {
                "direction": {
                    "type": "string",
                    "enum": ["up", "down"],
                    "description": "Direction to scroll"
                }
            },
            "required": ["direction"]
        }
    },
    {
        "name": "browser_back",
        "description": "Navigate back to the previous page in browser history. Requires browser_navigate to be called first.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "browser_press",
        "description": "Press a keyboard key. Useful for submitting forms (Enter), navigating (Tab), or keyboard shortcuts. Requires browser_navigate to be called first.",
        "parameters": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')"
                }
            },
            "required": ["key"]
        }
    },
    {
        "name": "browser_get_images",
        "description": "Get a list of all images on the current page with their URLs and alt text. Useful for finding images to analyze. Requires browser_navigate to be called first.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "browser_vision",
        "description": "NOTE: Screenshot/vision analysis is not currently supported by the Extension Bridge backend. Use browser_snapshot to get a text snapshot of the page instead. This function returns an informational error message.",
        "parameters": {
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "What you want to know about the page visually."
                },
                "annotate": {
                    "type": "boolean",
                    "default": False,
                    "description": "Not supported in this backend."
                }
            },
            "required": ["question"]
        }
    },
    {
        "name": "browser_console",
        "description": "Evaluate JavaScript in the page context, like the DevTools console. Returns the result of the expression. Use this to extract data, manipulate DOM, or inspect page state. Requires browser_navigate to be called first.",
        "parameters": {
            "type": "object",
            "properties": {
                "clear": {
                    "type": "boolean",
                    "default": False,
                    "description": "Not used - only for API compatibility"
                },
                "expression": {
                    "type": "string",
                    "description": "JavaScript expression to evaluate in the page context. Example: 'document.title' or 'document.querySelectorAll(\"a\").length'"
                }
            },
            "required": []
        }
    },
]


# ============================================================================
# Browser Tool Functions
# ============================================================================

def browser_navigate(url: str, task_id: Optional[str] = None) -> str:
    """
    Navigate to a URL in the user's Chrome browser.

    Inherits the user's existing login sessions, cookies, and browser state.
    Must be called before other browser tools for the same task.

    Args:
        url: The URL to navigate to
        task_id: Task identifier for session isolation

    Returns:
        JSON string with navigation result and page snapshot
    """
    # FIRST: Check if bridge is ready - give installation guide priority
    # over security checks so user knows how to install first
    if not _check_bridge_available():
        return _not_ready_result("browser_navigate")

    # Secret exfiltration protection
    import urllib.parse
    from agent.redact import _PREFIX_RE
    url_decoded = urllib.parse.unquote(url)
    if _PREFIX_RE.search(url) or _PREFIX_RE.search(url_decoded):
        return json.dumps({
            "success": False,
            "error": "Blocked: URL contains what appears to be an API key or token. "
                     "Secrets must not be sent in URLs.",
        }, ensure_ascii=False)

    # SSRF protection - block private/internal addresses
    if not _is_safe_url(url):
        return json.dumps({
            "success": False,
            "error": "Blocked: URL targets a private or internal address",
        }, ensure_ascii=False)

    # Website policy check
    blocked = check_website_access(url)
    if blocked:
        return json.dumps({
            "success": False,
            "error": blocked["message"],
            "blocked_by_policy": {"host": blocked["host"], "rule": blocked["rule"], "source": blocked["source"]},
        }, ensure_ascii=False)

    # Route to Extension Bridge
    return extension_bridge_navigate(url, task_id)


def browser_snapshot(
    full: bool = False,
    task_id: Optional[str] = None,
    user_task: Optional[str] = None
) -> str:
    """
    Get a text-based snapshot of the current page's DOM structure.

    Args:
        full: If True, return complete snapshot. If False, return compact view.
        task_id: Task identifier for session isolation
        user_task: The user's current task (for task-aware extraction)

    Returns:
        JSON string with page snapshot
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_snapshot")

    return extension_bridge_snapshot(full, task_id, user_task)


def browser_click(ref: str, task_id: Optional[str] = None) -> str:
    """
    Click on an element.

    Args:
        ref: Element reference (e.g., "@e5")
        task_id: Task identifier for session isolation

    Returns:
        JSON string with click result
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_click")

    return extension_bridge_click(ref, task_id)


def browser_type(ref: str, text: str, task_id: Optional[str] = None) -> str:
    """
    Type text into an input field.

    Args:
        ref: Element reference (e.g., "@e3")
        text: Text to type
        task_id: Task identifier for session isolation

    Returns:
        JSON string with type result
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_type")

    return extension_bridge_type(ref, text, task_id)


def browser_scroll(direction: str, task_id: Optional[str] = None) -> str:
    """
    Scroll the page.

    Args:
        direction: "up" or "down"
        task_id: Task identifier for session isolation

    Returns:
        JSON string with scroll result
    """
    # Validate direction
    if direction not in ["up", "down"]:
        return json.dumps({
            "success": False,
            "error": f"Invalid direction '{direction}'. Use 'up' or 'down'.",
        }, ensure_ascii=False)

    if not _check_bridge_available():
        return _not_ready_result("browser_scroll")

    return extension_bridge_scroll(direction, task_id)


def browser_back(task_id: Optional[str] = None) -> str:
    """
    Navigate back in browser history.

    Args:
        task_id: Task identifier for session isolation

    Returns:
        JSON string with navigation result
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_back")

    return extension_bridge_back(task_id)


def browser_press(key: str, task_id: Optional[str] = None) -> str:
    """
    Press a keyboard key.

    Args:
        key: Key to press (e.g., "Enter", "Tab")
        task_id: Task identifier for session isolation

    Returns:
        JSON string with key press result
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_press")

    return extension_bridge_press(key, task_id)


def browser_get_images(task_id: Optional[str] = None) -> str:
    """
    Get all images on the current page.

    Args:
        task_id: Task identifier for session isolation

    Returns:
        JSON string with list of images (src and alt)
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_get_images")

    return extension_bridge_get_images(task_id)


def browser_vision(question: str, annotate: bool = False,
                   task_id: Optional[str] = None) -> str:
    """
    Vision analysis - Not supported by Extension Bridge.

    Returns an informational message indicating to use browser_snapshot instead.
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_vision")

    return extension_bridge_vision(question, annotate, task_id)


def browser_console(clear: bool = False, expression: Optional[str] = None,
                    task_id: Optional[str] = None) -> str:
    """
    Evaluate JavaScript expression via Extension Bridge.

    When expression is provided, evaluates JavaScript in the page context
    (like DevTools console) and returns the result.

    Args:
        clear: Not used (API compatibility only)
        expression: JavaScript expression to evaluate
        task_id: Task identifier for session isolation

    Returns:
        JSON string with evaluation result
    """
    if not _check_bridge_available():
        return _not_ready_result("browser_console")

    return extension_bridge_console(clear, expression, task_id)


# ============================================================================
# Cleanup Function
# ============================================================================

def cleanup_browser(task_id: Optional[str] = None) -> None:
    """
    Clean up browser session for a task.

    Called automatically when a task completes. Cleans up local session state.
    NOTE: Does NOT close user's browser tabs to avoid disrupting user experience.

    Args:
        task_id: Task identifier to clean up
    """
    if _check_bridge_available():
        try:
            extension_bridge_close(task_id)
        except Exception as e:
            logger.debug("Extension Bridge cleanup for task %s: %s", task_id, e)


def cleanup_all_browsers() -> None:
    """
    Clean up all active browser sessions.
    """
    cleanup_browser(None)


# ============================================================================
# Requirements Check
# ============================================================================

def check_browser_requirements() -> bool:
    """
    Check if browser tool requirements are met.

    Returns:
        True if Extension Bridge is available, False otherwise
    """
    return _check_bridge_available()


# ============================================================================
# Module Test
# ============================================================================

if __name__ == "__main__":
    """
    Simple test/demo when run directly
    """
    print("🌐 Browser Tool Module - Page Agent Extension Bridge")
    print("=" * 50)

    # Check status
    status = get_installation_status()
    if status["ready"]:
        print("✅ 浏览器扩展桥接已就绪")
    else:
        print("⚠️  浏览器扩展桥接未就绪")
        print()
        print(_get_installation_guide())

    print("\n📋 Available Browser Tools:")
    for schema in BROWSER_TOOL_SCHEMAS:
        print(f"  🔹 {schema['name']}: {schema['description'][:60]}...")


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
from tools.registry import registry

_BROWSER_SCHEMA_MAP = {s["name"]: s for s in BROWSER_TOOL_SCHEMAS}

registry.register(
    name="browser_navigate",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_navigate"],
    handler=lambda args, **kw: browser_navigate(url=args.get("url", ""), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="🌐",
)
registry.register(
    name="browser_snapshot",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_snapshot"],
    handler=lambda args, **kw: browser_snapshot(
        full=args.get("full", False), task_id=kw.get("task_id"), user_task=kw.get("user_task")),
    check_fn=check_browser_requirements,
    emoji="📸",
)
registry.register(
    name="browser_click",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_click"],
    handler=lambda args, **kw: browser_click(ref=args.get("ref", ""), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="👆",
)
registry.register(
    name="browser_type",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_type"],
    handler=lambda args, **kw: browser_type(ref=args.get("ref", ""), text=args.get("text", ""), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="⌨️",
)
registry.register(
    name="browser_scroll",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_scroll"],
    handler=lambda args, **kw: browser_scroll(direction=args.get("direction", "down"), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="📜",
)
registry.register(
    name="browser_back",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_back"],
    handler=lambda args, **kw: browser_back(task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="◀️",
)
registry.register(
    name="browser_press",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_press"],
    handler=lambda args, **kw: browser_press(key=args.get("key", ""), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="⌨️",
)

registry.register(
    name="browser_get_images",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_get_images"],
    handler=lambda args, **kw: browser_get_images(task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="🖼️",
)
registry.register(
    name="browser_vision",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_vision"],
    handler=lambda args, **kw: browser_vision(question=args.get("question", ""), annotate=args.get("annotate", False), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="👁️",
)
registry.register(
    name="browser_console",
    toolset="browser",
    schema=_BROWSER_SCHEMA_MAP["browser_console"],
    handler=lambda args, **kw: browser_console(clear=args.get("clear", False), expression=args.get("expression"), task_id=kw.get("task_id")),
    check_fn=check_browser_requirements,
    emoji="🖥️",
)
