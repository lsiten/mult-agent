"""
Skills API handlers for Gateway Dashboard.
"""

import hmac
import json
import logging
import os
import time
import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List
from aiohttp import web
import httpx

logger = logging.getLogger(__name__)


class SecurityScanError(Exception):
    """Raised when security scan blocks skill installation."""

    def __init__(self, message: str, scan_result: Any, bundle_name: str):
        super().__init__(message)
        self.message = message
        self.scan_result = scan_result
        self.bundle_name = bundle_name
        self.details = {
            "verdict": scan_result.verdict,
            "threats_detected": len(scan_result.threats),
            "threats": scan_result.threats[:5],
            "can_force_install": True,
            "force_command": f"hermes skills install {bundle_name} --force"
        }

# Skill registry sources configuration
SKILL_REGISTRIES = {
    "skillssh": {
        "name": "Skills.sh Community",
        "repo": "skills-sh",
        "url_template": "https://skills.sh/api/search?q=",
        "website": "https://skills.sh/",
        "api_type": "search",  # Search API
    },
    "hermes": {
        "name": "Hermes Official",
        "repo": "hermes-official",
        "url_template": "https://hermes-agent.nousresearch.com/docs/api/skills-index.json",
        "website": "https://hermes-agent.nousresearch.com/docs/skills/",
        "api_type": "index",  # Static index
    },
}
REGISTRY_CACHE_TTL = 86400  # 24 hours


