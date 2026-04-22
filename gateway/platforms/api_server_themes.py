"""
Dashboard Themes API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

logger = logging.getLogger(__name__)


class ThemesAPIHandlers:
    """Dashboard themes API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_themes(self, request: web.Request) -> web.Response:
        """GET /api/dashboard/themes - List available themes."""
        try:
            themes = [
                {"id": "default", "label": "Default"},
                {"id": "midnight", "label": "Midnight"},
                {"id": "ember", "label": "Ember"},
                {"id": "mono", "label": "Mono"},
                {"id": "cyberpunk", "label": "Cyberpunk"},
                {"id": "rose", "label": "Rose"},
            ]

            return web.json_response({"themes": themes})

        except Exception as e:
            logger.error(f"Failed to get themes: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_set_theme(self, request: web.Request) -> web.Response:
        """PUT /api/dashboard/theme - Set dashboard theme."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"theme": str}, required=["theme"])

            # Load config and update theme
            from hermes_cli.config import load_config, save_config
            config = load_config()

            if "dashboard" not in config:
                config["dashboard"] = {}

            config["dashboard"]["theme"] = data["theme"]
            save_config(config)

            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to set theme: {e}")
            return web.json_response({"error": str(e)}, status=500)
