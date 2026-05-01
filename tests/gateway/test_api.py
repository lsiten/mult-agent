"""Tests for Organization API endpoints."""

import json
import pytest
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer
from pathlib import Path


@pytest.fixture
def org_service(tmp_path):
    """Create an OrganizationService with a temp database."""
    from gateway.org import OrganizationService, OrganizationStore
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


@pytest.fixture
def org_app(org_service):
    """Create a test app with org routes registered."""
    from gateway.platforms.api_server_org import OrganizationAPIHandlers

    app = web.Application()
    handlers = OrganizationAPIHandlers(session_token="test-token", service=org_service)

    # Register the init-director-office route
    app.router.add_post(
        "/api/org/companies/{id}/init-director-office",
        handlers.handle_init_director_office,
    )
    # Register create company route for test setup
    app.router.add_post("/api/org/companies", handlers.handle_create_company)

    return app


@pytest.mark.asyncio
async def test_init_director_office_api(org_app):
    """Test POST /api/org/companies/:id/init-director-office endpoint."""
    headers = {"Authorization": "Bearer test-token"}
    async with TestClient(TestServer(org_app)) as client:
        # First create a company
        resp = await client.post("/api/org/companies", 
            json={"name": "Test Co", "goal": "Grow"},
            headers=headers)
        assert resp.status == 200
        company_data = await resp.json()
        company_id = company_data["id"]

        # Call init endpoint
        resp = await client.post(
            f"/api/org/companies/{company_id}/init-director-office",
            json={"agent_count": 3},
            headers=headers
        )

        assert resp.status == 200
        data = await resp.json()
        assert "department_id" in data
        assert "office_id" in data
        assert "agents" in data
        assert len(data["agents"]) == 3
