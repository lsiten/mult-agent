"""
Status API handler for Dashboard.

Provides system status information including paths, version, and configuration.
"""

import logging
import os
from pathlib import Path
from typing import Dict, Any

from aiohttp import web

from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)


class StatusAPIHandlers:
    """Handlers for status API endpoints."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> None:
        """Validate session token. Raises 401 on failure.

        In Electron mode, auth is bypassed since it's a single-user desktop app.
        """
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        if auth != expected:
            raise web.HTTPUnauthorized(text="Unauthorized")

    async def handle_get_status(self, request: web.Request) -> web.Response:
        """GET /api/status

        Get system status including paths, version, and configuration.

        Response:
            {
                "hermes_home": "/Users/.../Library/Application Support/hermes-agent-electron",
                "config_path": "~/Library/.../config.yaml",
                "env_path": "~/Library/.../.env",
                "version": "2.0.0",
                "electron_mode": true,
                "gateway_enabled": true
            }
        """
        self._check_auth(request)

        try:
            hermes_home = get_hermes_home()
            config_path = hermes_home / "config.yaml"
            env_path = hermes_home / ".env"

            # Get version info
            version = "2.0.0"  # TODO: Read from version file

            status = {
                "hermes_home": str(hermes_home),
                "config_path": str(config_path),
                "env_path": str(env_path),
                "version": version,
                "electron_mode": os.getenv("HERMES_ELECTRON_MODE") == "true",
                "gateway_enabled": True,
                "gateway_running": True,
                "gateway_state": "running",
                "gateway_platforms": {},  # TODO: Get actual platform status
                "gateway_pid": os.getpid(),
                "gateway_updated_at": None,
                "gateway_exit_reason": None,
                "gateway_health_url": None,
                "active_sessions": 0,  # TODO: Get from SessionDB
                "config_version": 14,  # TODO: Read from config
                "latest_config_version": 14,
                "release_date": "2026-04-18",
            }

            return web.json_response(status)

        except Exception as e:
            _log.exception("GET /api/status failed")
            return web.json_response({"detail": str(e)}, status=500)
