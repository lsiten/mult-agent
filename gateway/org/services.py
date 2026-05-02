"""Domain services for organization orchestration."""

from __future__ import annotations

import json
import logging
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
    AgentPermissionRepository,
    AgentRepository,
    CompanyRepository,
    DepartmentRepository,
    DirectorOfficeRepository,
    MasterAgentAssetRepository,
    OrganizationStore,
    PositionRepository,
    ProfileAgentRepository,
    ProfileTemplateRepository,
    SubagentBootstrapRequirementRepository,
    TaskRepository,
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


logger = logging.getLogger(__name__)


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

        # 构建领导角色信息
        leadership_role = agent.get("leadership_role", "none")
        leadership_role_info = ""
        if leadership_role == "primary":
            leadership_role_info = "- **角色**: 主负责人 👑\n"
        elif leadership_role == "deputy":
            leadership_role_info = "- **角色**: 副负责人 🎖️\n"

        # 岗位管理标识
        position_management_badge = ""
        if position.get("is_management_position"):
            position_management_badge = " 👔（管理岗位）"

        # 角色特定的系统提示部分
        is_manager = bool(position.get("is_management_position")) or leadership_role in ("primary", "deputy")
        organization_role_section = self._render_organization_role_section(is_manager, agent)

        # org.db 路径
        org_db_path = str(self.store.db_path)

        context = {
            # 基本身份信息
            "agent_id": agent.get("id", ""),
            "agent_name": agent.get("display_name") or agent.get("name", ""),
            "company_id": company.get("id", ""),
            "company_name": company.get("name", ""),
            "company_goal": company.get("goal", ""),
            "department_id": department.get("id", ""),
            "department_name": department.get("name", ""),
            "department_goal": department.get("goal", ""),
            "position_id": position.get("id", ""),
            "position_name": position.get("name", ""),
            "position_goal": position.get("goal") or "Follow the position responsibilities.",
            "position_responsibilities": position.get("responsibilities", ""),
            "position_management_badge": position_management_badge,
            "agent_goal": agent.get("service_goal") or "Support the assigned position.",
            "leadership_role_info": leadership_role_info,
            # 组织角色特定内容
            "organization_role_section": organization_role_section,
            # 组织架构查询信息
            "org_db_path": org_db_path,
            # 工作空间路径
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

    def _render_organization_role_section(self, is_manager: bool, agent: dict[str, Any]) -> str:
        """根据角色渲染组织协作相关的系统提示。

        Args:
            is_manager: 是否是管理者
            agent: Agent 信息

        Returns:
            Markdown 格式的角色特定系统提示
        """
        if is_manager:
            return self._render_manager_section(agent)
        else:
            return self._render_contributor_section(agent)

    def _render_manager_section(self, agent: dict[str, Any]) -> str:
        """渲染管理者角色的专属系统提示。"""
        agent_name = agent.get("display_name") or agent.get("name", "Agent")
        return f"""
# 管理者工作指南

👔 **你是 {agent_name}，一位管理者**

作为团队管理者，你拥有以下专属工具和能力：

## 1. 任务分配与拆解
- **assign_task_to_subordinate**: 为你的直属下属分配任务
- **list_my_subordinates**: 查看团队成员及工作负载
- **可以将大任务拆解成子任务**，分配给不同的团队成员

**任务分配原则**：
- 先了解下属的技能和当前工作负载
- 每个任务要有明确的验收标准和截止时间
- 大型任务要拆解成可管理的小任务

## 2. 任务审批与质量控制
- **approve_task**: 审批下属提交的任务成果
- **可以要求修改、拒绝或批准任务**
- 保持高标准的产出质量

**审批流程**：
1. 审阅提交的内容和成果
2. 检查是否符合要求和验收标准
3. 给出具体的反馈意见
4. 做出 approve/reject/request_changes 决定

## 3. 团队协作与文件共享
- **share_file_with_subordinate**: 将你的工作文件共享给下属
- 可以共享参考文档、模板、数据文件等
- 所有共享的文件存放在下属的 shared_from_manager 目录

## 4. 任务跟踪与汇报
- **list_my_tasks**: 查看所有你创建的任务及其状态
- 定期检查任务进度
- 及时解决团队遇到的问题和障碍

## 5. 向上汇报
- 定期向你的上级汇报团队整体工作进度
- 汇总下属的工作成果
- 及时汇报风险和需要协调的问题

## 管理原则
1. **清晰沟通**：任务描述要具体、明确，避免模糊不清
2. **合理分配**：根据下属能力和负载合理分配工作
3. **及时反馈**：定期检查进度，及时给出指导
4. **赋能团队**：提供必要的资源和支持，帮助团队成功
5. **责任担当**：对团队的整体产出负责

**记住**：优秀的管理者通过赋能他人达成目标，而不是自己完成所有工作。
"""

    def _render_contributor_section(self, agent: dict[str, Any]) -> str:
        """渲染普通员工角色的专属系统提示。"""
        agent_name = agent.get("display_name") or agent.get("name", "Agent")
        return f"""
# 执行者工作指南

👤 **你是 {agent_name}，一位团队执行者**

作为贡献者，你拥有以下专属工具和能力：

## 1. 任务接收与执行
- **list_my_tasks**: 查看分配给你的所有任务
- 任务状态说明：
  - `pending`: 待开始的任务
  - `in_progress`: 正在进行中的任务
  - `review`: 已提交，等待审批
  - `completed`: 已完成并通过审批
  - `rejected`: 被拒绝，需要重新处理

## 2. 进度与成果汇报
- **submit_task_report**: 向你的管理者汇报任务进度

**汇报类型**：
- **progress**: 定期进度更新（建议每周 1-2 次）
  - 说明已完成的工作
  - 遇到的问题和障碍
  - 下一步计划
  - 需要的支持和资源

- **final**: 最终成果提交（任务完成时）
  - 详细说明完成情况
  - 列出所有交付物和产出
  - 附加上下文和使用说明
  - 确保管理者可以快速验收

## 3. 使用共享资源
- 管理者会通过 share_file_with_subordinate 工具共享文件给你
- 共享文件存放在你的工作区 shared_from_manager 目录
- 可以自由读取和使用这些资源

## 4. 工作区管理
- 你的个人工作区：`{{agent_workspace}}`
- 任务特定的工作区：每个任务在 tasks/ 目录下有独立文件夹
- 产出文件请存放在对应任务的 outputs 目录

## 执行者原则
1. **主动沟通**：遇到问题及时向管理者反馈，不要等被问
2. **定期汇报**：保持进度透明，让管理者了解状态
3. **质量优先**：交付的成果要符合要求，有测试和验证
4. **文档完整**：产出要附带清晰的使用说明和上下文
5. **积极求助**：遇到阻碍及时寻求帮助和支持

**记住**：你的目标是高质量完成分配的任务，让管理者为你感到骄傲。
"""

    @staticmethod
    def _default_template() -> str:
        """动态组织架构版 SOUL.md 模板

        不写死组织关系，而是提供查询方法，让 Agent 动态查询：
        - 自己的直属负责人
        - 自己的直属下属（如果是负责人）
        - 同部门的管理岗位 Agent
        - 部门的管理部门

        技术能力通过文件系统体现：
        - Skills 位于 profile_home/skills/ 目录（Python 自动发现）
        - Tools 配置在 profile_home/config.yaml 的 toolsets 字段
        """
        return (
            "# {{agent_name}}\n"
            "\n"
            "## 身份信息\n"
            "- **员工编号**: {{agent_id}}\n"
            "- **岗位**: {{position_name}}{{position_management_badge}}\n"
            "- **部门**: {{department_name}}\n"
            "- **公司**: {{company_name}}\n"
            "{{leadership_role_info}}"
            "\n"
            "## 职责描述\n"
            "{{position_responsibilities}}\n"
            "\n"
            "## 服务目标\n"
            "{{agent_goal}}\n"
            "\n"
            "## 组织关系查询\n"
            "\n"
            "### 如何查询我的直属负责人？\n"
            "\n"
            "使用以下 SQLite 查询（org.db 位于 `{{org_db_path}}`）：\n"
            "\n"
            "```sql\n"
            "-- 方法 1: 如果有显式指定的负责人\n"
            "SELECT a.id, a.display_name, a.name, p.name AS position\n"
            "FROM agents a\n"
            "JOIN positions p ON a.position_id = p.id\n"
            "WHERE a.id = (\n"
            "  SELECT manager_agent_id FROM agents WHERE id = {{agent_id}}\n"
            ")\n"
            "AND a.status = 'active';\n"
            "\n"
            "-- 方法 2: 如果未指定，根据组织架构查找\n"
            "-- 优先级 1: 同岗位的负责人\n"
            "SELECT a.id, a.display_name, a.name, a.leadership_role\n"
            "FROM agents a\n"
            "WHERE a.position_id = (SELECT position_id FROM agents WHERE id = {{agent_id}})\n"
            "  AND a.id != {{agent_id}}\n"
            "  AND a.leadership_role IN ('primary', 'deputy')\n"
            "  AND a.status = 'active'\n"
            "ORDER BY CASE a.leadership_role\n"
            "  WHEN 'primary' THEN 1\n"
            "  WHEN 'deputy' THEN 2\n"
            "  ELSE 3 END\n"
            "LIMIT 1;\n"
            "\n"
            "-- 优先级 2: 本部门的管理岗位 Agent\n"
            "SELECT a.id, a.display_name, a.name, p.name AS position\n"
            "FROM agents a\n"
            "JOIN positions p ON a.position_id = p.id\n"
            "WHERE a.department_id = (SELECT department_id FROM agents WHERE id = {{agent_id}})\n"
            "  AND a.id != {{agent_id}}\n"
            "  AND p.is_management_position = 1\n"
            "  AND a.status = 'active'\n"
            "ORDER BY CASE a.leadership_role\n"
            "  WHEN 'primary' THEN 1\n"
            "  WHEN 'deputy' THEN 2\n"
            "  ELSE 3 END\n"
            "LIMIT 1;\n"
            "```\n"
            "\n"
            "### 如何查询我的直属下属？\n"
            "\n"
            "```sql\n"
            "-- 查询以我为负责人的 Agent\n"
            "SELECT a.id, a.display_name, a.name, p.name AS position\n"
            "FROM agents a\n"
            "JOIN positions p ON a.position_id = p.id\n"
            "WHERE a.manager_agent_id = {{agent_id}}\n"
            "  AND a.status = 'active'\n"
            "ORDER BY p.name, a.name;\n"
            "\n"
            "-- 如果我是管理岗位的负责人，查询本部门所有非管理岗位的 Agent\n"
            "SELECT a.id, a.display_name, a.name, p.name AS position\n"
            "FROM agents a\n"
            "JOIN positions p ON a.position_id = p.id\n"
            "WHERE a.department_id = (SELECT department_id FROM agents WHERE id = {{agent_id}})\n"
            "  AND a.id != {{agent_id}}\n"
            "  AND (p.is_management_position = 0 OR a.leadership_role = 'none')\n"
            "  AND a.status = 'active'\n"
            "ORDER BY p.name, a.name;\n"
            "```\n"
            "\n"
            "### 如何查询同部门的其他 Agent？\n"
            "\n"
            "```sql\n"
            "SELECT a.id, a.display_name, a.name, p.name AS position, a.leadership_role\n"
            "FROM agents a\n"
            "JOIN positions p ON a.position_id = p.id\n"
            "WHERE a.department_id = (SELECT department_id FROM agents WHERE id = {{agent_id}})\n"
            "  AND a.id != {{agent_id}}\n"
            "  AND a.status = 'active'\n"
            "ORDER BY \n"
            "  p.is_management_position DESC,\n"
            "  CASE a.leadership_role WHEN 'primary' THEN 1 WHEN 'deputy' THEN 2 ELSE 3 END,\n"
            "  p.name, a.name;\n"
            "```\n"
            "\n"
            "### 组织架构信息\n"
            "\n"
            "- **org.db 路径**: `{{org_db_path}}`\n"
            "- **我的 Agent ID**: {{agent_id}}\n"
            "- **我的岗位 ID**: {{position_id}}\n"
            "- **我的部门 ID**: {{department_id}}\n"
            "- **我的公司 ID**: {{company_id}}\n"
            "\n"
            "**使用建议**:\n"
            "- 需要向负责人汇报时，先查询负责人是谁\n"
            "- 需要分配任务给下属时，先查询下属列表\n"
            "- 组织关系会动态变化，每次查询确保使用最新数据\n"
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
            "- 组织架构查询使用 SQLite（见上方查询示例）\n"
            "\n"
            "{{organization_role_section}}\n"
        )


class ProfileProvisionService:
    """Provision a sub-agent's profile using three truth sources.

    Pipeline (see design doc §16.1 and §16.10):
      1. Load agent/position/department/company from SQLite.
      2. Run BootstrapValidator → abort early as ``blocked`` on issues.
      3. Resolve the Profile Template with precedence fallback.
      4. Collect master agent inheritable assets (visibility=public).
      5. Apply each asset according to its inherit_mode (copy/merge/inject).
      6. Initialize agent permissions based on role (manager/contributor).
      7. Render SOUL.md from (template + snippets + organization rows).
      8. Write organization.json metadata for runtime consumers.
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
        self.agent_permissions_repo = AgentPermissionRepository(store)

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

        # Step 6: Initialize agent permissions based on role
        # - If position is management position, give full management permissions
        # - If individual contributor, give only task execution permissions
        is_manager = bool(position.get("is_management_position")) or agent.get("leadership_role") in ("primary", "deputy")
        permissions = {
            "agent_id": agent_id,
            "can_assign_tasks": is_manager,
            "can_approve_tasks": is_manager,
            "can_create_subagents": is_manager,
            "max_subordinates": 10 if is_manager else None,
        }
        self.agent_permissions_repo.create_or_update(permissions, conn=conn)

        # Step 7: render SOUL.md using template + inject_prompt snippets + workspace paths.
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

        # Step 8: emit organization.json for runtime consumers. We no longer
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

        # Step 9: 生成 Sub Agent 的 config.yaml（继承主 Agent 配置并覆盖特定设置）
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
                logger.warning("Main Agent .env not found, Sub Agent may lack API keys")
                return

            # 3. 复制 .env 到 Sub Agent profile
            sub_env_path = profile_home / ".env"
            shutil.copy2(main_env_path, sub_env_path)

            # 4. 设置文件权限（仅所有者可读写，敏感文件）
            sub_env_path.chmod(0o600)

        except Exception as e:
            # .env 复制失败不应阻断 Profile 创建，记录错误即可
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
        self.tasks = TaskRepository(self.store)
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
        self.director_offices = DirectorOfficeRepository(self.store)

    def init_director_office(self, company_id: int, agent_count: int = 3) -> dict[str, Any]:
        """Initialize director office with specified number of director agents."""
        from .models import DirectorOffice

        # Director introductions based on role
        director_intros = {
            "CEO": """大家好，我是公司的 CEO（首席执行官）。

我的职责是：
- 制定公司的长期战略方向和愿景
- 负责整体业务决策和资源分配
- 协调各部门之间的协作
- 对公司的最终经营成果负责

我将带领团队确保公司战略目标的实现，并为大家提供必要的支持和资源保障。期待与大家共同打造一个高效、创新的组织！""",
            "CTO": """大家好，我是公司的 CTO（首席技术官）。

我的职责是：
- 负责技术战略规划和技术路线图制定
- 领导技术团队进行产品研发和技术创新
- 确保技术架构的可扩展性和安全性
- 管理技术债务和技术风险

我将为公司提供技术领导力，确保技术决策支持业务战略，并建立高效的研发流程和技术标准。期待与大家一起打造优秀的技术团队！""",
            "CFO": """大家好，我是公司的 CFO（首席财务官）。

我的职责是：
- 负责公司财务管理和财务战略制定
- 预算规划、成本控制和投资决策
- 财务风险评估和现金流管理
- 为战略决策提供财务分析支持

我将确保公司财务健康，为各部门提供必要的财务资源支持，并建立透明、高效的财务管理体系。期待与大家共同实现公司的财务目标！""",
            "COO": """大家好，我是公司的 COO（首席运营官）。

我的职责是：
- 负责公司日常运营管理和流程优化
- 建立高效的运营体系和管理制度
- 协调各部门执行公司战略
- 监控运营指标并持续改进

我将确保公司运营高效顺畅，建立标准化的工作流程，并协助各部门提升执行效率。期待与大家一起打造卓越的运营体系！""",
            "CMO": """大家好，我是公司的 CMO（首席营销官）。

我的职责是：
- 负责市场战略和品牌建设
- 制定营销策略和营销计划
- 管理营销团队和营销资源分配
- 监控市场动态和竞争环境

我将帮助公司建立强大的市场影响力，制定有效的营销策略，并确保营销投入带来良好的投资回报。期待与大家共同打造成功的品牌！"""
        }

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            # Check if already initialized
            existing = conn.execute(
                "SELECT id FROM director_offices WHERE company_id = ?",
                (company_id,),
            ).fetchone()
            if existing:
                raise OrganizationError(
                    f"Company {company_id} already has a director office initialized",
                    409
                )

            # 1. Create director office department
            dept_data = {
                "company_id": company_id,
                "name": "董事办",
                "goal": "公司战略决策与组织架构设计",
                "is_management_department": True
            }
            department = self.departments.create(dept_data, conn=conn)

            # 2. Define director roles (max agent_count)
            roles = ["CEO", "CTO", "CFO", "COO", "CMO"][:agent_count]

            # 3. Create positions and agents with proper introductions
            agents = []
            for i, role in enumerate(roles):
                position_data = {
                    "department_id": department["id"],
                    "name": f"{role}",
                    "responsibilities": director_intros[role],
                    "sort_order": i,
                }
                position = self.positions.create(position_data, conn=conn)

                agent_data = {
                    "company_id": company_id,
                    "department_id": department["id"],
                    "position_id": position["id"],
                    "name": role,
                    "display_name": role,
                    "role_summary": f"{role} 董事",
                    "service_goal": director_intros[role],
                }
                agent = self.agents.create(agent_data, conn=conn)
                agents.append(agent)

            # 4. Create director office record
            office_data = {
                "company_id": company_id,
                "department_id": department["id"],
                "office_name": "董事办",
                "responsibilities": "公司战略决策与组织架构设计"
            }
            office = self.director_offices.create(office_data, conn=conn)

            # 5. Provision profiles for all director agents so they can chat
            for agent in agents:
                self.agent_provision.provision_profile(agent["id"], conn=conn)

            return {
                "department_id": department["id"],
                "office_id": office["id"],
                "agents": agents,
                "roles": roles
            }

        return self.store.transaction(tx)

    def confirm_architecture(self, company_id: int, architecture: dict) -> dict[str, Any]:
        """Confirm and create organization structure from architecture diagram.

        Args:
            company_id: Company ID
            architecture: Dict with departments, positions, agents to create
                {
                    "departments": [
                        {"name": "技术部", "goal": "...", "parent_name": None},
                        ...
                    ],
                    "positions": [
                        {"department_name": "技术部", "name": "Frontend工程师", ...},
                        ...
                    ],
                    "agents": [
                        {"department_name": "技术部", "position_name": "Frontend工程师", "name": "..."},
                        ...
                    ]
                }

        Returns:
            {"created": {"departments": [...], "positions": [...], "agents": [...]}}
        """
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            created_depts = []
            created_positions = []
            created_agents = []

            # 1. Create departments
            dept_map = {}  # name -> id
            for dept_data in architecture.get("departments", []):
                # Find parent_id if parent_name provided
                parent_id = None
                if dept_data.get("parent_name"):
                    parent = self.store.query_one(
                        "SELECT id FROM departments WHERE company_id = ? AND name = ?",
                        (company_id, dept_data["parent_name"]),
                        conn=conn
                    )
                    if parent:
                        parent_id = parent["id"]

                data = {
                    "company_id": company_id,
                    "name": dept_data["name"],
                    "goal": dept_data.get("goal", ""),
                    "parent_id": parent_id
                }
                dept = self.departments.create(data, conn=conn)
                created_depts.append(dept)
                dept_map[dept["name"]] = dept["id"]

            # 2. Create positions
            for pos_data in architecture.get("positions", []):
                dept_id = dept_map.get(pos_data.get("department_name", ""))
                if not dept_id:
                    continue

                data = {
                    "department_id": dept_id,
                    "name": pos_data["name"],
                    "responsibilities": pos_data.get("responsibilities", ""),
                }
                position = self.positions.create(data, conn=conn)
                created_positions.append(position)

            # 3. Create agents
            for agent_data in architecture.get("agents", []):
                dept_id = dept_map.get(agent_data.get("department_name", ""))
                if not dept_id:
                    continue

                data = {
                    "company_id": company_id,
                    "department_id": dept_id,
                    "name": agent_data["name"],
                    "role_summary": agent_data.get("role_summary", ""),
                }
                agent = self.agents.create(data, conn=conn)
                created_agents.append(agent)

            return {
                "created": {
                    "departments": created_depts,
                    "positions": created_positions,
                    "agents": created_agents
                }
            }

        return self.store.transaction(tx)

    def _get_director_prompt(self, role: str) -> str:
        """Get system prompt for director agent."""
        prompts = {
            "CEO": """You are the CEO Agent. Given company info, design a PRACTICAL org structure.

Step 1: Ask 3 clarifying questions:
1. "What are the TOP 3 problems your current team faces?"
2. "How many people will the company have in the next 6 months?"
3. "Which function is MOST critical right now: tech, sales, or operations?"

Step 2: Propose 2-3 department options with reasoning.

Step 3: Output Mermaid diagram:
```mermaid
graph TD
    CEO[CEO] --> Dept1[Dept Name]
    CEO --> Dept2[Dept Name]
```

Step 4: Ask: "Does this solve your problems? What to adjust?"
""",
            "CTO": """You are the CTO Agent. Focus on technical departments.

After CEO's proposal, add technical dept recommendations:
- Frontend/Backend split?
- DevOps needs?
- How many engineers per team?

Update Mermaid diagram to include tech reporting structure.
""",
            "CFO": """You are the CFO Agent. Focus on financial structure.

After CEO/CTO's proposal, add financial dept recommendations:
- Finance Dept (budget tracking)
- HR Dept (hiring, payroll)

Update Mermaid to show budget flow.
""",
        }
        return prompts.get(role, "You are a director agent.")

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

        # Check which companies have director office already
        company_has_director_office: dict[int, bool] = {}
        director_offices = self.store.query_all("SELECT DISTINCT company_id FROM director_offices")
        for office in director_offices:
            company_has_director_office[office["company_id"]] = True

        result = []
        for company in companies:
            item = dict(company)
            item["departments"] = departments_by_company.get(company["id"], [])
            item["department_count"] = len(item["departments"])
            item["position_count"] = sum(d["position_count"] for d in item["departments"])
            item["agent_count"] = sum(d["agent_count"] for d in item["departments"])
            item["has_director_office"] = company_has_director_office.get(company["id"], False)
            result.append(item)
        return {"companies": result}

    def get_company_tree(self, company_id: int) -> dict[str, Any]:
        """Get full organization tree for a specific company only.

        Data isolation: only returns data that belongs to this company,
        no other companies' data is exposed.
        """
        # Get the specific company only
        company = self.store.query_one("SELECT * FROM companies WHERE id = ?", (company_id,))
        if not company:
            raise OrganizationError(f"Company {company_id} not found", 404)

        # Get ONLY departments that belong to this company (data isolation)
        departments = self.store.query_all(
            "SELECT * FROM departments WHERE company_id = ? ORDER BY sort_order, id",
            (company_id,)
        )
        # Get ONLY positions that belong to departments of this company
        department_ids = [d["id"] for d in departments]
        placeholders = ",".join("?" for _ in department_ids)
        positions = self.store.query_all(
            f"SELECT * FROM positions WHERE department_id IN ({placeholders}) ORDER BY sort_order, id",
            department_ids
        )
        # Get ONLY agents that belong to positions of this company
        position_ids = [p["id"] for p in positions]
        if position_ids:
            placeholders = ",".join("?" for _ in position_ids)
            agents = self.store.query_all(
                f"SELECT * FROM agents WHERE position_id IN ({placeholders}) ORDER BY name, id",
                position_ids
            )
            profiles = self.store.query_all(
                f"SELECT * FROM profile_agents WHERE agent_id IN ({placeholders})",
                position_ids
            )
        else:
            agents = []
            profiles = []

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

        # Check if company already has director office
        has_director_office = self.store.query_one(
            "SELECT id FROM director_offices WHERE company_id = ?",
            (company_id,)
        ) is not None

        # Build the company item with full tree
        item = dict(company)
        item["departments"] = []
        for department in departments:
            dept_item = dict(department)
            dept_item["positions"] = positions_by_department.get(department["id"], [])
            dept_item["position_count"] = len(dept_item["positions"])
            dept_item["agent_count"] = sum(p["agent_count"] for p in dept_item["positions"])
            item["departments"].append(dept_item)

        item["department_count"] = len(item["departments"])
        item["position_count"] = sum(d["position_count"] for d in item["departments"])
        item["agent_count"] = sum(d["agent_count"] for d in item["departments"])
        item["has_director_office"] = has_director_office

        return {"company": item}
    
    def get_company(self, company_id: int) -> dict[str, Any] | None:
        """Get company by ID."""
        return self.companies.get(company_id)
    
    def get_agents_by_department_name(self, company_id: int, department_name: str) -> list[dict[str, Any]]:
        """Get agents by department name within a company."""
        # First find the department by name and company_id
        department = self.store.query_one(
            "SELECT * FROM departments WHERE company_id = ? AND name = ?",
            (company_id, department_name)
        )
        if not department:
            return []
        
        # Get positions for this department
        positions = self.store.query_all(
            "SELECT id FROM positions WHERE department_id = ?",
            (department["id"],)
        )
        position_ids = [p["id"] for p in positions]
        
        if not position_ids:
            return []
        
        placeholders = ",".join("?" for _ in position_ids)
        agents = self.store.query_all(
            f"SELECT * FROM agents WHERE position_id IN ({placeholders}) ORDER BY sort_order, id",
            position_ids
        )
        return agents
    
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
            "sort_order", "status", "parent_id", "managing_department_id",
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
            "workspace_path", "sort_order", "status", "is_management_position",
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
            "accent_color", "enabled", "status", "leadership_role",
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

    def delete_company(self, company_id: int) -> dict[str, Any]:
        resources = self.store.transaction(
            lambda conn: self._delete_company_tx(company_id, conn)
        )
        self._cleanup_paths(resources)
        return {"deleted": company_id}

    def delete_department(self, department_id: int) -> dict[str, Any]:
        resources = self.store.transaction(
            lambda conn: self._delete_department_tx(department_id, conn)
        )
        self._cleanup_paths(resources)
        return {"deleted": department_id}

    def delete_position(self, position_id: int) -> dict[str, Any]:
        resources = self.store.transaction(
            lambda conn: self._delete_position_tx(position_id, conn)
        )
        self._cleanup_paths(resources)
        return {"deleted": position_id}

    def delete_agent(self, agent_id: int) -> dict[str, Any]:
        resources = self.store.transaction(
            lambda conn: self._delete_agent_tx(agent_id, conn)
        )
        self._cleanup_paths(resources)
        return {"deleted": agent_id}

    # ----------------------------------------- Task Operations

    def create_task(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a task and optionally route it through the workflow engine."""
        _require(data, "title", "creator_agent_id", "assignee_agent_id")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            # Create the task
            task = self.tasks.create(data, conn=conn)

            # Try to route via workflow engine
            from gateway.org.workflow_engine import WorkflowEngine
            engine = WorkflowEngine(self.store)
            match_result = engine.match_workflow(
                conn, task["creator_agent_id"], task["title"], task.get("description", "")
            )

            workflow_instance = None
            if match_result:
                instance = engine.create_instance(
                    match_result["workflow_id"],
                    match_result["company_id"],
                    task["id"],
                    match_result["current_department_id"],
                )
                if instance:
                    workflow_instance = instance

            return {"task": task, "workflow_instance": workflow_instance}

        return self.store.transaction(tx)

    def get_task(self, task_id: int) -> dict[str, Any]:
        """Get a task by ID."""
        task = self.tasks.get(task_id)
        if not task:
            raise OrganizationError(f"Task {task_id} not found", 404)
        return {"task": task}

    def update_task(self, task_id: int, data: dict[str, Any]) -> dict[str, Any]:
        """Update a task."""
        return self.store.transaction(
            lambda conn: self.tasks.update(task_id, data, conn=conn)
        )

    def delete_task(self, task_id: int) -> dict[str, Any]:
        """Delete a task."""
        return self.store.transaction(
            lambda conn: self.tasks.delete(task_id, conn=conn)
        )

    # ----------------------------------------- Quick Actions (快捷操作)

    def get_recommended_manager(self, agent_id: int) -> dict[str, Any] | None:
        """获取推荐的经理 Agent

        Args:
            agent_id: Agent ID

        Returns:
            推荐的经理 Agent 信息，如果没有返回 None
        """
        def tx(conn: sqlite3.Connection) -> dict[str, Any] | None:
            agent = self.agents.get(agent_id, conn)
            if not agent:
                raise OrganizationError("Agent not found", 404)

            # 如果已经有显式指定的经理，直接返回
            if agent.get("manager_agent_id"):
                return self.get_agent(agent["manager_agent_id"], conn)

            # 否则根据组织架构推荐
            position = self.positions.get(agent["position_id"], conn)
            department = self.departments.get(agent["department_id"], conn)
            company = self.companies.get(agent["company_id"], conn)

            if not all([position, department, company]):
                return None

            soul_service = SoulRenderService(self.store)
            manager = soul_service._find_manager_by_hierarchy(agent, position, department, company)

            if manager:
                return self.get_agent(manager["id"], conn)
            return None

        return self.store.transaction(tx)

    def set_agent_as_leader(
        self,
        agent_id: int,
        leadership_role: str,
    ) -> dict[str, Any]:
        """设置 Agent 为负责人

        Args:
            agent_id: Agent ID
            leadership_role: 'primary' | 'deputy' | 'none'

        Returns:
            更新后的 Agent 信息
        """
        if leadership_role not in {"primary", "deputy", "none"}:
            raise OrganizationError("leadership_role must be 'primary', 'deputy', or 'none'")

        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            agent = self.agents.get(agent_id, conn)
            if not agent:
                raise OrganizationError("Agent not found", 404)

            # 如果设置为 primary，需要检查同岗位是否已有 primary
            if leadership_role == "primary":
                existing_primary = self.store.query_one(
                    """
                    SELECT id, name FROM agents
                    WHERE position_id = ?
                      AND id != ?
                      AND leadership_role = 'primary'
                      AND status = 'active'
                    """,
                    (agent["position_id"], agent_id),
                    conn,
                )
                if existing_primary:
                    raise OrganizationError(
                        f"Position already has a primary leader: {existing_primary['name']} (ID: {existing_primary['id']})",
                        409,
                    )

            # 更新 leadership_role
            self.agents.update(agent_id, {"leadership_role": leadership_role}, {"leadership_role"}, conn)
            return self.get_agent(agent_id, conn)

        return self.store.transaction(tx)

    def set_position_as_management(
        self,
        position_id: int,
        is_management: bool = True,
    ) -> dict[str, Any]:
        """设置岗位为管理岗位

        Args:
            position_id: Position ID
            is_management: True 设置为管理岗位，False 取消

        Returns:
            更新后的 Position 信息
        """
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            position = self.positions.get(position_id, conn)
            if not position:
                raise OrganizationError("Position not found", 404)

            self.positions.update(
                position_id,
                {"is_management_position": 1 if is_management else 0},
                {"is_management_position"},
                conn,
            )
            return self.positions.get(position_id, conn) or position

        return self.store.transaction(tx)

    def set_department_as_management(
        self,
        department_id: int,
        is_management: bool = True,
    ) -> dict[str, Any]:
        """设置部门为管理部门

        Args:
            department_id: Department ID
            is_management: True 设置为管理部门，False 取消

        Returns:
            更新后的 Department 信息
        """
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            department = self.departments.get(department_id, conn)
            if not department:
                raise OrganizationError("Department not found", 404)

            self.departments.update(
                department_id,
                {"is_management_department": 1 if is_management else 0},
                {"is_management_department"},
                conn,
            )
            return self.departments.get(department_id, conn) or department

        return self.store.transaction(tx)

    def set_managing_department(
        self,
        department_id: int,
        managing_department_id: int | None,
    ) -> dict[str, Any]:
        """设置部门的管理部门

        Args:
            department_id: Department ID
            managing_department_id: 管理部门 ID，None 表示取消

        Returns:
            更新后的 Department 信息
        """
        def tx(conn: sqlite3.Connection) -> dict[str, Any]:
            department = self.departments.get(department_id, conn)
            if not department:
                raise OrganizationError("Department not found", 404)

            # 如果设置管理部门，检查目标部门是否存在
            if managing_department_id is not None:
                managing_dept = self.departments.get(managing_department_id, conn)
                if not managing_dept:
                    raise OrganizationError("Managing department not found", 404)

                # 防止自己管理自己
                if managing_department_id == department_id:
                    raise OrganizationError("Department cannot manage itself", 400)

                # 防止循环引用（简单检查：A→B，B不能→A）
                if managing_dept.get("managing_department_id") == department_id:
                    raise OrganizationError("Circular managing department reference", 400)

            self.departments.update(
                department_id,
                {"managing_department_id": managing_department_id},
                {"managing_department_id"},
                conn,
            )
            return self.departments.get(department_id, conn) or department

        return self.store.transaction(tx)

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

    def _delete_company_tx(
        self,
        company_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, list[str]]:
        if not self.companies.get(company_id, conn):
            raise OrganizationError("Company not found", 404)
        resources = self._collect_delete_resources("company", company_id, conn)
        self.store.execute(
            """
            DELETE FROM director_offices WHERE company_id = ?
            """,
            (company_id,),
            conn,
        )
        self.store.execute(
            """
            DELETE FROM workspaces
            WHERE (owner_type = 'company' AND owner_id = ?)
               OR (owner_type = 'department' AND owner_id IN (
                    SELECT id FROM departments WHERE company_id = ?
               ))
               OR (owner_type = 'position' AND owner_id IN (
                    SELECT p.id
                    FROM positions p
                    JOIN departments d ON d.id = p.department_id
                    WHERE d.company_id = ?
               ))
               OR (owner_type = 'agent' AND owner_id IN (
                    SELECT id FROM agents WHERE company_id = ?
               ))
            """,
            (company_id, company_id, company_id, company_id),
            conn,
        )
        self.companies.delete(company_id, conn)
        return resources

    def _delete_department_tx(
        self,
        department_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, list[str]]:
        if not self.departments.get(department_id, conn):
            raise OrganizationError("Department not found", 404)
        resources = self._collect_delete_resources("department", department_id, conn)
        self.store.execute(
            """
            DELETE FROM director_offices WHERE department_id = ?
            """,
            (department_id,),
            conn,
        )
        self.store.execute(
            """
            DELETE FROM workspaces
            WHERE (owner_type = 'department' AND owner_id = ?)
               OR (owner_type = 'position' AND owner_id IN (
                    SELECT id FROM positions WHERE department_id = ?
               ))
               OR (owner_type = 'agent' AND owner_id IN (
                    SELECT id FROM agents WHERE department_id = ?
               ))
            """,
            (department_id, department_id, department_id),
            conn,
        )
        self.departments.delete(department_id, conn)
        return resources

    def _delete_position_tx(
        self,
        position_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, list[str]]:
        if not self.positions.get(position_id, conn):
            raise OrganizationError("Position not found", 404)
        resources = self._collect_delete_resources("position", position_id, conn)
        self.store.execute(
            """
            DELETE FROM workspaces
            WHERE (owner_type = 'position' AND owner_id = ?)
               OR (owner_type = 'agent' AND owner_id IN (
                    SELECT id FROM agents WHERE position_id = ?
               ))
            """,
            (position_id, position_id),
            conn,
        )
        self.positions.delete(position_id, conn)
        return resources

    def _delete_agent_tx(
        self,
        agent_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, list[str]]:
        if not self.agents.get(agent_id, conn):
            raise OrganizationError("Agent not found", 404)
        resources = self._collect_delete_resources("agent", agent_id, conn)
        self.store.execute(
            "DELETE FROM workspaces WHERE owner_type = 'agent' AND owner_id = ?",
            (agent_id,),
            conn,
        )
        self.agents.delete(agent_id, conn)
        return resources

    def _collect_delete_resources(
        self,
        owner_type: str,
        owner_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, list[str]]:
        workspace_paths: list[str]
        profile_paths: list[str]

        if owner_type == "company":
            workspace_rows = self.store.query_all(
                """
                SELECT root_path FROM workspaces
                WHERE (owner_type = 'company' AND owner_id = ?)
                   OR (owner_type = 'department' AND owner_id IN (
                        SELECT id FROM departments WHERE company_id = ?
                   ))
                   OR (owner_type = 'position' AND owner_id IN (
                        SELECT p.id
                        FROM positions p
                        JOIN departments d ON d.id = p.department_id
                        WHERE d.company_id = ?
                   ))
                   OR (owner_type = 'agent' AND owner_id IN (
                        SELECT id FROM agents WHERE company_id = ?
                   ))
                """,
                (owner_id, owner_id, owner_id, owner_id),
                conn,
            )
            profile_rows = self.store.query_all(
                """
                SELECT pa.profile_home
                FROM profile_agents pa
                JOIN agents a ON a.id = pa.agent_id
                WHERE a.company_id = ?
                """,
                (owner_id,),
                conn,
            )
        elif owner_type == "department":
            workspace_rows = self.store.query_all(
                """
                SELECT root_path FROM workspaces
                WHERE (owner_type = 'department' AND owner_id = ?)
                   OR (owner_type = 'position' AND owner_id IN (
                        SELECT id FROM positions WHERE department_id = ?
                   ))
                   OR (owner_type = 'agent' AND owner_id IN (
                        SELECT id FROM agents WHERE department_id = ?
                   ))
                """,
                (owner_id, owner_id, owner_id),
                conn,
            )
            profile_rows = self.store.query_all(
                """
                SELECT pa.profile_home
                FROM profile_agents pa
                JOIN agents a ON a.id = pa.agent_id
                WHERE a.department_id = ?
                """,
                (owner_id,),
                conn,
            )
        elif owner_type == "position":
            workspace_rows = self.store.query_all(
                """
                SELECT root_path FROM workspaces
                WHERE (owner_type = 'position' AND owner_id = ?)
                   OR (owner_type = 'agent' AND owner_id IN (
                        SELECT id FROM agents WHERE position_id = ?
                   ))
                """,
                (owner_id, owner_id),
                conn,
            )
            profile_rows = self.store.query_all(
                """
                SELECT pa.profile_home
                FROM profile_agents pa
                JOIN agents a ON a.id = pa.agent_id
                WHERE a.position_id = ?
                """,
                (owner_id,),
                conn,
            )
        elif owner_type == "agent":
            workspace_rows = self.store.query_all(
                "SELECT root_path FROM workspaces WHERE owner_type = 'agent' AND owner_id = ?",
                (owner_id,),
                conn,
            )
            profile_rows = self.store.query_all(
                "SELECT profile_home FROM profile_agents WHERE agent_id = ?",
                (owner_id,),
                conn,
            )
        else:
            raise OrganizationError("Invalid delete owner type")

        workspace_paths = [row["root_path"] for row in workspace_rows if row.get("root_path")]
        profile_paths = [row["profile_home"] for row in profile_rows if row.get("profile_home")]
        return {
            "workspace_paths": self._dedupe_paths(workspace_paths),
            "profile_paths": self._dedupe_paths(profile_paths),
        }

    def _cleanup_paths(self, resources: dict[str, list[str]]) -> None:
        all_paths = self._dedupe_paths(
            [*resources.get("workspace_paths", []), *resources.get("profile_paths", [])]
        )
        for path_str in sorted(all_paths, key=len, reverse=True):
            managed_path = self._managed_path(path_str)
            if not managed_path:
                continue
            try:
                if managed_path.is_dir():
                    shutil.rmtree(managed_path)
                elif managed_path.exists():
                    managed_path.unlink()
            except FileNotFoundError:
                continue
            except Exception:
                logger.warning("Failed to delete organization path: %s", managed_path, exc_info=True)

    def _managed_path(self, raw_path: str) -> Path | None:
        if not raw_path:
            return None
        try:
            path = Path(raw_path).expanduser().resolve(strict=False)
            org_root = self.store.org_root.resolve(strict=False)
        except OSError:
            logger.warning("Failed to resolve organization path: %s", raw_path, exc_info=True)
            return None

        if path == org_root or org_root in path.parents:
            return path

        logger.info("Skip deleting unmanaged path outside org root: %s", raw_path)
        return None

    @staticmethod
    def _dedupe_paths(paths: list[str]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for path in paths:
            if not path or path in seen:
                continue
            seen.add(path)
            ordered.append(path)
        return ordered

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
