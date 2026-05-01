# gateway/platforms/api_server_workflow.py
"""Workflow API handlers for the dashboard."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from aiohttp import web

from gateway.org.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


class WorkflowAPIHandlers:
    """Workflow API handlers."""

    def __init__(self, session_token: str, workflow_store: WorkflowStore):
        self._session_token = session_token
        self._store = workflow_store

    def _check_auth(self, request: web.Request) -> bool:
        if __import__("os").getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True
        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        import hmac
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def _handle(self, request: web.Request, fn):
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)
        try:
            return web.json_response(fn())
        except Exception as exc:
            logger.exception("Workflow API request failed")
            return web.json_response({"error": str(exc)}, status=500)

    async def handle_get_workflow(self, request: web.Request) -> web.Response:
        """GET /api/org/companies/{companyId}/workflow"""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)
        company_id = int(request.match_info["companyId"])
        workflow = self._store.get_workflow_by_company(company_id)
        if workflow is None:
            return web.json_response({"error": "Workflow not found"}, status=404)
        try:
            return web.json_response({"workflow": workflow})
        except Exception as exc:
            logger.exception("Workflow API request failed")
            return web.json_response({"error": str(exc)}, status=500)

    async def handle_generate_workflow(self, request: web.Request) -> web.Response:
        """POST /api/org/companies/{companyId}/workflow/generate"""
        company_id = int(request.match_info["companyId"])
        return await self._handle(request, lambda: self._generate_workflow(company_id))

    async def handle_create_workflow(self, request: web.Request) -> web.Response:
        """POST /api/org/workflows"""
        data = await request.json()
        return await self._handle(request, lambda: self._store.create_workflow(data["company_id"], data))

    async def handle_update_workflow(self, request: web.Request) -> web.Response:
        """PUT /api/org/workflows/{id}"""
        workflow_id = int(request.match_info["id"])
        data = await request.json()
        return await self._handle(request, lambda: self._store.update_workflow(workflow_id, data))

    async def handle_delete_workflow(self, request: web.Request) -> web.Response:
        """DELETE /api/org/workflows/{id}"""
        workflow_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._store.delete_workflow(workflow_id))

    def _get_workflow_by_company(self, company_id: int):
        workflow = self._store.get_workflow_by_company(company_id)
        if workflow is None:
            raise web.HTTPNotFound(text='{"error": "Workflow not found"}')
        return {"workflow": workflow}

    def _generate_workflow(self, company_id: int):
        """
        AI-generate workflow based on company structure.
        If workflow exists, return it; otherwise create one.
        """
        existing = self._store.get_workflow_by_company(company_id)
        if existing is not None:
            return existing

        conn = self._store._conn
        depts = conn.execute(
            "SELECT id, name FROM departments WHERE company_id = ? AND status = 'active' ORDER BY sort_order",
            (company_id,),
        ).fetchall()
        
        if len(depts) == 0:
            raise ValueError("Company has no active departments to build workflow")
        
        workflow = self._store.create_workflow(company_id, {
            "name": "Auto-Generated Workflow",
            "description": "AI-generated workflow based on company structure",
        })
        
        for i in range(len(depts) - 1):
            self._store.add_edge(workflow["id"], {
                "source_department_id": depts[i]["id"],
                "target_department_id": depts[i + 1]["id"],
                "action_description": f"Hand off to {depts[i + 1]['name']}",
                "trigger_condition": "task.status == 'completed'",
                "sort_order": i,
            })
        
        return self._store.get_workflow_by_company(company_id)
