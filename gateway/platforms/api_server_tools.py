"""
Tools API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

logger = logging.getLogger(__name__)


class ToolsAPIHandlers:
    """Tools/toolsets API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_toolsets(self, request: web.Request) -> web.Response:
        """GET /api/tools/toolsets - List available toolsets."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            # Import model_tools which provides access to the tool registry
            try:
                from model_tools import get_available_toolsets
                toolsets_dict = get_available_toolsets()

                # Convert to frontend-expected format
                toolsets = []
                for name, info in toolsets_dict.items():
                    toolsets.append({
                        "name": name,
                        "label": name.replace("_", " ").title(),
                        "description": info.get("description", ""),
                        "enabled": info.get("available", False),
                        "configured": info.get("available", False),
                        "tools": info.get("tools", []),
                    })
            except Exception as e:
                logger.warning(f"Failed to get toolsets from registry: {e}")
                toolsets = []

            return web.json_response({"toolsets": toolsets})

        except Exception as e:
            logger.error(f"Failed to get toolsets: {e}")
            return web.json_response({"error": str(e)}, status=500)