class SkillsAPIHandlers:
    """Skills management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token
        self._registry_cache: Dict[str, Optional[Dict[str, Any]]] = {}  # source_id -> registry
        self._registry_cache_time: Dict[str, float] = {}  # source_id -> timestamp
        self._init_cache_db()

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "1":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    def _init_cache_db(self):
        """Initialize registry cache database."""
        from hermes_constants import get_hermes_home

        cache_dir = get_hermes_home() / ".skill_cache"
        cache_dir.mkdir(exist_ok=True)
        self._cache_db_path = cache_dir / "registry_cache.db"

        with sqlite3.connect(self._cache_db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS registry_cache (
                    repo TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    fetched_at REAL NOT NULL
                )
            """)
            conn.commit()

    async def _fetch_registry(self, source_id: str = "hermes", query: str = "") -> Optional[Dict[str, Any]]:
        """Fetch skill registry from specified source with caching."""
        if source_id not in SKILL_REGISTRIES:
            logger.error(f"Unknown skill registry source: {source_id}")
            return None

        source_config = SKILL_REGISTRIES[source_id]
        api_type = source_config.get("api_type", "index")
        repo = source_config["repo"]
        now = time.time()

        # For search APIs without query, return empty results
        if api_type == "search" and not query:
            return {"skills": []}

        # For search APIs, skip cache if there's a query
        cache_key = f"{source_id}:{query}" if (api_type == "search" and query) else source_id
        use_cache = not (api_type == "search" and query)

        # Check in-memory cache first (only for non-search or empty query)
        if use_cache and cache_key in self._registry_cache and (now - self._registry_cache_time.get(cache_key, 0)) < REGISTRY_CACHE_TTL:
            return self._registry_cache[cache_key]

        # Check SQLite cache (only for index APIs)
        if use_cache and api_type == "index":
            with sqlite3.connect(self._cache_db_path) as conn:
                cursor = conn.execute(
                    "SELECT data, fetched_at FROM registry_cache WHERE repo = ?",
                    (repo,)
                )
                row = cursor.fetchone()

                if row:
                    cached_data, fetched_at = row
                    if (now - fetched_at) < REGISTRY_CACHE_TTL:
                        registry = json.loads(cached_data)
                        self._registry_cache[cache_key] = registry
                        self._registry_cache_time[cache_key] = now
                        logger.info(f"Using cached skill registry for {source_id}")
                        return registry

        # Fetch from API
        try:
            url = source_config["url_template"]

            # Build params based on API type
            params = {}
            if api_type == "search":
                # Pass query as-is (empty check is handled above)
                params["q"] = query
            elif api_type == "api":
                if query:
                    params["search"] = query
                params["limit"] = 100

            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=15)

                if response.status_code == 403:
                    # Rate limited
                    logger.warning(f"API rate limited for {source_id}, using stale cache if available")
                    if cache_key in self._registry_cache:
                        return self._registry_cache[cache_key]
                    return None

                if response.status_code == 200:
                    raw_data = response.json()

                    # Normalize response based on API type
                    if api_type == "search":
                        # skills.sh returns {skills: [...]}
                        skills = raw_data.get("skills", [])
                    elif api_type == "api":
                        # ClawHub returns {items: [...]}
                        skills = raw_data.get("items", [])
                    else:
                        # Hermes index returns {skills: [...]}
                        skills = raw_data.get("skills", [])

                    registry_data = {"skills": skills}

                    # Cache in SQLite (only for index APIs)
                    if use_cache and api_type == "index":
                        with sqlite3.connect(self._cache_db_path) as conn:
                            conn.execute(
                                "INSERT OR REPLACE INTO registry_cache (repo, data, fetched_at) VALUES (?, ?, ?)",
                                (repo, json.dumps(registry_data), now)
                            )
                            conn.commit()

                    # Cache in memory
                    if use_cache:
                        self._registry_cache[cache_key] = registry_data
                        self._registry_cache_time[cache_key] = now

                    logger.info(f"Fetched skill registry from {source_id} ({len(skills)} skills)")
                    return registry_data

                logger.error(f"Failed to fetch registry from {source_id}: HTTP {response.status_code}")
                return None

        except Exception as e:
            logger.error(f"Failed to fetch skill registry from {source_id}: {e}", exc_info=True)
            # Return stale cache if available
            if cache_key in self._registry_cache:
                logger.warning(f"Using stale cache for {source_id} due to fetch error")
                return self._registry_cache[cache_key]
            return None

    async def handle_list_sources(self, request: web.Request) -> web.Response:
        """GET /api/skills/sources - List available skill registry sources."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        sources = []
        for source_id, config in SKILL_REGISTRIES.items():
            sources.append({
                "id": source_id,
                "name": config["name"],
                "repo": config["repo"],
            })

        return web.json_response({"sources": sources})

    async def handle_search_skills(self, request: web.Request) -> web.Response:
        """GET /api/skills/search?q=<keyword>&source=<source_id> - Search online skills."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            query = request.query.get("q", "").strip().lower()
            source = request.query.get("source", "hermes")

            # Fetch registry (pass query for search APIs)
            source_config = SKILL_REGISTRIES.get(source, {})
            api_type = source_config.get("api_type", "index")

            # For search/API sources, pass query directly to API
            # For index sources, fetch all and filter locally
            if api_type in ("search", "api"):
                registry = await self._fetch_registry(source, query)
            else:
                registry = await self._fetch_registry(source)
            if not registry:
                return web.json_response({
                    "error": "skill_registry_unavailable",
                    "offline_mode": True,
                    "skills": []
                }, status=503)

            skills = registry.get("skills", [])

            # For index sources, filter by query locally
            if query and api_type == "index":
                filtered_skills = []
                for skill in skills:
                    name_match = query in skill.get("name", "").lower()
                    desc_match = query in skill.get("description", "").lower()
                    tag_match = any(query in tag.lower() for tag in skill.get("tags", []))

                    if name_match or desc_match or tag_match:
                        filtered_skills.append(skill)

                skills = filtered_skills

            # Normalize skills: add id field and check installed status
            from hermes_constants import get_hermes_home
            skills_dir = get_hermes_home() / "skills"

            for skill in skills:
                # Generate unique ID based on source type
                if api_type == "search":
                    # skills.sh: use existing id field (includes source prefix)
                    skill["id"] = skill.get("id") or f"{skill.get('source', '')}/{skill.get('name', '')}"
                else:
                    # Hermes/ClawHub: use identifier or name
                    skill["id"] = skill.get("identifier") or skill.get("id") or skill.get("name", "")

                skill_name = skill.get("name", "")
                skill_path = skills_dir / skill_name
                # Check if installed: directory exists AND contains skill definition files
                is_installed = False
                if skill_path.exists() and skill_path.is_dir():
                    # Verify it contains skill.yaml or SKILL.md
                    if (skill_path / "skill.yaml").exists() or (skill_path / "SKILL.md").exists():
                        is_installed = True
                skill["installed"] = is_installed

            return web.json_response({
                "skills": skills,
                "offline_mode": False,
                "total": len(skills)
            })

        except Exception as e:
            logger.error(f"Skill search failed: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)

    async def handle_list_skills(self, request: web.Request) -> web.Response:
        """GET /api/skills - List available skills."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import get_hermes_home
            import yaml

            skills_dir = get_hermes_home() / "skills"
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

            skills_dir = get_hermes_home() / "skills"
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
                            category=category
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
                        category=category
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
                        category=category
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
        category: str = ""
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
        """
        from tools.skills_hub import (
            quarantine_bundle,
            install_from_quarantine,
            HubLockFile,
            SKILLS_DIR,
            QUARANTINE_DIR
        )
        from tools.skills_guard import scan_skill
        import shutil
        from datetime import datetime

        try:
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
                existing_path = SKILLS_DIR / bundle.name
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
            await progress_callback(100, f"Successfully installed {bundle.name}")
            logger.info(f"Successfully installed skill: {bundle.name} at {install_path}")

        except Exception as e:
            # Cleanup temp file on error
            if temp_zip_path and temp_zip_path.exists():
                temp_zip_path.unlink(missing_ok=True)
            raise

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

            skills_dir = get_hermes_home() / "skills"
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
