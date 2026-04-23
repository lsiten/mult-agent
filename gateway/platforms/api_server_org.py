"""Organization API handlers for the dashboard."""

from __future__ import annotations

import hmac
import json
import logging
import os
from typing import Any, Callable

from aiohttp import web

from gateway.org import OrganizationService
from gateway.org.services import OrganizationError

logger = logging.getLogger(__name__)


class OrganizationAPIHandlers:
    """Organization management API handlers."""

    def __init__(self, session_token: str, service: OrganizationService | None = None):
        self._session_token = session_token
        self._service = service or OrganizationService()

    def _check_auth(self, request: web.Request) -> bool:
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            return True
        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def _json_body(self, request: web.Request) -> dict[str, Any]:
        try:
            body = await request.read()
            if not body:
                return {}
            data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError("Request body must be a JSON object")
            return data
        except ValueError as exc:
            raise web.HTTPBadRequest(
                text=json.dumps({"error": str(exc)}),
                content_type="application/json",
            )

    async def _handle(
        self,
        request: web.Request,
        fn: Callable[[], Any],
        success_status: int = 200,
    ) -> web.Response:
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)
        try:
            return web.json_response(fn(), status=success_status)
        except OrganizationError as exc:
            return web.json_response({"error": str(exc)}, status=exc.status)
        except Exception as exc:
            logger.exception("Organization API request failed")
            return web.json_response({"error": str(exc)}, status=500)

    async def handle_get_tree(self, request: web.Request) -> web.Response:
        return await self._handle(request, self._service.get_tree)

    async def handle_create_company(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_company(data))

    async def handle_update_company(self, request: web.Request) -> web.Response:
        company_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_company(company_id, data))

    async def handle_create_department(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_department(data))

    async def handle_update_department(self, request: web.Request) -> web.Response:
        department_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_department(department_id, data))

    async def handle_create_position(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_position(data))

    async def handle_update_position(self, request: web.Request) -> web.Response:
        position_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_position(position_id, data))

    async def handle_create_agent(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_agent(data))

    async def handle_get_agent(self, request: web.Request) -> web.Response:
        agent_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.get_agent(agent_id))

    async def handle_update_agent(self, request: web.Request) -> web.Response:
        agent_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_agent(agent_id, data))

    async def handle_provision_profile(self, request: web.Request) -> web.Response:
        agent_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.provision_profile(agent_id))

    async def handle_get_workspace(self, request: web.Request) -> web.Response:
        owner_type = request.match_info["ownerType"]
        owner_id = int(request.match_info["ownerId"])
        return await self._handle(request, lambda: self._service.get_workspace(owner_type, owner_id))
