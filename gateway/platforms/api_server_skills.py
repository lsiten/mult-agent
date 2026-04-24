"""
Skills API handlers for Gateway Dashboard.
"""

import hmac
import json
import logging
import os
from pathlib import Path
from typing import Optional, Dict, Any, List
from aiohttp import web

from .api_server_skills_common import (
    with_skills_dir,
    SecurityScanError,
    SKILL_REGISTRIES,
)
from .api_server_skills_registry import (
    SkillRegistryManager,
    handle_list_sources,
    handle_search_skills,
)

from .api_server_skills_installer import SkillInstallerHandlers
logger = logging.getLogger(__name__)


class SkillsAPIHandlers:
    """Skills management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token
        from hermes_constants import get_hermes_home
        cache_dir = get_hermes_home() / ".skill_cache"
        cache_db_path = cache_dir / "registry_cache.db"
        self._registry_manager = SkillRegistryManager(cache_db_path)
        self._installer = SkillInstallerHandlers(self._check_auth)


    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_list_sources(self, request: web.Request) -> web.Response:
        """GET /api/skills/sources - List available skill registry sources."""
        return await handle_list_sources(request, self._check_auth)

    async def handle_search_skills(self, request: web.Request) -> web.Response:
        """GET /api/skills/search - Search online skills."""
        return await handle_search_skills(request, self._check_auth, self._registry_manager)


    async def handle_upload_skill_zip(self, request: web.Request) -> web.Response:
        """POST /api/skills/upload - Upload skill ZIP."""
        return await self._installer.handle_upload_skill_zip(request)

    async def handle_install_skill_online(self, request: web.Request) -> web.Response:
        """POST /api/skills/install - Install skill from online registry."""
        return await self._installer.handle_install_skill_online(request)

    async def handle_get_install_status(self, request: web.Request) -> web.Response:
        """GET /api/skills/install/{task_id} - Get installation status."""
        return await self._installer.handle_get_install_status(request)

    async def handle_cancel_install(self, request: web.Request) -> web.Response:
        """POST /api/skills/install/{task_id}/cancel - Cancel installation."""
        return await self._installer.handle_cancel_install(request)

    async def handle_list_install_tasks(self, request: web.Request) -> web.Response:
        """GET /api/skills/install-tasks - List all installation tasks."""
        return await self._installer.handle_list_install_tasks(request)

    async def handle_list_skills(self, request: web.Request) -> web.Response:
        """GET /api/skills - List available skills."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import get_hermes_home
            import yaml

            from gateway.org.runtime import resolve_request_profile_home
            profile_home = resolve_request_profile_home(request)
            skills_dir = (profile_home / "skills") if profile_home else (get_hermes_home() / "skills")
            if not skills_dir.exists():
                return web.json_response([])

            skills = []

            def scan_skills_recursive(directory: Path, depth: int = 0, max_depth: int = 3):
                """Recursively scan for skills, supporting nested directory structures."""
                if depth > max_depth:
                    return

                for item_path in directory.iterdir():
                    if not item_path.is_dir() or item_path.name.startswith("."):
                        continue

                    # Check for both skill.yaml and SKILL.md formats
                    skill_yaml = item_path / "skill.yaml"
                    skill_md = item_path / "SKILL.md"

                    skill_file = None
                    if skill_yaml.exists():
                        skill_file = skill_yaml
                    elif skill_md.exists():
                        skill_file = skill_md

                    # Check if this directory contains a skill definition
                    if skill_file:
                        try:
                            description = ""
                            category = "other"

                            with open(skill_file, encoding="utf-8") as f:
                                content = f.read()

                                # Parse YAML frontmatter if present (for SKILL.md)
                                if content.startswith("---"):
                                    parts = content.split("---", 2)
                                    if len(parts) >= 3:
                                        frontmatter = yaml.safe_load(parts[1]) or {}
                                        description = frontmatter.get("description", "")
                                        # Support both direct category and metadata.category
                                        category = frontmatter.get("category") or frontmatter.get("metadata", {}).get("category", "other")
                                else:
                                    # No frontmatter, try to parse as pure YAML
                                    data = yaml.safe_load(content) or {}
                                    description = data.get("description", "")
                                    category = data.get("category", "other")

                            # Use relative path from skills dir as the skill name
                            relative_path = item_path.relative_to(skills_dir)
                            skill_name = str(relative_path).replace("\\", "/")

                            skill_info = {
                                "name": skill_name,
                                "path": str(item_path),
                                "description": description,
                                "enabled": True,  # TODO: Check actual enabled status
                                "category": category,
                            }
                            skills.append(skill_info)
                            logger.debug(f"Found skill: {skill_name} at {item_path} (format: {skill_file.name})")
                        except Exception as e:
                            logger.warning(f"Failed to parse skill definition for {item_path}: {e}")
                    else:
                        # No skill definition, recurse into subdirectories
                        scan_skills_recursive(item_path, depth + 1, max_depth)

            scan_skills_recursive(skills_dir)

            return web.json_response(skills)

        except Exception as e:
            logger.error(f"Failed to list skills: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_toggle_skill(self, request: web.Request) -> web.Response:
        """PUT /api/skills/toggle - Toggle skill enabled status."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(
                request,
                {"name": str, "enabled": bool},
                required=["name", "enabled"]
            )

            # TODO: Implement actual skill enable/disable logic
            # For now, just return success
            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to toggle skill: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_delete_skill(self, request: web.Request) -> web.Response:
        """DELETE /api/skills/{skill_name} - Delete a skill."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_constants import get_hermes_home
            import shutil
            skill_name = request.match_info.get("skill_name")
            if not skill_name:
                return web.json_response({"error": "Missing skill name"}, status=400)

            from gateway.org.runtime import resolve_request_profile_home
            profile_home = resolve_request_profile_home(request)
            skills_dir = (profile_home / "skills") if profile_home else (get_hermes_home() / "skills")
            skill_path = skills_dir / skill_name

            if not skill_path.exists():
                return web.json_response({"error": "skill_not_found"}, status=404)

            # Delete skill directory
            shutil.rmtree(skill_path)
            logger.info(f"Deleted skill: {skill_name}")

            return web.json_response({"ok": True})

        except Exception as e:
            logger.error(f"Failed to delete skill: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_open_directory(self, request: web.Request) -> web.Response:
        """POST /api/skills/open-directory - Open skill directory in file explorer."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
            path = data.get("path")

            if not path:
                return web.json_response({"error": "Missing path"}, status=400)

            import subprocess
            import platform
            from pathlib import Path

            skill_path = Path(path)
            if not skill_path.exists():
                return web.json_response({"error": "Path not found"}, status=404)

            # Open directory based on platform
            system = platform.system()
            if system == "Darwin":  # macOS
                subprocess.run(["open", str(skill_path)], check=True)
            elif system == "Windows":
                subprocess.run(["explorer", str(skill_path)], check=True)
            else:  # Linux
                subprocess.run(["xdg-open", str(skill_path)], check=True)

            return web.json_response({"success": True})

        except Exception as e:
            logger.error(f"Failed to open directory: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_update_description(self, request: web.Request) -> web.Response:
        """POST /api/skills/update-description - Update skill description."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            data = await request.json()
            skill_name = data.get("skill_name")
            description = data.get("description", "")

            if not skill_name:
                return web.json_response({"error": "Missing skill_name"}, status=400)

            from hermes_constants import get_hermes_home
            import yaml

            from gateway.org.runtime import resolve_request_profile_home
            profile_home = resolve_request_profile_home(request)
            skills_dir = (profile_home / "skills") if profile_home else (get_hermes_home() / "skills")
            skill_dir = skills_dir / skill_name
            skill_yaml_path = skill_dir / "skill.yaml"

            if not skill_yaml_path.exists():
                return web.json_response({"error": "skill.yaml not found"}, status=404)

            # Update skill.yaml
            with open(skill_yaml_path, "r", encoding="utf-8") as f:
                skill_data = yaml.safe_load(f) or {}

            skill_data["description"] = description

            with open(skill_yaml_path, "w", encoding="utf-8") as f:
                yaml.safe_dump(skill_data, f, allow_unicode=True, sort_keys=False)

            logger.info(f"Updated description for skill: {skill_name}")
            return web.json_response({"success": True})

        except Exception as e:
            logger.error(f"Failed to update description: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)
