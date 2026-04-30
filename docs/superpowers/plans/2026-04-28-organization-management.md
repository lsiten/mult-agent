# Hermes Agent 组织化管理功能实现计划

&gt; **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现"我→管理者→下属"的两级组织化管理架构。我可以给组织架构中的任何管理者分配任务，管理者收到任务后智能拆分子任务并分配给合适的下属，下属执行后向上汇报，最终汇总给我。

**Architecture:** 
- 在现有 org.db 数据库中新增 4 张表（tasks / task_reports / approvals / agent_permissions）
- 新增 `org_management` 工具集，包含 6 个核心管理工具函数
- **扩展权限模型：我（主 Agent）可以给任何管理者分配任务，管理者可以给下属分配任务**
- 扩展 SoulRenderService，**为管理者增加任务拆分、人员匹配、进度汇总的专属系统提示**
- 实现任务链追踪：从顶层任务→子任务→执行结果的完整链路可追溯

**核心流程：**
```
我（用户/主 Agent）
    ↓ 分配大任务给 CTO
CTO (管理者 Agent)
    ├─ 分析任务需求
    ├─ 拆分成 3-5 个可执行子任务
    ├─ 查看下属技能和工作量，匹配执行者
    └─ 分配子任务给架构师、开发主管等
下属 Agent (架构师/开发主管)
    ├─ 执行任务
    ├─ 定期向 CTO 汇报
    └─ 提交最终成果
CTO (管理者 Agent)
    ├─ 审批下属成果
    └─ 汇总后向我汇报最终结果
```

**Tech Stack:** Python 3.10+, SQLite, pytest

---

## 文件映射

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 创建 | `gateway/org/models.py` | 数据库表结构定义和数据模型 |
| 修改 | `gateway/org/store.py` | 新增 Repository 类和数据库迁移方法 |
| 创建 | `tools/org_management_tool.py` | 组织管理工具集实现 |
| 修改 | `gateway/org/services.py` | 扩展 SoulRenderService，添加管理权限初始化 |
| 修改 | `tools/registry.py` | 注册 org_management 工具集 |
| 创建 | `tests/gateway/test_org_management.py` | 组织管理功能测试 |

---

## Task 1: 数据库表结构设计 (models.py)

**Files:**
- Create: `gateway/org/models.py`

- [ ] **Step 1: 创建数据模型文件，定义 4 张表的结构**

```python
"""
Organization Management Data Models

This module defines the database schema for organization management:
- tasks: Task assignments and tracking
- task_reports: Progress and final reports from subordinates
- approvals: Manager approval decisions
- agent_permissions: Role-based access control for management features
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any


@dataclass
class Task:
    """A task assigned from a manager to a subordinate."""
    id: Optional[int] = None
    title: str = ""
    description: str = ""
    priority: str = "normal"  # low, normal, high, urgent
    status: str = "pending"   # pending, in_progress, review, completed, rejected
    creator_agent_id: int = 0
    assignee_agent_id: int = 0
    parent_task_id: Optional[int] = None
    workspace_path: Optional[str] = None
    deadline_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "priority": self.priority,
            "status": self.status,
            "creator_agent_id": self.creator_agent_id,
            "assignee_agent_id": self.assignee_agent_id,
            "parent_task_id": self.parent_task_id,
            "workspace_path": self.workspace_path,
            "deadline_at": self.deadline_at.isoformat() if self.deadline_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@dataclass
class TaskReport:
    """A report submitted by a subordinate for a task."""
    id: Optional[int] = None
    task_id: int = 0
    reporter_agent_id: int = 0
    content: str = ""
    attachments: Optional[List[str]] = None
    report_type: str = "progress"  # progress, final
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "reporter_agent_id": self.reporter_agent_id,
            "content": self.content,
            "attachments": self.attachments or [],
            "report_type": self.report_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


@dataclass
class Approval:
    """A manager's approval decision for a task."""
    id: Optional[int] = None
    task_id: int = 0
    approver_agent_id: int = 0
    decision: str = ""  # approve, reject, request_changes
    comment: Optional[str] = None
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "approver_agent_id": self.approver_agent_id,
            "decision": self.decision,
            "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


@dataclass
class AgentPermission:
    """Permissions for what an agent can do in the organization."""
    id: Optional[int] = None
    agent_id: int = 0
    can_assign_tasks: bool = False
    can_approve_tasks: bool = False
    can_create_subagents: bool = False
    max_subordinates: Optional[int] = None
    created_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "can_assign_tasks": self.can_assign_tasks,
            "can_approve_tasks": self.can_approve_tasks,
            "can_create_subagents": self.can_create_subagents,
            "max_subordinates": self.max_subordinates,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# SQL Table Creation Statements
TABLES_SQL = {
    "tasks": """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'pending',
            creator_agent_id INTEGER NOT NULL,
            assignee_agent_id INTEGER NOT NULL,
            parent_task_id INTEGER,
            workspace_path TEXT,
            deadline_at TIMESTAMP,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (creator_agent_id) REFERENCES agents(id),
            FOREIGN KEY (assignee_agent_id) REFERENCES agents(id),
            FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
        )
    """,
    "task_reports": """
        CREATE TABLE IF NOT EXISTS task_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            reporter_agent_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            attachments TEXT,  -- JSON array of file paths
            report_type TEXT DEFAULT 'progress',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (reporter_agent_id) REFERENCES agents(id)
        )
    """,
    "approvals": """
        CREATE TABLE IF NOT EXISTS approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            approver_agent_id INTEGER NOT NULL,
            decision TEXT NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (approver_agent_id) REFERENCES agents(id)
        )
    """,
    "agent_permissions": """
        CREATE TABLE IF NOT EXISTS agent_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id INTEGER NOT NULL UNIQUE,
            can_assign_tasks BOOLEAN DEFAULT 0,
            can_approve_tasks BOOLEAN DEFAULT 0,
            can_create_subagents BOOLEAN DEFAULT 0,
            max_subordinates INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        )
    """,
}

# Indexes for performance
INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
    "CREATE INDEX IF NOT EXISTS idx_task_reports_task ON task_reports(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)",
]
```

- [ ] **Step 2: 验证文件语法正确**

Run: `python -m py_compile gateway/org/models.py`
Expected: No output (no syntax errors)

- [ ] **Step 3: Commit**

```bash
git add gateway/org/models.py
git commit -m "feat(org): add organization management data models"
```

---

## Task 2: 数据库迁移和 Repository 类

**Files:**
- Modify: `gateway/org/store.py`
- Test: `tests/gateway/test_org_store.py`

- [ ] **Step 1: 先写测试，验证迁移功能**

```python
"""Tests for organization database migrations and repositories."""

import sqlite3
import tempfile
from pathlib import Path

import pytest

from gateway.org.store import (
    OrganizationStore,
    TaskRepository,
    TaskReportRepository,
    ApprovalRepository,
    AgentPermissionRepository,
)


@pytest.fixture
def temp_db():
    """Create a temporary org database for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    yield db_path
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def store(temp_db):
    """Create a store with migrations applied."""
    store = OrganizationStore(db_path=str(temp_db))
    # Create base tables first (agents, positions, etc.)
    store._create_base_tables()
    store.run_migrations()
    yield store
    store.close()


def test_migrations_create_tables(store):
    """Verify that migrations create all 4 new tables."""
    tables = store.query_all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    table_names = [t["name"] for t in tables]
    
    assert "tasks" in table_names
    assert "task_reports" in table_names
    assert "approvals" in table_names
    assert "agent_permissions" in table_names


def test_task_repository_crud(store):
    """Test TaskRepository CRUD operations."""
    conn = store.conn
    
    # Create test agents
    store.execute(
        "INSERT INTO agents (id, name, position_id, status) VALUES (1, 'Manager', 1, 'active')",
        conn=conn,
    )
    store.execute(
        "INSERT INTO agents (id, name, position_id, status) VALUES (2, 'Worker', 1, 'active')",
        conn=conn,
    )
    
    tasks = TaskRepository(store)
    
    # Create
    task = tasks.create(
        {
            "title": "Review architecture",
            "description": "Review the new proposal",
            "priority": "high",
            "creator_agent_id": 1,
            "assignee_agent_id": 2,
        },
        conn=conn,
    )
    assert task["id"] is not None
    assert task["title"] == "Review architecture"
    
    # Get
    fetched = tasks.get(task["id"], conn=conn)
    assert fetched["title"] == "Review architecture"
    
    # Update
    updated = tasks.update(
        task["id"],
        {"status": "in_progress"},
        {"status"},
        conn=conn,
    )
    assert updated["status"] == "in_progress"
    
    # List by assignee
    worker_tasks = tasks.list_by_assignee(2, conn=conn)
    assert len(worker_tasks) == 1
    assert worker_tasks[0]["assignee_agent_id"] == 2
    
    # List by creator
    manager_tasks = tasks.list_by_creator(1, conn=conn)
    assert len(manager_tasks) == 1
    assert manager_tasks[0]["creator_agent_id"] == 1


def test_agent_permission_repository(store):
    """Test AgentPermissionRepository."""
    conn = store.conn
    
    # Create test agent
    store.execute(
        "INSERT INTO agents (id, name, position_id, status) VALUES (3, 'CTO', 1, 'active')",
        conn=conn,
    )
    
    perms = AgentPermissionRepository(store)
    
    # Create permission for manager
    perm = perms.create_or_update(
        {
            "agent_id": 3,
            "can_assign_tasks": 1,
            "can_approve_tasks": 1,
            "max_subordinates": 10,
        },
        conn=conn,
    )
    assert perm["can_assign_tasks"] == 1
    
    # Get permission
    fetched = perms.get_by_agent(3, conn=conn)
    assert fetched["can_approve_tasks"] == 1
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/gateway/test_org_store.py -v`
Expected: FAIL with "ModuleNotFoundError" or "ImportError"

- [ ] **Step 3: 实现 OrganizationStore 的迁移方法**

在 `gateway/org/store.py` 开头添加导入：
```python
from .models import TABLES_SQL, INDEXES_SQL
```

