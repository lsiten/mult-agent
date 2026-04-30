# 组织架构创建工具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 3 个 Tool（`create_department`、`create_position`、`create_agent`），调用 `OrganizationService` 的现有方法，暴露给 Agent 创建组织架构元素。

**Architecture:** 新增 `tools/org_creation_tool.py`，Tool 内部初始化 `OrganizationService` 并调用其 `create_department()`、`create_position()`、`create_agent()` 方法。复用现有的数据库事务、工作区初始化、Profile 配置逻辑。

**Tech Stack:** Python 3.11+, SQLite (org.db), pytest

---

## 文件映射

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 创建 | `tools/org_creation_tool.py` | 3 个 Tool 实现 + registry 注册 |
| 创建 | `tests/tools/test_org_creation_tool.py` | Tool 单元测试 |
| 修改 | `toolsets.py` | 添加 `org_creation` toolset 定义（可选） |

---

### Task 1: 创建 `tools/org_creation_tool.py` 基础结构

**Files:**
- Create: `tools/org_creation_tool.py`

- [ ] **Step 1: 创建文件，写导入和辅助函数**

```python
"""Organization Creation Tools

This module provides tools for creating organization elements:
- Departments, Positions, and Agents.

Tools call OrganizationService which handles:
- Parameter validation (_require())
- Workspace initialization (workspace_service.ensure_workspace())
- Agent Profile setup (profile_service.create_metadata() + agent_provision.provision_profile())
"""

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
```

- [ ] **Step 2: 运行语法检查**

Run: `python -m py_compile tools/org_creation_tool.py`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add tools/org_creation_tool.py
git commit -m "feat(org): add org_creation_tool.py base structure"
```

---

### Task 2: 实现 `create_department` Tool

**Files:**
- Modify: `tools/org_creation_tool.py`

- [ ] **Step 1: 先写测试**

```python
"""Tests for organization creation tools."""

import json
import pytest
from unittest.mock import patch, MagicMock

from tools.org_creation_tool import create_department


class TestCreateDepartment:
    def test_create_department_success(self):
        """Test successful department creation."""
        mock_service = MagicMock()
        mock_service.create_department.return_value = {
            "id": 1,
            "company_id": 1,
            "name": "Engineering",
            "goal": "Build great products",
            "status": "active",
        }

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_department(
                company_id=1,
                name="Engineering",
                goal="Build great products",
            )
            result = json.loads(result_json)

        assert "error" not in result
        assert result["name"] == "Engineering"
        assert result["goal"] == "Build great products"
        mock_service.create_department.assert_called_once()

    def test_create_department_with_optional_params(self):
        """Test department creation with optional parameters."""
        mock_service = MagicMock()
        mock_service.create_department.return_value = {"id": 2, "name": "Sales"}

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_department(
                company_id=1,
                name="Sales",
                goal="Drive revenue",
                description="Sales department",
                parent_id=1,
            )
            result = json.loads(result_json)

        assert result["name"] == "Sales"
        call_args = mock_service.create_department.call_args[0][0]
        assert call_args["description"] == "Sales department"
        assert call_args["parent_id"] == 1
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreateDepartment -v`
Expected: FAIL with "ModuleNotFoundError" or "ImportError"

- [ ] **Step 3: 实现 `create_department` Tool**

在 `tools/org_creation_tool.py` 中添加：

```python
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


# Register tool
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
```

- [ ] **Step 4: 运行测试，验证通过**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreateDepartment -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/org_creation_tool.py tests/tools/test_org_creation_tool.py
git commit -m "feat(org): implement create_department tool"
```

---

### Task 3: 实现 `create_position` Tool

**Files:**
- Modify: `tools/org_creation_tool.py`

- [ ] **Step 1: 写测试**

在 `tests/tools/test_org_creation_tool.py` 中添加：

