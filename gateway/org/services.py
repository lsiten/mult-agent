"""Domain services for organization orchestration."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
from pathlib import Path
from typing import Any

import yaml

from .assets import MasterAgentAssetScanner, ScanReport
from .bootstrap import BootstrapResult, BootstrapValidator
from .inheritance import InheritanceApplier, InheritContext, InheritanceResult
from .whitelist import PROVIDER_ENV_KEYS, is_provider_id_valid
from .store import (
    AgentRepository,
    CompanyRepository,
    DepartmentRepository,
    MasterAgentAssetRepository,
    OrganizationStore,
    PositionRepository,
    ProfileAgentRepository,
    ProfileTemplateRepository,
    SubagentBootstrapRequirementRepository,
    WorkspaceRepository,
    now_ts,
    slugify,
)

# Import hermes_constants for HERMES_HOME
try:
    from hermes_constants import get_hermes_home
except ImportError:
    def get_hermes_home() -> Path:
        """Fallback implementation for testing."""
        val = os.environ.get("HERMES_HOME", "").strip()
        if not val:
            raise RuntimeError("HERMES_HOME environment variable is not set.")
        return Path(val)


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
    """Render the sub-agent's SOUL.md using the three design-doc sources:

    (1) Profile template (with fallback to a built-in base skeleton)
    (2) Master agent inheritable prompt snippets (``inject_prompt`` mode)
    (3) SQLite organization rows (company / department / position / agent)
    """

    _DEFAULT_SECTIONS = {
        "working_style": (
            "- Clarify the task before acting.\n"
            "- Produce structured, reusable, auditable output.\n"
            "- Call out risks, assumptions, and missing permissions explicitly."
        ),
        "output_preferences": (
            "- Lead with the result, then the supporting detail.\n"
            "- Prefer lists, tables, and concise summaries."
        ),
        "hard_rules": (
            "- Do not fabricate files, data, execution results, or permissions.\n"
            "- Do not expose private workspace content.\n"
            "- Use SQLite organization data as the source of truth for reporting lines."
        ),
    }

    def __init__(self, store: OrganizationStore):
        self.store = store

    def _query_manager(self, manager_id: int) -> dict[str, Any] | None:
        """查询经理 Agent 信息

        Args:
            manager_id: 经理 Agent ID

        Returns:
            经理 Agent 记录，如果不存在返回 None
        """
        try:
            manager = self.store.query_one(
                "SELECT id, name, display_name FROM agents WHERE id = ?",
                (manager_id,),
            )
            return manager
        except Exception:
            return None

    def _find_manager_by_hierarchy(
        self,
        agent: dict[str, Any],
        position: dict[str, Any],
        department: dict[str, Any],
        company: dict[str, Any],
    ) -> dict[str, Any] | None:
        """根据组织架构智能查找经理（就近原则）

        查找优先级（就近原则）：
        1. 当前岗位下的负责人 Agent
           - 如果自己所在岗位有其他 Agent 且是负责人（leadership_role = 'primary' 或 'deputy'）
           - 优先级：primary > deputy

        2. 当前部门的管理岗位下的 Agent
           - 查找部门内 is_management_position=1 的岗位下的 Agent
           - 优先级：primary > deputy > none

        3. 管理部门（managing_department_id）下的 Agent
           - 如果当前部门有管理部门，查找管理部门的管理岗位下的 Agent
           - 递归向上查找管理部门链

        4. 上级部门（parent_id）的管理岗位下的 Agent
           - 递归向上查找部门层级

        5. 公司层级的管理 Agent（兜底）

        Args:
            agent: 当前 Agent 信息
            position: 当前岗位信息
            department: 当前部门信息
            company: 公司信息

        Returns:
            经理 Agent 记录，如果找不到返回 None
        """
        try:
            # 1. 当前岗位下的负责人 Agent（同岗位的其他人）
            # 场景：同一个岗位下有多个 Agent，其中某些是负责人
            same_position_leader = self.store.query_one(
                """
                SELECT a.id, a.name, a.display_name, a.leadership_role
                FROM agents a
                WHERE a.position_id = ?
                  AND a.id != ?
                  AND a.leadership_role IN ('primary', 'deputy')
                  AND a.status = 'active'
                  AND a.enabled = 1
                ORDER BY
                  CASE a.leadership_role
                    WHEN 'primary' THEN 1
                    WHEN 'deputy' THEN 2
                    ELSE 3
                  END,
                  a.id
                LIMIT 1
                """,
                (position["id"], agent["id"]),
            )

            if same_position_leader:
                return same_position_leader

            # 2. 当前部门的管理岗位下的 Agent
            # 场景：部门内有专门的管理岗位（如"部门经理"岗位）
            dept_management_leader = self.store.query_one(
                """
                SELECT a.id, a.name, a.display_name, a.leadership_role
                FROM agents a
                JOIN positions p ON a.position_id = p.id
                WHERE a.department_id = ?
                  AND a.id != ?
                  AND p.is_management_position = 1
                  AND a.status = 'active'
                  AND a.enabled = 1
                ORDER BY
                  CASE a.leadership_role
                    WHEN 'primary' THEN 1
                    WHEN 'deputy' THEN 2
                    ELSE 3
                  END,
                  a.id
                LIMIT 1
                """,
                (department["id"], agent["id"]),
            )

            if dept_management_leader:
                return dept_management_leader

            # 3. 管理部门（managing_department_id）的管理岗位下的 Agent
            # 场景：部门有指定的管理部门（如技术部由架构部管理）
            current_managing_dept_id = department.get("managing_department_id")
            visited_managing_depts = set()  # 防止循环

            while current_managing_dept_id and current_managing_dept_id not in visited_managing_depts:
                visited_managing_depts.add(current_managing_dept_id)

                managing_dept_leader = self.store.query_one(
                    """
                    SELECT a.id, a.name, a.display_name, a.leadership_role
                    FROM agents a
                    JOIN positions p ON a.position_id = p.id
                    WHERE a.department_id = ?
                      AND p.is_management_position = 1
                      AND a.status = 'active'
                      AND a.enabled = 1
                    ORDER BY
                      CASE a.leadership_role
                        WHEN 'primary' THEN 1
                        WHEN 'deputy' THEN 2
                        ELSE 3
                      END,
                      a.id
                    LIMIT 1
                    """,
                    (current_managing_dept_id,),
                )

                if managing_dept_leader:
                    return managing_dept_leader

                # 继续向上查找管理部门的管理部门
                managing_dept = self.store.query_one(
                    "SELECT managing_department_id FROM departments WHERE id = ?",
                    (current_managing_dept_id,),
                )
                current_managing_dept_id = managing_dept.get("managing_department_id") if managing_dept else None

            # 4. 上级部门（parent_id）的管理岗位下的 Agent
            # 场景：递归向上查找部门层级
            current_parent_id = department.get("parent_id")
            visited_parents = set()  # 防止循环

            while current_parent_id and current_parent_id not in visited_parents:
                visited_parents.add(current_parent_id)

                parent_dept_leader = self.store.query_one(
                    """
                    SELECT a.id, a.name, a.display_name, a.leadership_role
                    FROM agents a
                    JOIN positions p ON a.position_id = p.id
                    WHERE a.department_id = ?
                      AND p.is_management_position = 1
                      AND a.status = 'active'
                      AND a.enabled = 1
                    ORDER BY
                      CASE a.leadership_role
                        WHEN 'primary' THEN 1
                        WHEN 'deputy' THEN 2
                        ELSE 3
                      END,
                      a.id
                    LIMIT 1
                    """,
                    (current_parent_id,),
                )

                if parent_dept_leader:
                    return parent_dept_leader

                # 继续向上查找
                parent_dept = self.store.query_one(
                    "SELECT parent_id FROM departments WHERE id = ?",
                    (current_parent_id,),
                )
                current_parent_id = parent_dept.get("parent_id") if parent_dept else None

            # 5. 公司层级的管理 Agent（兜底）
            # 场景：查找公司级别的管理岗位 Agent
            company_leader = self.store.query_one(
                """
                SELECT a.id, a.name, a.display_name, a.leadership_role
                FROM agents a
                JOIN positions p ON a.position_id = p.id
                WHERE a.company_id = ?
                  AND a.id != ?
                  AND p.is_management_position = 1
                  AND a.status = 'active'
                  AND a.enabled = 1
                ORDER BY
                  CASE a.leadership_role
                    WHEN 'primary' THEN 1
                    WHEN 'deputy' THEN 2
                    ELSE 3
                  END,
                  a.id
                LIMIT 1
                """,
                (company["id"], agent["id"]),
            )

            if company_leader:
                return company_leader

            # 6. 最后兜底：公司中的任何其他 Agent
            any_agent = self.store.query_one(
                """
                SELECT a.id, a.name, a.display_name
                FROM agents a
                WHERE a.company_id = ?
                  AND a.id != ?
                  AND a.status = 'active'
                  AND a.enabled = 1
                ORDER BY a.id
                LIMIT 1
                """,
                (company["id"], agent["id"]),
            )

            return any_agent

        except Exception as e:
            import hermes_logging
            logger = hermes_logging.get_logger(__name__)
            logger.warning(f"Failed to find manager by hierarchy: {e}")
            return None

    def render(
        self,
        company: dict[str, Any],
        department: dict[str, Any],
        position: dict[str, Any],
        agent: dict[str, Any],
        *,
        template: dict[str, Any] | None = None,
        prompt_snippets: list[str] | None = None,
        profile_home: str = "",
        workspaces: dict[str, str] | None = None,
    ) -> str:
        """渲染 SOUL.md

        Args:
            company: 公司信息
            department: 部门信息
            position: 岗位信息
            agent: Agent 信息
            template: Profile 模板（可选）
            prompt_snippets: 继承的 prompt 片段（可选）
            profile_home: Profile 目录路径
            workspaces: 工作空间路径字典（agent/position/department/company）
        """
        tpl = template or {}
        workspaces = workspaces or {}

        # 构建经理信息（智能查找）
        manager_info = ""
        manager_id = agent.get("manager_agent_id")

        if manager_id:
            # 1. 优先使用指定的 manager_agent_id
            manager = self._query_manager(manager_id)
        else:
            # 2. 如果没有指定，根据组织架构智能查找
            manager = self._find_manager_by_hierarchy(agent, position, department, company)

        if manager:
            manager_display = manager.get("display_name") or manager.get("name", "")
            manager_info = f"- **直属负责人**: {manager_display}\n"

        context = {
            "agent_id": agent.get("id", ""),
            "agent_name": agent.get("display_name") or agent.get("name", ""),
            "company_name": company.get("name", ""),
            "company_goal": company.get("goal", ""),
            "department_name": department.get("name", ""),
            "department_goal": department.get("goal", ""),
            "position_name": position.get("name", ""),
            "position_goal": position.get("goal") or "Follow the position responsibilities.",
            "position_responsibilities": position.get("responsibilities", ""),
            "agent_goal": agent.get("service_goal") or "Support the assigned position.",
            "manager_info": manager_info,
            "profile_home": profile_home,
            "agent_workspace": workspaces.get("agent", ""),
            "position_workspace": workspaces.get("position", ""),
            "department_workspace": workspaces.get("department", ""),
            "company_workspace": workspaces.get("company", ""),
            # 旧模板兼容字段（保留以支持自定义模板）
            "working_style": tpl.get("default_working_style") or self._DEFAULT_SECTIONS["working_style"],
            "output_preferences": tpl.get("default_output_preferences")
            or self._DEFAULT_SECTIONS["output_preferences"],
            "hard_rules": tpl.get("default_hard_rules") or self._DEFAULT_SECTIONS["hard_rules"],
        }

        base = tpl.get("base_soul_md") or self._default_template()
        body = base
        for key, value in context.items():
            body = body.replace("{{" + key + "}}", str(value))

        if prompt_snippets:
            body += "\n\n# Inherited Knowledge\n\n" + "\n\n---\n\n".join(prompt_snippets)
        if not body.endswith("\n"):
            body += "\n"
        return body

    @staticmethod
    def _default_template() -> str:
        """简化版 SOUL.md 模板（身份与技术能力分离）

        技术能力通过文件系统体现：
        - Skills 位于 profile_home/skills/ 目录（Python 自动发现）
        - Tools 配置在 profile_home/config.yaml 的 toolsets 字段
        """
        return (
            "# {{agent_name}}\n"
            "\n"
            "## 身份信息\n"
            "- **员工编号**: {{agent_id}}\n"
            "- **岗位**: {{position_name}}\n"
            "- **部门**: {{department_name}}\n"
            "- **公司**: {{company_name}}\n"
            "{{manager_info}}"
            "\n"
            "## 职责描述\n"
            "{{position_responsibilities}}\n"
            "\n"
            "## 服务目标\n"
            "{{agent_goal}}\n"
            "\n"
            "## 工作空间\n"
            "\n"
            "### Profile 目录（运行时环境）\n"
            "- **位置**: `{{profile_home}}`\n"
            "- **包含**: 配置、会话、记忆、技能、日志\n"
            "\n"
            "### Workspace 目录（工作成果）\n"
            "- **个人工作区**: `{{agent_workspace}}`\n"
            "- **岗位空间**: `{{position_workspace}}`\n"
            "- **部门空间**: `{{department_workspace}}`\n"
            "- **公司空间**: `{{company_workspace}}`\n"
            "\n"
            "---\n"
            "\n"
            "⚙️ **技术能力**:\n"
            "- Skills 位于 `skills/` 目录（Python 自动发现）\n"
            "- Tools 配置见 `config.yaml` 的 `toolsets` 字段\n"
        )


class ProfileProvisionService:
    """Provision a sub-agent's profile using three truth sources.

    Pipeline (see design doc §16.1 and §16.10):
      1. Load agent/position/department/company from SQLite.
      2. Run BootstrapValidator → abort early as ``blocked`` on issues.
      3. Resolve the Profile Template with precedence fallback.
      4. Collect master agent inheritable assets (visibility=public).
      5. Apply each asset according to its inherit_mode (copy/merge/inject).
      6. Render SOUL.md from (template + snippets + organization rows).
      7. Write organization.json metadata for runtime consumers.
    """

    def __init__(
        self,
        store: OrganizationStore,
        profiles: ProfileAgentRepository,
        soul_renderer: SoulRenderService,
        *,
        templates: ProfileTemplateRepository | None = None,
        assets: MasterAgentAssetRepository | None = None,
        validator: BootstrapValidator | None = None,
        applier: InheritanceApplier | None = None,
    ):
        self.store = store
        self.profiles = profiles
        self.soul_renderer = soul_renderer
        self.templates = templates or ProfileTemplateRepository(store)
        self.assets = assets or MasterAgentAssetRepository(store)
        self.validator = validator or BootstrapValidator(
            store,
            templates=self.templates,
            assets=self.assets,
        )
        self.applier = applier or InheritanceApplier()

    # ----------------------------------------------------------------- utils

    def profile_name(self, agent_id: int) -> str:
        return f"org-{agent_id}"

    def profile_home(self, profile_name: str) -> Path:
        return self.store.org_root / "profiles" / profile_name

    def bootstrap_issues(
        self,
        position: dict[str, Any],
        conn: sqlite3.Connection,
    ) -> list[str]:
        result = self.validator.validate_position(position["id"], conn)
        return result.required_messages

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

    # --------------------------------------------------------------- provision

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

        # Step 1 & 2: run full dynamic validation (also persists rows).
        verdict = self.validator.validate_position(position["id"], conn)
        if not verdict.can_bootstrap:
            return self._mark_profile(
                profile["id"],
                "blocked",
                "; ".join(verdict.required_messages) or "Bootstrap requirements unmet",
                conn,
            )

        profile_home = Path(profile["profile_home"])
        profile_home.mkdir(parents=True, exist_ok=True)
        for child in ("memories", "sessions", "skills", "logs", "cron"):
            (profile_home / child).mkdir(parents=True, exist_ok=True)

        # Step 2.5: 创建 4 层 Workspace 目录结构
        workspaces_root = self.store.org_root / "workspaces"
        agent_ws_path = Path(agent["workspace_path"]) if agent.get("workspace_path") else None
        position_ws_path = Path(position["workspace_path"]) if position.get("workspace_path") else None
        department_ws_path = Path(department["workspace_path"]) if department.get("workspace_path") else None
        company_ws_path = Path(company["workspace_path"]) if company.get("workspace_path") else None

        # Agent workspace
        if agent_ws_path:
            (agent_ws_path / "outputs").mkdir(parents=True, exist_ok=True)
            (agent_ws_path / "reports").mkdir(parents=True, exist_ok=True)

        # Position workspace (templates)
        if position_ws_path:
            (position_ws_path / "templates").mkdir(parents=True, exist_ok=True)

        # Department workspace (shared_resources)
        if department_ws_path:
            (department_ws_path / "shared_resources").mkdir(parents=True, exist_ok=True)

        # Company workspace (shared_resources)
        if company_ws_path:
            (company_ws_path / "shared_resources").mkdir(parents=True, exist_ok=True)

        # Step 3: resolve template (verdict.template already ran the fallback).
        template = verdict.template

        # Step 4 + 5: apply inheritable assets.
        inheritable = self.assets.list_inheritable(conn)
        context = InheritContext(
            profile_home=profile_home,
            agent_workspace=agent_ws_path,
        )
        inheritance_result: InheritanceResult = self.applier.apply(inheritable, context)

        # Step 6: render SOUL.md using template + inject_prompt snippets + workspace paths.
        workspaces = {
            "agent": str(agent_ws_path) if agent_ws_path else "",
            "position": str(position_ws_path) if position_ws_path else "",
            "department": str(department_ws_path) if department_ws_path else "",
            "company": str(company_ws_path) if company_ws_path else "",
        }
        soul = self.soul_renderer.render(
            company,
            department,
            position,
            agent,
            template=template,
            prompt_snippets=inheritance_result.prompt_snippets,
            profile_home=str(profile_home),
            workspaces=workspaces,
        )
        Path(profile["soul_path"]).write_text(soul, encoding="utf-8")

        # Step 7: emit organization.json for runtime consumers. We no longer
        # clobber the merged config.yaml written by the inheritance applier;
        # organization metadata lives in its own file.
        organization_meta = {
            "organization": {
                "company_id": company["id"],
                "department_id": department["id"],
                "position_id": position["id"],
                "agent_id": agent["id"],
                "company_name": company.get("name"),
                "department_name": department.get("name"),
                "position_name": position.get("name"),
                "agent_name": agent.get("name"),
            },
            "template_key": template.get("template_key") if template else None,
            "inheritance": {
                "applied": inheritance_result.applied,
                "skipped": inheritance_result.skipped,
            },
        }
        (profile_home / "organization.json").write_text(
            json.dumps(organization_meta, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        # Step 8: 生成 Sub Agent 的 config.yaml（继承主 Agent 配置并覆盖特定设置）
        self._generate_sub_agent_config(profile_home, agent)

        # Step 9: 复制主 Agent 的 .env 文件到 Sub Agent profile
        self._copy_env_file(profile_home)

        return self._mark_profile(profile["id"], "ready", None, conn)

    def _get_required(self, table: str, item_id: int, conn: sqlite3.Connection) -> dict[str, Any]:
        row = self.store.query_one(f"SELECT * FROM {table} WHERE id = ?", (item_id,), conn)
        if not row:
            raise OrganizationError(f"{table[:-1].replace('_', ' ')} not found", 404)
        return row

    def _generate_sub_agent_config(self, profile_home: Path, agent: dict[str, Any]) -> None:
        """生成 Sub Agent 的 config.yaml（继承主 Agent 配置并覆盖特定设置）

        Args:
            profile_home: Sub Agent 的 profile 主目录
            agent: Agent 记录（包含 id、name 等信息）

        继承策略：
        - 继承主 Agent 的大部分配置（model、providers、toolsets、agent settings 等）
        - 覆盖 logging 路径（使用 Sub Agent 自己的 logs/）
        - 覆盖 platforms 配置（Sub Agent 只启用 api_server，不需要 discord/telegram 等）
        - 端口通过环境变量 API_SERVER_PORT 动态设置（不在 config.yaml 中硬编码）
        """
        try:
            # 1. 读取主 Agent 的 config.yaml
            main_hermes_home = get_hermes_home()
            main_config_path = main_hermes_home / "config.yaml"

            if not main_config_path.exists():
                # 主 Agent 无配置文件，使用最小默认配置
                sub_agent_config = {
                    "model": "claude-sonnet-4-6",
                    "toolsets": ["hermes-cli"],
                    "agent": {
                        "max_turns": 90,
                        "gateway_timeout": 1800,
                    },
                }
            else:
                # 读取并继承主 Agent 配置
                with open(main_config_path, "r", encoding="utf-8") as f:
                    main_config = yaml.safe_load(f) or {}

                # 深拷贝主配置（避免修改原对象）
                sub_agent_config = json.loads(json.dumps(main_config))

            # 2. 覆盖 Sub Agent 特定配置

            # 2.1 logging: 使用 Sub Agent 自己的 logs/ 目录
            if "logging" not in sub_agent_config:
                sub_agent_config["logging"] = {}
            sub_agent_config["logging"]["log_dir"] = str(profile_home / "logs")
            sub_agent_config["logging"]["log_file"] = f"sub-agent-{agent['id']}.log"

            # 2.2 platforms: Sub Agent 只启用 api_server
            # - 移除 discord、telegram、slack 等平台配置
            # - api_server 的端口通过环境变量 API_SERVER_PORT 动态设置（不硬编码）
            sub_agent_config["platforms"] = {
                "api_server": {
                    "enabled": True,
                    # 端口由环境变量 API_SERVER_PORT 设置，不在配置文件中指定
                    "host": "127.0.0.1",
                    "cors_origins": ["*"],  # Sub Agent 通常只被主 Agent 调用，允许所有来源
                }
            }

            # 2.3 禁用不必要的功能（Sub Agent 不需要）
            if "dashboard" in sub_agent_config:
                sub_agent_config["dashboard"]["enabled"] = False  # Sub Agent 不需要 Dashboard UI

            if "tts" in sub_agent_config:
                sub_agent_config["tts"]["enabled"] = False  # Sub Agent 不需要 TTS

            # 3. 写入 Sub Agent 的 config.yaml
            config_path = profile_home / "config.yaml"
            with open(config_path, "w", encoding="utf-8") as f:
                yaml.dump(sub_agent_config, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

            # 设置文件权限（仅所有者可读写）
            config_path.chmod(0o600)

        except Exception as e:
            # 配置文件生成失败不应阻断 Profile 创建，记录错误即可
            import hermes_logging
            logger = hermes_logging.get_logger(__name__)
            logger.warning(f"Failed to generate Sub Agent config.yaml: {e}")

    def _copy_env_file(self, profile_home: Path) -> None:
        """复制主 Agent 的 .env 文件到 Sub Agent profile

        Args:
            profile_home: Sub Agent 的 profile 主目录

        ⚠️ .env 包含 API keys（ANTHROPIC_API_KEY、OPENROUTER_API_KEY 等），
        Sub Agent 必须继承才能正常调用 LLM。
        """
        try:
            # 1. 读取主 Agent 的 .env 路径
            main_hermes_home = get_hermes_home()
            main_env_path = main_hermes_home / ".env"

            # 2. 如果主 Agent 没有 .env 文件，跳过（不影响 Profile 创建）
            if not main_env_path.exists():
                import hermes_logging
                logger = hermes_logging.get_logger(__name__)
                logger.warning("Main Agent .env not found, Sub Agent may lack API keys")
                return

            # 3. 复制 .env 到 Sub Agent profile
            sub_env_path = profile_home / ".env"
            shutil.copy2(main_env_path, sub_env_path)

            # 4. 设置文件权限（仅所有者可读写，敏感文件）
            sub_env_path.chmod(0o600)

        except Exception as e:
            # .env 复制失败不应阻断 Profile 创建，记录错误即可
            import hermes_logging
            logger = hermes_logging.get_logger(__name__)
            logger.warning(f"Failed to copy .env file: {e}")

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
        self.master_assets = MasterAgentAssetRepository(self.store)
        self.bootstrap_requirements = SubagentBootstrapRequirementRepository(self.store)
        self.profile_templates = ProfileTemplateRepository(self.store)
        self.workspace_service = WorkspaceProvisionService(self.store, self.workspaces)
        self.asset_scanner = MasterAgentAssetScanner(self.store, self.master_assets)
        self.validator = BootstrapValidator(
            self.store,
            templates=self.profile_templates,
            assets=self.master_assets,
            requirements=self.bootstrap_requirements,
        )
        self.inheritance = InheritanceApplier()
        self.profile_service = ProfileProvisionService(
            self.store,
            self.profile_agents,
            SoulRenderService(self.store),
            templates=self.profile_templates,
            assets=self.master_assets,
            validator=self.validator,
            applier=self.inheritance,
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

    # ----------------------------------------- master_agent_assets management

    def refresh_master_assets(self) -> dict[str, Any]:
        """Run the scanner and return the report (scanned / created / ...)."""
        report: ScanReport = self.asset_scanner.scan()
        return report.as_dict()

    def list_master_assets(
        self,
        *,
        asset_type: str | None = None,
        visibility: str | None = None,
        inheritable_only: bool = False,
    ) -> list[dict[str, Any]]:
        if inheritable_only:
            return self.master_assets.list_inheritable()
        return self.master_assets.list(
            asset_type=asset_type,
            visibility=visibility,
        )

    def update_master_asset(self, asset_id: int, data: dict[str, Any]) -> dict[str, Any]:
        _ALLOWED = {
            "visibility",
            "inherit_mode",
            "target_path_template",
            "is_runtime_required",
            "is_bootstrap_required",
            "description",
            "status",
        }
        payload = {k: v for k, v in data.items() if k in _ALLOWED}
        if "visibility" in payload and payload["visibility"] not in {"public", "private"}:
            raise OrganizationError("visibility must be 'public' or 'private'")
        if "inherit_mode" in payload and payload["inherit_mode"] not in {
            "copy_to_workspace",
            "copy_to_profile",
            "merge_config",
            "inject_prompt",
        }:
            raise OrganizationError(
                "inherit_mode must be one of copy_to_workspace/copy_to_profile/"
                "merge_config/inject_prompt"
            )
        if "is_runtime_required" in payload:
            payload["is_runtime_required"] = 1 if payload["is_runtime_required"] else 0
        if "is_bootstrap_required" in payload:
            payload["is_bootstrap_required"] = 1 if payload["is_bootstrap_required"] else 0

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.master_assets.get(asset_id, conn):
                raise OrganizationError("Master asset not found", 404)
            result = self.master_assets.patch(asset_id, payload, conn)
            if not result:
                raise OrganizationError("Master asset not found", 404)
            return result

        return self.store.transaction(tx)

    def set_provider_visibility(
        self,
        provider_id: str,
        visibility: str,
    ) -> dict[str, Any]:
        """Flip the Public / Private toggle for a single provider asset row.

        Validation rules (enforced here, not in the generic ``update_master_asset``):
          * ``provider_id`` must be a registered id in ``PROVIDER_ENV_KEYS`` —
            prevents operators from creating arbitrary rows via the API.
          * ``visibility`` must be ``public`` or ``private``.
          * A provider may only be set to ``public`` if ``inherit_ready == 1``
            (i.e. the master agent has at least one key configured for it).
            This protects the bootstrap flow from promising keys that do not
            actually exist.
        """
        if visibility not in {"public", "private"}:
            raise OrganizationError("visibility must be 'public' or 'private'")
        if not is_provider_id_valid(provider_id):
            raise OrganizationError(
                f"Unknown provider id: {provider_id!r}", 404
            )

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            asset = self.master_assets.get_by_key(
                "env_provider", provider_id, conn
            )
            if not asset:
                raise OrganizationError(
                    f"Provider asset not found for {provider_id!r}. "
                    "Run refresh_master_assets first.",
                    404,
                )
            if visibility == "public" and not asset.get("inherit_ready"):
                raise OrganizationError(
                    f"Provider {provider_id!r} has no configured keys; "
                    "cannot mark as public.",
                    400,
                )
            result = self.master_assets.patch(
                asset["id"], {"visibility": visibility}, conn
            )
            if not result:
                raise OrganizationError("Master asset not found", 404)
            return result

        return self.store.transaction(tx)

    # ----------------------------------------------------- bootstrap checking

    def bootstrap_check_position(self, position_id: int) -> dict[str, Any]:
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.positions.get(position_id, conn):
                raise OrganizationError("Position not found", 404)
            result: BootstrapResult = self.validator.validate_position(position_id, conn)
            return result.as_dict()

        return self.store.transaction(tx)

    # ------------------------------------------- profile_templates management

    def list_profile_templates(
        self,
        *,
        scope_type: str | None = None,
        scope_id: int | None = None,
    ) -> list[dict[str, Any]]:
        return self.profile_templates.list(scope_type=scope_type, scope_id=scope_id)

    def create_profile_template(self, data: dict[str, Any]) -> dict[str, Any]:
        _require(data, "template_key", "name")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if self.profile_templates.get_by_key(data["template_key"], conn):
                raise OrganizationError("template_key already exists", 409)
            return self.profile_templates.create(data, conn)

        return self.store.transaction(tx)

    def update_profile_template(
        self,
        template_id: int,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.profile_templates.get(template_id, conn):
                raise OrganizationError("Profile template not found", 404)
            updated = self.profile_templates.patch(template_id, data, conn)
            if not updated:
                raise OrganizationError("Profile template not found", 404)
            return updated

        return self.store.transaction(tx)

    def delete_profile_template(self, template_id: int) -> dict[str, Any]:
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            if not self.profile_templates.get(template_id, conn):
                raise OrganizationError("Profile template not found", 404)
            self.profile_templates.delete(template_id, conn)
            return {"deleted": template_id}

        return self.store.transaction(tx)

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
