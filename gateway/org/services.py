"""Domain services for organization orchestration."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .store import (
    AgentRepository,
    CompanyRepository,
    DepartmentRepository,
    OrganizationStore,
    PositionRepository,
    ProfileAgentRepository,
    WorkspaceRepository,
    now_ts,
    slugify,
)


class OrganizationError(ValueError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _require(data: dict[str, Any], *fields: str) -> None:
    missing = [field for field in fields if data.get(field) in (None, "")]
    if missing:
        raise OrganizationError(f"Missing required fields: {', '.join(missing)}")


def _int_id(value: Any, name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise OrganizationError(f"{name} must be an integer")


class WorkspaceProvisionService:
    def __init__(self, store: OrganizationStore, workspaces: WorkspaceRepository):
        self.store = store
        self.workspaces = workspaces

    def workspace_path(self, owner_type: str, owner_id: int, name: str) -> Path:
        plural = {
            "company": "companies",
            "department": "departments",
            "position": "positions",
            "agent": "agents",
        }[owner_type]
        return self.store.org_root / "workspaces" / plural / f"{owner_id}-{slugify(name)}"

    def ensure_workspace(
        self,
        owner_type: str,
        owner_id: int,
        name: str,
        visibility: str,
        conn: sqlite3.Connection,
    ) -> dict[str, Any]:
        root = self.workspace_path(owner_type, owner_id, name)
        root.mkdir(parents=True, exist_ok=True)
        return self.workspaces.create_or_update(
            {
                "owner_type": owner_type,
                "owner_id": owner_id,
                "name": name,
                "root_path": str(root),
                "visibility": visibility,
            },
            conn,
        )


class SoulRenderService:
    def render(self, company: dict[str, Any], department: dict[str, Any], position: dict[str, Any], agent: dict[str, Any]) -> str:
        return "\n".join(
            [
                "# Identity",
                f"You are {agent['name']}, a Profile Agent in {company['name']} / {department['name']} / {position['name']}.",
                "",
                "# Mission",
                f"Company goal: {company['goal']}",
                f"Department goal: {department['goal']}",
                f"Position goal: {position.get('goal') or 'Follow the position responsibilities.'}",
                f"Agent goal: {agent.get('service_goal') or 'Support the assigned position.'}",
                "",
                "# Responsibilities",
                position["responsibilities"],
                "",
                "# Organization Rules",
                "- Use SQLite organization data as the source of truth for reporting lines and status.",
                "- Use only your own Profile Agent resources at runtime.",
                "- Do not access personal workspace data from other agents.",
                "- Put company work outputs in company, department, position, or agent workspaces as appropriate.",
                "",
                "# Output Preferences",
                "- Lead with the result, then include concise supporting details.",
                "- Mark assumptions and missing permissions explicitly.",
                "",
                "# Hard Rules",
                "- Do not fabricate files, data, execution results, or permissions.",
                "- Do not expose private workspace content.",
                "",
            ]
        )


class ProfileProvisionService:
    def __init__(
        self,
        store: OrganizationStore,
        profiles: ProfileAgentRepository,
        soul_renderer: SoulRenderService,
    ):
        self.store = store
        self.profiles = profiles
        self.soul_renderer = soul_renderer

    def profile_name(self, agent_id: int) -> str:
        return f"org-{agent_id}"

    def profile_home(self, profile_name: str) -> Path:
        return self.store.org_root / "profiles" / profile_name

    def bootstrap_issues(
        self,
        position: dict[str, Any],
        conn: sqlite3.Connection,
    ) -> list[str]:
        rows = self.store.query_all(
            """
            SELECT requirement_type, requirement_key, validation_status, validation_message
            FROM subagent_bootstrap_requirements
            WHERE required_level = 'required'
              AND (
                scope_type = 'system'
                OR (scope_type = 'position' AND scope_id = ?)
                OR (scope_type = 'template' AND template_key = ?)
              )
            """,
            (position["id"], position.get("template_key")),
            conn,
        )
        issues = []
        for row in rows:
            if row["validation_status"] not in ("ready", "ok"):
                detail = row.get("validation_message") or row["requirement_key"]
                issues.append(f"{row['requirement_type']}:{detail}")
        return issues

    def create_metadata(
        self,
        agent: dict[str, Any],
        position: dict[str, Any],
        conn: sqlite3.Connection,
    ) -> dict[str, Any]:
        profile_name = self.profile_name(agent["id"])
        home = self.profile_home(profile_name)
        return self.profiles.create(
            {
                "agent_id": agent["id"],
                "profile_name": profile_name,
                "profile_home": str(home),
                "soul_path": str(home / "SOUL.md"),
                "config_path": str(home / "config.yaml"),
                "profile_status": "pending",
                "template_key": position.get("template_key"),
            },
            conn,
        )

    def provision(
        self,
        agent_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, Any]:
        agent = self._get_required("agents", agent_id, conn)
        company = self._get_required("companies", agent["company_id"], conn)
        department = self._get_required("departments", agent["department_id"], conn)
        position = self._get_required("positions", agent["position_id"], conn)
        profile = self.profiles.get_by_agent(agent_id, conn)
        if not profile:
            profile = self.create_metadata(agent, position, conn)

        issues = self.bootstrap_issues(position, conn)
        if issues:
            return self._mark_profile(
                profile["id"],
                "blocked",
                "; ".join(issues),
                conn,
            )

        profile_home = Path(profile["profile_home"])
        for child in ("memories", "sessions", "skills"):
            (profile_home / child).mkdir(parents=True, exist_ok=True)
        profile_home.mkdir(parents=True, exist_ok=True)

        soul = self.soul_renderer.render(company, department, position, agent)
        Path(profile["soul_path"]).write_text(soul, encoding="utf-8")
        config = {
            "organization": {
                "company_id": company["id"],
                "department_id": department["id"],
                "position_id": position["id"],
                "agent_id": agent["id"],
            }
        }
        Path(profile["config_path"]).write_text(json.dumps(config, indent=2), encoding="utf-8")
        return self._mark_profile(profile["id"], "ready", None, conn)

    def _get_required(self, table: str, item_id: int, conn: sqlite3.Connection) -> dict[str, Any]:
        row = self.store.query_one(f"SELECT * FROM {table} WHERE id = ?", (item_id,), conn)
        if not row:
            raise OrganizationError(f"{table[:-1].replace('_', ' ')} not found", 404)
        return row

    def _mark_profile(
        self,
        profile_id: int,
        status: str,
        error_message: str | None,
        conn: sqlite3.Connection,
    ) -> dict[str, Any]:
        ts = now_ts()
        self.store.execute(
            """
            UPDATE profile_agents
            SET profile_status = ?, error_message = ?, last_provisioned_at = ?,
                last_sync_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (status, error_message, ts, ts, ts, profile_id),
            conn,
        )
        profile = self.profiles.get(profile_id, conn)
        if not profile:
            raise OrganizationError("Profile Agent not found", 404)
        return profile