在 OrganizationStore 类中添加方法：
```python
class OrganizationStore:
    # ... existing methods ...

    def run_migrations(self):
        """Run database migrations for organization management tables."""
        conn = self.conn
        
        # Create tables
        for table_name, sql in TABLES_SQL.items():
            conn.execute(sql)
        
        # Create indexes
        for sql in INDEXES_SQL:
            conn.execute(sql)
        
        conn.commit()

    def _create_base_tables(self):
        """Create minimal base tables needed for tests."""
        conn = self.conn
        conn.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY,
                name TEXT,
                display_name TEXT,
                position_id INTEGER,
                department_id INTEGER,
                status TEXT,
                enabled INTEGER DEFAULT 1,
                leadership_role TEXT DEFAULT 'none',
                manager_agent_id INTEGER,
                workspace_path TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS positions (
                id INTEGER PRIMARY KEY,
                name TEXT,
                department_id INTEGER,
                is_management_position INTEGER DEFAULT 0,
                workspace_path TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY,
                name TEXT,
                company_id INTEGER,
                is_management_department INTEGER DEFAULT 0,
                workspace_path TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY,
                name TEXT,
                workspace_path TEXT
            )
        """)
        conn.commit()
```

- [ ] **Step 4: 添加 TaskRepository 类**

在 `gateway/org/store.py` 文件末尾添加：
```python
class TaskRepository:
    """Repository for task operations."""

    def __init__(self, store: OrganizationStore):
        self.store = store

    def get(self, task_id: int, *, conn=None):
        """Get a task by ID."""
        return self.store.query_one(
            "SELECT * FROM tasks WHERE id = ?", (task_id,), conn=conn
        )

    def create(self, data: dict, *, conn=None):
        """Create a new task."""
        columns = [
            "title", "description", "priority", "status",
            "creator_agent_id", "assignee_agent_id", "parent_task_id",
            "workspace_path", "deadline_at"
        ]
        values = [data.get(c) for c in columns]
        placeholders = ", ".join("?" for _ in columns)
        cursor = self.store.execute(
            f"INSERT INTO tasks ({', '.join(columns)}) VALUES ({placeholders})",
            values,
            conn=conn,
        )
        task_id = cursor.lastrowid
        return self.get(task_id, conn=conn)

    def update(self, task_id: int, data: dict, allowed_fields: set, *, conn=None):
        """Update a task."""
        updates = []
        values = []
        for field in allowed_fields:
            if field in data:
                updates.append(f"{field} = ?")
                values.append(data[field])
        if not updates:
            return self.get(task_id, conn=conn)
        updates.append("updated_at = CURRENT_TIMESTAMP")
        values.append(task_id)
        self.store.execute(
            f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?",
            values,
            conn=conn,
        )
        return self.get(task_id, conn=conn)

    def list_by_assignee(self, assignee_id: int, status: str = None, *, conn=None):
        """List tasks assigned to an agent."""
        sql = "SELECT * FROM tasks WHERE assignee_agent_id = ?"
        params = [assignee_id]
        if status:
            sql += " AND status = ?"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        return self.store.query_all(sql, params, conn=conn)

    def list_by_creator(self, creator_id: int, status: str = None, *, conn=None):
        """List tasks created by an agent."""
        sql = "SELECT * FROM tasks WHERE creator_agent_id = ?"
        params = [creator_id]
        if status:
            sql += " AND status = ?"
            params.append(status)
        sql += " ORDER BY created_at DESC"
        return self.store.query_all(sql, params, conn=conn)


class TaskReportRepository:
    """Repository for task report operations."""

    def __init__(self, store: OrganizationStore):
        self.store = store

    def get(self, report_id: int, *, conn=None):
        """Get a report by ID."""
        return self.store.query_one(
            "SELECT * FROM task_reports WHERE id = ?", (report_id,), conn=conn
        )

    def create(self, data: dict, *, conn=None):
        """Create a new report."""
        import json
        attachments_json = json.dumps(data.get("attachments", [])) if data.get("attachments") else None
        cursor = self.store.execute(
            """
            INSERT INTO task_reports (task_id, reporter_agent_id, content, attachments, report_type)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                data["task_id"],
                data["reporter_agent_id"],
                data["content"],
                attachments_json,
                data.get("report_type", "progress"),
            ],
            conn=conn,
        )
        return self.get(cursor.lastrowid, conn=conn)

    def list_by_task(self, task_id: int, *, conn=None):
        """List all reports for a task."""
        import json
        reports = self.store.query_all(
            "SELECT * FROM task_reports WHERE task_id = ? ORDER BY created_at DESC",
            (task_id,),
            conn=conn,
        )
        # Parse attachments JSON
        for report in reports:
            if report.get("attachments"):
                try:
                    report["attachments"] = json.loads(report["attachments"])
                except (json.JSONDecodeError, TypeError):
                    report["attachments"] = []
            else:
                report["attachments"] = []
        return reports


class ApprovalRepository:
    """Repository for approval operations."""

    def __init__(self, store: OrganizationStore):
        self.store = store

    def get(self, approval_id: int, *, conn=None):
        """Get an approval by ID."""
        return self.store.query_one(
            "SELECT * FROM approvals WHERE id = ?", (approval_id,), conn=conn
        )

    def create(self, data: dict, *, conn=None):
        """Create a new approval."""
        cursor = self.store.execute(
            """
            INSERT INTO approvals (task_id, approver_agent_id, decision, comment)
            VALUES (?, ?, ?, ?)
            """,
            [
                data["task_id"],
                data["approver_agent_id"],
                data["decision"],
                data.get("comment"),
            ],
            conn=conn,
        )
        return self.get(cursor.lastrowid, conn=conn)

    def get_latest_for_task(self, task_id: int, *, conn=None):
        """Get the latest approval for a task."""
        return self.store.query_one(
            "SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
            (task_id,),
            conn=conn,
        )


class AgentPermissionRepository:
    """Repository for agent permission operations."""

    def __init__(self, store: OrganizationStore):
        self.store = store

    def get_by_agent(self, agent_id: int, *, conn=None):
        """Get permissions for an agent."""
        return self.store.query_one(
            "SELECT * FROM agent_permissions WHERE agent_id = ?",
            (agent_id,),
            conn=conn,
        )

    def create_or_update(self, data: dict, *, conn=None):
        """Create or update permissions for an agent."""
        existing = self.get_by_agent(data["agent_id"], conn=conn)
        if existing:
            # Update
            updates = []
            values = []
            for field in [
                "can_assign_tasks", "can_approve_tasks",
                "can_create_subagents", "max_subordinates"
            ]:
                if field in data:
                    updates.append(f"{field} = ?")
                    values.append(data[field])
            if updates:
                values.append(data["agent_id"])
                self.store.execute(
                    f"UPDATE agent_permissions SET {', '.join(updates)} WHERE agent_id = ?",
                    values,
                    conn=conn,
                )
            return self.get_by_agent(data["agent_id"], conn=conn)
        else:
            # Create
            cursor = self.store.execute(
                """
                INSERT INTO agent_permissions
                (agent_id, can_assign_tasks, can_approve_tasks, can_create_subagents, max_subordinates)
                VALUES (?, ?, ?, ?, ?)
                """,
                [
                    data["agent_id"],
                    data.get("can_assign_tasks", 0),
                    data.get("can_approve_tasks", 0),
                    data.get("can_create_subagents", 0),
                    data.get("max_subordinates"),
                ],
                conn=conn,
            )
            return self.get_by_agent(data["agent_id"], conn=conn)
```

- [ ] **Step 5: 运行测试，验证通过**

Run: `pytest tests/gateway/test_org_store.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add gateway/org/store.py tests/gateway/test_org_store.py
git commit -m "feat(org): add task and permission repositories with migrations"
```

---

## Task 3: 权限校验工具函数

**Files:**
- Create: `gateway/org/permissions.py`
- Test: `tests/gateway/test_org_permissions.py`

- [ ] **Step 1: 先写测试**

```python
"""Tests for organization permission checking."""

import pytest

from gateway.org.permissions import (
    require_management_permission,
    is_subordinate,
    has_permission,
    PermissionError,
)
from gateway.org.store import OrganizationStore, AgentRepository


@pytest.fixture
def store():
    """Create an in-memory store with test data."""
    import sqlite3
    import tempfile
    from pathlib import Path
    
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    
    store = OrganizationStore(db_path=str(db_path))
    store._create_base_tables()
    store.run_migrations()
    
    conn = store.conn
    
    # Create test agents
    conn.execute(
        "INSERT INTO agents (id, name, display_name, leadership_role, status, enabled) "
        "VALUES (1, 'Manager', 'CTO', 'primary', 'active', 1)"
    )
    conn.execute(
        "INSERT INTO agents (id, name, display_name, manager_agent_id, leadership_role, status, enabled) "
        "VALUES (2, 'Worker', 'Developer', 1, 'none', 'active', 1)"
    )
    conn.execute(
        "INSERT INTO agents (id, name, display_name, leadership_role, status, enabled) "
        "VALUES (3, 'Other', 'Other Manager', 'primary', 'active', 1)"
    )
    
    # Give manager permissions
    from gateway.org.store import AgentPermissionRepository
    perms = AgentPermissionRepository(store)
    perms.create_or_update(
        {"agent_id": 1, "can_assign_tasks": 1, "can_approve_tasks": 1, "max_subordinates": 10},
        conn=conn,
    )
    perms.create_or_update(
        {"agent_id": 3, "can_assign_tasks": 1, "can_approve_tasks": 1, "max_subordinates": 5},
        conn=conn,
    )
    
    conn.commit()
    yield store
    store.close()
    if db_path.exists():
        db_path.unlink()


def test_has_permission(store):
    """Test permission checking."""
    # Manager has assign permission
    assert has_permission(store, 1, "can_assign_tasks") is True
    # Worker has no permissions
    assert has_permission(store, 2, "can_assign_tasks") is False
    # Worker has no entry, defaults to no permission
    assert has_permission(store, 2, "can_approve_tasks") is False


def test_require_management_permission(store):
    """Test that permission requirement raises for non-managers."""
    # Manager should not raise
    require_management_permission(store, 1, "can_assign_tasks")
    
    # Worker should raise
    with pytest.raises(PermissionError) as exc:
        require_management_permission(store, 2, "can_assign_tasks")
    assert "does not have permission" in str(exc.value)


def test_is_subordinate_direct_manager(store):
    """Test direct subordinate relationship via manager_agent_id."""
    # Worker 2 is subordinate of Manager 1
    assert is_subordinate(store, 1, 2) is True
    # Manager 1 is NOT subordinate of Worker 2
    assert is_subordinate(store, 2, 1) is False
    # Worker 2 is NOT subordinate of Other Manager 3
    assert is_subordinate(store, 3, 2) is False
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/gateway/test_org_permissions.py -v`
Expected: FAIL with ImportError

