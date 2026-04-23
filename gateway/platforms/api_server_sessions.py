"""
Sessions API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
from aiohttp import web

from gateway.org.runtime import request_agent_id

logger = logging.getLogger(__name__)


class SessionsAPIHandlers:
    """Session management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_sessions(self, request: web.Request) -> web.Response:
        """GET /api/sessions - List sessions with pagination."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            limit = int(request.query.get("limit", "20"))
            offset = int(request.query.get("offset", "0"))

            from hermes_state import SessionDB
            db = SessionDB()
            # Scope sessions to the active sub-agent (master when header absent).
            scope_agent_id = request_agent_id(request)
            sessions = db.list_sessions_rich(
                limit=limit,
                offset=offset,
                agent_id=scope_agent_id,
            )
            total = len(sessions)  # list_sessions_rich returns filtered list

            return web.json_response({
                "sessions": sessions,
                "total": total,
                "limit": limit,
                "offset": offset
            })

        except ValueError:
            return web.json_response(
                {"error": "Invalid limit/offset parameters"},
                status=400
            )
        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_search_sessions(self, request: web.Request) -> web.Response:
        """GET /api/sessions/search - Full-text search sessions."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            query = request.query.get("q", "").strip()
            if not query:
                return web.json_response(
                    {"error": "Missing 'q' query parameter"},
                    status=400
                )

            limit = int(request.query.get("limit", "20"))

            from hermes_state import SessionDB
            db = SessionDB()

            # Prepare FTS5 prefix query (term*)
            prefix_query = " OR ".join(f"{term}*" for term in query.split())
            matches = db.search_messages(query=prefix_query, limit=limit)

            return web.json_response({
                "query": query,
                "matches": matches,
                "count": len(matches)
            })

        except Exception as e:
            logger.error(f"Failed to search sessions: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_session(self, request: web.Request) -> web.Response:
        """GET /api/sessions/{session_id} - Get session details."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]

            from hermes_state import SessionDB
            db = SessionDB()
            session = db.get_session(session_id)

            if not session:
                return web.json_response(
                    {"error": "Session not found"},
                    status=404
                )

            return web.json_response(session)

        except Exception as e:
            logger.error(f"Failed to get session: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_messages(self, request: web.Request) -> web.Response:
        """GET /api/sessions/{session_id}/messages - Get session messages."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]

            from hermes_state import SessionDB
            db = SessionDB()
            messages = db.get_messages(session_id)

            return web.json_response({"messages": messages})

        except Exception as e:
            logger.error(f"Failed to get messages: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_update_session(self, request: web.Request) -> web.Response:
        """PUT /api/sessions/{session_id} - Update session metadata."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]
            data = await request.json()

            from hermes_state import SessionDB
            db = SessionDB()

            # Update title if provided
            if "title" in data:
                with db._lock:
                    db._conn.execute(
                        "UPDATE sessions SET title = ? WHERE id = ?",
                        (data["title"], session_id)
                    )
                    db._conn.commit()

            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to update session: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_session(self, request: web.Request) -> web.Response:
        """DELETE /api/sessions/{session_id} - Delete session."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            session_id = request.match_info["session_id"]

            from hermes_state import SessionDB
            db = SessionDB()
            db.delete_session(session_id)

            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to delete session: {e}")
            return web.json_response({"error": str(e)}, status=500)
