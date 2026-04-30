# gateway/org/workflow_store.py
"""Workflow storage and CRUD operations."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Optional

from .store import OrganizationStore


class WorkflowStore:
    """Thread-safe workflow data access."""

    def __init__(self, db_path: Path | None = None):
        self._store = OrganizationStore(db_path)
        self._conn = self._store._conn
        self._lock = self._store._lock

    def create_workflow(self, company_id: int, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new workflow for a company."""
        now = time.time()
        with self._lock:
            cursor = self._conn.execute(
                """INSERT INTO workflows (company_id, name, description, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    company_id,
                    data.get("name", "Untitled Workflow"),
                    data.get("description", ""),
                    "draft",
                    now,
                    now,
                ),
            )
            workflow_id = cursor.lastrowid
            return self._get_workflow(workflow_id)

    def get_workflow_by_company(self, company_id: int) -> Optional[dict[str, Any]]:
        """Get workflow with edges for a company."""
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM workflows WHERE company_id = ?", (company_id,)
            ).fetchone()
            if row is None:
                return None
            workflow = dict(row)
            workflow["edges"] = self._get_edges(workflow["id"])
            return workflow

    def update_workflow(self, workflow_id: int, data: dict[str, Any]) -> dict[str, Any]:
        """Update workflow fields (name, description, status, edges)."""
        with self._lock:
            now = time.time()
            fields = []
            values: list[Any] = []
            for field in ("name", "description", "status"):
                if field in data:
                    fields.append(f"{field} = ?")
                    values.append(data[field])
            
            # Handle edges replacement
            if "edges" in data:
                self._conn.execute(
                    "DELETE FROM workflow_edges WHERE workflow_id = ?", (workflow_id,)
                )
                for edge in data["edges"]:
                    self._add_edge_txn(workflow_id, edge)
            
            if fields:
                fields.append("updated_at = ?")
                values.append(now)
                values.append(workflow_id)
                self._conn.execute(
                    "UPDATE workflows SET " + ", ".join(fields) + " WHERE id = ?",
                    values,
                )
            return self._get_workflow(workflow_id)

    def delete_workflow(self, workflow_id: int) -> None:
        """Delete workflow (edges cascade)."""
        with self._lock:
            self._conn.execute("DELETE FROM workflows WHERE id = ?", (workflow_id,))

    def add_edge(self, workflow_id: int, edge: dict[str, Any]) -> dict[str, Any]:
        """Add a single edge to a workflow."""
        with self._lock:
            return self._add_edge_txn(workflow_id, edge)

    def _add_edge_txn(self, workflow_id: int, edge: dict[str, Any]) -> dict[str, Any]:
        """Internal: add edge within existing lock."""
        cursor = self._conn.execute(
            """INSERT INTO workflow_edges
               (workflow_id, source_department_id, target_department_id, action_description, trigger_condition, sort_order, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                workflow_id,
                edge["source_department_id"],
                edge["target_department_id"],
                edge.get("action_description", ""),
                edge.get("trigger_condition", ""),
                edge.get("sort_order", 0),
                time.time(),
            ),
        )
        edge_id = cursor.lastrowid
        row = self._conn.execute(
            "SELECT * FROM workflow_edges WHERE id = ?", (edge_id,)
        ).fetchone()
        return dict(row)

    def _get_workflow(self, workflow_id: int) -> dict[str, Any]:
        """Get workflow by ID."""
        row = self._conn.execute(
            "SELECT * FROM workflows WHERE id = ?", (workflow_id,)
        ).fetchone()
        if row is None:
            raise ValueError(f"Workflow {workflow_id} not found")
        return dict(row)

    def _get_edges(self, workflow_id: int) -> list[dict[str, Any]]:
        """Get all edges for a workflow."""
        rows = self._conn.execute(
            "SELECT * FROM workflow_edges WHERE workflow_id = ? ORDER BY sort_order",
            (workflow_id,),
        ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        self._store.close()