class AgentProvisionService:
    def __init__(self, profiles: ProfileProvisionService):
        self.profiles = profiles

    def provision_profile(self, agent_id: int, conn: sqlite3.Connection) -> dict[str, Any]:
        return self.profiles.provision(agent_id, conn)


class OrganizationService:
    def __init__(self, store: OrganizationStore | None = None):
        self.store = store or OrganizationStore()
        self.companies = CompanyRepository(self.store)
        self.departments = DepartmentRepository(self.store)
        self.positions = PositionRepository(self.store)
        self.agents = AgentRepository(self.store)
        self.profile_agents = ProfileAgentRepository(self.store)
        self.workspaces = WorkspaceRepository(self.store)
        self.workspace_service = WorkspaceProvisionService(self.store, self.workspaces)
        self.profile_service = ProfileProvisionService(
            self.store,
            self.profile_agents,
            SoulRenderService(),
        )
        self.agent_provision = AgentProvisionService(self.profile_service)

    def get_tree(self) -> dict[str, Any]:
        companies = self.store.query_all("SELECT * FROM companies ORDER BY created_at, id")
        departments = self.store.query_all("SELECT * FROM departments ORDER BY sort_order, id")
        positions = self.store.query_all("SELECT * FROM positions ORDER BY sort_order, id")
        agents = self.store.query_all("SELECT * FROM agents ORDER BY name, id")
        profiles = self.store.query_all("SELECT * FROM profile_agents ORDER BY id")
        profile_by_agent = {p["agent_id"]: p for p in profiles}

        agents_by_position: dict[int, list[dict[str, Any]]] = {}
        for agent in agents:
            item = dict(agent)
            item["profile_agent"] = profile_by_agent.get(agent["id"])
            agents_by_position.setdefault(agent["position_id"], []).append(item)

        positions_by_department: dict[int, list[dict[str, Any]]] = {}
        for position in positions:
            item = dict(position)
            item["agents"] = agents_by_position.get(position["id"], [])
            item["agent_count"] = len(item["agents"])
            positions_by_department.setdefault(position["department_id"], []).append(item)

        departments_by_company: dict[int, list[dict[str, Any]]] = {}
        for department in departments:
            item = dict(department)
            item["positions"] = positions_by_department.get(department["id"], [])
            item["position_count"] = len(item["positions"])
            item["agent_count"] = sum(p["agent_count"] for p in item["positions"])
            departments_by_company.setdefault(department["company_id"], []).append(item)

        result = []
        for company in companies:
            item = dict(company)
            item["departments"] = departments_by_company.get(company["id"], [])
            item["department_count"] = len(item["departments"])
            item["position_count"] = sum(d["position_count"] for d in item["departments"])
            item["agent_count"] = sum(d["agent_count"] for d in item["departments"])
            result.append(item)
        return {"companies": result}

    def create_company(self, data: dict[str, Any]) -> dict[str, Any]:
        _require(data, "name", "goal")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            company = self.companies.create(data, conn)
            workspace = self.workspace_service.ensure_workspace(
                "company", company["id"], company["name"], "company", conn
            )
            return self.companies.update(
                company["id"],
                {"workspace_path": workspace["root_path"]},
                {"workspace_path"},
                conn,
            ) or company

        return self.store.transaction(tx)

    def update_company(self, company_id: int, data: dict[str, Any]) -> dict[str, Any]:
        allowed = {"name", "goal", "description", "icon", "accent_color", "status", "workspace_path"}
        return self._update_existing(self.companies, company_id, data, allowed)

    def create_department(self, data: dict[str, Any]) -> dict[str, Any]:
        _require(data, "company_id", "name", "goal")
        data["company_id"] = _int_id(data["company_id"], "company_id")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.companies.get(data["company_id"], conn):
                raise OrganizationError("Company not found", 404)
            department = self.departments.create(data, conn)
            workspace = self.workspace_service.ensure_workspace(
                "department", department["id"], department["name"], "company", conn
            )
            return self.departments.update(
                department["id"],
                {"workspace_path": workspace["root_path"]},
                {"workspace_path"},
                conn,
            ) or department

        return self.store.transaction(tx)

    def update_department(self, department_id: int, data: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "name", "goal", "description", "icon", "accent_color", "leader_agent_id", "workspace_path",
            "sort_order", "status", "parent_id",
        }
        return self._update_existing(self.departments, department_id, data, allowed)

    def create_position(self, data: dict[str, Any]) -> dict[str, Any]:
        _require(data, "department_id", "name", "responsibilities")
        data["department_id"] = _int_id(data["department_id"], "department_id")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.departments.get(data["department_id"], conn):
                raise OrganizationError("Department not found", 404)
            position = self.positions.create(data, conn)
            workspace = self.workspace_service.ensure_workspace(
                "position", position["id"], position["name"], "company", conn
            )
            return self.positions.update(
                position["id"],
                {"workspace_path": workspace["root_path"]},
                {"workspace_path"},
                conn,
            ) or position

        return self.store.transaction(tx)

    def update_position(self, position_id: int, data: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "name", "goal", "responsibilities", "icon", "accent_color", "headcount", "template_key",
            "workspace_path", "sort_order", "status",
        }
        return self._update_existing(self.positions, position_id, data, allowed)

    def create_agent(self, data: dict[str, Any]) -> dict[str, Any]:
        _require(data, "position_id", "name", "role_summary")
        data["position_id"] = _int_id(data["position_id"], "position_id")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            position = self.positions.get(data["position_id"], conn)
            if not position:
                raise OrganizationError("Position not found", 404)
            department = self.departments.get(position["department_id"], conn)
            if not department:
                raise OrganizationError("Department not found", 404)
            data["department_id"] = department["id"]
            data["company_id"] = department["company_id"]

            agent = self.agents.create(data, conn)
            workspace = self.workspace_service.ensure_workspace(
                "agent", agent["id"], agent["name"], "company", conn
            )
            agent = self.agents.update(
                agent["id"],
                {"workspace_path": workspace["root_path"]},
                {"workspace_path"},
                conn,
            ) or agent
            self.profile_service.create_metadata(agent, position, conn)
            self.agent_provision.provision_profile(agent["id"], conn)
            return self.get_agent(agent["id"], conn)

        return self.store.transaction(tx)

    def get_agent(self, agent_id: int, conn: sqlite3.Connection | None = None) -> dict[str, Any]:
        agent = self.agents.get(agent_id, conn)
        if not agent:
            raise OrganizationError("Agent not found", 404)
        agent["profile_agent"] = self.profile_agents.get_by_agent(agent_id, conn)
        agent["workspace"] = self.workspaces.get_by_owner("agent", agent_id, conn)
        return agent

    def update_agent(self, agent_id: int, data: dict[str, Any]) -> dict[str, Any]:
        allowed = {
            "employee_no", "name", "display_name", "avatar_url", "manager_agent_id",
            "employment_status", "role_summary", "service_goal", "workspace_path",
            "accent_color", "enabled", "status",
        }

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.agents.get(agent_id, conn):
                raise OrganizationError("Agent not found", 404)
            if "enabled" in data:
                data["enabled"] = 1 if data["enabled"] else 0
            self.agents.update(agent_id, data, allowed, conn)
            return self.get_agent(agent_id, conn)

        return self.store.transaction(tx)

    def provision_profile(self, agent_id: int) -> dict[str, Any]:
        return self.store.transaction(
            lambda conn: self.agent_provision.provision_profile(agent_id, conn)
        )

    def get_workspace(self, owner_type: str, owner_id: int) -> dict[str, Any]:
        if owner_type not in {"company", "department", "position", "agent"}:
            raise OrganizationError("Invalid workspace owner type")
        workspace = self.workspaces.get_by_owner(owner_type, owner_id)
        if not workspace:
            raise OrganizationError("Workspace not found", 404)
        return workspace

    def _update_existing(
        self,
        repo: Any,
        item_id: int,
        data: dict[str, Any],
        allowed: set[str],
    ) -> dict[str, Any]:
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not repo.get(item_id, conn):
                raise OrganizationError("Record not found", 404)
            updated = repo.update(item_id, data, allowed, conn)
            if not updated:
                raise OrganizationError("Record not found", 404)
            return updated

        return self.store.transaction(tx)
