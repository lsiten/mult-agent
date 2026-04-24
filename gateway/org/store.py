"""SQLite storage for organization orchestration."""

from __future__ import annotations

import re
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Iterable

from hermes_constants import get_hermes_home

SCHEMA_VERSION = 3


def default_org_db_path() -> Path:
    """
    返回组织架构数据库路径。

    ⚠️ org.db 应该全局共享，不随 HERMES_HOME 变化。
    主 Agent 和所有 Sub Agent 都应该访问同一个 org.db，
    以确保组织架构数据（companies, departments, positions, agents）一致。

    Sub Agent 的隔离仅限于 state.db（sessions, messages）。
    """
    import os

    # 检查是否在 Sub Agent 模式下
    if os.getenv("HERMES_SUB_AGENT_MODE") == "1":
        # Sub Agent：使用主 Agent 的 org.db（通过去除 profile 路径前缀）
        hermes_home = get_hermes_home()
        # 路径格式：.../hermes-agent-electron/org/profiles/org-N
        # 需要回退到：.../hermes-agent-electron
        hermes_home_str = str(hermes_home)
        if "/org/profiles/" in hermes_home_str:
            main_hermes_home = Path(hermes_home_str.split("/org/profiles/")[0])
            return main_hermes_home / "org" / "org.db"

    # 主 Agent：使用 HERMES_HOME 下的 org.db
    return get_hermes_home() / "org" / "org.db"


def now_ts() -> float:
    return time.time()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "item"


def new_code(prefix: str, name: str) -> str:
    return f"{prefix}-{slugify(name)}-{uuid.uuid4().hex[:8]}"


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    accent_color TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    workspace_path TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    goal TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    accent_color TEXT,
    leader_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    workspace_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    goal TEXT,
    responsibilities TEXT NOT NULL,
    icon TEXT,
    accent_color TEXT,
    headcount INTEGER,
    template_key TEXT,
    workspace_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    employee_no TEXT,
    name TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    manager_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    employment_status TEXT NOT NULL DEFAULT 'active',
    role_summary TEXT NOT NULL,
    service_goal TEXT,
    accent_color TEXT,
    workspace_path TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL UNIQUE,
    profile_home TEXT NOT NULL,
    soul_path TEXT,
    config_path TEXT,
    profile_status TEXT NOT NULL DEFAULT 'pending',
    template_key TEXT,
    last_provisioned_at REAL,
    last_sync_at REAL,
    error_message TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL,
    visibility TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS master_agent_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type TEXT NOT NULL,
    asset_key TEXT NOT NULL,
    asset_name TEXT,
    source_path TEXT,
    source_format TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    inherit_mode TEXT NOT NULL DEFAULT 'copy_to_profile',
    target_path_template TEXT,
    content_checksum TEXT,
    is_runtime_required INTEGER NOT NULL DEFAULT 0,
    is_bootstrap_required INTEGER NOT NULL DEFAULT 0,
    inherit_ready INTEGER NOT NULL DEFAULT 0,
    validation_status TEXT NOT NULL DEFAULT 'warning',
    validation_message TEXT,
    last_validated_at REAL,
    version TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    UNIQUE(asset_type, asset_key)
);