- [ ] **Step 3: 实现权限校验模块**

```python
"""
Organization Permission Checking

This module provides functions for verifying management permissions
and hierarchical relationships between agents.
"""

from typing import Optional

from .store import (
    OrganizationStore,
    AgentPermissionRepository,
    AgentRepository,
)


class PermissionError(Exception):
    """Raised when an agent does not have required permissions."""
    pass


def has_permission(
    store: OrganizationStore,
    agent_id: int,
    permission: str,
    *,
    conn=None,
) -> bool:
    """
    Check if an agent has a specific permission.

    Args:
        store: OrganizationStore instance
        agent_id: ID of the agent to check
        permission: Permission name (e.g., "can_assign_tasks")
        conn: Optional database connection

    Returns:
        True if agent has the permission, False otherwise
    """
    perms_repo = AgentPermissionRepository(store)
    agent_perms = perms_repo.get_by_agent(agent_id, conn=conn)
    
    if not agent_perms:
        # No permissions record = no permissions
        return False
    
    return bool(agent_perms.get(permission, 0))


def require_management_permission(
    store: OrganizationStore,
    agent_id: int,
    permission: str,
    *,
    conn=None,
) -> None:
    """
    Require that an agent has a specific permission.

    Raises:
        PermissionError: If agent does not have the permission
    """
    if not has_permission(store, agent_id, permission, conn=conn):
        raise PermissionError(
            f"Agent {agent_id} does not have permission: {permission}. "
            "Only management position agents can perform this action."
        )


def is_subordinate(
    store: OrganizationStore,
    manager_id: int,
    subordinate_id: int,
    *,
    conn=None,
) -> bool:
    """
    Check if an agent is a direct subordinate of another agent.

    Checks:
    1. Direct manager_agent_id relationship
    2. Same department and manager is in a management position

    Args:
        store: OrganizationStore instance
        manager_id: ID of the potential manager
        subordinate_id: ID of the potential subordinate
        conn: Optional database connection

    Returns:
        True if subordinate_id reports to manager_id
    """
    agents = AgentRepository(store)
    
    subordinate = agents.get(subordinate_id, conn=conn)
    if not subordinate:
        return False
    
    # Check direct manager relationship
    if subordinate.get("manager_agent_id") == manager_id:
        return True
    
    # TODO: Add hierarchical check (department head, etc.)
    
    return False


def can_assign_to_agent(
    store: OrganizationStore,
    assigner_id: int,
    target_agent_id: int,
    *,
    conn=None,
) -> tuple[bool, str]:
    """
    Check if assigner can assign a task to target_agent.

    **两级权限模型：**
    1. Root Agent (我 / 用户): 可以给组织中的 ANY 管理者分配任务
    2. 普通管理者: 只能给自己的直属下属分配任务

    Args:
        store: OrganizationStore instance
        assigner_id: ID of the agent assigning the task
        target_agent_id: ID of the agent receiving the task
        conn: Optional database connection

    Returns:
        (can_assign: bool, reason: str)
    """
    from .services import SoulRenderService
    
    agents = AgentRepository(store)
    assigner = agents.get(assigner_id, conn=conn)
    target = agents.get(target_agent_id, conn=conn)
    
    if not target:
        return False, f"Target agent {target_agent_id} not found"
    
    # Check 1: Is this the ROOT AGENT (me)?
    soul_service = SoulRenderService(store)
    if soul_service._is_root_agent(assigner_id):
        # Root agent can assign to ANY management position agent
        target_position = store.query_one(
            "SELECT * FROM positions WHERE id = ?",
            (target["position_id"],),
            conn=conn,
        )
        if soul_service._is_manager(target, target_position):
            return True, f"Root agent can assign tasks to any manager (including {target.get('display_name') or target.get('name')})"
        else:
            return False, (
                f"As root agent, you can only assign tasks to MANAGERS, not to individual contributors directly. "
                f"Please assign this task to {target.get('display_name') or target.get('name')}'s manager instead, "
                f"and they will delegate to their team members appropriately."
            )
    
    # Check 2: Regular manager - can only assign to direct subordinates
    if is_subordinate(store, assigner_id, target_agent_id, conn=conn):
        return True, "Target is direct subordinate"
    
    assigner_name = assigner.get("display_name") or assigner.get("name") or f"Agent {assigner_id}"
    target_name = target.get("display_name") or target.get("name") or f"Agent {target_agent_id}"
    return False, f"{target_name} is not a direct subordinate of {assigner_name}"


def get_subordinates(
    store: OrganizationStore,
    manager_id: int,
    *,
    conn=None,
) -> list:
    """
    Get all direct subordinates of a manager.

    Args:
        store: OrganizationStore instance
        manager_id: ID of the manager
        conn: Optional database connection

    Returns:
        List of subordinate agent records
    """
    agents = AgentRepository(store)
    
    # Get agents where manager_agent_id = manager_id
    all_agents = store.query_all(
        "SELECT * FROM agents WHERE manager_agent_id = ? AND status = 'active' AND enabled = 1",
        (manager_id,),
        conn=conn,
    )
    
    return all_agents
```

- [ ] **Step 4: 运行测试，验证通过**

Run: `pytest tests/gateway/test_org_permissions.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/org/permissions.py tests/gateway/test_org_permissions.py
git commit -m "feat(org): add permission checking and hierarchy validation"
```

---

## Task 4: 组织管理工具集实现

**Files:**
- Create: `tools/org_management_tool.py`
- Modify: `tools/registry.py`

- [ ] **Step 1: 先写测试**

```python
"""Tests for organization management tools."""

import json
import pytest

from tools.org_management_tool import (
    assign_task_to_subordinate,
    list_my_subordinates,
    list_my_tasks,
    submit_task_report,
    approve_task,
    share_file_with_subordinate,
)


class MockAgent:
    """Mock parent agent for testing."""
    def __init__(self, agent_id):
        self.agent_id = agent_id
        self.session_id = f"session-{agent_id}"
        # Store will be set by test fixture


@pytest.fixture
def org_store():
    """Create organization store with test hierarchy."""
    import tempfile
    from pathlib import Path
    from gateway.org.store import (
        OrganizationStore,
        AgentPermissionRepository,
    )
    
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    
    store = OrganizationStore(db_path=str(db_path))
    store._create_base_tables()
    store.run_migrations()
    
    conn = store.conn
    
    # Create company, dept, position
    conn.execute("INSERT INTO companies (id, name) VALUES (1, 'Test Corp')")
    conn.execute("INSERT INTO departments (id, name, company_id) VALUES (1, 'Engineering', 1)")
    conn.execute(
        "INSERT INTO positions (id, name, department_id, is_management_position) "
        "VALUES (1, 'CTO', 1, 1)"
    )
    conn.execute(
        "INSERT INTO positions (id, name, department_id, is_management_position) "
        "VALUES (2, 'Developer', 1, 0)"
    )
    
    # Create agents
    conn.execute(
        "INSERT INTO agents (id, name, display_name, position_id, department_id, "
        "company_id, leadership_role, status, enabled, workspace_path) "
        "VALUES (1, 'manager', 'CTO', 1, 1, 1, 'primary', 'active', 1, '/tmp/ws/manager')"
    )
    conn.execute(
        "INSERT INTO agents (id, name, display_name, position_id, department_id, "
        "company_id, manager_agent_id, leadership_role, status, enabled, workspace_path) "
        "VALUES (2, 'worker', 'Developer', 2, 1, 1, 1, 'none', 'active', 1, '/tmp/ws/worker')"
    )
    conn.execute(
        "INSERT INTO agents (id, name, display_name, position_id, department_id, "
        "company_id, manager_agent_id, leadership_role, status, enabled, workspace_path) "
        "VALUES (3, 'worker2', 'Developer 2', 2, 1, 1, 1, 'none', 'active', 1, '/tmp/ws/worker2')"
    )
    
    # Give manager permissions
    perms = AgentPermissionRepository(store)
    perms.create_or_update(
        {"agent_id": 1, "can_assign_tasks": 1, "can_approve_tasks": 1, "max_subordinates": 10},
        conn=conn,
    )
    
    conn.commit()
    yield store
    store.close()
    if db_path.exists():
        db_path.unlink()


def test_assign_task_to_subordinate(org_store):
    """Test assigning a task to a subordinate."""
    manager = MockAgent(1)
    manager.org_store = org_store
    
    result_json = assign_task_to_subordinate(
        subordinate_agent_id=2,
        title="Review PR",
        description="Review pull request #123",
        priority="high",
        parent_agent=manager,
    )
    
    result = json.loads(result_json)
    assert "error" not in result
    assert result["title"] == "Review PR"
    assert result["creator_agent_id"] == 1
    assert result["assignee_agent_id"] == 2
    assert result["status"] == "pending"


def test_assign_task_wrong_subordinate(org_store):
    """Test that assigning to a non-subordinate fails."""
    manager = MockAgent(1)
    manager.org_store = org_store
    
    # Create another agent not managed by 1
    other_manager = MockAgent(3)
    
    result_json = assign_task_to_subordinate(
        subordinate_agent_id=3,  # Not a subordinate of 1
        title="Should fail",
        parent_agent=manager,
    )
    
    result = json.loads(result_json)
    assert "error" in result
    assert "is not your subordinate" in result["error"]


def test_list_my_subordinates(org_store):
    """Test listing subordinates."""
    manager = MockAgent(1)
    manager.org_store = org_store
    
    result_json = list_my_subordinates(parent_agent=manager)
    result = json.loads(result_json)
    
    assert len(result) == 2  # Workers 2 and 3
    subordinate_names = [s["name"] for s in result]
    assert "worker" in subordinate_names
    assert "worker2" in subordinate_names


def test_list_my_tasks(org_store):
    """Test listing tasks assigned to me."""
    # First create a task
    from gateway.org.store import TaskRepository
    tasks = TaskRepository(org_store)
    tasks.create({
        "title": "Test Task",
        "creator_agent_id": 1,
        "assignee_agent_id": 2,
    }, conn=org_store.conn)
    
    # Now worker lists tasks
    worker = MockAgent(2)
    worker.org_store = org_store
    
    result_json = list_my_tasks(parent_agent=worker)
    result = json.loads(result_json)
    
    assert len(result) == 1
    assert result[0]["title"] == "Test Task"
```

