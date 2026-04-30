"""Page Agent Extension Bridge browser backend — local Chrome via extension WebSocket.

This is the DEFAULT and ONLY supported browser backend for Hermes. It connects
to the Page Agent Chrome extension running in the user's local Chrome browser via
a WebSocket bridge running on port 18765. It inherits the user's existing
login sessions and browser state, allowing automation with already-authenticated
sites.

**Important**: This backend is ENABLED by default. No configuration needed
other than installing the extension and starting the bridge server.

Setup (required before first use):
1. Install the Page Agent Chrome extension from `packages/skills/extension-bridge/assets/`
2. Start the bridge server: `npm run bridge:server` from the page-agent project
3. Connect the extension to ws://127.0.0.1:18765 via the extension popup

If the bridge is not available when calling browser tools, a step-by-step
installation guide will be provided in the error response.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import uuid
import websockets
from typing import Any, Dict, Optional, Callable

import asyncio

from tools.registry import tool_error

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_DEFAULT_TIMEOUT = 30  # seconds per command
_DEFAULT_HOST = "127.0.0.1"
_DEFAULT_PORT = 18765


def get_bridge_url() -> str:
    """Return the WebSocket URL for the extension bridge."""
    host = os.getenv("EXTENSION_BRIDGE_HOST", _DEFAULT_HOST)
    port = int(os.getenv("EXTENSION_BRIDGE_PORT", _DEFAULT_PORT))
    return f"ws://{host}:{port}"


def is_extension_bridge_mode() -> bool:
    """True when Extension Bridge backend is enabled.

    Extension Bridge is ENABLED by default. It is only disabled when
    EXTENSION_BRIDGE_ENABLED is explicitly set to "false".
    """
    if os.getenv("BROWSER_CDP_URL", "").strip():
        return False  # CDP override takes priority
    # Enabled by default, only disable if explicitly set to "false"
    return os.getenv("EXTENSION_BRIDGE_ENABLED", "true").lower() != "false"


def check_extension_bridge_available() -> bool:
    """Verify the extension bridge server is reachable."""
    import socket
    host = os.getenv("EXTENSION_BRIDGE_HOST", _DEFAULT_HOST)
    port = int(os.getenv("EXTENSION_BRIDGE_PORT", _DEFAULT_PORT))
    try:
        with socket.create_connection((host, port), timeout=5):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------
# Maps task_id -> {"tab_id": int | None, "command_id_counter": int}
_sessions: Dict[str, Dict[str, Any]] = {}
_sessions_lock = threading.Lock()


def _get_session(task_id: Optional[str]) -> Dict[str, Any]:
    """Get or create a session for the given task."""
    task_id = task_id or "default"
    with _sessions_lock:
        if task_id in _sessions:
            return _sessions[task_id]
        session = {
            "tab_id": None,
            "command_id_counter": 0,
        }
        _sessions[task_id] = session
        return session


def _drop_session(task_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Remove and return session info."""
    task_id = task_id or "default"
    with _sessions_lock:
        return _sessions.pop(task_id, None)


# ---------------------------------------------------------------------------
# WebSocket communication
# ---------------------------------------------------------------------------

