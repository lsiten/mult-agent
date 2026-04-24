"""
Skill installation handlers for Skills API.

Handles skill upload, online installation, and installation task management.
"""

import asyncio
import json
import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Dict, Any
from aiohttp import web

from .api_server_skills_common import with_skills_dir, SecurityScanError

logger = logging.getLogger(__name__)


# Installation task tracking
_install_tasks: Dict[str, Dict[str, Any]] = {}
_install_tasks_lock = asyncio.Lock()


class SkillInstallerHandlers:
    """Skill installation and task management handlers."""

    def __init__(self, check_auth_fn):
        """Initialize installer handlers.

        Args:
            check_auth_fn: Authentication check function
        """
        self._check_auth = check_auth_fn

    async def handle_upload_skill_zip(self, request: web.Request) -> web.Response:
        """POST /api/skills/upload - Upload and validate skill ZIP file."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from tools.skill_installer import AsyncTaskManager
            from tools.skills_hub import SkillBundle
            from tools.skills_guard import scan_skill
            from hermes_constants import get_hermes_home
            import tempfile
            import shutil

            # 解析 profile_home（在处理请求开始时）
            from gateway.org.runtime import resolve_request_profile_home
            profile_home = resolve_request_profile_home(request)
            target_skills_dir = (profile_home / "skills") if profile_home else (get_hermes_home() / "skills")

            # Read multipart form data
            reader = await request.multipart()

            # Extract file and optional category
            file_data = bytearray()
            category = ""

            async for field in reader:
                if field.name == "file":
                    # Read file data immediately
                    while True:
                        chunk = await field.read_chunk()
                        if not chunk:
                            break
                        file_data.extend(chunk)
                        if len(file_data) > 50 * 1024 * 1024:  # 50MB limit
                            return web.json_response({
                                "error": "file_too_large",
                                "message": "File exceeds 50MB limit"
                            }, status=413)
                elif field.name == "category":
                    category = (await field.read()).decode('utf-8').strip()
                    logger.info(f"[SkillUpload] Received category parameter: '{category}'")

            if not file_data:
                return web.json_response({"error": "Missing 'file' field"}, status=400)

            logger.info(f"[SkillUpload] Starting upload with category: '{category}', size: {len(file_data)} bytes")

            # file_data is already read above
            data = file_data

            # Save to temp file
            temp_dir = Path(tempfile.gettempdir()) / "hermes_skill_uploads"
            temp_dir.mkdir(exist_ok=True)

            import uuid
            temp_file = temp_dir / f"{uuid.uuid4()}.zip"

            try:
                temp_file.write_bytes(data)
                logger.info(f"[SkillUpload] Wrote {len(data)} bytes to {temp_file}")
                logger.info(f"[SkillUpload] File exists: {temp_file.exists()}, size: {temp_file.stat().st_size if temp_file.exists() else 'N/A'}")

                # Parse ZIP and validate
                try:
                    logger.info(f"[SkillUpload] Calling SkillBundle.from_zip({temp_file})")
                    bundle = SkillBundle.from_zip(temp_file, source="upload")
                    logger.info(f"[SkillUpload] SkillBundle created successfully: {bundle.name}")
                except ValueError as e:
                    temp_file.unlink(missing_ok=True)
                    return web.json_response({
                        "error": "invalid_zip",
                        "message": str(e)
                    }, status=400)

                # Run skills_guard scan
                skills_dir = get_hermes_home() / "skills"
                temp_extract_dir = temp_dir / f"extract_{uuid.uuid4()}"
                temp_extract_dir.mkdir()

                try:
                    # Extract bundle files to temp directory
                    for rel_path, content in bundle.files.items():
                        file_path = temp_extract_dir / rel_path
                        file_path.parent.mkdir(parents=True, exist_ok=True)

                        if isinstance(content, bytes):
                            file_path.write_bytes(content)
                        else:
                            file_path.write_text(content)

                    # Scan with skills_guard
                    scan_result = scan_skill(temp_extract_dir, source="upload")

                    if scan_result.threats_detected:
                        temp_file.unlink(missing_ok=True)
                        shutil.rmtree(temp_extract_dir, ignore_errors=True)

                        return web.json_response({
                            "error": "security_threat_detected",
                            "message": "Skill contains suspicious code patterns",
                            "details": {
                                "threat_count": scan_result.threats_detected,
                                "threat_patterns": scan_result.threat_details[:5]  # First 5
                            }
                        }, status=400)

                finally:
                    shutil.rmtree(temp_extract_dir, ignore_errors=True)

                # Create installation task
                task_manager = AsyncTaskManager()
                task_id = await task_manager.create_task(
                    skill_id=None,
                    source="upload",
                    skill_name=bundle.name
                )

                # Store bundle temporarily for installation
                bundle_storage_dir = get_hermes_home() / ".skill_cache" / "bundles"
                bundle_storage_dir.mkdir(parents=True, exist_ok=True)
                bundle_file = bundle_storage_dir / f"{task_id}.zip"
                shutil.move(str(temp_file), str(bundle_file))

                # Start installation in background
                async def install_uploaded_skill(task_id_inner, progress_callback):
                    """Install from uploaded bundle."""
                    # Reload bundle from storage
                    bundle_file_path = bundle_storage_dir / f"{task_id_inner}.zip"
                    try:
                        await progress_callback(5, "Loading skill package...")
                        bundle_reload = SkillBundle.from_zip(bundle_file_path, source="upload")

                        # Use shared installation helper
                        await self._perform_installation(
                            bundle=bundle_reload,
                            temp_zip_path=bundle_file_path,
                            progress_callback=progress_callback,
                            start_progress=10,
                            category=category,
                            skills_dir=target_skills_dir  # 传递目标 skills 目录
                        )
                    except Exception as e:
                        # Cleanup on error
                        if bundle_file_path.exists():
                            bundle_file_path.unlink()
                        raise

                task_manager.start_task(task_id, install_uploaded_skill)

                return web.json_response({
                    "task_id": task_id,
                    "skill_name": bundle.name,
                    "status": "pending"
                })

            finally:
                temp_file.unlink(missing_ok=True)

        except Exception as e:
            logger.error(f"ZIP upload failed: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_install_skill_online(self, request: web.Request) -> web.Response:
        """POST /api/skills/install - Install skill from online repository."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            from tools.skill_installer import AsyncTaskManager
            from hermes_constants import get_hermes_home
            import hashlib
            import tempfile
            import uuid

            # 解析 profile_home（在处理请求开始时）
            from gateway.org.runtime import resolve_request_profile_home
            profile_home = resolve_request_profile_home(request)
            target_skills_dir = (profile_home / "skills") if profile_home else (get_hermes_home() / "skills")

            data = await parse_request_json(
                request,
                {"skill_id": str, "source": str, "source_id": str, "category": str},
                required=["skill_id", "source"]
            )

            if data["source"] != "online":
                return web.json_response({"error": "Invalid source, expected 'online'"}, status=400)

            skill_id = data["skill_id"]
            source_id = data.get("source_id", "hermes")  # Which registry to use
            category = data.get("category", "")  # Optional category parameter
            print(f"[DEBUG SkillInstallOnline] Received install request - skill_id: {skill_id}, source_id: {source_id}, category: '{category}'")
            logger.info(f"[SkillInstallOnline] Received install request - skill_id: {skill_id}, source_id: {source_id}, category: '{category}'")

            # For skills.sh, construct download URL directly from skill_id
            # skill_id format: "owner/repo/skill-name" OR "skills-sh/owner/repo/skill-name"
            source_config = SKILL_REGISTRIES.get(source_id, {})
            api_type = source_config.get("api_type", "index")

            # Check if skill_id has skills-sh prefix (from Hermes registry indexing skills.sh)
            actual_skill_id = skill_id
            is_skillssh_format = False
            if skill_id.startswith("skills-sh/"):
                actual_skill_id = skill_id[len("skills-sh/"):]
                is_skillssh_format = True
                logger.info(f"[SkillInstallOnline] Detected skills-sh prefix, stripped to: {actual_skill_id}")

            # Handle skills.sh format (either from skillssh source or Hermes registry with skills-sh prefix)
            if (api_type == "search" and source_id == "skillssh") or is_skillssh_format:
                # Extract GitHub repo from skill_id
                # Format: "owner/repo/skill-name" -> repo: "owner/repo"
                parts = actual_skill_id.split("/")
                if len(parts) >= 2:
                    github_repo = "/".join(parts[:2])  # owner/repo
                    skill_name = parts[-1] if len(parts) >= 3 else parts[-1]

                    skill_info = {
                        "id": actual_skill_id,
                        "name": skill_name,
                        "source": github_repo,
                        "download_url": f"https://github.com/{github_repo}/archive/refs/heads/main.zip"
                    }
                    logger.info(f"[SkillInstallOnline] Constructed download URL from skill_id: {skill_info['download_url']}")
                else:
                    return web.json_response({
                        "error": "invalid_skill_id",
                        "message": f"Invalid skill_id format: '{actual_skill_id}'"
                    }, status=400)
            elif not is_skillssh_format:
                # For Hermes and other index-based registries, fetch from registry
                registry = await self._fetch_registry(source_id)
                if not registry:
                    return web.json_response({
                        "error": "skill_registry_unavailable",
                        "message": "Cannot install: registry unavailable"
                    }, status=503)

                # Find skill in registry
                skill_info = None
                for skill in registry.get("skills", []):
                    if skill.get("id") == skill_id or skill.get("name") == skill_id:
                        skill_info = skill
                        break

                if not skill_info:
                    return web.json_response({
                        "error": "skill_not_found",
                        "message": f"Skill '{skill_id}' not found in registry"
                    }, status=404)

            # Create installation task
            task_manager = AsyncTaskManager()
            task_id = await task_manager.create_task(
                skill_id=skill_id,
                source="online",
                skill_name=skill_info.get("name")
            )

            # Start installation in background
            async def install_online_skill(task_id_inner, progress_callback):
                """Download, validate, and install online skill."""
                source = skill_info.get("source", "")
                identifier = skill_info.get("identifier") or skill_info.get("id")

                # Handle official/builtin skills differently
                if source == "official" or (identifier and identifier.startswith("official/")):
                    await progress_callback(10, "Loading official skill...")

                    # Official skills are installed from local optional-skills/ directory
                    from tools.skills_hub import SkillBundle, OptionalSkillSource

                    source_obj = OptionalSkillSource()
                    bundle = source_obj.fetch(identifier)
                    if not bundle:
                        raise ValueError(f"Official skill '{identifier}' not found")

                    await progress_callback(30, "Validating skill package...")

                    # Install directly without download
                    await self._perform_installation(
                        bundle=bundle,
                        temp_zip_path=None,  # No ZIP file for official skills
                        progress_callback=progress_callback,
                        start_progress=30,
                        category=category,
                        skills_dir=target_skills_dir  # 传递目标 skills 目录
                    )
                    return

                # For non-official skills, download from URL
                await progress_callback(10, "Downloading from GitHub...")

                download_url = skill_info.get("download_url")
                expected_hash = skill_info.get("sha256")

                # If no download_url but has repo field (skills.sh format from Hermes registry)
                if not download_url and skill_info.get("repo"):
                    github_repo = skill_info["repo"]
                    download_url = f"https://github.com/{github_repo}/archive/refs/heads/main.zip"
                    logger.info(f"[SkillInstallOnline] Constructed GitHub URL from repo field: {download_url}")

                if not download_url:
                    raise ValueError("Skill download URL not found in registry")

                # Download ZIP
                temp_dir = Path(tempfile.gettempdir()) / "hermes_skill_downloads"
                temp_dir.mkdir(exist_ok=True)
                temp_file = temp_dir / f"{uuid.uuid4()}.zip"

                try:
                    async with httpx.AsyncClient(follow_redirects=True) as client:
                        async with client.stream("GET", download_url, timeout=60) as response:
                            if response.status_code != 200:
                                raise ValueError(f"Download failed: HTTP {response.status_code}")

                            with open(temp_file, "wb") as f:
                                async for chunk in response.aiter_bytes():
                                    f.write(chunk)

                    await progress_callback(30, "Verifying download...")

                    # Verify SHA256 if provided
                    if expected_hash:
                        hasher = hashlib.sha256()
                        with open(temp_file, "rb") as f:
                            while chunk := f.read(8192):
                                hasher.update(chunk)
                        actual_hash = hasher.hexdigest()

                        if actual_hash != expected_hash:
                            temp_file.unlink(missing_ok=True)
                            raise ValueError(
                                f"Download verification failed: hash mismatch "
                                f"(expected {expected_hash[:8]}..., got {actual_hash[:8]}...)"
                            )

                    await progress_callback(40, "Validating skill package...")

                    # Parse and validate using SkillBundle
                    from tools.skills_hub import SkillBundle
                    bundle = SkillBundle.from_zip(temp_file, source="online")

                    # Call the shared installation helper (handles quarantine → scan → install)
                    await self._perform_installation(
                        bundle=bundle,
                        temp_zip_path=temp_file,
                        progress_callback=progress_callback,
                        start_progress=50,
                        category=category,
                        skills_dir=target_skills_dir  # 传递目标 skills 目录
                    )

                except Exception as e:
                    # Cleanup on error
                    if temp_file.exists():
                        temp_file.unlink(missing_ok=True)
                    raise

            task_manager.start_task(task_id, install_online_skill)

            return web.json_response({
                "task_id": task_id,
                "skill_id": skill_id,
                "skill_name": skill_info.get("name"),
                "status": "pending"
            })

        except web.HTTPBadRequest:
            raise
        except Exception as e:
            logger.error(f"Online skill installation failed: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_install_status(self, request: web.Request) -> web.Response:
        """GET /api/skills/install/{task_id} - Query installation task status."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from tools.skill_installer import AsyncTaskManager

            task_id = request.match_info.get("task_id")
            if not task_id:
                return web.json_response({"error": "Missing task_id"}, status=400)

            task_manager = AsyncTaskManager()
            state = await task_manager.get_status(task_id)

            if not state:
                return web.json_response({"error": "Task not found"}, status=404)

            return web.json_response(state.to_dict())

        except Exception as e:
            logger.error(f"Failed to get installation status: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_cancel_install(self, request: web.Request) -> web.Response:
        """POST /api/skills/install/{task_id}/cancel - Cancel installation task."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from tools.skill_installer import AsyncTaskManager

            task_id = request.match_info.get("task_id")
            if not task_id:
                return web.json_response({"error": "Missing task_id"}, status=400)

            task_manager = AsyncTaskManager()
            cancelled = await task_manager.cancel_task(task_id)

            if not cancelled:
                return web.json_response({
                    "error": "cannot_cancel",
                    "message": "Task not found or already in terminal state"
                }, status=400)

            return web.json_response({"ok": True, "task_id": task_id})

        except Exception as e:
            logger.error(f"Failed to cancel installation: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_list_install_tasks(self, request: web.Request) -> web.Response:
        """GET /api/skills/install/tasks - List recent installation tasks."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from tools.skill_installer import AsyncTaskManager

            task_manager = AsyncTaskManager()

            # Get query parameters
            status_filter = request.query.get("status")  # Optional: filter by status
            limit = int(request.query.get("limit", "10"))  # Default: 10 most recent

            # Query database directly for recent tasks
            import sqlite3
            with sqlite3.connect(task_manager.db_path) as conn:
                query = "SELECT * FROM skill_install_tasks"
                params = []

                if status_filter:
                    query += " WHERE status = ?"
                    params.append(status_filter)

                query += " ORDER BY created_at DESC LIMIT ?"
                params.append(limit)

                cursor = conn.execute(query, params)
                rows = cursor.fetchall()

                # Convert rows to TaskState dicts
                columns = [desc[0] for desc in cursor.description]
                tasks = []
                for row in rows:
                    task_dict = dict(zip(columns, row))
                    tasks.append(task_dict)

            return web.json_response({"tasks": tasks})

        except Exception as e:
            logger.error(f"Failed to list installation tasks: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    @staticmethod
    async def _perform_installation(
        bundle: "SkillBundle",
        temp_zip_path: Path | None,
        progress_callback,
        start_progress: int = 50,
        category: str = "",
        skills_dir: Optional[Path] = None
    ):
        """
        Shared installation logic for both upload and online installs.

        Performs quarantine → security scan → conflict check → install.

        Args:
            bundle: Validated SkillBundle
            temp_zip_path: Path to temporary ZIP file (will be deleted on success), or None for official skills
            progress_callback: async callback(progress_pct, step_text)
            start_progress: Starting progress percentage (default 50)
            category: Optional category subdirectory for installation
            skills_dir: 目标 skills 目录（如 Sub Agent 的 profile_home/skills/），None 使用默认
        """
        import tools.skills_hub
        from tools.skills_hub import (
            quarantine_bundle,
            install_from_quarantine,
            HubLockFile,
            QUARANTINE_DIR
        )
        from tools.skills_guard import scan_skill
        import shutil
        from datetime import datetime

        with with_skills_dir(skills_dir):
            # Step 1: Quarantine bundle
            await progress_callback(start_progress, "Quarantining skill package...")
            quarantine_path = quarantine_bundle(bundle)

            # Step 2: Security scan
            await progress_callback(start_progress + 10, "Scanning for security threats...")
            scan_result = scan_skill(quarantine_path)

            if not scan_result.is_safe:
                if temp_zip_path:
                    temp_zip_path.unlink(missing_ok=True)

                # Create structured error with scan details
                error = SecurityScanError(
                    message=f"Security scan blocked installation: {scan_result.verdict}",
                    scan_result=scan_result,
                    bundle_name=bundle.name
                )
                raise error

            # Step 3: Check for conflicts
            await progress_callback(start_progress + 20, "Checking for conflicts...")
            lock = HubLockFile()
            existing = lock.get_installed(bundle.name)

            if existing:
                # Backup existing skill to quarantine
                current_skills_dir = tools.skills_hub.SKILLS_DIR
                existing_path = current_skills_dir / bundle.name
                if existing_path.exists():
                    backup_name = f"{bundle.name}_backup_{int(datetime.now().timestamp())}"
                    backup_path = QUARANTINE_DIR / backup_name
                    await progress_callback(start_progress + 25, "Backing up existing skill...")
                    shutil.move(str(existing_path), str(backup_path))
                    logger.info(f"Backed up existing skill to {backup_path}")

            # Step 4: Install from quarantine
            await progress_callback(start_progress + 35, "Installing skill...")
            print(f"[DEBUG SkillInstall] Installing with category: '{category}'")
            logger.info(f"[SkillInstall] Installing with category: '{category}'")
            install_path = install_from_quarantine(
                quarantine_path=quarantine_path,
                skill_name=bundle.name,
                category=category,
                bundle=bundle,
                scan_result=scan_result
            )
            print(f"[DEBUG SkillInstall] Installed to: {install_path}")
            logger.info(f"[SkillInstall] Installed to: {install_path}")

            # Step 5: Cleanup
            await progress_callback(start_progress + 45, "Cleaning up...")
            if temp_zip_path:
                temp_zip_path.unlink(missing_ok=True)

            # Step 6: Done
            # Step 6: Done
            await progress_callback(100, f"Successfully installed {bundle.name}")
            logger.info(f"Successfully installed skill: {bundle.name} at {install_path}")

            # Cleanup temp file after success
            if temp_zip_path:
                temp_zip_path.unlink(missing_ok=True)