- [ ] **Step 2: 运行测试，验证失败**

Run: `pytest tests/gateway/test_org_management.py -v`
Expected: FAIL with ImportError

- [ ] **Step 3: 实现组织管理工具集**

```python
"""
Organization Management Tools

This module provides tools for hierarchical agent collaboration:
- Task assignment from managers to subordinates
- Progress reporting from subordinates to managers
- Approval workflow
- File sharing between manager and subordinates

Only agents with management permissions can use these tools.
"""

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from gateway.org.store import (
    OrganizationStore,
    TaskRepository,
    TaskReportRepository,
    ApprovalRepository,
    AgentRepository,
)
from gateway.org.permissions import (
    require_management_permission,
    is_subordinate,
    get_subordinates,
    PermissionError,
)

logger = logging.getLogger(__name__)


def _get_org_store(parent_agent: Any) -> OrganizationStore:
    """Get the organization store from parent agent or create one."""
    # First try to get from parent_agent
    if hasattr(parent_agent, "org_store"):
        return parent_agent.org_store
    
    # Fallback: create from default path
    from hermes_constants import get_hermes_home
    hermes_home = get_hermes_home()
    org_db_path = Path(hermes_home) / "org" / "org.db"
    org_db_path.parent.mkdir(parents=True, exist_ok=True)
    
    store = OrganizationStore(db_path=str(org_db_path))
    store.run_migrations()
    return store


def _get_agent_id(parent_agent: Any) -> int:
    """Extract the current agent's ID from the parent agent context."""
    # Try profile-based ID first
    if hasattr(parent_agent, "profile_agent_id"):
        return parent_agent.profile_agent_id
    
    # Fallback: extract from session or config
    if hasattr(parent_agent, "agent_id"):
        return parent_agent.agent_id
    
    # Default: 0 means main/root agent (should have permissions if configured)
    return 0


# ============================================================
# 1. 任务分配工具（仅管理者可用）
# ============================================================

def assign_task_to_subordinate(
    subordinate_agent_id: int,
    title: str,
    description: str = "",
    priority: str = "normal",
    deadline: str = None,
    parent_task_id: int = None,
    parent_agent=None,
) -> str:
    """
    管理者给下属分配任务。
    
    自动校验：
    - 调用者是否有分配权限
    - 目标 Agent 是否是调用者的直属下属
    - 目标 Agent 是否在线/可用
    
    Args:
        subordinate_agent_id: 下属 Agent 的 ID
        title: 任务标题
        description: 任务详细描述
        priority: 优先级 (low, normal, high, urgent)
        deadline: 截止时间 (ISO format, e.g., "2026-05-15T18:00:00")
        parent_task_id: 父任务 ID（可选，用于子任务）
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含任务详情或错误信息
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        # 权限校验
        require_management_permission(store, my_id, "can_assign_tasks")
        
        # 上下级关系校验
        if not is_subordinate(store, my_id, subordinate_agent_id):
            agent_repo = AgentRepository(store)
            subordinate = agent_repo.get(subordinate_agent_id)
            name = subordinate.get("display_name") or subordinate.get("name") or f"Agent {subordinate_agent_id}" if subordinate else f"Agent {subordinate_agent_id}"
            return json.dumps({
                "error": f"{name} (ID: {subordinate_agent_id}) is not your subordinate. "
                         "You can only assign tasks to agents who report directly to you."
            })
        
        # 解析截止时间
        deadline_dt = None
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline)
            except ValueError:
                return json.dumps({"error": f"Invalid deadline format: {deadline}. Use ISO format: YYYY-MM-DDTHH:MM:SS"})
        
        # 创建任务
        tasks = TaskRepository(store)
        task = tasks.create({
            "title": title,
            "description": description,
            "priority": priority,
            "status": "pending",
            "creator_agent_id": my_id,
            "assignee_agent_id": subordinate_agent_id,
            "parent_task_id": parent_task_id,
            "deadline_at": deadline_dt,
        }, conn=store.conn)
        
        # 创建任务工作区
        workspace_path = None
        try:
            agent_repo = AgentRepository(store)
            subordinate = agent_repo.get(subordinate_agent_id)
            if subordinate and subordinate.get("workspace_path"):
                task_workspace = Path(subordinate["workspace_path"]) / "tasks" / f"task-{task['id']}"
                task_workspace.mkdir(parents=True, exist_ok=True)
                workspace_path = str(task_workspace)
                tasks.update(task["id"], {"workspace_path": workspace_path}, {"workspace_path"}, conn=store.conn)
                task["workspace_path"] = workspace_path
        except Exception as e:
            logger.warning(f"Failed to create task workspace: {e}")
        
        return json.dumps(task, ensure_ascii=False)
    
    except PermissionError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception("Error assigning task")
        return json.dumps({"error": f"Failed to assign task: {e}"})


# ============================================================
# 2. 查询下属列表（仅管理者可用）
# ============================================================

def list_my_subordinates(
    include_status: bool = True,
    parent_agent=None,
) -> str:
    """
    查询我的所有直属下属及其当前工作负载。
    
    Args:
        include_status: 是否包含任务统计信息
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含下属列表：每个下属的信息、进行中任务数、最近活动时间
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        # 权限校验
        require_management_permission(store, my_id, "can_assign_tasks")
        
        subordinates = get_subordinates(store, my_id, conn=store.conn)
        
        # 补充任务统计
        if include_status:
            tasks = TaskRepository(store)
            for sub in subordinates:
                sub_tasks = tasks.list_by_assignee(sub["id"], conn=store.conn)
                in_progress = [t for t in sub_tasks if t["status"] == "in_progress"]
                sub["active_tasks_count"] = len(in_progress)
                sub["total_tasks_count"] = len(sub_tasks)
        
        return json.dumps(subordinates, ensure_ascii=False)
    
    except PermissionError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception("Error listing subordinates")
        return json.dumps({"error": f"Failed to list subordinates: {e}"})


# ============================================================
# 3. 查询我收到的任务（所有 Agent 可用）
# ============================================================

def list_my_tasks(
    status: str = None,
    parent_agent=None,
) -> str:
    """
    查询分配给我的任务列表。
    
    Args:
        status: 按状态过滤 (pending, in_progress, review, completed, rejected)
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含任务列表
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        tasks = TaskRepository(store)
        my_tasks = tasks.list_by_assignee(my_id, status=status, conn=store.conn)
        
        # 补充最新汇报
        reports = TaskReportRepository(store)
        for task in my_tasks:
            task_reports = reports.list_by_task(task["id"], conn=store.conn)
            task["reports_count"] = len(task_reports)
            if task_reports:
                task["latest_report"] = task_reports[0]
        
        return json.dumps(my_tasks, ensure_ascii=False)
    
    except Exception as e:
        logger.exception("Error listing tasks")
        return json.dumps({"error": f"Failed to list tasks: {e}"})


# ============================================================
# 4. 提交任务汇报（执行者用）
# ============================================================

def submit_task_report(
    task_id: int,
    content: str,
    report_type: str = "progress",
    attachments: List[str] = None,
    parent_agent=None,
) -> str:
    """
    向我的管理者提交任务汇报。
    汇报会自动通知管理者。
    
    Args:
        task_id: 任务 ID
        content: 汇报内容（详细描述）
        report_type: 汇报类型 (progress, final)
        attachments: 附件文件路径列表（可选）
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含汇报详情
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        # 验证任务存在且是分配给我的
        tasks = TaskRepository(store)
        task = tasks.get(task_id, conn=store.conn)
        if not task:
            return json.dumps({"error": f"Task {task_id} not found"})
        
        if task["assignee_agent_id"] != my_id:
            return json.dumps({"error": f"Task {task_id} is not assigned to you"})
        
        # 创建汇报
        reports = TaskReportRepository(store)
        report = reports.create({
            "task_id": task_id,
            "reporter_agent_id": my_id,
            "content": content,
            "attachments": attachments or [],
            "report_type": report_type,
        }, conn=store.conn)
        
        # 如果是最终汇报，更新任务状态为 review
        if report_type == "final":
            tasks.update(task_id, {"status": "review"}, {"status"}, conn=store.conn)
            report["task_status_updated"] = "review"
        
        return json.dumps(report, ensure_ascii=False)
    
    except Exception as e:
        logger.exception("Error submitting report")
        return json.dumps({"error": f"Failed to submit report: {e}"})


# ============================================================
# 5. 审批任务（管理者用）
# ============================================================

def approve_task(
    task_id: int,
    decision: str,
    comment: str = "",
    parent_agent=None,
) -> str:
    """
    审批下属提交的最终任务汇报。
    
    Args:
        task_id: 任务 ID
        decision: 审批决定 (approve, reject, request_changes)
        comment: 审批意见
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含审批结果
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    valid_decisions = ["approve", "reject", "request_changes"]
    if decision not in valid_decisions:
        return json.dumps({
            "error": f"Invalid decision: {decision}. Must be one of: {', '.join(valid_decisions)}"
        })
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        # 权限校验
        require_management_permission(store, my_id, "can_approve_tasks")
        
        # 验证任务存在且是我创建的
        tasks = TaskRepository(store)
        task = tasks.get(task_id, conn=store.conn)
        if not task:
            return json.dumps({"error": f"Task {task_id} not found"})
        
        if task["creator_agent_id"] != my_id:
            return json.dumps({"error": f"Task {task_id} was not created by you. You can only approve tasks you assigned."})
        
        # 创建审批记录
        approvals = ApprovalRepository(store)
        approval = approvals.create({
            "task_id": task_id,
            "approver_agent_id": my_id,
            "decision": decision,
            "comment": comment,
        }, conn=store.conn)
        
        # 更新任务状态
        new_status = {
            "approve": "completed",
            "reject": "rejected",
            "request_changes": "in_progress",
        }[decision]
        tasks.update(task_id, {"status": new_status}, {"status"}, conn=store.conn)
        approval["task_status_updated"] = new_status
        
        # 如果批准完成，记录完成时间
        if decision == "approve":
            tasks.update(task_id, {"completed_at": datetime.now()}, {"completed_at"}, conn=store.conn)
        
        return json.dumps(approval, ensure_ascii=False)
    
    except PermissionError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception("Error approving task")
        return json.dumps({"error": f"Failed to approve task: {e}"})


# ============================================================
# 6. 跨 Agent 工作区文件共享
# ============================================================

def share_file_with_subordinate(
    subordinate_agent_id: int,
    source_file_path: str,
    target_file_name: str = None,
    parent_agent=None,
) -> str:
    """
    将管理者工作区的文件共享给下属的任务工作区。
    用于：参考文档、需求说明、设计稿等
    
    Args:
        subordinate_agent_id: 下属 Agent 的 ID
        source_file_path: 源文件路径（管理者工作区内的文件）
        target_file_name: 目标文件名（可选，默认使用源文件名）
        parent_agent: 调用此工具的父 Agent（自动注入，不需要手动传）
    
    Returns:
        JSON 字符串包含共享结果
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = _get_org_store(parent_agent)
        my_id = _get_agent_id(parent_agent)
        
        # 权限校验
        require_management_permission(store, my_id, "can_assign_tasks")
        
        # 上下级关系校验
        if not is_subordinate(store, my_id, subordinate_agent_id):
            return json.dumps({
                "error": f"Agent {subordinate_agent_id} is not your subordinate. "
                         "You can only share files with agents who report directly to you."
            })
        
        # 验证源文件存在
        source_path = Path(source_file_path)
        if not source_path.exists():
            return json.dumps({"error": f"Source file not found: {source_file_path}"})
        if not source_path.is_file():
            return json.dumps({"error": f"Source is not a file: {source_file_path}"})
        
        # 获取下属工作区
        agents = AgentRepository(store)
        subordinate = agents.get(subordinate_agent_id, conn=store.conn)
        if not subordinate or not subordinate.get("workspace_path"):
            return json.dumps({"error": f"Subordinate {subordinate_agent_id} has no workspace configured"})
        
        # 确定目标路径
        target_name = target_file_name or source_path.name
        target_dir = Path(subordinate["workspace_path"]) / "shared_from_manager"
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / target_name
        
        # 复制文件
        import shutil
        shutil.copy2(source_path, target_path)
        
        return json.dumps({
            "success": True,
            "source_file": str(source_path),
            "target_file": str(target_path),
            "subordinate_id": subordinate_agent_id,
            "file_size_bytes": target_path.stat().st_size,
        }, ensure_ascii=False)
    
    except PermissionError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception("Error sharing file")
        return json.dumps({"error": f"Failed to share file: {e}"})


# ============================================================
# OpenAI Function-Calling Schema
# ============================================================

ORG_MANAGEMENT_SCHEMA = {
    "name": "org_management",
    "description": """
Organization management tools for hierarchical agent collaboration.
Only management position agents can use these tools.

FEATURES:
1. assign_task_to_subordinate - Assign a task to one of your direct reports
2. list_my_subordinates - View your team members and their current workload
3. list_my_tasks - View tasks assigned to you (all agents can use this)
4. submit_task_report - Submit progress or final report to your manager
5. approve_task - Approve/reject a subordinate's completed task (managers only)
6. share_file_with_subordinate - Share files from your workspace to a subordinate

Use these tools to manage your team, delegate work, track progress, and collaborate effectively.
""",
}

ASSIGN_TASK_SCHEMA = {
    "name": "assign_task_to_subordinate",
    "description": """
Assign a task to one of your direct subordinates.
You MUST be in a management position to use this tool.
The target agent MUST report directly to you (check with list_my_subordinates first).

Creates:
- A task record in the organization database
- A dedicated task workspace folder in the subordinate's workspace
- Status tracking from pending → in_progress → review → completed

Best practices:
1. Always include a clear, specific title
2. Describe acceptance criteria in the description
3. Set realistic deadlines for time-sensitive tasks
4. Use 'urgent' priority sparingly (reserve for true emergencies)
""",
    "parameters": {
        "type": "object",
        "properties": {
            "subordinate_agent_id": {
                "type": "integer",
                "description": "ID of the subordinate agent to assign this task to. Use list_my_subordinates to see valid IDs.",
            },
            "title": {
                "type": "string",
                "description": "Short, clear task title (10-80 characters)",
            },
            "description": {
                "type": "string",
                "description": "Detailed task description including requirements, acceptance criteria, and context.",
            },
            "priority": {
                "type": "string",
                "enum": ["low", "normal", "high", "urgent"],
                "description": "Task priority level. Default: normal",
                "default": "normal",
            },
            "deadline": {
                "type": "string",
                "description": "Deadline in ISO format: YYYY-MM-DDTHH:MM:SS (e.g., 2026-05-15T18:00:00). Optional.",
            },
            "parent_task_id": {
                "type": "integer",
                "description": "For sub-tasks: ID of the parent task. Optional.",
            },
        },
        "required": ["subordinate_agent_id", "title"],
    },
}

LIST_SUBORDINATES_SCHEMA = {
    "name": "list_my_subordinates",
    "description": """
List all your direct subordinates with their current workload statistics.
Use this before assigning tasks to:
- See who is on your team
- Check which team members have capacity (low active task count)
- Find the right person for a specific task

Returns each subordinate's ID, name, role, active tasks, and total tasks.
""",
    "parameters": {
        "type": "object",
        "properties": {
            "include_status": {
                "type": "boolean",
                "description": "Include task workload statistics. Default: true",
                "default": True,
            },
        },
    },
}

LIST_MY_TASKS_SCHEMA = {
    "name": "list_my_tasks",
    "description": """
List all tasks assigned to you, optionally filtered by status.

Use this to:
- See your pending work
- Check task details and deadlines
- Find tasks needing status updates
- View latest reports on each task

All agents can use this tool (no management permission required).
""",
    "parameters": {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["pending", "in_progress", "review", "completed", "rejected"],
                "description": "Filter tasks by status. Omit to see all tasks.",
            },
        },
    },
}

SUBMIT_REPORT_SCHEMA = {
    "name": "submit_task_report",
    "description": """
Submit a progress or final report for a task assigned to you.
Your manager will be notified automatically when you submit a report.

When to use:
- Daily/weekly progress updates
- When you encounter blockers
- When you complete the task (use report_type: "final")

After submitting a "final" report:
- Task status changes to "review"
- Your manager will review and approve/request changes
""",
    "parameters": {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "integer",
                "description": "ID of the task you're reporting on",
            },
            "content": {
                "type": "string",
                "description": "Detailed report content: what was done, progress, blockers, results",
            },
            "report_type": {
                "type": "string",
                "enum": ["progress", "final"],
                "description": "Type of report: 'progress' for updates, 'final' when task is complete",
                "default": "progress",
            },
            "attachments": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of file paths to attach to this report (e.g., output files, screenshots)",
            },
        },
        "required": ["task_id", "content"],
    },
}

APPROVE_TASK_SCHEMA = {
    "name": "approve_task",
    "description": """
Approve or reject a task that your subordinate submitted as complete.
You MUST be the task creator (assigned the task) to use this tool.

Decision options:
- approve: Task is complete and satisfactory. Marks as completed.
- reject: Work is unacceptable and cannot be salvaged. Marks as rejected.
- request_changes: Work is on the right track but needs revisions.
                   Send back with specific feedback on what to change.
""",
    "parameters": {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "integer",
                "description": "ID of the task to approve/reject",
            },
            "decision": {
                "type": "string",
                "enum": ["approve", "reject", "request_changes"],
                "description": "Approval decision",
            },
            "comment": {
                "type": "string",
                "description": "Explanation of your decision: what was good, what needs to change, why rejected",
            },
        },
        "required": ["task_id", "decision"],
    },
}

SHARE_FILE_SCHEMA = {
    "name": "share_file_with_subordinate",
    "description": """
Share a file from your workspace with one of your subordinates.
The file is copied to the subordinate's workspace in a shared_from_manager folder.

Use this to share:
- Reference documents
- Requirements specs
- Design files
- Sample data
- Templates
""",
    "parameters": {
        "type": "object",
        "properties": {
            "subordinate_agent_id": {
                "type": "integer",
                "description": "ID of the subordinate to share with",
            },
            "source_file_path": {
                "type": "string",
                "description": "Full path to the file in your workspace",
            },
            "target_file_name": {
                "type": "string",
                "description": "Rename the file when sharing (optional). Default: keep original name.",
            },
        },
        "required": ["subordinate_agent_id", "source_file_path"],
    },
}
```