class BridgeConnection:
    """Manages the WebSocket connection to the extension bridge."""

    def __init__(self):
        self._lock = asyncio.Lock()
        self._websocket = None
        self._pending_commands: Dict[str, asyncio.Future] = {}

    async def connect(self) -> bool:
        """Connect to the bridge server."""
        try:
            self._websocket = await websockets.connect(get_bridge_url())
            # Start listener in background
            asyncio.create_task(self._listen())
            return True
        except Exception as e:
            logger.error("Failed to connect to extension bridge: %s", e)
            return False

    async def _listen(self):
        """Listen for incoming messages from the bridge."""
        if not self._websocket:
            return
        try:
            async for message in self._websocket:
                try:
                    data = json.loads(message)
                    cmd_id = data.get("id")
                    if cmd_id and cmd_id in self._pending_commands:
                        future = self._pending_commands.pop(cmd_id)
                        if not future.done():
                            future.set_result(data)
                except Exception as e:
                    logger.warning("Error processing bridge message: %s", e)
        except websockets.exceptions.ConnectionClosed:
            logger.info("Bridge connection closed")
        except Exception as e:
            logger.error("Bridge listener error: %s", e)

    async def send_command(self, action: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Send a command to the extension and wait for response."""
        if not self._websocket or self._websocket.closed:
            await self.connect()

        cmd_id = f"cmd_{uuid.uuid4().hex[:8]}"
        command = {
            "id": cmd_id,
            "action": action,
            "params": params,
        }

        future = asyncio.Future()
        self._pending_commands[cmd_id] = future

        try:
            async with self._lock:
                await self._websocket.send(json.dumps(command))

            # Wait for response with timeout
            result = await asyncio.wait_for(future, timeout=_DEFAULT_TIMEOUT)
            return result
        except asyncio.TimeoutError:
            self._pending_commands.pop(cmd_id, None)
            return {
                "id": cmd_id,
                "ok": False,
                "error": {
                    "code": "TIMEOUT",
                    "message": f"Command timed out after {_DEFAULT_TIMEOUT} seconds",
                },
            }
        except Exception as e:
            self._pending_commands.pop(cmd_id, None)
            return {
                "id": cmd_id,
                "ok": False,
                "error": {
                    "code": "CONNECTION_ERROR",
                    "message": str(e),
                },
            }


# Global connection singleton
_bridge_connection: Optional[BridgeConnection] = None
_connection_lock = threading.Lock()


def _get_bridge_connection() -> BridgeConnection:
    """Get or create the global bridge connection."""
    global _bridge_connection
    with _connection_lock:
        if _bridge_connection is None:
            _bridge_connection = BridgeConnection()
        return _bridge_connection


def _run_async(coro: Callable) -> Any:
    """Run an async coroutine from sync code."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def extension_bridge_navigate(url: str, task_id: Optional[str] = None) -> str:
    """Navigate to a URL via Extension Bridge."""
    try:
        session = _get_session(task_id)
        conn = _get_bridge_connection()

        if session["tab_id"] is None:
            # Open new tab
            result = _run_async(conn.send_command("open_new_tab", {"url": url}))
            if not result.get("ok"):
                return json.dumps({
                    "success": False,
                    "error": result.get("error", {}).get("message", "Failed to open new tab"),
                })
            # Get tab_id from result
            state_result = _run_async(conn.send_command("get_browser_state", {}))
            if state_result.get("ok") and state_result.get("data"):
                data = state_result.get("data", {})
                tabs = data.get("tabs", [])
                active_tab = data.get("active_tab")
                if active_tab and "id" in active_tab:
                    session["tab_id"] = active_tab["id"]
        else:
            # Navigate existing tab (we need to execute JS to navigate since
            # the extension protocol doesn't have a dedicated navigate command)
            escaped_url = url.replace("'", "\\'")
            result = _run_async(conn.send_command("execute_javascript", {
                "code": f"window.location.href = '{escaped_url}';"
            }))
            if not result.get("ok"):
                return json.dumps({
                    "success": False,
                    "error": result.get("error", {}).get("message", "Failed to navigate"),
                })

        # Get page title after navigation
        title_result = _run_async(conn.send_command("execute_javascript", {
            "code": "document.title;"
        }))
        title = ""
        if title_result.get("ok"):
            title = str(title_result.get("data", ""))

        # Get snapshot
        from tools.browser_tool import (
            SNAPSHOT_SUMMARIZE_THRESHOLD,
            _truncate_snapshot,
        )

        snapshot_text = ""
        element_count = 0
        try:
            # We need to get the DOM tree via JavaScript
            # The extension already provides a simplified DOM tree
            snap_result = _run_async(conn.send_command("execute_javascript", {
                "code": """
(function() {
    const elements = [];
    const walk = (node, index) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            const text = node.textContent.trim().slice(0, 100);
            const role = node.getAttribute('role') || '';
            elements.push(`[${index}] ${tag}: ${text}${role ? ` (role=${role})` : ''}`);
            let childIndex = 0;
            for (const child of node.childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    walk(child, `${index}.${childIndex++}`);
                }
            }
        }
    };
    walk(document.body, '0');
    return elements.join('\\n');
})();
                """
            }))
            if snap_result.get("ok"):
                snapshot_text = str(snap_result.get("data", ""))
                element_count = len(snapshot_text.split("\n"))

            if len(snapshot_text) > SNAPSHOT_SUMMARIZE_THRESHOLD:
                snapshot_text = _truncate_snapshot(snapshot_text)

        except Exception:
            pass  # Navigation succeeded; snapshot is a bonus

        result = {
            "success": True,
            "url": url,
            "title": title,
            "snapshot": snapshot_text,
            "element_count": element_count,
        }

        return json.dumps(result)
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_snapshot(full: bool = False, task_id: Optional[str] = None,
                               user_task: Optional[str] = None) -> str:
    """Get page snapshot via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        # Get simplified DOM tree via JavaScript
        from tools.browser_tool import (
            SNAPSHOT_SUMMARIZE_THRESHOLD,
            _extract_relevant_content,
            _truncate_snapshot,
        )

        js_code = """
(function() {
    const elements = [];
    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', '[onclick]', '[role=button]', '[role=link]'];

    const isInteractive = (el) => {
        const tag = el.tagName.toLowerCase();
        if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return true;
        if (el.hasAttribute('onclick') || el.hasAttribute('ng-click')) return true;
        const role = el.getAttribute('role');
        if (role && ['button', 'link', 'menuitem'].includes(role)) return true;
        return false;
    };

    const getText = (el) => {
        return el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 150);
    };

    const walk = (node, counter) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return counter;
        const tag = node.tagName.toLowerCase();
        const text = getText(node);
        const interactive = isInteractive(node);
        if (interactive || (full && text) || node.children.length <= 3) {
            const ref = counter;
            let line = `${ref}: `;
            if (interactive) line += '*';
            line += `${tag}`;
            if (text) line += ` - "${text}"`;
            const id = node.id ? `#${node.id}` : '';
            const classes = node.className ? `.${String(node.className).replace(/\\s+/g, '.')}` : '';
            if (id || classes) line += ` ${id}${classes}`;
            elements.push(line);
        }
        let childCounter = 0;
        for (const child of node.children) {
            childCounter = walk(child, `${counter}.${childCounter}`);
        }
        return counter + 1;
    };

    walk(document.body, 1);
    return elements.join('\\n');
})();
        """ if full else """
