"""
Logs API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

logger = logging.getLogger(__name__)


class LogsAPIHandlers:
    """Logs viewing API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_logs(self, request: web.Request) -> web.Response:
        """GET /api/logs - Retrieve log entries with filters."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import get_hermes_home

            # Parse query parameters
            log_file = request.query.get("file", "agent.log")
            lines = int(request.query.get("lines", "100"))
            level_filter = request.query.get("level", "").upper()
            component_filter = request.query.get("component", "")

            log_path = get_hermes_home() / "logs" / log_file

            if not log_path.exists():
                return web.json_response({"lines": [], "file": log_file})

            # Read last N lines
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                all_lines = f.readlines()
                last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

            # Apply filters
            filtered_lines = []
            for line in last_lines:
                if level_filter and level_filter not in line:
                    continue
                if component_filter and component_filter not in line:
                    continue
                filtered_lines.append(line.rstrip())

            return web.json_response({
                "lines": filtered_lines,
                "file": log_file,
                "total_lines": len(filtered_lines)
            })

        except ValueError:
            return web.json_response(
                {"error": "Invalid 'lines' parameter"},
                status=400
            )
        except Exception as e:
            logger.error(f"Failed to get logs: {e}")
            return web.json_response({"error": str(e)}, status=500)