- [ ] **Step 4: 在 tools/registry.py 中注册工具集**

找到 `tools/registry.py` 中导入其他工具的地方，添加：
```python
# 在文件开头的导入部分添加
from tools.org_management_tool import (
    ASSIGN_TASK_SCHEMA,
    LIST_SUBORDINATES_SCHEMA,
    LIST_MY_TASKS_SCHEMA,
    SUBMIT_REPORT_SCHEMA,
    APPROVE_TASK_SCHEMA,
    SHARE_FILE_SCHEMA,
    assign_task_to_subordinate,
    list_my_subordinates,
    list_my_tasks,
    submit_task_report,
    approve_task,
    share_file_with_subordinate,
)
```

然后在注册表部分添加：
```python
# 任务分配
registry.register(
    name="assign_task_to_subordinate",
    toolset="org_management",
    schema=ASSIGN_TASK_SCHEMA,
    handler=lambda args, **kw: assign_task_to_subordinate(
        subordinate_agent_id=args.get("subordinate_agent_id"),
        title=args.get("title"),
        description=args.get("description", ""),
        priority=args.get("priority", "normal"),
        deadline=args.get("deadline"),
        parent_task_id=args.get("parent_task_id"),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="📋",
)

# 列出下属
registry.register(
    name="list_my_subordinates",
    toolset="org_management",
    schema=LIST_SUBORDINATES_SCHEMA,
    handler=lambda args, **kw: list_my_subordinates(
        include_status=args.get("include_status", True),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="👥",
)

# 列出我的任务
registry.register(
    name="list_my_tasks",
    toolset="org_management",
    schema=LIST_MY_TASKS_SCHEMA,
    handler=lambda args, **kw: list_my_tasks(
        status=args.get("status"),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="📝",
)

# 提交任务汇报
registry.register(
    name="submit_task_report",
    toolset="org_management",
    schema=SUBMIT_REPORT_SCHEMA,
    handler=lambda args, **kw: submit_task_report(
        task_id=args.get("task_id"),
        content=args.get("content"),
        report_type=args.get("report_type", "progress"),
        attachments=args.get("attachments"),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="📤",
)

# 审批任务
registry.register(
    name="approve_task",
    toolset="org_management",
    schema=APPROVE_TASK_SCHEMA,
    handler=lambda args, **kw: approve_task(
        task_id=args.get("task_id"),
        decision=args.get("decision"),
        comment=args.get("comment", ""),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="✅",
)

# 共享文件
registry.register(
    name="share_file_with_subordinate",
    toolset="org_management",
    schema=SHARE_FILE_SCHEMA,
    handler=lambda args, **kw: share_file_with_subordinate(
        subordinate_agent_id=args.get("subordinate_agent_id"),
        source_file_path=args.get("source_file_path"),
        target_file_name=args.get("target_file_name"),
        parent_agent=kw.get("parent_agent"),
    ),
    emoji="📁",
)
```

