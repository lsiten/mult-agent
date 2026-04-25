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

    async def handle_get_company_tree(self, request: web.Request) -> web.Response:
        """Get full organization tree for a specific company only (data isolation)."""
        company_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.get_company_tree(company_id))

    async def handle_create_company(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_company(data))

    async def handle_update_company(self, request: web.Request) -> web.Response:
        company_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_company(company_id, data))

    async def handle_delete_company(self, request: web.Request) -> web.Response:
        company_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.delete_company(company_id))

    async def handle_create_department(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_department(data))

    async def handle_update_department(self, request: web.Request) -> web.Response:
        department_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_department(department_id, data))

    async def handle_delete_department(self, request: web.Request) -> web.Response:
        department_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.delete_department(department_id))

    async def handle_create_position(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.create_position(data))

    async def handle_update_position(self, request: web.Request) -> web.Response:
        position_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(request, lambda: self._service.update_position(position_id, data))

    async def handle_delete_position(self, request: web.Request) -> web.Response:
        position_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.delete_position(position_id))

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

    async def handle_delete_agent(self, request: web.Request) -> web.Response:
        agent_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.delete_agent(agent_id))

    async def handle_provision_profile(self, request: web.Request) -> web.Response:
        agent_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.provision_profile(agent_id))

    async def handle_get_workspace(self, request: web.Request) -> web.Response:
        owner_type = request.match_info["ownerType"]
        owner_id = int(request.match_info["ownerId"])
        return await self._handle(request, lambda: self._service.get_workspace(owner_type, owner_id))

    # ------------------------------ Quick Actions (快捷操作) ------------------------------

    async def handle_get_recommended_manager(self, request: web.Request) -> web.Response:
        """获取 Agent 的推荐经理"""
        agent_id = int(request.match_info["id"])
        return await self._handle(request, lambda: self._service.get_recommended_manager(agent_id))

    async def handle_set_agent_as_leader(self, request: web.Request) -> web.Response:
        """设置 Agent 为负责人（主/副/无）"""
        agent_id = int(request.match_info["id"])
        data = await self._json_body(request)
        leadership_role = data.get("leadership_role", "none")
        return await self._handle(
            request,
            lambda: self._service.set_agent_as_leader(agent_id, leadership_role),
        )

    async def handle_set_position_as_management(self, request: web.Request) -> web.Response:
        """设置岗位为管理岗位"""
        position_id = int(request.match_info["id"])
        data = await self._json_body(request)
        is_management = data.get("is_management", True)
        return await self._handle(
            request,
            lambda: self._service.set_position_as_management(position_id, is_management),
        )

    async def handle_set_department_as_management(self, request: web.Request) -> web.Response:
        """设置部门为管理部门"""
        department_id = int(request.match_info["id"])
        data = await self._json_body(request)
        is_management = data.get("is_management", True)
        return await self._handle(
            request,
            lambda: self._service.set_department_as_management(department_id, is_management),
        )

    async def handle_set_managing_department(self, request: web.Request) -> web.Response:
        """设置部门的管理部门"""
        department_id = int(request.match_info["id"])
        data = await self._json_body(request)
        managing_department_id = data.get("managing_department_id")
        return await self._handle(
            request,
            lambda: self._service.set_managing_department(department_id, managing_department_id),
        )

    # ------------------------------ master_agent_assets ------------------------------

    async def handle_refresh_master_assets(self, request: web.Request) -> web.Response:
        return await self._handle(request, self._service.refresh_master_assets)

    async def handle_list_master_assets(self, request: web.Request) -> web.Response:
        asset_type = request.query.get("asset_type") or None
        visibility = request.query.get("visibility") or None
        inheritable_only = request.query.get("inheritable_only", "").lower() in {"1", "true"}
        return await self._handle(
            request,
            lambda: self._service.list_master_assets(
                asset_type=asset_type,
                visibility=visibility,
                inheritable_only=inheritable_only,
            ),
        )

    async def handle_update_master_asset(self, request: web.Request) -> web.Response:
        asset_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(
            request,
            lambda: self._service.update_master_asset(asset_id, data),
        )

    async def handle_set_provider_visibility(
        self, request: web.Request
    ) -> web.Response:
        """Flip Public / Private on a single ``env_provider`` row.

        POST body: ``{"visibility": "public" | "private"}``. The provider id
        comes from the URL path (``/api/org/assets/env-provider/{providerId}/visibility``)
        and is re-validated server-side via ``PROVIDER_ENV_KEYS`` so clients
        cannot mint arbitrary asset rows.
        """
        provider_id = request.match_info["providerId"]
        data = await self._json_body(request)
        visibility = data.get("visibility")
        return await self._handle(
            request,
            lambda: self._service.set_provider_visibility(
                provider_id, str(visibility or "")
            ),
        )

    # ------------------------------ bootstrap check ------------------------------

    async def handle_bootstrap_check_position(self, request: web.Request) -> web.Response:
        position_id = int(request.match_info["id"])
        return await self._handle(
            request,
            lambda: self._service.bootstrap_check_position(position_id),
        )

    # ------------------------------ profile_templates ------------------------------

    async def handle_list_profile_templates(self, request: web.Request) -> web.Response:
        scope_type = request.query.get("scope_type") or None
        scope_id_raw = request.query.get("scope_id")
        scope_id = int(scope_id_raw) if scope_id_raw and scope_id_raw.isdigit() else None
        return await self._handle(
            request,
            lambda: self._service.list_profile_templates(
                scope_type=scope_type,
                scope_id=scope_id,
            ),
        )

    async def handle_create_profile_template(self, request: web.Request) -> web.Response:
        data = await self._json_body(request)
        return await self._handle(
            request,
            lambda: self._service.create_profile_template(data),
            success_status=201,
        )

    async def handle_update_profile_template(self, request: web.Request) -> web.Response:
        template_id = int(request.match_info["id"])
        data = await self._json_body(request)
        return await self._handle(
            request,
            lambda: self._service.update_profile_template(template_id, data),
        )

    async def handle_delete_profile_template(self, request: web.Request) -> web.Response:
        template_id = int(request.match_info["id"])
        return await self._handle(
            request,
            lambda: self._service.delete_profile_template(template_id),
        )
