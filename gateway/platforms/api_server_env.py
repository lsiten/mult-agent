"""
Environment variables API handlers for Gateway Dashboard.
"""

import hmac
import logging
import os
import time
from typing import Any, Dict, List
from aiohttp import web

logger = logging.getLogger(__name__)


class EnvAPIHandlers:
    """Environment variables management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token
        self._reveal_timestamps: List[float] = []
        self._REVEAL_MAX_PER_WINDOW = 5
        self._REVEAL_WINDOW_SECONDS = 30

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_env(self, request: web.Request) -> web.Response:
        """GET /api/env - Return environment variables with metadata.

        Returns dict mapping env var name to:
        {
            "is_set": bool,
            "redacted_value": str | null,
            "description": str,
            "url": str | null,
            "category": str,
            "is_password": bool,
            "tools": [str],
            "advanced": bool
        }
        """
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import load_env, OPTIONAL_ENV_VARS, redact_key

            env_vars = load_env()
            result = {}

            # Return all known env vars with metadata (even if not set)
            for key, metadata in OPTIONAL_ENV_VARS.items():
                value = env_vars.get(key)
                result[key] = {
                    "is_set": bool(value),
                    "redacted_value": redact_key(value) if value else None,
                    "description": metadata.get("description", ""),
                    "url": metadata.get("url"),
                    "category": metadata.get("category", "other"),
                    "is_password": metadata.get("password", False),
                    "tools": metadata.get("tools", []),
                    "advanced": metadata.get("advanced", False),
                }

            # Also include EXTRA keys that are set (provider keys, etc.)
            # These don't have full metadata but should be visible
            _EXTRA_KEY_DESCRIPTIONS = {
                "ANTHROPIC_API_KEY": "Anthropic API key (configured via providers)",
                "ANTHROPIC_TOKEN": "Legacy Anthropic token (no longer used)",
                "OPENAI_API_KEY": "OpenAI API key (configured via providers)",
                "OPENAI_BASE_URL": "OpenAI base URL override",
            }

            for key in env_vars.keys():
                if key not in result and key not in OPTIONAL_ENV_VARS:
                    # This is an extra key (provider keys, platform keys, etc.)
                    value = env_vars[key]
                    result[key] = {
                        "is_set": bool(value),
                        "redacted_value": redact_key(value) if value else None,
                        "description": _EXTRA_KEY_DESCRIPTIONS.get(key, f"Environment variable: {key}"),
                        "url": None,
                        "category": "provider" if "API_KEY" in key or "TOKEN" in key else "other",
                        "is_password": True if ("KEY" in key or "TOKEN" in key or "SECRET" in key) else False,
                        "tools": [],
                        "advanced": True,
                    }

            return web.json_response(result)

        except Exception as e:
            logger.error(f"Failed to load env vars: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_set_env(self, request: web.Request) -> web.Response:
        """PUT /api/env - Set environment variable."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(
                request,
                {"key": str, "value": str},
                required=["key", "value"]
            )

            from hermes_cli.config import save_env_value
            save_env_value(data["key"], data["value"])

            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to set env var: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_env(self, request: web.Request) -> web.Response:
        """DELETE /api/env - Delete environment variable."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"key": str}, required=["key"])

            from hermes_cli.config import remove_env_value
            remove_env_value(data["key"])

            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to delete env var: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_reveal_env(self, request: web.Request) -> web.Response:
        """POST /api/env/reveal - Reveal unmasked environment variable (rate limited)."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        # Rate limiting
        now = time.time()
        self._reveal_timestamps = [
            ts for ts in self._reveal_timestamps
            if now - ts < self._REVEAL_WINDOW_SECONDS
        ]

        if len(self._reveal_timestamps) >= self._REVEAL_MAX_PER_WINDOW:
            return web.json_response(
                {"error": "Rate limit exceeded. Try again later."},
                status=429
            )

        self._reveal_timestamps.append(now)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"key": str}, required=["key"])

            from hermes_cli.config import load_env
            env_vars = load_env()

            key = data["key"]
            if key not in env_vars:
                return web.json_response(
                    {"error": f"Key '{key}' not found"},
                    status=404
                )

            return web.json_response({
                "key": key,
                "value": env_vars[key]
            })

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to reveal env var: {e}")
            return web.json_response({"error": str(e)}, status=500)