- [ ] **Step 5: 运行测试，验证通过**

Run: `pytest tests/gateway/test_org_management.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add tools/org_management_tool.py tools/registry.py tests/gateway/test_org_management.py
git commit -m "feat(org): add organization management toolset"
```

---

## Task 5: 扩展 SOUL 模板，添加管理章节

**Files:**
- Modify: `gateway/org/services.py`
- Modify: `gateway/org/inheritance.py` (ProfileProvisionService.provision method)

- [ ] **Step 1: 扩展 SoulRenderService，添加管理角色判断**

在 `gateway/org/services.py` 的 SoulRenderService 类中添加方法：
```python
class SoulRenderService:
    # ... existing methods ...

    def _is_manager(self, agent: dict, position: dict) -> bool:
        """Check if an agent has management responsibilities."""
        # Check 1: leadership_role is primary or deputy
        leadership_role = agent.get("leadership_role", "none")
        if leadership_role in ("primary", "deputy"):
            return True
        
        # Check 2: position is marked as management position
        if position.get("is_management_position"):
            return True
        
        # Check 3: has subordinates
        if agent.get("id"):
            subordinates = self.store.query_all(
                "SELECT COUNT(*) as count FROM agents WHERE manager_agent_id = ? AND status = 'active'",
                (agent["id"],),
            )
            if subordinates and subordinates[0].get("count", 0) > 0:
                return True
        
        return False
    
    def _is_root_agent(self, agent_id: int) -> bool:
        """Check if this is the root agent (me / user).
        
        Root agent has special privileges:
        - Can assign tasks to ANY manager in the organization
        - Is not subject to subordinate relationship checks
        """
        # Agent ID 0, 1, or None typically means root agent
        if agent_id in (0, 1, None):
            return True
        
        # Agent with no manager is a root-level agent
        agent = self.store.query_one(
            "SELECT manager_agent_id FROM agents WHERE id = ?",
            (agent_id,),
        )
        if agent and (agent.get("manager_agent_id") is None or agent.get("manager_agent_id") == 0):
            return True
        
        return False

    def _render_manager_section(self, agent: dict, position: dict) -> str:
        """Render the management section for manager agents."""
        if not self._is_manager(agent, position):
            return ""
        
        return """
## 我的管理职责

你是一名管理者，拥有以下管理权限：

### 📋 任务分配
使用 `assign_task_to_subordinate()` 工具将任务分配给你的直属下属。
- 先使用 `list_my_subordinates()` 查看你的团队成员
- 分配任务时明确：目标、优先级、截止时间
- 任务会自动创建专属工作区

### 📊 进度跟踪
- 使用 `list_my_tasks(status="in_progress")` 查看进行中任务
- 下属提交汇报时，你可以在任务详情中看到

### ✅ 审批工作流
- 下属提交最终汇报后，使用 `approve_task()` 审批
- 可选：批准通过 / 拒绝 / 要求修改

### 📁 文件共享
使用 `share_file_with_subordinate()` 将你的工作文件共享给下属。

**重要管理原则：**
1. 合理分配任务，避免单一下属过载
2. 定期检查进度，及时提供指导
3. 审批时给出明确的反馈意见
4. 重要决策留下书面记录
"""

    def _render_contributor_section(self, agent: dict, position: dict) -> str:
        """Render the individual contributor section for non-manager agents."""
        if self._is_manager(agent, position):
            return ""
        
        return """
## 我的工作方式

你是一名一线贡献者。

### 📥 接收任务
- 使用 `list_my_tasks()` 查看分配给你的任务
- 每个任务有独立的工作目录

### 📤 提交汇报
- 定期使用 `submit_task_report()` 向管理者汇报进度
- 最终完成时提交完整成果和总结（report_type: "final"）
- 管理者审批后任务正式结束
"""
```

- [ ] **Step 2: 在 render 方法中集成新章节**

找到 `render()` 方法中返回 SOUL 模板的地方，在返回前添加管理章节：
```python
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
        # ... existing code ...
        
        # 原有模板渲染逻辑
        base = tpl.get("base_soul_md") or self._default_template()
        body = base
        for key, value in context.items():
            body = body.replace("{{" + key + "}}", str(value))
        
        # NEW: 添加管理角色专属章节
        body += self._render_manager_section(agent, position)
        
        # NEW: 添加一线贡献者章节
        body += self._render_contributor_section(agent, position)
        
        # ... rest of existing code ...
        if prompt_snippets:
            body += "\n\n# Inherited Knowledge\n\n" + "\n\n---\n\n".join(prompt_snippets)
        if not body.endswith("\n"):
            body += "\n"
        return body
```

- [ ] **Step 3: 在 ProfileProvisionService.provision 中初始化权限**

在 `ProfileProvisionService.provision()` 方法中，创建 profile 元数据后添加权限初始化：
```python
    def provision(
        self,
        agent_id: int,
        conn: sqlite3.Connection,
    ) -> dict[str, Any]:
        # ... existing code ...
        
        if not profile:
            profile = self.create_metadata(agent, position, conn)
        
        # NEW: 初始化管理权限
        # 判断是否是管理角色
        is_manager = (
            position.get("is_management_position")
            or agent.get("leadership_role") in ("primary", "deputy")
        )
        
        # 初始化权限记录
        from gateway.org.store import AgentPermissionRepository
        perms_repo = AgentPermissionRepository(self.store)
        perms_repo.create_or_update(
            {
                "agent_id": agent_id,
                "can_assign_tasks": 1 if is_manager else 0,
                "can_approve_tasks": 1 if is_manager else 0,
                "max_subordinates": 10 if is_manager else 0,
            },
            conn=conn,
        )
        
        # ... rest of existing code ...
```

- [ ] **Step 4: 运行现有测试确保没有破坏**

Run: `pytest tests/gateway/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add gateway/org/services.py
git commit -m "feat(org): add management role sections to SOUL template"
```

---

## Task 6: 在启动时自动运行数据库迁移

**Files:**
- Modify: `gateway/run.py`

- [ ] **Step 1: 找到 Gateway 初始化代码，添加迁移调用**

在 `gateway/run.py` 中找到创建或初始化 OrganizationStore 的地方（可能在 `__main__` 或某个初始化函数中），添加：

```python
# 在 OrganizationStore 创建后运行迁移
from gateway.org.store import OrganizationStore

org_store = OrganizationStore()
org_store.run_migrations()
```

**注意：** 具体位置取决于当前代码结构。找到正确的初始化点很重要。

- [ ] **Step 2: Commit**

```bash
git add gateway/run.py
git commit -m "feat(org): auto-run database migrations on gateway startup"
```

---

## 实施完成总结

Plan complete and saved to `docs/superpowers/plans/2026-04-28-organization-management.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**现在开始？**

---

---

## Task 7: 管理者 Agent 智能任务拆分与分配 (核心功能)

**Files:**
- Create: `tools/manager_task_planner.py`
- Modify: `gateway/org/services.py` (SoulRenderService)

- [ ] **Step 1: 创建任务规划工具**

```python
"""
Manager Task Planner - 管理者智能任务拆分与分配

This tool enables manager agents to:
1. Analyze a large task assigned by me (the root agent)
2. Break it down into 3-5 actionable subtasks
3. Analyze team members' skills and current workload
4. Match subtasks to the most appropriate subordinates
5. Generate a complete assignment plan with timelines
"""

import json
import logging
from typing import List, Dict, Any, Tuple

from gateway.org.store import OrganizationStore, AgentRepository, TaskRepository
from gateway.org.permissions import require_management_permission

logger = logging.getLogger(__name__)


def analyze_team_capacity(store: OrganizationStore, manager_id: int) -> List[Dict]:
    """
    分析我的团队的当前工作负载和技能情况。
    
    Returns:
        List of subordinate info with:
        - id, name, role
        - active_tasks_count
        - skills (from position/agent profile)
        - availability_score
    """
    agents = AgentRepository(store)
    tasks = TaskRepository(store)
    
    subordinates = store.query_all(
        "SELECT * FROM agents WHERE manager_agent_id = ? AND status = 'active' AND enabled = 1",
        (manager_id,),
    )
    
    result = []
    for sub in subordinates:
        sub_tasks = tasks.list_by_assignee(sub["id"], conn=store.conn)
        active_tasks = [t for t in sub_tasks if t["status"] in ("pending", "in_progress")]
        
        # 从职位描述提取技能关键词
        position = store.query_one(
            "SELECT name, responsibilities FROM positions WHERE id = ?",
            (sub["position_id"],),
        )
        skills = []
        if position and position.get("responsibilities"):
            # 简单的关键词提取
            resp = position["responsibilities"].lower()
            skill_keywords = ["python", "javascript", "react", "vue", "backend", "frontend", 
                             "devops", "design", "testing", "architecture", "database", "cloud"]
            skills = [k for k in skill_keywords if k in resp]
        
        # 可用性评分：任务越少分数越高
        availability_score = max(0, 10 - len(active_tasks) * 2)
        
        result.append({
            "id": sub["id"],
            "name": sub.get("display_name") or sub.get("name"),
            "role": position.get("name") if position else "Unknown",
            "active_tasks_count": len(active_tasks),
            "skills": skills,
            "availability_score": availability_score,
            "workspace_path": sub.get("workspace_path"),
        })
    
    return sorted(result, key=lambda x: x["availability_score"], reverse=True)


