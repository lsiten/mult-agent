# 组织架构创建工具 — 设计文档

**日期**: 2026-04-30  
**状态**: 已批准  
**目标**: 为 Agent 组织工具添加创建部门、岗位、Agent 的能力。

---

## 需求

现有 `gateway/org/services.py` 的 `AgentProvisionService` 已有 `create_department`、`create_position`、`create_agent` 方法，但缺少对外暴露的 Tool 接口。本次为 Agent 新增 3 个 Tool，使其能直接创建组织架构元素。

**权限模型**:
- 主 Agent（root）：可创建任何部门、岗位、Agent
- 部门管理者：可在自己部门内创建岗位和下属 Agent

---

## 方案选择

**选定方案**: Tool → Service 层（方案1）

复用 `AgentProvisionService` 现有逻辑，包括：
- 参数校验（`_require()`）
- 工作区初始化（`workspace_service.ensure_workspace()`）
- Agent Profile 配置（`profile_service.create_metadata()` + `agent_provision.provision_profile()`）

---

## 设计

### 新增文件

`tools/org_creation_tool.py`

### Tool 定义

#### 1. `create_department`

```python
def create_department(
    company_id: int,
    name: str,
    goal: str,
    description: str = "",
    parent_id: int = None,
    parent_agent=None,
) -> str:
    """创建部门。调用 AgentProvisionService.create_department()。"""
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `company_id` | int | 是 | 所属公司 ID |
| `name` | str | 是 | 部门名称 |
| `goal` | str | 是 | 部门目标 |
| `description` | str | 否 | 描述 |
| `parent_id` | int | 否 | 上级部门 ID（支持多级部门） |
| `parent_agent` | - | 自动注入 | 调用此工具的父 Agent |

#### 2. `create_position`

```python
def create_position(
    department_id: int,
    name: str,
    responsibilities: str,
    is_management_position: bool = False,
    headcount: int = None,
    parent_agent=None,
) -> str:
    """创建岗位。调用 AgentProvisionService.create_position()。"""
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `department_id` | int | 是 | 所属部门 ID |
| `name` | str | 是 | 岗位名称 |
| `responsibilities` | str | 是 | 岗位职责 |
| `is_management_position` | bool | 否 | 是否管理岗位 |
| `headcount` | int | 否 | 编制人数 |
| `parent_agent` | - | 自动注入 | 调用此工具的父 Agent |

#### 3. `create_agent`

```python
def create_agent(
    position_id: int,
    name: str,
    role_summary: str,
    manager_agent_id: int = None,
    employee_no: str = None,
    parent_agent=None,
) -> str:
    """创建 Agent。调用 AgentProvisionService.create_agent()。"""
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `position_id` | int | 是 | 所属岗位 ID |
| `name` | str | 是 | Agent 名称 |
| `role_summary` | str | 是 | 角色摘要 |
| `manager_agent_id` | int | 否 | 直属管理者 ID |
| `employee_no` | str | 否 | 工号 |
| `parent_agent` | - | 自动注入 | 调用此工具的父 Agent |

---

### 返回值

所有 Tool 返回 JSON 字符串，包含创建后的完整对象（与 Service 层返回一致）。

---

### Tool 注册

```python
from tools.registry import registry

# create_department
DEPT_SCHEMA = {
    "type": "function",
    "function": {
        "name": "create_department",
        "description": "创建部门。调用 AgentProvisionService.create_department()，自动初始化工作区。主 Agent 和部门管理者都可以使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "company_id": {"type": "integer", "description": "所属公司 ID"},
                "name": {"type": "string", "description": "部门名称"},
                "goal": {"type": "string", "description": "部门目标"},
                "description": {"type": "string", "description": "部门描述（可选）"},
                "parent_id": {"type": "integer", "description": "上级部门 ID（可选，支持多级部门）"},
            },
            "required": ["company_id", "name", "goal"],
        },
    },
}

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
)

# create_position 和 create_agent 类似注册
```

Tool 集名称：`org_creation`，会被 `model_tools.py` 自动发现（因为 `tools/*.py` 文件都会被扫描）。

---

### Tool 内部如何实现

Tool 内部通过 `OrganizationService` 调用创建方法：

```python
def _get_org_service():
    """获取 OrganizationService 实例。"""
    from gateway.org.store import OrganizationStore
    from gateway.org.services import OrganizationService
    
    store = OrganizationStore()
    service = OrganizationService(store)
    return service
```

调用示例：
```python
def create_department(company_id, name, goal, description="", parent_id=None, parent_agent=None):
    service = _get_org_service()
    result = service.create_department({
        "company_id": company_id,
        "name": name,
        "goal": goal,
        "description": description,
        "parent_id": parent_id,
    })
    return json.dumps(result)
```

---

## 复用现有逻辑

| 功能 | 实现位置 |
|------|-----------|
| 参数校验 | `AgentProvisionService.create_department()` 中的 `_require()` |
| 工作区初始化 | `workspace_service.ensure_workspace()` |
| Agent Profile | `profile_service.create_metadata()` + `agent_provision.provision_profile()` |
| 数据库事务 | `store.transaction(tx)` |

---

## 后续扩展（本次不实现）

- 权限校验：管理者只能在本部门创建岗位/Agent
- 创建后通知：自动通知相关管理者
- Slash Command 版本：为人类用户提供 `/create-department` 等命令
