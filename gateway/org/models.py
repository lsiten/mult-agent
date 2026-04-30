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


@dataclass
class DirectorOffice:
    """Director office for strategic decision making."""
    id: Optional[int] = None
    company_id: int = 0
    department_id: int = 0
    director_agent_id: int = 0
    office_name: str = ""
    responsibilities: str = ""
    status: str = "active"  # active, inactive
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


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
    "workflows": """
        CREATE TABLE IF NOT EXISTS workflows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """,
    "workflow_edges": """
        CREATE TABLE IF NOT EXISTS workflow_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            source_department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            target_department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            action_description TEXT NOT NULL,
            trigger_condition TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
        )
    """,
    "workflow_instances": """
        CREATE TABLE IF NOT EXISTS workflow_instances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            current_edge_id INTEGER REFERENCES workflow_edges(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'running',
            started_at REAL NOT NULL,
            completed_at REAL
        )
    """,
    "director_offices": """
        CREATE TABLE IF NOT EXISTS director_offices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
            director_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
            office_name TEXT NOT NULL,
            responsibilities TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL
        )
    """,
}

# Indexes for performance
INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(creator_agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_agent_id)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)",
    "CREATE INDEX IF NOT EXISTS idx_task_reports_task ON task_reports(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflows_company ON workflows(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow ON workflow_edges(workflow_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_edges_source ON workflow_edges(source_department_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_edges_target ON workflow_edges(target_department_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_instances_workflow ON workflow_instances(workflow_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_instances_task ON workflow_instances(task_id)",
    "CREATE INDEX IF NOT EXISTS idx_workflow_instances_company ON workflow_instances(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_director_offices_company ON director_offices(company_id)",
    "CREATE INDEX IF NOT EXISTS idx_director_offices_department ON director_offices(department_id)",
    "CREATE INDEX IF NOT EXISTS idx_director_offices_director ON director_offices(director_agent_id)",
]