CREATE TABLE IF NOT EXISTS subagent_bootstrap_requirements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL,
    scope_id INTEGER,
    template_key TEXT,
    requirement_type TEXT NOT NULL,
    requirement_key TEXT NOT NULL,
    required_level TEXT NOT NULL DEFAULT 'required',
    expected_source TEXT NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'missing',
    last_validated_at REAL,
    validation_message TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope_type TEXT NOT NULL DEFAULT 'system',
    scope_id INTEGER,
    base_soul_md TEXT,
    default_skills TEXT,
    default_memory_policy TEXT,
    default_working_style TEXT,
    default_output_preferences TEXT,
    default_hard_rules TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_departments_company_sort
    ON departments(company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_positions_department_sort
    ON positions(department_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_agents_position ON agents(position_id);
CREATE INDEX IF NOT EXISTS idx_agents_department ON agents(department_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(employment_status, enabled);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON workspaces(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_bootstrap_scope
    ON subagent_bootstrap_requirements(scope_type, scope_id, template_key);
CREATE INDEX IF NOT EXISTS idx_profile_templates_scope
    ON profile_templates(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_master_assets_type_visibility
    ON master_agent_assets(asset_type, visibility);
"""


class OrganizationStore:
    """Thread-safe SQLite access for organization data."""

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or default_org_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            str(self.db_path),
            check_same_thread=False,
            timeout=1.0,
            isolation_level=None,
        )
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._init_schema()

    @property
    def org_root(self) -> Path:
        return self.db_path.parent

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(SCHEMA_SQL)
            row = self._conn.execute("SELECT version FROM schema_version").fetchone()
            self._migrate_schema()
            if row is None:
                self._conn.execute(
                    "INSERT INTO schema_version(version) VALUES (?)",
                    (SCHEMA_VERSION,),
                )
            elif int(row["version"]) < SCHEMA_VERSION:
                self._conn.execute(
                    "UPDATE schema_version SET version = ?",
                    (SCHEMA_VERSION,),
                )

    def _migrate_schema(self) -> None:
        additions = {
            "companies": {
                "icon": "TEXT",
                "accent_color": "TEXT",
            },
            "departments": {
                "icon": "TEXT",
                "accent_color": "TEXT",
                "managing_department_id": "INTEGER REFERENCES departments(id) ON DELETE SET NULL",
                "is_management_department": "INTEGER NOT NULL DEFAULT 0",
            },
            "positions": {
                "icon": "TEXT",
                "accent_color": "TEXT",
                "is_management_position": "INTEGER NOT NULL DEFAULT 0",
            },
            "agents": {
                "accent_color": "TEXT",
                "leadership_role": "TEXT DEFAULT 'none'",
            },
        }
        for table, columns in additions.items():
            existing = {
                row["name"]
                for row in self._conn.execute(f"PRAGMA table_info({table})").fetchall()
            }
            for name, definition in columns.items():
                if name not in existing:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")

    def transaction(self, fn: Callable[[sqlite3.Connection], Any]) -> Any:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                result = fn(self._conn)
                self._conn.commit()
                return result
            except BaseException:
                self._conn.rollback()
                raise

    def query_one(
        self,
        sql: str,
        params: Iterable[Any] = (),
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        connection = conn or self._conn
        with self._lock:
            return row_to_dict(connection.execute(sql, tuple(params)).fetchone())

    def query_all(
        self,
        sql: str,
        params: Iterable[Any] = (),
        conn: sqlite3.Connection | None = None,
    ) -> list[dict[str, Any]]:
        connection = conn or self._conn
        with self._lock:
            return [dict(row) for row in connection.execute(sql, tuple(params)).fetchall()]

    def execute(
        self,
        sql: str,
        params: Iterable[Any] = (),
        conn: sqlite3.Connection | None = None,
    ) -> sqlite3.Cursor:
        connection = conn or self._conn
        with self._lock:
            return connection.execute(sql, tuple(params))


class BaseRepository:
    table = ""

    def __init__(self, store: OrganizationStore):
        self.store = store

    def get(self, item_id: int, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
        return self.store.query_one(
            f"SELECT * FROM {self.table} WHERE id = ?",
            (item_id,),
            conn,
        )

    def update(
        self,
        item_id: int,
        fields: dict[str, Any],
        allowed: set[str],
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return self.get(item_id, conn)
        updates["updated_at"] = now_ts()
        names = list(updates)
        sql = f"UPDATE {self.table} SET " + ", ".join(f"{n} = ?" for n in names) + " WHERE id = ?"
        self.store.execute(sql, (*[updates[n] for n in names], item_id), conn)
        return self.get(item_id, conn)


class CompanyRepository(BaseRepository):
    table = "companies"

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO companies(
                code, name, goal, description, icon, accent_color,
                status, workspace_path, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data.get("code") or new_code("company", data["name"]),
                data["name"],
                data["goal"],
                data.get("description"),
                data.get("icon"),
                data.get("accent_color"),
                data.get("status") or "active",
                data.get("workspace_path"),
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}


class DepartmentRepository(BaseRepository):
    table = "departments"

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO departments(
                company_id, parent_id, code, name, goal, description, icon, accent_color, leader_agent_id,
                workspace_path, sort_order, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["company_id"],
                data.get("parent_id"),
                data.get("code") or new_code("department", data["name"]),
                data["name"],
                data["goal"],
                data.get("description"),
                data.get("icon"),
                data.get("accent_color"),
                data.get("leader_agent_id"),
                data.get("workspace_path"),
                data.get("sort_order") or 0,
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}


class PositionRepository(BaseRepository):
    table = "positions"

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO positions(
                department_id, code, name, goal, responsibilities, icon, accent_color, headcount,
                template_key, workspace_path, sort_order, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["department_id"],
                data.get("code") or new_code("position", data["name"]),
                data["name"],
                data.get("goal"),
                data["responsibilities"],
                data.get("icon"),
                data.get("accent_color"),
                data.get("headcount"),
                data.get("template_key"),
                data.get("workspace_path"),
                data.get("sort_order") or 0,
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}


class AgentRepository(BaseRepository):
    table = "agents"

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO agents(
                company_id, department_id, position_id, employee_no, name, display_name,
                avatar_url, manager_agent_id, employment_status, role_summary,
                service_goal, accent_color, workspace_path, enabled, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["company_id"],
                data["department_id"],
                data["position_id"],
                data.get("employee_no"),
                data["name"],
                data.get("display_name"),
                data.get("avatar_url"),
                data.get("manager_agent_id"),
                data.get("employment_status") or "active",
                data["role_summary"],
                data.get("service_goal"),
                data.get("accent_color"),
                data.get("workspace_path"),
                1 if data.get("enabled", True) else 0,
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}


class ProfileAgentRepository(BaseRepository):
    table = "profile_agents"

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO profile_agents(
                agent_id, profile_name, profile_home, soul_path, config_path,
                profile_status, template_key, last_provisioned_at, last_sync_at,
                error_message, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["agent_id"],
                data["profile_name"],
                data["profile_home"],
                data.get("soul_path"),
                data.get("config_path"),
                data.get("profile_status") or "pending",
                data.get("template_key"),
                data.get("last_provisioned_at"),
                data.get("last_sync_at"),
                data.get("error_message"),
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}

    def get_by_agent(self, agent_id: int, conn: sqlite3.Connection | None = None) -> dict[str, Any] | None:
        return self.store.query_one(
            "SELECT * FROM profile_agents WHERE agent_id = ?",
            (agent_id,),
            conn,
        )


class MasterAgentAssetRepository(BaseRepository):
    """CRUD for master agent inheritable assets.

    Assets are identified uniquely by (asset_type, asset_key).
    Use upsert() to reconcile scanner results idempotently.
    """

    table = "master_agent_assets"

    _UPDATABLE = {
        "asset_name",
        "source_path",
        "source_format",
        "visibility",
        "inherit_mode",
        "target_path_template",
        "content_checksum",
        "is_runtime_required",
        "is_bootstrap_required",
        "inherit_ready",
        "validation_status",
        "validation_message",
        "last_validated_at",
        "version",
        "description",
        "status",
    }

    def get_by_key(
        self,
        asset_type: str,
        asset_key: str,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.store.query_one(
            "SELECT * FROM master_agent_assets WHERE asset_type = ? AND asset_key = ?",
            (asset_type, asset_key),
            conn,
        )

    def list(
        self,
        *,
        asset_type: str | None = None,
        visibility: str | None = None,
        inherit_ready: int | None = None,
        status: str | None = "active",
        conn: sqlite3.Connection | None = None,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if asset_type is not None:
            clauses.append("asset_type = ?")
            params.append(asset_type)
        if visibility is not None:
            clauses.append("visibility = ?")
            params.append(visibility)
        if inherit_ready is not None:
            clauses.append("inherit_ready = ?")
            params.append(int(inherit_ready))
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        return self.store.query_all(
            f"SELECT * FROM master_agent_assets{where} ORDER BY asset_type, asset_key",
            params,
            conn,
        )

    def list_inheritable(
        self,
        conn: sqlite3.Connection | None = None,
    ) -> list[dict[str, Any]]:
        """Assets eligible for sub-agent inheritance (public + ready + active)."""
        return self.store.query_all(
            """
            SELECT * FROM master_agent_assets
            WHERE visibility = 'public'
              AND inherit_ready = 1
              AND status = 'active'
            ORDER BY asset_type, asset_key
            """,
            (),
            conn,
        )

    def upsert(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        if not data.get("asset_type") or not data.get("asset_key"):
            raise ValueError("master_agent_assets requires asset_type and asset_key")
        existing = self.get_by_key(data["asset_type"], data["asset_key"], conn)
        ts = now_ts()
        if existing:
            updates = {k: v for k, v in data.items() if k in self._UPDATABLE}
            if not updates:
                return existing
            updates["updated_at"] = ts
            names = list(updates)
            sql = (
                "UPDATE master_agent_assets SET "
                + ", ".join(f"{n} = ?" for n in names)
                + " WHERE id = ?"
            )
            self.store.execute(sql, (*[updates[n] for n in names], existing["id"]), conn)
            return self.get(existing["id"], conn) or existing
        cursor = self.store.execute(
            """
            INSERT INTO master_agent_assets(
                asset_type, asset_key, asset_name, source_path, source_format,
                visibility, inherit_mode, target_path_template, content_checksum,
                is_runtime_required, is_bootstrap_required, inherit_ready,
                validation_status, validation_message, last_validated_at,
                version, description, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["asset_type"],
                data["asset_key"],
                data.get("asset_name"),
                data.get("source_path"),
                data.get("source_format"),
                data.get("visibility") or "private",
                data.get("inherit_mode") or "copy_to_profile",
                data.get("target_path_template"),
                data.get("content_checksum"),
                1 if data.get("is_runtime_required") else 0,
                1 if data.get("is_bootstrap_required") else 0,
                1 if data.get("inherit_ready") else 0,
                data.get("validation_status") or "warning",
                data.get("validation_message"),
                data.get("last_validated_at"),
                data.get("version"),
                data.get("description"),
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}

    def patch(
        self,
        asset_id: int,
        data: dict[str, Any],
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.update(asset_id, data, self._UPDATABLE, conn)


class SubagentBootstrapRequirementRepository(BaseRepository):
    """CRUD for bootstrap requirements that gate one-click sub-agent creation."""

    table = "subagent_bootstrap_requirements"

    _UPDATABLE = {
        "required_level",
        "expected_source",
        "validation_status",
        "validation_message",
        "last_validated_at",
    }

    def list_for_scope(
        self,
        *,
        scope_type: str | None = None,
        scope_id: int | None = None,
        template_key: str | None = None,
        conn: sqlite3.Connection | None = None,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if scope_type is not None:
            clauses.append("scope_type = ?")
            params.append(scope_type)
        if scope_id is not None:
            clauses.append("scope_id = ?")
            params.append(scope_id)
        if template_key is not None:
            clauses.append("template_key = ?")
            params.append(template_key)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        return self.store.query_all(
            f"SELECT * FROM subagent_bootstrap_requirements{where} ORDER BY requirement_type, requirement_key",
            params,
            conn,
        )

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        required = ("scope_type", "requirement_type", "requirement_key", "expected_source")
        missing = [f for f in required if not data.get(f)]
        if missing:
            raise ValueError(
                "subagent_bootstrap_requirements missing fields: " + ", ".join(missing)
            )
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO subagent_bootstrap_requirements(
                scope_type, scope_id, template_key, requirement_type, requirement_key,
                required_level, expected_source, validation_status, last_validated_at,
                validation_message, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["scope_type"],
                data.get("scope_id"),
                data.get("template_key"),
                data["requirement_type"],
                data["requirement_key"],
                data.get("required_level") or "required",
                data["expected_source"],
                data.get("validation_status") or "missing",
                data.get("last_validated_at"),
                data.get("validation_message"),
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}

    def patch(
        self,
        req_id: int,
        data: dict[str, Any],
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.update(req_id, data, self._UPDATABLE, conn)

    def delete(self, req_id: int, conn: sqlite3.Connection | None = None) -> None:
        self.store.execute(
            "DELETE FROM subagent_bootstrap_requirements WHERE id = ?",
            (req_id,),
            conn,
        )


class ProfileTemplateRepository(BaseRepository):
    """CRUD for sub-agent profile templates.

    Templates resolve with a precedence fallback:
        position → department → company → system
    """

    table = "profile_templates"

    _UPDATABLE = {
        "name",
        "scope_type",
        "scope_id",
        "base_soul_md",
        "default_skills",
        "default_memory_policy",
        "default_working_style",
        "default_output_preferences",
        "default_hard_rules",
        "description",
        "status",
    }

    def get_by_key(
        self,
        template_key: str,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.store.query_one(
            "SELECT * FROM profile_templates WHERE template_key = ?",
            (template_key,),
            conn,
        )

    def list(
        self,
        *,
        scope_type: str | None = None,
        scope_id: int | None = None,
        status: str | None = "active",
        conn: sqlite3.Connection | None = None,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if scope_type is not None:
            clauses.append("scope_type = ?")
            params.append(scope_type)
        if scope_id is not None:
            clauses.append("scope_id = ?")
            params.append(scope_id)
        if status is not None:
            clauses.append("status = ?")
            params.append(status)
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        return self.store.query_all(
            f"SELECT * FROM profile_templates{where} ORDER BY scope_type, scope_id, template_key",
            params,
            conn,
        )

    def resolve(
        self,
        *,
        template_key: str | None,
        position_id: int | None,
        department_id: int | None,
        company_id: int | None,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        """Resolve the best-matching template using precedence fallback.

        Precedence (highest first):
            1. explicit template_key (any scope)
            2. position-scoped template
            3. department-scoped template
            4. company-scoped template
            5. system-scoped template
        """
        if template_key:
            template = self.get_by_key(template_key, conn)
            if template and template.get("status") == "active":
                return template
        for scope_type, scope_id in (
            ("position", position_id),
            ("department", department_id),
            ("company", company_id),
        ):
            if scope_id is None:
                continue
            row = self.store.query_one(
                """
                SELECT * FROM profile_templates
                WHERE scope_type = ? AND scope_id = ? AND status = 'active'
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (scope_type, scope_id),
                conn,
            )
            if row:
                return row
        return self.store.query_one(
            """
            SELECT * FROM profile_templates
            WHERE scope_type = 'system' AND status = 'active'
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (),
            conn,
        )

    def create(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        required = ("template_key", "name")
        missing = [f for f in required if not data.get(f)]
        if missing:
            raise ValueError("profile_templates missing fields: " + ", ".join(missing))
        ts = now_ts()
        cursor = self.store.execute(
            """
            INSERT INTO profile_templates(
                template_key, name, scope_type, scope_id, base_soul_md,
                default_skills, default_memory_policy, default_working_style,
                default_output_preferences, default_hard_rules, description,
                status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["template_key"],
                data["name"],
                data.get("scope_type") or "system",
                data.get("scope_id"),
                data.get("base_soul_md"),
                data.get("default_skills"),
                data.get("default_memory_policy"),
                data.get("default_working_style"),
                data.get("default_output_preferences"),
                data.get("default_hard_rules"),
                data.get("description"),
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get(cursor.lastrowid, conn) or {}

    def patch(
        self,
        template_id: int,
        data: dict[str, Any],
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.update(template_id, data, self._UPDATABLE, conn)

    def delete(self, template_id: int, conn: sqlite3.Connection | None = None) -> None:
        self.store.execute(
            "DELETE FROM profile_templates WHERE id = ?",
            (template_id,),
            conn,
        )


class WorkspaceRepository(BaseRepository):
    table = "workspaces"

    def create_or_update(self, data: dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
        ts = now_ts()
        self.store.execute(
            """
            INSERT INTO workspaces(owner_type, owner_id, name, root_path, visibility, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(owner_type, owner_id) DO UPDATE SET
                name = excluded.name,
                root_path = excluded.root_path,
                visibility = excluded.visibility,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                data["owner_type"],
                data["owner_id"],
                data["name"],
                data["root_path"],
                data["visibility"],
                data.get("status") or "active",
                ts,
                ts,
            ),
            conn,
        )
        return self.get_by_owner(data["owner_type"], data["owner_id"], conn) or {}

    def get_by_owner(
        self,
        owner_type: str,
        owner_id: int,
        conn: sqlite3.Connection | None = None,
    ) -> dict[str, Any] | None:
        return self.store.query_one(
            "SELECT * FROM workspaces WHERE owner_type = ? AND owner_id = ?",
            (owner_type, owner_id),
            conn,
        )