(function() {
    const elements = [];
    const walk = (node, index) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName.toLowerCase();
            const text = node.textContent.trim().slice(0, 100);
            let interactive = false;
            const role = node.getAttribute('role') || '';
            if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) interactive = true;
            if (node.hasAttribute('onclick') || role.includes('button') || role.includes('link')) interactive = true;
            if (interactive || text.length > 0) {
                elements.push(`[${index}] ${tag}: ${text}${role ? ` (${role})` : ''}`);
            }
            let childIndex = 0;
            for (const child of node.childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    walk(child, `${index}.${childIndex++}`);
                }
            }
        }
    };
    walk(document.body, 1);
    return elements.join('\\n');
})();
        """

        result = _run_async(conn.send_command("execute_javascript", {"code": js_code}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", "Failed to get snapshot"), success=False)

        snapshot = str(result.get("data", ""))
        element_count = len(snapshot.split("\n"))

        if len(snapshot) > SNAPSHOT_SUMMARIZE_THRESHOLD:
            if user_task:
                snapshot = _extract_relevant_content(snapshot, user_task)
            else:
                snapshot = _truncate_snapshot(snapshot)

        return json.dumps({
            "success": True,
            "snapshot": snapshot,
            "element_count": element_count,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_click(ref: str, task_id: Optional[str] = None) -> str:
    """Click an element by index via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        # Parse the index from ref (ref format: @e1 or 1 or 1.2)
        clean_ref = ref.lstrip("@e")
        try:
            index = int(clean_ref.split('.')[0]) - 1  # convert to 0-indexed
        except ValueError:
            index = 0  # fallback

        result = _run_async(conn.send_command("click_element", {"index": index}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", f"Failed to click {ref}"), success=False)

        return json.dumps({
            "success": True,
            "clicked": ref,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_type(ref: str, text: str, task_id: Optional[str] = None) -> str:
    """Type text into an element by index via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        # Parse the index from ref
        clean_ref = ref.lstrip("@e")
        try:
            index = int(clean_ref.split('.')[0]) - 1  # convert to 0-indexed
        except ValueError:
            index = 0

        result = _run_async(conn.send_command("input_text", {"index": index, "text": text}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", f"Failed to type into {ref}"), success=False)

        return json.dumps({
            "success": True,
            "typed": text,
            "element": ref,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_scroll(direction: str, task_id: Optional[str] = None) -> str:
    """Scroll the page via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()
        down = direction == "down"
        num_pages = 1

        result = _run_async(conn.send_command("scroll", {"down": down, "numPages": num_pages}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", f"Failed to scroll {direction}"), success=False)

        return json.dumps({
            "success": True,
            "scrolled": direction,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_back(task_id: Optional[str] = None) -> str:
    """Navigate back via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        result = _run_async(conn.send_command("execute_javascript", {
            "code": "window.history.back();"
        }))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", "Failed to go back"), success=False)

        # Get current URL
        url_result = _run_async(conn.send_command("execute_javascript", {
            "code": "window.location.href;"
        }))
        current_url = ""
        if url_result.get("ok"):
            current_url = str(url_result.get("data", ""))

        return json.dumps({
            "success": True,
            "url": current_url,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_press(key: str, task_id: Optional[str] = None) -> str:
    """Press a keyboard key via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        # Use JavaScript to dispatch keyboard event
        result = _run_async(conn.send_command("execute_javascript", {
            "code": f"""
const event = new KeyboardEvent('keypress', {{
    key: '{key.replace("'", "\\'")}',
    code: '{key.replace("'", "\\'")}',
    bubbles: true
}});
document.activeElement && document.activeElement.dispatchEvent(event);
            """
        }))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", f"Failed to press {key}"), success=False)

        return json.dumps({
            "success": True,
            "pressed": key,
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_get_images(task_id: Optional[str] = None) -> str:
    """Get images on the current page via Extension Bridge."""
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        conn = _get_bridge_connection()

        js_code = """JSON.stringify(
    [...document.images].map(img => ({
        src: img.src,
        alt: img.alt || '',
        width: img.naturalWidth,
        height: img.naturalHeight
    })).filter(img => img.src && !img.src.startsWith('data:'))
)"""
        result = _run_async(conn.send_command("execute_javascript", {"code": js_code}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", "Failed to get images"), success=False)

        raw_result = result.get("data", "[]")
        try:
            images = json.loads(raw_result) if isinstance(raw_result, str) else raw_result
        except json.JSONDecodeError:
            images = []

        return json.dumps({
            "success": True,
            "images": images,
            "count": len(images),
        })
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_vision(question: str, annotate: bool = False,
                             task_id: Optional[str] = None) -> str:
    """Take a screenshot and analyze it via Extension Bridge.

    Note: The current extension protocol doesn't support screenshots natively.
    This fallback attempts to get the page HTML and asks the vision model to
    analyze based on that, which isn't ideal but works for simple cases.
    """
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        # We can't capture screenshots via the current extension protocol.
        # For now, return an error indicating this isn't supported.
        return tool_error(
            "Screenshot/vision analysis is not currently supported by the Extension Bridge backend. "
            "Use browser_snapshot to get a text snapshot of the page instead.",
            success=False
        )
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_console(clear: bool = False, expression: Optional[str] = None,
                             task_id: Optional[str] = None) -> str:
    """Evaluate JavaScript expression via Extension Bridge.

    The extension protocol doesn't support capturing console logs, but does
    support evaluating JavaScript expressions which is the more useful feature.
    """
    try:
        session = _get_session(task_id)
        if not session["tab_id"]:
            return tool_error("No browser session. Call browser_navigate first.", success=False)

        if expression is None:
            # No expression, just return an informational note
            return json.dumps({
                "success": True,
                "console_messages": [],
                "js_errors": [],
                "total_messages": 0,
                "total_errors": 0,
                "note": "Console log capture is not available with the Extension Bridge backend. "
                       "Use the 'expression' parameter to evaluate JavaScript in the page.",
            })

        conn = _get_bridge_connection()
        result = _run_async(conn.send_command("execute_javascript", {"code": expression}))
        if not result.get("ok"):
            return tool_error(result.get("error", {}).get("message", "JavaScript evaluation failed"), success=False)

        data = result.get("data")
        parsed = data
        if isinstance(data, str):
            try:
                parsed = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                pass  # keep as string

        return json.dumps({
            "success": True,
            "result": parsed,
            "result_type": type(parsed).__name__,
        }, default=str)
    except Exception as e:
        return tool_error(str(e), success=False)


def extension_bridge_close(task_id: Optional[str] = None) -> str:
    """Close the browser session via Extension Bridge."""
    session = _drop_session(task_id)
    # We don't close the tab since it's user's browser
    # Just clean up our local state
    return json.dumps({
        "success": True,
        "closed": True,
        "note": "Local session cleaned up. The tab remains open in your browser.",
    })