def generate_subtask_plan(
    parent_task_title: str,
    parent_task_description: str,
    team_capacity: List[Dict],
    deadline: str = None,
) -> Dict[str, Any]:
    """
    智能生成子任务拆分和分配方案。
    
    Args:
        parent_task_title: 父任务标题
        parent_task_description: 父任务详细描述
        team_capacity: 团队能力分析结果（来自 analyze_team_capacity）
        deadline: 截止时间（可选）
    
    Returns:
        完整的分配方案，包含：
        - subtasks: 3-5 个子任务列表
        - assignments: 每个子任务推荐的执行者
        - timeline: 建议的时间线
        - dependencies: 子任务间依赖关系
    """
    # 这是 LLM 友好的结构化提示，管理者 Agent 会用 LLM 来完成实际的拆分
    # 这里提供框架和数据结构
    
    subtask_template = {
        "id": "stub_1",
        "title": "子任务标题",
        "description": "子任务详细描述",
        "skills_required": ["skill1", "skill2"],
        "estimated_days": 3,
        "priority": "high",
        "assigned_to_recommended": None,  # 推荐的下属 ID
        "dependencies": [],  # 依赖的子任务 ID 列表
    }
    
    plan = {
        "parent_task": parent_task_title,
        "analysis_summary": "",
        "subtasks": [],
        "assignments": {},
        "timeline": {
            "start_date": "",
            "milestones": [],
            "deadline": deadline,
        },
        "risks": [],
    }
    
    return plan


def plan_task_assignment(
    parent_task_title: str,
    parent_task_description: str,
    deadline: str = None,
    parent_agent=None,
) -> str:
    """
    **管理者专用工具：** 分析我收到的任务，智能拆分成子任务并分配给下属。
    
    当我（作为管理者）从我的上级（通常是用户/Root Agent）收到一个大任务时，
    使用此工具来：
    1. 分析我的团队当前工作负载
    2. 根据每个人的技能和可用性推荐分配方案
    3. 生成完整的子任务计划
    
    Args:
        parent_task_title: 我收到的任务标题
        parent_task_description: 我收到的任务详细描述
        deadline: 整体截止时间（可选）
        parent_agent: 调用此工具的父 Agent（自动注入）
    
    Returns:
        JSON 包含：团队分析、建议的子任务列表、推荐的人员分配
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        from gateway.org.permissions import _get_agent_id, PermissionError
        
        store = OrganizationStore()  # TODO: use _get_org_store
        my_id = _get_agent_id(parent_agent)
        
        # 权限校验：只有管理者可以使用此工具
        require_management_permission(store, my_id, "can_assign_tasks")
        
        # Step 1: 分析团队当前情况
        team = analyze_team_capacity(store, my_id)
        
        # Step 2: 生成分配方案框架
        # （管理者 Agent 的 LLM 会基于此框架填充具体拆分）
        plan = {
            "team_analysis": {
                "team_size": len(team),
                "members": team,
                "most_available": team[0] if team else None,
            },
            "parent_task": {
                "title": parent_task_title,
                "description": parent_task_description,
                "deadline": deadline,
            },
            "recommended_next_steps": """
作为管理者，请基于以下团队分析，将任务拆分为 3-5 个子任务：

1. 首先理解任务的整体目标和交付物
2. 考虑团队成员的技能和当前工作负载
3. 将大任务拆分为可独立执行的子任务
4. 为每个子任务匹配最合适的执行者
5. 考虑子任务之间的依赖关系和执行顺序

然后使用 assign_task_to_subordinate() 逐个分配子任务。
""",
            "assignment_template": {
                "subtask_title": "子任务名称",
                "subtask_description": "详细描述和验收标准",
                "assignee_id": "推荐的下属 ID",
                "priority": "normal/high",
                "days_estimated": 3,
            },
        }
        
        return json.dumps(plan, ensure_ascii=False, indent=2)
    
    except PermissionError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception("Error planning task assignment")
        return json.dumps({"error": f"Failed to plan task assignment: {e}"})


def get_all_subtasks_status(
    parent_task_id: int,
    parent_agent=None,
) -> str:
    """
    **管理者专用工具：** 查看我分配的所有子任务的当前状态。
    
    用于：
    - 跟踪整体进度
    - 发现阻塞的子任务
    - 准备向上级汇报
    """
    if parent_agent is None:
        return json.dumps({"error": "Missing parent agent context"})
    
    try:
        store = OrganizationStore()  # TODO: use _get_org_store
        
        # 查询所有此任务的子任务
        child_tasks = store.query_all(
            "SELECT * FROM tasks WHERE parent_task_id = ? ORDER BY status, created_at",
            (parent_task_id,),
        )
        
        # 统计
        status_counts = {}
        for task in child_tasks:
            status = task["status"]
            status_counts[status] = status_counts.get(status, 0) + 1
        
        # 计算完成率
        total = len(child_tasks)
        completed = status_counts.get("completed", 0)
        completion_rate = (completed / total * 100) if total > 0 else 0
        
        result = {
            "parent_task_id": parent_task_id,
            "total_subtasks": total,
            "status_breakdown": status_counts,
            "completion_rate_percent": round(completion_rate, 1),
            "subtasks": child_tasks,
        }
        
        return json.dumps(result, ensure_ascii=False, indent=2)
    
    except Exception as e:
        logger.exception("Error getting subtasks status")
        return json.dumps({"error": f"Failed to get subtasks status: {e}"})


# ============================================================
# Tool Schema
# ============================================================

PLAN_TASK_SCHEMA = {
    "name": "plan_task_assignment",
    "description": """
【管理者专用工具】智能任务规划与分配。

当你（作为管理者）从上级收到一个大任务时，使用此工具来：
1. 分析你的团队当前的工作负载和技能情况
2. 获取任务拆分框架和建议
3. 然后使用 assign_task_to_subordinate() 逐个分配子任务

**使用流程：**
1. 我给你分配了一个大任务
2. 你调用 plan_task_assignment() 分析团队和生成拆分方案
3. LLM 思考后，你得到每个子任务的建议分配
4. 你循环调用 assign_task_to_subordinate() 逐个分配
5. 后续使用 get_all_subtasks_status() 跟踪进度

这是实现"我→管理者→下属"两级管理的核心工具！
""",
    "parameters": {
        "type": "object",
        "properties": {
            "parent_task_title": {
                "type": "string",
                "description": "你收到的上级任务的标题（我给你的任务标题）",
            },
            "parent_task_description": {
                "type": "string",
                "description": "你收到的上级任务的详细描述",
            },
            "deadline": {
                "type": "string",
                "description": "整体任务的截止时间（ISO 格式，可选）",
            },
        },
        "required": ["parent_task_title", "parent_task_description"],
    },
}

GET_SUBTASKS_STATUS_SCHEMA = {
    "name": "get_all_subtasks_status",
    "description": """
【管理者专用工具】查看我分配的所有子任务的状态汇总。

