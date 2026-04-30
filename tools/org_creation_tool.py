"""Organization Creation Tools

This module provides tools for creating organization elements:
- Departments, Positions, and Agents.

Tools call OrganizationService which handles:
- Parameter validation (_require())
- Workspace initialization (workspace_service.ensure_workspace())
- Agent Profile setup (profile_service.create_metadata() + agent_provision.provision_profile())"""

import json
import logging
from typing import Any, Dict

from tools.registry import registry

logger = logging.getLogger(__name__)


def _get_org_service():
    """Get OrganizationService instance."""
    from gateway.org.store import OrganizationStore
    from gateway.org.services import OrganizationService

    store = OrganizationStore()
    service = OrganizationService(store)
    return service


# ============================================================
# 1. create_department
# ============================================================

DEPT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_department",
        "description": "Create a department. Calls AgentProvisionService.create_department() with workspace auto-initialization. Available to root agent and department managers.",
        "parameters": {
            "type": "object",
            "properties": {
                "company_id": {"type": "integer", "description": "Company ID this department belongs to"},
                "name": {"type": "string", "description": "Department name"},
                "goal": {"type": "string", "description": "Department goal/purpose"},
                "description": {"type": "string", "description": "Department description (optional)"},
                "parent_id": {"type": "integer", "description": "Parent department ID for multi-level hierarchy (optional)"},
            },
            "required": ["company_id", "name", "goal"],
        },
    },
}


def create_department(
    company_id: int,
    name: str,
    goal: str,
    description: str = "",
    parent_id: int = None,
    parent_agent=None,
) -> str:
    """
    [创建部门] 调用 OrganizationService.create_department()。

    Args:
        company_id: 所属公司 ID
        name: 部门名称
        goal: 部门目标
        description: 部门描述（可选）
        parent_id: 上级部门 ID（可选，支持多级部门）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含创建的部门详情
    """
    try:
        service = _get_org_service()
        result = service.create_department({
            "company_id": company_id,
            "name": name,
            "goal": goal,
            "description": description,
            "parent_id": parent_id,
        })
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error creating department")
        return json.dumps({"error": f"Failed to create department: {e}"}, ensure_ascii=False)


registry.register(
    name="create_department",
    toolset="org_creation",
    schema=DEPT_SCHEMA,
    handler=lambda args, **kw: create_department(
        company_id=args.get("company_id"),
        name=args.get("name"),
        goal=args.get("goal"),
        description=args.get("description", ""),
        parent_id=args.get("parent_id"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=lambda: True,
    emoji="🏢",
)

# ============================================================
# 2. create_position
# ============================================================

POS_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_position",
        "description": "Create a position in a department. Calls AgentProvisionService.create_position() with workspace auto-initialization.",
        "parameters": {
            "type": "object",
            "properties": {
                "department_id": {"type": "integer", "description": "Department ID this position belongs to"},
                "name": {"type": "string", "description": "Position name (e.g., Software Engineer)"},
                "responsibilities": {"type": "string", "description": "Position responsibilities and duties"},
                "is_management_position": {"type": "boolean", "description": "Whether this is a management position", "default": False},
                "headcount": {"type": "integer", "description": "Headcount quota (optional)"},
            },
            "required": ["department_id", "name", "responsibilities"],
        },
    },
}


def create_position(
    department_id: int,
    name: str,
    responsibilities: str,
    is_management_position: bool = False,
    headcount: int = None,
    parent_agent=None,
) -> str:
    """
    [创建岗位] 调用 OrganizationService.create_position()。

    Args:
        department_id: 所属部门 ID
        name: 岗位名称
        responsibilities: 岗位职责
        is_management_position: 是否管理岗位（默认 False）
        headcount: 编制人数（可选）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含创建的岗位详情
    """
    try:
        service = _get_org_service()
        result = service.create_position({
            "department_id": department_id,
            "name": name,
            "responsibilities": responsibilities,
            "is_management_position": is_management_position,
            "headcount": headcount,
        })
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error creating position")
        return json.dumps({"error": f"Failed to create position: {e}"}, ensure_ascii=False)


registry.register(
    name="create_position",
    toolset="org_creation",
    schema=POS_SCHEMA,
    handler=lambda args, **kw: create_position(
        department_id=args.get("department_id"),
        name=args.get("name"),
        responsibilities=args.get("responsibilities"),
        is_management_position=args.get("is_management_position", False),
        headcount=args.get("headcount"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=lambda: True,
    emoji="📋",
)

# ============================================================
# 3. create_agent
# ============================================================

AGENT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_agent",
        "description": "Create an agent. Calls AgentProvisionService.create_agent() with profile auto-configuration and workspace initialization.",
        "parameters": {
            "type": "object",
            "properties": {
                "position_id": {"type": "integer", "description": "Position ID this agent belongs to"},
                "name": {"type": "string", "description": "Agent name/identifier"},
                "role_summary": {"type": "string", "description": "Brief summary of the agent's role"},
                "manager_agent_id": {"type": "integer", "description": "Direct manager agent ID (optional)"},
                "employee_no": {"type": "string", "description": "Employee number (optional)"},
            },
            "required": ["position_id", "name", "role_summary"],
        },
    },
}


def create_agent(
    position_id: int,
    name: str,
    role_summary: str,
    manager_agent_id: int = None,
    employee_no: str = None,
    parent_agent=None,
) -> str:
    """
    [创建 Agent] 调用 OrganizationService.create_agent()。

    Args:
        position_id: 所属岗位 ID
        name: Agent 名称
        role_summary: 角色摘要
        manager_agent_id: 直属管理者 ID（可选）
        employee_no: 工号（可选）
        parent_agent: 调用此工具的父 Agent（自动注入）

    Returns:
        JSON 字符串包含创建的 Agent 详情（含 profile 信息）
    """
    try:
        service = _get_org_service()
        result = service.create_agent({
            "position_id": position_id,
            "name": name,
            "role_summary": role_summary,
            "manager_agent_id": manager_agent_id,
            "employee_no": employee_no,
        })
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.exception("Error creating agent")
        return json.dumps({"error": f"Failed to create agent: {e}"}, ensure_ascii=False)


registry.register(
    name="create_agent",
    toolset="org_creation",
    schema=AGENT_SCHEMA,
    handler=lambda args, **kw: create_agent(
        position_id=args.get("position_id"),
        name=args.get("name"),
        role_summary=args.get("role_summary"),
        manager_agent_id=args.get("manager_agent_id"),
        employee_no=args.get("employee_no"),
        parent_agent=kw.get("parent_agent"),
    ),
    check_fn=lambda: True,
    emoji="🤖",
)