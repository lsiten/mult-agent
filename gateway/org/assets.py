"""Master agent asset scanner.

Walks the master agent's Hermes home directory and reconciles discovered
skills / tools / resources / config entries into the ``master_agent_assets``
table. Records are created as ``private`` by default; an operator must
explicitly flip ``visibility = public`` before sub-agents will inherit them.

Design notes:
  * Scanning is idempotent. Each run upserts by (asset_type, asset_key).
  * Checksums are computed for files and sorted directory listings so
    operators can tell when an asset's content drifts.
  * ``.env`` is never stored verbatim. We only record which whitelisted
    keys are present — actual values are resolved fresh at inherit time.
  * ``config.yaml`` is stored as a filtered projection (only whitelisted
    fields) so the record itself is safe to commit/backup.
"""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from .store import (
    MasterAgentAssetRepository,
    OrganizationStore,
    now_ts,
)
from .whitelist import (
    ENV_WHITELIST,
    PROVIDER_ENV_KEYS,
    RUNTIME_ENV_KEYS,
    TOOL_ENV_KEYS,
    filter_config_yaml,
    is_env_key_allowed,
)

# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

_TEXT_SAMPLE_LIMIT = 2 * 1024 * 1024  # 2 MiB safety cap for checksum reads


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    try:
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(65536)
                if not chunk:
                    break
                h.update(chunk)
                if h.block_size and path.stat().st_size > _TEXT_SAMPLE_LIMIT * 16:
                    # Very large file — SHA over head only to bound cost
                    break
    except OSError:
        return ""
    return h.hexdigest()


def _sha256_dir(root: Path) -> str:
    """Checksum of a directory listing (names + per-file checksum)."""
    if not root.is_dir():
        return ""
    h = hashlib.sha256()
    for entry in sorted(root.rglob("*")):
        try:
            rel = entry.relative_to(root).as_posix()
        except ValueError:
            continue
        if entry.is_file():
            h.update(rel.encode("utf-8"))
            h.update(b"\0")
            h.update(_sha256_file(entry).encode("ascii"))
            h.update(b"\0")
    return h.hexdigest()


def _safe_load_yaml(path: Path) -> dict[str, Any] | None:
    try:
        import yaml  # type: ignore
    except ImportError:
        return None
    if not path.is_file():
        return None
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _parse_env_file(path: Path) -> dict[str, str]:
    """Parse a minimal .env file. Returns an empty dict on any error.

    We do not execute shell expansion or support multi-line values; this is
    a whitelist-aware inventory, not a fully spec-compliant parser.
    """
    if not path.is_file():
        return {}
    result: dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].strip()
            if "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if value and value[0] in ('"', "'") and value.endswith(value[0]):
                value = value[1:-1]
            if not key:
                continue
            result[key] = value
    except OSError:
        return {}
    return result


# ---------------------------------------------------------------------------
# Scanner
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ScanReport:
    scanned: int
    created: int
    updated: int
    removed: int
    missing_sources: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "scanned": self.scanned,
            "created": self.created,
            "updated": self.updated,
            "removed": self.removed,
            "missing_sources": list(self.missing_sources),
        }


