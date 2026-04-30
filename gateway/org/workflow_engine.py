"""Workflow engine for task auto-routing based on creator's department."""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from .workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


class WorkflowEngine:
    """Matches tasks to workflows and creates instances."""

    def __init__(self, workflow_store: WorkflowStore):
        self._workflow_store = workflow_store
        self._conn = workflow_store._conn

    def match_workflow(
        self, conn, creator_agent_id: int, task_title: str, task_description: str
    ) -> Optional[dict[str, Any]]:
        """
        Find the workflow for a task based on creator's department.
        
        Steps:
        1. Look up task creator's department via agents table
        2. Find workflow for that company
        3. Return workflow with starting department context
        """
        row = conn.execute(
            "SELECT company_id, department_id FROM agents WHERE id = ?",
            (creator_agent_id,),
        ).fetchone()
        
        if row is None:
            logger.warning(f"Agent {creator_agent_id} not found")
            return None
        
        company_id = row["company_id"]
        department_id = row["department_id"]
        
        workflow = self._workflow_store.get_workflow_by_company(company_id)
        if workflow is None:
            return None
        
        return {
            "workflow_id": workflow["id"],
            "company_id": company_id,
            "current_department_id": department_id,
            "edges": workflow["edges"],
        }

    def create_instance(
        self,
        workflow_id: int,
        company_id: int,
        task_id: int,
        current_department_id: int,
        current_edge_id: Optional[int] = None,
    ) -> dict[str, Any]:
        """Create a workflow_instance record linking a task to a workflow."""
        now = time.time()
        
        edge_row = self._conn.execute(
            "SELECT id FROM workflow_edges WHERE workflow_id = ? AND source_department_id = ? ORDER BY sort_order LIMIT 1",
            (workflow_id, current_department_id),
        ).fetchone()
        
        edge_id = edge_row["id"] if edge_row else None
        
        cursor = self._conn.execute(
            """INSERT INTO workflow_instances
               (workflow_id, company_id, task_id, current_edge_id, status, started_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (workflow_id, company_id, task_id, edge_id, "running", now),
        )
        
        instance_id = cursor.lastrowid
        row = self._conn.execute(
            "SELECT * FROM workflow_instances WHERE id = ?", (instance_id,)
        ).fetchone()
        
        return dict(row)