使用场景：
- 定期检查团队进度
- 准备向上级汇报
- 发现阻塞的任务并介入帮助
- 计算整体完成率
""",
    "parameters": {
        "type": "object",
        "properties": {
            "parent_task_id": {
                "type": "integer",
                "description": "父任务的 ID（我分配给你的那个任务的 ID）",
            },
        },
        "required": ["parent_task_id"],
    },
}
```

- [ ] **Step 2: 在 tools/registry.py 注册新工具**
- [ ] **Step 3: 扩展管理者的 SOUL 章节，强调两级管理流程**

```markdown
## 🎯 我的核心管理职责

你是公司的管理者，直接向我（老板/用户）汇报。

### 当我给你分配任务时，请按以下流程执行：

**Step 1: 理解并确认任务**
- 仔细阅读我给你的任务目标和要求
- 如有疑问，立即向我确认澄清

**Step 2: 智能拆分与规划 (关键！)**
- 立即调用 `plan_task_assignment()` 工具
- 该工具会：
  • 分析你的团队当前工作负载
  • 显示每个人的技能和可用性
  • 生成任务拆分框架

**Step 3: 分配子任务**
- 根据规划结果，循环调用 `assign_task_to_subordinate()`
- 将大任务拆分成 3-5 个可执行的子任务
- 分配给最合适的下属

**Step 4: 跟踪进度**
- 定期调用 `get_all_subtasks_status()` 查看进度
- 对阻塞的任务提供帮助或调整资源

**Step 5: 汇总汇报**
- 所有子任务完成后，你汇总最终结果
- 使用 `submit_task_report(report_type="final")` 向我汇报
- 任务状态变为 review，等待我最终验收

### ⚠️ 重要原则
1. **你不需要亲自执行具体工作** - 你的职责是管理和协调
2. **合理拆分** - 每个子任务应该 1-5 天可以完成
3. **匹配技能** - 把合适的任务给合适的人
4. **主动沟通** - 遇到问题或延期风险时及时告诉我
5. **最终负责** - 你对整个任务的最终交付质量负责

记住：你的价值在于管理和协调，而不是亲自做所有事！
```

- [ ] **Step 4: 运行所有测试确保集成正确**

Run: `pytest tests/gateway/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add tools/manager_task_planner.py gateway/org/services.py tools/registry.py
git commit -m "feat(org): add manager intelligent task planning feature (me → manager → subordinate)"
```

---

**完整功能清单：**

| 功能 | 描述 |
|------|------|
| 👤 **我 → 管理者** | 我可以给组织中的任何管理者直接分配任务 |
| 🧠 **管理者智能拆分** | 管理者用 `plan_task_assignment()` 分析团队，智能拆分子任务 |
| 📋 **管理者 → 下属** | 管理者用 `assign_task_to_subordinate()` 分配给直属下属 |
| 📊 **进度汇总** | 管理者用 `get_all_subtasks_status()` 查看所有子任务状态 |
| 👥 **团队视图** | 查看下属列表及其工作负载 |
| 📝 **任务追踪** | 每个人看到分配给自己的任务 |
| 📤 **进度汇报** | 下属→管理者→我，两级汇报链条 |
| ✅ **审批工作流** | 管理者审批下属，我最终审批管理者 |
| 📁 **文件共享** | 管理者可向下属共享文件 |
| 🔐 **两级权限控制** | Root Agent 特殊权限 + 普通管理者权限 |
| 📊 **工作区隔离** | 每个任务有独立工作目录 |
| 💾 **持久化存储** | SQLite 存储所有任务、汇报、审批记录 |

---

## Task 8: 前端 @提及交互 (用户友好的任务下达方式)

**Files:**
- Modify: `web/src/pages/Chat.tsx` 或对应聊天页面组件
- Create: `web/src/components/OrganizationMention.tsx` - @提及组件
- Modify: `gateway/platforms/api_server_chat.py` - 消息处理后端

- [ ] **Step 1: 公司选择器组件**

```tsx
// web/src/components/CompanySelector.tsx
/**
 * 公司/组织选择器 - 让用户先选择要在哪个组织中工作
 */
import React, { useState, useEffect } from 'react';

interface Company {
  id: number;
  name: string;
  description?: string;
}

export const CompanySelector: React.FC<{
  selectedCompanyId: number | null;
  onSelect: (companyId: number) => void;
}> = ({ selectedCompanyId, onSelect }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  
  useEffect(() => {
    // 加载公司列表
    fetch('/api/organization/companies')
      .then(r => r.json())
      .then(setCompanies);
  }, []);
  
  return (
    <div className="company-selector">
      <span className="icon">🏢</span>
      <select 
        value={selectedCompanyId || ''}
        onChange={(e) => onSelect(Number(e.target.value))}
      >
        <option value="">选择组织...</option>
        {companies.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
};
```

- [ ] **Step 2: @提及输入框组件**

```tsx
// web/src/components/OrganizationMentionInput.tsx
/**
 * 支持 @提及公司成员的聊天输入框
 * 输入 @ 时弹出成员列表，选择后自动高亮
 */
import React, { useState, useRef } from 'react';
import { Popover, Avatar } from 'your-ui-library';

interface Agent {
  id: number;
  name: string;
  display_name: string;
  position_name: string;
  avatar_url?: string;
  leadership_role: string;
}

interface Mention {
  id: number;
  name: string;
  displayName: string;
  start: number;
  end: number;
}

export const OrganizationMentionInput: React.FC<{
  companyId: number | null;
  onSendMessage: (content: string, mentionedAgentIds: number[]) => void;
}> = ({ companyId, onSendMessage }) => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [showAgentList, setShowAgentList] = useState(false);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // 检测 @ 输入，加载公司成员列表
  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    setText(value);
    
    const cursorPos = e.currentTarget.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1 && lastAtIndex === cursorPos - 1) {
      // 刚输入 @，弹出成员列表
      if (companyId) {
        fetch(`/api/organization/companies/${companyId}/agents`)
          .then(r => r.json())
          .then(setAgentList);
        setShowAgentList(true);
        setSearchQuery('');
      }
    } else if (lastAtIndex !== -1) {
      // 继续输入搜索词
      setSearchQuery(textBeforeCursor.slice(lastAtIndex + 1));
    } else {
      setShowAgentList(false);
    }
  };
  
  // 选择成员
  const selectAgent = (agent: Agent) => {
    const mentionText = `@${agent.display_name || agent.name} `;
    const cursorPos = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    // 替换 @ 为 @名字
    const newText = 
      text.slice(0, lastAtIndex) + 
      mentionText + 
      text.slice(cursorPos);
    
    setText(newText);
    setShowAgentList(false);
    
    // 记录提及
    setMentions(prev => [...prev, {
      id: agent.id,
      name: agent.name,
      displayName: agent.display_name || agent.name,
      start: lastAtIndex,
      end: lastAtIndex + mentionText.length,
    }]);
  };
  
  // 过滤成员列表
  const filteredAgents = agentList.filter(a => 
    (a.display_name || a.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.position_name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // 发送消息
  const handleSend = () => {
    const mentionedIds = mentions.map(m => m.id);
    onSendMessage(text, mentionedIds);
    setText('');
    setMentions([]);
  };
  
  return (
    <div className="mention-input-wrapper">
      {/* 渲染带高亮的文本预览层 */}
      <div className="text-preview" style={{ /* 样式: 底层不可见，用于高亮 */ }}>
        {renderWithHighlights(text, mentions)}
      </div>
      
      {/* 实际输入框 */}
      <textarea
        ref={inputRef}
        value={text}
        onInput={handleInput}
        placeholder="输入 @ 来提及团队成员，例如：@CTO 给我设计新的用户系统"
      />
      
      {/* @提及弹出框 */}
      {showAgentList && companyId && (
        <Popover>
          <div className="agent-list">
            <div className="list-header">选择要指派的人</div>
            {filteredAgents.map(agent => (
              <div 
                key={agent.id} 
                className="agent-item"
                onClick={() => selectAgent(agent)}
              >
                <Avatar size="small" src={agent.avatar_url}>
                  {agent.leadership_role === 'primary' && '👑'}
                  {agent.leadership_role === 'deputy' && '🎖️'}
                </Avatar>
                <div className="agent-info">
                  <div className="agent-name">
                    {agent.display_name || agent.name}
                    {agent.leadership_role !== 'none' && (
                      <span className="role-badge manager">管理者</span>
                    )}
                  </div>
                  <div className="agent-position">{agent.position_name}</div>
                </div>
              </div>
            ))}
          </div>
        </Popover>
      )}
      
      <button onClick={handleSend}>发送</button>
    </div>
  );
};

// 高亮渲染提及的文本
function renderWithHighlights(text: string, mentions: Mention[]) {
  // 将文本分段，提及的部分用 <span class="mention-highlight"> 包裹
  // 省略具体实现...
  return <span>{text}</span>;
}
```

- [ ] **Step 3: 后端 API - 按公司获取 Agent 列表**

在 `gateway/platforms/api_server_chat.py` 中添加：

```python
# GET /api/organization/companies
async def list_companies(request):
    """获取所有公司列表"""
    from gateway.org.store import OrganizationStore
    store = OrganizationStore()
    companies = store.query_all("SELECT id, name, description FROM companies ORDER BY name")
    return web.json_response(companies)

# GET /api/organization/companies/{company_id}/agents
async def list_company_agents(request):
    """获取指定公司的所有 Agent 列表（用于@提及）"""
    company_id = int(request.match_info["company_id"])
    from gateway.org.store import OrganizationStore
    store = OrganizationStore()
    
    agents = store.query_all("""
        SELECT 
            a.id, a.name, a.display_name, a.avatar_url,
            a.leadership_role,
            p.name as position_name
        FROM agents a
        JOIN positions p ON a.position_id = p.id
        WHERE a.company_id = ? 
          AND a.status = 'active'
          AND a.enabled = 1
        ORDER BY p.is_management_position DESC, a.leadership_role, a.name
    """, (company_id,))
    
    return web.json_response(agents)
```

- [ ] **Step 4: 消息处理 - @提及自动切换上下文**

在聊天处理 API 中增加：当消息中包含 `@agent_id` 时，自动切换到该 Agent 的 Profile 上下文：

```python
# 在 chat_completion 处理逻辑中
async def handle_chat_message(request):
    data = await request.json()
    messages = data.get("messages", [])
    mentioned_agent_ids = data.get("mentioned_agent_ids", [])
    
    # 如果 @了特定 Agent，切换到该 Agent 的 Profile 上下文
    target_agent_id = None
    if mentioned_agent_ids:
        # 取第一个被 @ 的人作为主要对话对象
        target_agent_id = mentioned_agent_ids[0]
    
    # 解析 Profile 上下文
    if target_agent_id:
        from gateway.org.runtime import resolve_chat_profile
        profile = resolve_chat_profile(target_agent_id)
        if profile:
            # 注入 SOUL.md 到系统提示
            soul_path = Path(profile.profile_home) / "SOUL.md"
            if soul_path.exists():
                system_prompt = soul_path.read_text(encoding="utf-8")
                messages.insert(0, {"role": "system", "content": system_prompt})
    
    # ... 其余聊天处理逻辑
```

- [ ] **Step 5: 集成到主聊天页面**

修改聊天页面，将公司选择器和 @提及输入框集成进去。

- [ ] **Step 6: 对话气泡中的提及高亮**

在聊天消息渲染组件中，将 `@名字` 部分高亮显示，点击可以查看该人的信息卡片。

- [ ] **Step 7: Commit**

```bash
git add web/src/components/CompanySelector.tsx
git add web/src/components/OrganizationMentionInput.tsx
git add web/src/pages/Chat.tsx
git add gateway/platforms/api_server_chat.py
git commit -m "feat(frontend): add @mention interaction for task assignment"
```

---

**架构优势：**
1. **真正的组织化管理**：不是简单的 delegate，而是符合公司架构的我→管理者→下属
2. **与现有组织架构完全集成**：复用 agents、positions、departments 表
3. **管理者有思考过程**：不是机械分配，而是有分析、规划、决策的完整过程
4. **✨ 用户友好的交互**：选择公司 → @某人 → 发送任务，直观流畅
5. **可扩展**：未来可以增加更多管理智能（自动优先级、技能匹配算法等）

---

## 🎯 最终 8 任务总览

| Task | 名称 | 核心功能 |
|------|------|---------|
| 1 | 数据库表结构设计 | tasks/reports/approvals/permissions 4 张表 |
| 2 | Repository 类和迁移 | 数据访问层和自动迁移 |
| 3 | 权限和关系检查 | Root Agent 特殊权限 + 普通管理者权限 |
| 4 | 6 个组织管理工具 | 任务分配、列表、汇报、审批、文件共享 |
| 5 | SOUL 模板扩展 | 管理者和普通员工的专属系统提示 |
| 6 | 启动时自动迁移 | 无缝升级 |
| 7 | **管理者智能任务拆分** | plan_task_assignment() + get_all_subtasks_status() |
| 8 | **前端 @提及交互** | 公司选择器 + @某人 下达任务 |

---

**现在的完整工作流：**

```
你
 ↓
[页面] 选择公司 → 输入框打 @ → 弹出成员列表 → 选 CTO → 写任务 → 发送
 ↓
[后端] 自动切换到 CTO Profile → 注入 CTO 的 SOUL.md
 ↓
CTO Agent (用他的身份、技能、权限运行)
 ├─ 调用 plan_task_assignment() 分析团队
 ├─ LLM 思考，拆分成 3-5 子任务
 └─ 用 assign_task_to_subordinate() 分配给下属
 ↓
下属们执行 → 汇报 → CTO 审批 → 汇总
 ↓
你收到最终回复："已完成！我把任务拆成 x/y/z，分别交给了 a/b/c 三人..."
```

---

**确认开始执行这 8 个任务吗？**