```python
class TestCreatePosition:
    def test_create_position_success(self):
        """Test successful position creation."""
        mock_service = MagicMock()
        mock_service.create_position.return_value = {
            "id": 1,
            "department_id": 1,
            "name": "Software Engineer",
            "responsibilities": "Develop and maintain software",
            "status": "active",
        }

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_position(
                department_id=1,
                name="Software Engineer",
                responsibilities="Develop and maintain software",
            )
            result = json.loads(result_json)

        assert "error" not in result
        assert result["name"] == "Software Engineer"
        mock_service.create_position.assert_called_once()

    def test_create_position_management(self):
        """Test creating a management position."""
        mock_service = MagicMock()
        mock_service.create_position.return_value = {"id": 2, "name": "CTO"}

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_position(
                department_id=1,
                name="CTO",
                responsibilities="Lead technology strategy",
                is_management_position=True,
                headcount=1,
            )
            result = json.loads(result_json)

        call_args = mock_service.create_position.call_args[0][0]
        assert call_args["is_management_position"] is True
        assert call_args["headcount"] == 1
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreatePosition -v`
Expected: FAIL with NameError

- [ ] **Step 3: 实现 `create_position` Tool**

在 `tools/org_creation_tool.py` 中添加（在 `create_department` 之后）：

```python
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
```

- [ ] **Step 4: 运行测试，验证通过**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreatePosition -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/org_creation_tool.py tests/tools/test_org_creation_tool.py
git commit -m "feat(org): implement create_position tool"
```

---

### Task 4: 实现 `create_agent` Tool

**Files:**
- Modify: `tools/org_creation_tool.py`

- [ ] **Step 1: 写测试**

在 `tests/tools/test_org_creation_tool.py` 中添加：

```python
class TestCreateAgent:
    def test_create_agent_success(self):
        """Test successful agent creation."""
        mock_service = MagicMock()
        mock_service.create_agent.return_value = {
            "id": 1,
            "name": "agent-eng-001",
            "display_name": "Engineer",
            "role_summary": "Software engineer",
            "status": "active",
        }

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_agent(
                position_id=1,
                name="agent-eng-001",
                role_summary="Software engineer",
            )
            result = json.loads(result_json)

        assert "error" not in result
        assert result["name"] == "agent-eng-001"
        mock_service.create_agent.assert_called_once()

    def test_create_agent_with_manager(self):
        """Test creating an agent with a manager."""
        mock_service = MagicMock()
        mock_service.create_agent.return_value = {"id": 2, "name": "agent-2"}

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_agent(
                position_id=1,
                name="agent-2",
                role_summary="Developer",
                manager_agent_id=1,
                employee_no="EMP-002",
            )
            result = json.loads(result_json)

        call_args = mock_service.create_agent.call_args[0][0]
        assert call_args["manager_agent_id"] == 1
        assert call_args["employee_no"] == "EMP-002"
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreateAgent -v`
Expected: FAIL with NameError

- [ ] **Step 3: 实现 `create_agent` Tool**

在 `tools/org_creation_tool.py` 中添加（在 `create_position` 之后）：

```python
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
```

- [ ] **Step 4: 运行测试，验证通过**

Run: `pytest tests/tools/test_org_creation_tool.py::TestCreateAgent -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/org_creation_tool.py tests/tools/test_org_creation_tool.py
git commit -m "feat(org): implement create_agent tool"
```

---

### Task 5: 集成验证

**Files:**
- Modify: `toolsets.py` (可选，取决于是否要显式定义 toolset)

- [ ] **Step 1: 检查 toolset 是否需要在 `toolsets.py` 中定义**

检查 `toolsets.py` 中是否有 `_HERMES_CORE_TOOLS` 或类似的 toolset 定义。如果 `org_creation` toolset 需要显式注册，则添加：

```python
# In toolsets.py, add to appropriate toolset list:
"org_creation",
```

如果不需显式定义（动态发现），跳过此步骤。

- [ ] **Step 2: 运行完整测试套件**

Run: `scripts/run_tests.sh tests/tools/test_org_creation_tool.py -v`
Expected: All tests PASS

- [ ] **Step 3: 验证 Tool 被自动发现**

```bash
# 启动 hermes，检查工具是否加载
hermes --toolsets org_creation -q "What tools are available in org_creation toolset?"
```

Expected: 输出包含 `create_department`、`create_position`、`create_agent`

- [ ] **Step 4: Commit (如有修改)**

```bash
git add toolsets.py
git commit -m "feat(org): register org_creation toolset"
```

---

## Plan 完成

Plan complete and saved to `docs/superpowers/plans/2026-04-30-org-creation-tools.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. In-line Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
