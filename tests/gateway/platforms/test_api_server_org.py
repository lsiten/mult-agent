import json
import os
import tempfile
from unittest.mock import Mock

import pytest
from aiohttp import web

os.environ.setdefault("HERMES_HOME", tempfile.mkdtemp(prefix="hermes-org-api-test-"))

from gateway.org import OrganizationService, OrganizationStore
from gateway.platforms.api_server import _CORS_HEADERS
from gateway.platforms.api_server_org import OrganizationAPIHandlers


@pytest.fixture
def service(tmp_path):
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


@pytest.fixture
def handlers(service):
    return OrganizationAPIHandlers("test-token", service)


def make_request(body=None, match_info=None, authorized=True):
    request = Mock(spec=web.Request)
    request.headers = {"Authorization": "Bearer test-token"} if authorized else {}
    request.match_info = match_info or {}

    async def read():
        return json.dumps(body or {}).encode()

    request.read = read
    return request


def test_cors_allow_methods_include_patch():
    assert "PATCH" in _CORS_HEADERS["Access-Control-Allow-Methods"]


@pytest.mark.asyncio
async def test_get_tree_unauthorized(handlers):
    response = await handlers.handle_get_tree(make_request(authorized=False))

    assert response.status == 401


@pytest.mark.asyncio
async def test_create_company_and_tree(handlers):
    response = await handlers.handle_create_company(
        make_request({"name": "Hermes AI Lab", "goal": "Build agent teams"})
    )

    assert response.status == 200
    created = json.loads(response.body.decode())
    assert created["name"] == "Hermes AI Lab"

    tree_response = await handlers.handle_get_tree(make_request())
    tree = json.loads(tree_response.body.decode())
    assert tree["companies"][0]["id"] == created["id"]


@pytest.mark.asyncio
async def test_update_company_visual_fields(handlers):
    create_response = await handlers.handle_create_company(
        make_request(
            {
                "name": "Hermes AI Lab",
                "goal": "Build agent teams",
                "icon": "HQ",
                "accent_color": "#123456",
            }
        )
    )
    company = json.loads(create_response.body.decode())

    update_response = await handlers.handle_update_company(
        make_request(
            {"name": "Hermes Labs", "icon": "HL", "accent_color": "#abcdef"},
            match_info={"id": str(company["id"])},
        )
    )
    updated = json.loads(update_response.body.decode())

    assert update_response.status == 200
    assert updated["name"] == "Hermes Labs"
    assert updated["icon"] == "HL"
    assert updated["accent_color"] == "#abcdef"


@pytest.mark.asyncio
async def test_create_company_validation_error(handlers):
    response = await handlers.handle_create_company(make_request({"name": "No Goal"}))

    assert response.status == 400


@pytest.mark.asyncio
async def test_agent_endpoints_return_profile_metadata(handlers):
    company_response = await handlers.handle_create_company(
        make_request({"name": "Hermes AI Lab", "goal": "Build agent teams"})
    )
    company = json.loads(company_response.body.decode())
    department_response = await handlers.handle_create_department(
        make_request(
            {
                "company_id": company["id"],
                "name": "Research",
                "goal": "Deliver research",
            }
        )
    )
    department = json.loads(department_response.body.decode())
    position_response = await handlers.handle_create_position(
        make_request(
            {
                "department_id": department["id"],
                "name": "Market Analyst",
                "responsibilities": "Write market briefs.",
            }
        )
    )
    position = json.loads(position_response.body.decode())

    agent_response = await handlers.handle_create_agent(
        make_request(
            {
                "position_id": position["id"],
                "name": "Market Analyst Agent",
                "role_summary": "Market analyst",
            }
        )
    )
    agent = json.loads(agent_response.body.decode())

    assert agent_response.status == 200
    assert agent["profile_agent"]["profile_status"] == "ready"

    get_response = await handlers.handle_get_agent(
        make_request(match_info={"id": str(agent["id"])})
    )
    fetched = json.loads(get_response.body.decode())
    assert fetched["profile_agent"]["profile_name"] == f"org-{agent['id']}"


@pytest.mark.asyncio
async def test_missing_agent_returns_404(handlers):
    response = await handlers.handle_get_agent(make_request(match_info={"id": "999"}))

    assert response.status == 404
