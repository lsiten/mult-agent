"""
Dashboard Plugins API handlers for Gateway Dashboard.
"""

import hmac
import json
import logging
import os
from pathlib import Path
from typing import Optional
from aiohttp import web

logger = logging.getLogger(__name__)

# Cache discovered plugins
_dashboard_plugins_cache: Optional[list] = None


class PluginsAPIHandlers:
    """Dashboard plugins management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    def _discover_dashboard_plugins(self) -> list:
        """Scan for dashboard plugins in skills directories."""
        plugins = []
        seen_names: set = set()

        from hermes_cli.config import get_hermes_home

        # Search in skills and optional-skills
        search_dirs = [
            (get_hermes_home() / "skills", "skills"),
            (get_hermes_home() / "optional-skills", "optional-skills"),
        ]

        for plugins_root, source in search_dirs:
            if not plugins_root.is_dir():
                continue

            for child in sorted(plugins_root.iterdir()):
                if not child.is_dir():
                    continue

                manifest_file = child / "dashboard" / "dashboard-plugin.json"
                if not manifest_file.exists():
                    # Try alternative name
                    manifest_file = child / "dashboard" / "manifest.json"
                    if not manifest_file.exists():
                        continue

                try:
                    data = json.loads(manifest_file.read_text(encoding="utf-8"))
                    name = data.get("name", child.name)

                    if name in seen_names:
                        continue

                    seen_names.add(name)
                    plugins.append({
                        "name": name,
                        "label": data.get("label", name),
                        "description": data.get("description", ""),
                        "icon": data.get("icon", "Puzzle"),
                        "version": data.get("version", "0.0.0"),
                        "tab": data.get("tab", {"path": f"/{name}", "position": "end"}),
                        "entry": data.get("entry", "dist/index.js"),
                        "css": data.get("css"),
                        "has_api": bool(data.get("api")),
                        "source": source,
                        "_dir": str(child / "dashboard"),
                        "_api_file": data.get("api"),
                    })

                except Exception as exc:
                    logger.warning(f"Bad dashboard plugin manifest {manifest_file}: {exc}")
                    continue

        return plugins

    def _get_dashboard_plugins(self, force_rescan: bool = False) -> list:
        """Get cached dashboard plugins."""
        global _dashboard_plugins_cache

        if _dashboard_plugins_cache is None or force_rescan:
            _dashboard_plugins_cache = self._discover_dashboard_plugins()

        return _dashboard_plugins_cache

    async def handle_get_plugins(self, request: web.Request) -> web.Response:
        """GET /api/dashboard/plugins - List dashboard plugins."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            plugins = self._get_dashboard_plugins()

            # Strip internal fields (starting with _)
            public_plugins = [
                {k: v for k, v in p.items() if not k.startswith("_")}
                for p in plugins
            ]

            return web.json_response(public_plugins)

        except Exception as e:
            logger.error(f"Failed to get plugins: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_rescan_plugins(self, request: web.Request) -> web.Response:
        """GET /api/dashboard/plugins/rescan - Force rescan plugins."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            plugins = self._get_dashboard_plugins(force_rescan=True)
            return web.json_response({"ok": True, "count": len(plugins)})

        except Exception as e:
            logger.error(f"Failed to rescan plugins: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_plugin_asset(self, request: web.Request) -> web.Response:
        """GET /dashboard-plugins/{plugin_name}/{file_path} - Serve plugin asset."""
        try:
            plugin_name = request.match_info["plugin_name"]
            file_path = request.match_info["file_path"]

            plugins = self._get_dashboard_plugins()
            plugin = next((p for p in plugins if p["name"] == plugin_name), None)

            if not plugin:
                return web.json_response(
                    {"error": "Plugin not found"},
                    status=404
                )

            base = Path(plugin["_dir"])
            target = (base / file_path).resolve()

            # Path traversal protection
            try:
                target.relative_to(base.resolve())
            except ValueError:
                return web.json_response(
                    {"error": "Path traversal blocked"},
                    status=403
                )

            if not target.exists() or not target.is_file():
                return web.json_response(
                    {"error": "File not found"},
                    status=404
                )

            # Determine content type
            suffix = target.suffix.lower()
            content_types = {
                ".js": "application/javascript",
                ".mjs": "application/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".html": "text/html",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".woff2": "font/woff2",
                ".woff": "font/woff",
            }
            media_type = content_types.get(suffix, "application/octet-stream")

            return web.FileResponse(target, headers={"Content-Type": media_type})

        except Exception as e:
            logger.error(f"Failed to serve plugin asset: {e}")
            return web.json_response({"error": str(e)}, status=500)