class MasterAgentAssetScanner:
    """Discover master agent assets and reconcile them into SQLite."""

    def __init__(
        self,
        store: OrganizationStore,
        repository: MasterAgentAssetRepository | None = None,
        *,
        master_home: Path | None = None,
    ):
        self.store = store
        self.assets = repository or MasterAgentAssetRepository(store)
        self._master_home = master_home

    # ------------------------------------------------------------------ API

    def master_home(self) -> Path | None:
        """Best-effort resolution of the master agent's Hermes home.

        Returns None when HERMES_HOME is not exported (e.g. unit tests that
        don't pass ``master_home`` explicitly). Callers must handle None.
        """
        if self._master_home is not None:
            return self._master_home
        home = os.environ.get("HERMES_HOME", "").strip()
        return Path(home) if home else None

    def scan(self, conn: sqlite3.Connection | None = None) -> ScanReport:
        """Run a full reconciliation pass.

        Scoped transactions: when ``conn`` is None, we open one internally so
        the scan is atomic. When provided, the caller controls the tx.
        """
        if conn is None:
            return self.store.transaction(lambda c: self._scan_impl(c))
        return self._scan_impl(conn)

    # -------------------------------------------------------------- internals

    def _scan_impl(self, conn: sqlite3.Connection) -> ScanReport:
        home = self.master_home()
        missing_sources: list[str] = []
        if home is None or not home.exists():
            missing_sources.append(str(home) if home else "<HERMES_HOME unset>")
            return ScanReport(0, 0, 0, 0, missing_sources)

        discovered_keys: set[tuple[str, str]] = set()
        created = 0
        updated = 0
        scanned = 0

        for record in self._discover(home, missing_sources):
            scanned += 1
            key = (record["asset_type"], record["asset_key"])
            discovered_keys.add(key)
            existing = self.assets.get_by_key(record["asset_type"], record["asset_key"], conn)
            record["last_validated_at"] = now_ts()
            if existing:
                # Preserve operator-controlled fields (visibility, inherit_mode).
                record["visibility"] = existing["visibility"]
                record["inherit_mode"] = existing["inherit_mode"]
                record["is_runtime_required"] = existing["is_runtime_required"]
                record["is_bootstrap_required"] = existing["is_bootstrap_required"]
                self.assets.upsert(record, conn)
                updated += 1
            else:
                self.assets.upsert(record, conn)
                created += 1

        # Mark rows that no longer have a source as status='stale'. We do not
        # delete them because an operator may have flipped visibility=public
        # and we want their decision history preserved.
        removed = 0
        for row in self.assets.list(status=None, conn=conn):
            key = (row["asset_type"], row["asset_key"])
            if key not in discovered_keys and row["status"] == "active":
                self.assets.patch(
                    row["id"],
                    {
                        "status": "stale",
                        "inherit_ready": 0,
                        "validation_status": "warning",
                        "validation_message": "Source no longer present on disk",
                        "last_validated_at": now_ts(),
                    },
                    conn,
                )
                removed += 1

        return ScanReport(scanned, created, updated, removed, missing_sources)

    def _discover(
        self,
        home: Path,
        missing_sources: list[str],
    ) -> Iterable[dict[str, Any]]:
        yield from self._discover_skills(home, missing_sources)
        yield from self._discover_tools(home, missing_sources)
        yield from self._discover_config_yaml(home, missing_sources)
        yield from self._discover_env(home, missing_sources)

    # -- skills ------------------------------------------------------------

    def _discover_skills(
        self,
        home: Path,
        missing_sources: list[str],
    ) -> Iterable[dict[str, Any]]:
        skills_dir = home / "skills"
        if not skills_dir.is_dir():
            missing_sources.append(str(skills_dir))
            return
        for skill_md in sorted(skills_dir.rglob("SKILL.md")):
            skill_root = skill_md.parent
            try:
                rel = skill_root.relative_to(skills_dir).as_posix()
            except ValueError:
                continue
            if rel.startswith(".hub/") or "/.git/" in skill_root.as_posix():
                continue
            checksum = _sha256_dir(skill_root)
            yield {
                "asset_type": "skill",
                "asset_key": rel or skill_root.name,
                "asset_name": skill_root.name,
                "source_path": str(skill_root),
                "source_format": "directory",
                "target_path_template": "skills/{asset_key}",
                "content_checksum": checksum,
                "inherit_ready": 1 if checksum else 0,
                "validation_status": "ready" if checksum else "warning",
                "validation_message": None if checksum else "Unable to hash skill directory",
                "description": f"Skill discovered at {rel}",
                "status": "active",
            }

    # -- tools -------------------------------------------------------------

    def _discover_tools(
        self,
        home: Path,
        missing_sources: list[str],
    ) -> Iterable[dict[str, Any]]:
        tools_dir = home / "tools"
        if not tools_dir.is_dir():
            # tools directory is optional; don't mark as missing
            return
        for tool in sorted(tools_dir.iterdir()):
            if not tool.is_dir():
                continue
            if tool.name.startswith("."):
                continue
            checksum = _sha256_dir(tool)
            yield {
                "asset_type": "tool",
                "asset_key": tool.name,
                "asset_name": tool.name,
                "source_path": str(tool),
                "source_format": "directory",
                "target_path_template": "tools/{asset_key}",
                "content_checksum": checksum,
                "inherit_ready": 1 if checksum else 0,
                "validation_status": "ready" if checksum else "warning",
                "status": "active",
            }

    # -- config.yaml -------------------------------------------------------

    def _discover_config_yaml(
        self,
        home: Path,
        missing_sources: list[str],
    ) -> Iterable[dict[str, Any]]:
        path = home / "config.yaml"
        if not path.is_file():
            missing_sources.append(str(path))
            return
        raw = _safe_load_yaml(path)
        if raw is None:
            yield {
                "asset_type": "config",
                "asset_key": "config_yaml",
                "asset_name": "config.yaml",
                "source_path": str(path),
                "source_format": "yaml",
                "inherit_mode": "merge_config",
                "target_path_template": "config.yaml",
                "inherit_ready": 0,
                "validation_status": "blocked",
                "validation_message": "Unable to parse config.yaml",
                "status": "active",
            }
            return
        filtered = filter_config_yaml(raw)
        payload = json.dumps(filtered, sort_keys=True, ensure_ascii=False)
        checksum = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        yield {
            "asset_type": "config",
            "asset_key": "config_yaml",
            "asset_name": "config.yaml",
            "source_path": str(path),
            "source_format": "yaml",
            "inherit_mode": "merge_config",
            "target_path_template": "config.yaml",
            "content_checksum": checksum,
            "description": (
                f"Whitelisted config fields discovered: {len(filtered)} top-level keys"
            ),
            "inherit_ready": 1 if filtered else 0,
            "validation_status": "ready" if filtered else "warning",
            "validation_message": (
                None
                if filtered
                else "config.yaml contained no whitelisted fields"
            ),
            "status": "active",
        }

    # -- .env --------------------------------------------------------------

    def _discover_env(
        self,
        home: Path,
        missing_sources: list[str],
    ) -> Iterable[dict[str, Any]]:
        """Emit one ``env_provider`` row per registered provider, plus a single
        ``env_runtime`` row for terminal defaults and one ``env_tools`` row for
        tool API keys.

        Values are never persisted. Each row records:
          * ``description``  — the sorted list of whitelisted key names this
            provider has configured in master ``.env`` (for the UI tooltip).
          * ``content_checksum`` — sha256 of that key list, so drift detection
            works without leaking secrets.
          * ``inherit_ready`` — 1 iff at least one whitelisted key has a value.

        Existing rows keep their operator-controlled fields (``visibility``,
        ``inherit_mode``) via the upsert path in ``_scan_impl``.
        """
        path = home / ".env"
        if not path.is_file():
            missing_sources.append(str(path))
            return
        env = _parse_env_file(path)
        # Belt-and-braces: even though we bucket by code-level maps below, run
        # the shared whitelist first so secrets whose env names happen to match
        # suspicious substrings cannot sneak through.
        allowed = {k: v for k, v in env.items() if is_env_key_allowed(k) and v}

        # --- per-provider rows ------------------------------------------------
        for provider_id, provider_keys in sorted(PROVIDER_ENV_KEYS.items()):
            present = sorted(k for k in provider_keys if k in allowed)
            has_api_key = any(
                k.endswith("_API_KEY") or k == "HF_TOKEN" for k in present
            )
            manifest = {"provider": provider_id, "keys": present}
            checksum = hashlib.sha256(
                json.dumps(manifest, sort_keys=True).encode("utf-8")
            ).hexdigest()
            yield {
                "asset_type": "env_provider",
                "asset_key": provider_id,
                "asset_name": f"provider:{provider_id}",
                "source_path": str(path),
                "source_format": "env",
                "inherit_mode": "merge_config",
                "target_path_template": ".env",
                "content_checksum": checksum,
                "description": (
                    f"Provider {provider_id} — configured keys: "
                    f"{', '.join(present) if present else 'none'}"
                ),
                "inherit_ready": 1 if present else 0,
                "is_bootstrap_required": 1 if has_api_key else 0,
                "validation_status": "ready" if present else "warning",
                "validation_message": (
                    None if present else "No key configured for this provider"
                ),
                "status": "active",
            }

        # --- terminal runtime bucket -----------------------------------------
        rt_present = sorted(k for k in RUNTIME_ENV_KEYS if k in allowed)
        rt_manifest = {"group": "runtime", "keys": rt_present}
        rt_checksum = hashlib.sha256(
            json.dumps(rt_manifest, sort_keys=True).encode("utf-8")
        ).hexdigest()
        yield {
            "asset_type": "env_runtime",
            "asset_key": "terminal",
            "asset_name": "terminal runtime defaults",
            "source_path": str(path),
            "source_format": "env",
            "inherit_mode": "merge_config",
            "target_path_template": ".env",
            "content_checksum": rt_checksum,
            "description": (
                f"Terminal runtime keys configured: "
                f"{', '.join(rt_present) if rt_present else 'none'}"
            ),
            "inherit_ready": 1 if rt_present else 0,
            "is_bootstrap_required": 0,
            "validation_status": "ready" if rt_present else "warning",
            "validation_message": (
                None if rt_present else "No terminal runtime keys configured"
            ),
            "status": "active",
        }

        # --- tool API keys bucket --------------------------------------------
        tool_present = sorted(k for k in TOOL_ENV_KEYS if k in allowed)
        tool_manifest = {"group": "tools", "keys": tool_present}
        tool_checksum = hashlib.sha256(
            json.dumps(tool_manifest, sort_keys=True).encode("utf-8")
        ).hexdigest()
        yield {
            "asset_type": "env_tools",
            "asset_key": "research",
            "asset_name": "research / scraping tool keys",
            "source_path": str(path),
            "source_format": "env",
            "inherit_mode": "merge_config",
            "target_path_template": ".env",
            "content_checksum": tool_checksum,
            "description": (
                f"Tool API keys configured: "
                f"{', '.join(tool_present) if tool_present else 'none'}"
            ),
            "inherit_ready": 1 if tool_present else 0,
            "is_bootstrap_required": 0,
            "validation_status": "ready" if tool_present else "warning",
            "validation_message": (
                None if tool_present else "No tool API keys configured"
            ),
            "status": "active",
        }


__all__ = [
    "MasterAgentAssetScanner",
    "ScanReport",
    "ENV_WHITELIST",
]
