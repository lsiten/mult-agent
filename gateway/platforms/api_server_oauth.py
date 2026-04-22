"""
OAuth Providers API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

logger = logging.getLogger(__name__)


class OAuthAPIHandlers:
    """OAuth providers management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_list_providers(self, request: web.Request) -> web.Response:
        """GET /api/providers/oauth - List OAuth providers."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            # TODO: Implement OAuth provider listing
            return web.json_response({"providers": []})

        except Exception as e:
            logger.error(f"Failed to list OAuth providers: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_provider(self, request: web.Request) -> web.Response:
        """DELETE /api/providers/oauth/{provider_id} - Delete OAuth provider."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            # TODO: Implement OAuth provider deletion
            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to delete OAuth provider: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_start_oauth(self, request: web.Request) -> web.Response:
        """POST /api/providers/oauth/{provider_id}/start - Start OAuth flow."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            # TODO: Implement OAuth flow initiation
            return web.json_response({"session_id": "placeholder", "status": "pending"})

        except Exception as e:
            logger.error(f"Failed to start OAuth flow: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_submit_oauth(self, request: web.Request) -> web.Response:
        """POST /api/providers/oauth/{provider_id}/submit - Submit OAuth code."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            # TODO: Implement OAuth code submission
            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to submit OAuth code: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_poll_oauth(self, request: web.Request) -> web.Response:
        """GET /api/providers/oauth/{provider_id}/poll/{session_id} - Poll OAuth status."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            provider_id = request.match_info["provider_id"]
            session_id = request.match_info["session_id"]
            # TODO: Implement OAuth polling
            return web.json_response({"status": "pending"})

        except Exception as e:
            logger.error(f"Failed to poll OAuth status: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_session(self, request: web.Request) -> web.Response:
        """DELETE /api/providers/oauth/sessions/{session_id} - Delete OAuth session."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]
            # TODO: Implement OAuth session deletion
            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to delete OAuth session: {e}")
            return web.json_response({"error": str(e)}, status=500)
