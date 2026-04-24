"""
Skill registry management for Skills API.

Handles skill registry caching, fetching, and searching.
"""

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Optional, Dict, Any

import httpx
from aiohttp import web

from .api_server_skills_common import SKILL_REGISTRIES, REGISTRY_CACHE_TTL

logger = logging.getLogger(__name__)


class SkillRegistryManager:
    """Manages skill registry caching and fetching."""

    def __init__(self, cache_db_path: Path):
        """Initialize registry manager.

        Args:
            cache_db_path: Path to SQLite cache database
        """
        self._cache_db_path = cache_db_path
        self._registry_cache: Dict[str, Optional[Dict[str, Any]]] = {}
        self._registry_cache_time: Dict[str, float] = {}
        self._init_cache_db()

    def _init_cache_db(self):
        """Initialize registry cache database."""
        self._cache_db_path.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self._cache_db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS registry_cache (
                    repo TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    fetched_at REAL NOT NULL
                )
            """)
            conn.commit()

    async def fetch_registry(self, source_id: str = "hermes", query: str = "") -> Optional[Dict[str, Any]]:
        """Fetch skill registry from specified source with caching.

        Args:
            source_id: Registry source ID
            query: Search query string

        Returns:
            Registry data dict with "skills" list, or None if fetch fails
        """
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

        # Check in-memory cache first
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

            params = {}
            if api_type == "search":
                params["q"] = query
            elif api_type == "api":
                if query:
                    params["search"] = query
                params["limit"] = 100

            async with httpx.AsyncClient() as client:
                response = await client.get(url, params=params, timeout=15)

                if response.status_code == 403:
                    logger.warning(f"API rate limited for {source_id}, using stale cache if available")
                    if cache_key in self._registry_cache:
                        return self._registry_cache[cache_key]
                    return None

                if response.status_code == 200:
                    raw_data = response.json()

                    # Normalize response based on API type
                    if api_type == "search":
                        skills = raw_data.get("skills", [])
                    elif api_type == "api":
                        skills = raw_data.get("items", [])
                    else:
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
            if cache_key in self._registry_cache:
                logger.warning(f"Using stale cache for {source_id} due to fetch error")
                return self._registry_cache[cache_key]
            return None


async def handle_list_sources(request: web.Request, check_auth_fn) -> web.Response:
    """GET /api/skills/sources - List available skill registry sources.

    Args:
        request: aiohttp request
        check_auth_fn: Authentication check function

    Returns:
        JSON response with sources list
    """
    if not check_auth_fn(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    sources = []
    for source_id, config in SKILL_REGISTRIES.items():
        sources.append({
            "id": source_id,
            "name": config["name"],
            "repo": config["repo"],
        })

    return web.json_response({"sources": sources})


async def handle_search_skills(request: web.Request, check_auth_fn, registry_manager: SkillRegistryManager) -> web.Response:
    """GET /api/skills/search?q=<keyword>&source=<source_id> - Search online skills.

    Args:
        request: aiohttp request
        check_auth_fn: Authentication check function
        registry_manager: SkillRegistryManager instance

    Returns:
        JSON response with search results
    """
    if not check_auth_fn(request):
        return web.json_response({"error": "Unauthorized"}, status=401)

    try:
        query = request.query.get("q", "").strip().lower()
        source = request.query.get("source", "hermes")

        source_config = SKILL_REGISTRIES.get(source, {})
        api_type = source_config.get("api_type", "index")

        # Fetch registry
        if api_type in ("search", "api"):
            registry = await registry_manager.fetch_registry(source, query)
        else:
            registry = await registry_manager.fetch_registry(source)

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
            # Generate unique ID
            if api_type == "search":
                skill["id"] = skill.get("id") or f"{skill.get('source', '')}/{skill.get('name', '')}"
            else:
                skill["id"] = skill.get("identifier") or skill.get("id") or skill.get("name", "")

            skill_name = skill.get("name", "")
            skill_path = skills_dir / skill_name
            is_installed = False
            if skill_path.exists() and skill_path.is_dir():
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
