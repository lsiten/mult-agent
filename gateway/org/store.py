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

SCHEMA_VERSION = 2


def default_org_db_path() -> Path:
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
            },
            "positions": {
                "icon": "TEXT",
                "accent_color": "TEXT",
            },
            "agents": {
                "accent_color": "TEXT",
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
