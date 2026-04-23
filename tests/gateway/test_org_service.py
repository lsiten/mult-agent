import sqlite3

from gateway.org import OrganizationService, OrganizationStore


def make_service(tmp_path):
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


def test_org_schema_initializes_required_tables(tmp_path):
    service = make_service(tmp_path)
    rows = service.store.query_all(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    names = {row["name"] for row in rows}

    assert {
        "companies",
        "departments",
        "positions",
        "agents",
        "profile_agents",
        "workspaces",
        "master_agent_assets",
        "subagent_bootstrap_requirements",
    }.issubset(names)


def test_create_agent_provisions_workspace_and_profile(tmp_path):
    service = make_service(tmp_path)
    company = service.create_company({"name": "Hermes AI Lab", "goal": "Build agent teams"})
    department = service.create_department(
        {
            "company_id": company["id"],
            "name": "Research",
            "goal": "Deliver product intelligence",
        }
    )
    position = service.create_position(
        {
            "department_id": department["id"],
            "name": "Market Analyst",
            "goal": "Track market changes",
            "responsibilities": "Write weekly market briefs.",
        }
    )

    agent = service.create_agent(
        {
            "position_id": position["id"],
            "name": "Market Analyst Agent",
            "role_summary": "Market analyst",
            "service_goal": "Produce competitor summaries",
        }
    )

    assert agent["company_id"] == company["id"]
    assert agent["department_id"] == department["id"]
    assert agent["position_id"] == position["id"]
    assert agent["workspace_path"]
    assert agent["profile_agent"]["profile_status"] == "ready"
    assert agent["profile_agent"]["profile_name"] == f"org-{agent['id']}"


def test_update_org_visual_fields_persist(tmp_path):
    service = make_service(tmp_path)
    company = service.create_company(
        {
            "name": "Hermes AI Lab",
            "goal": "Build agent teams",
            "icon": "HQ",
            "accent_color": "#123456",
        }
    )
    department = service.create_department(
        {
            "company_id": company["id"],
            "name": "Research",
            "goal": "Deliver product intelligence",
            "icon": "RD",
            "accent_color": "#234567",
        }
    )
    position = service.create_position(
        {
            "department_id": department["id"],
            "name": "Market Analyst",
            "responsibilities": "Write weekly market briefs.",
            "icon": "MA",
            "accent_color": "#345678",
        }
    )
    agent = service.create_agent(
        {
            "position_id": position["id"],
            "name": "Market Analyst Agent",
            "role_summary": "Market analyst",
            "avatar_url": "https://example.test/avatar.png",
            "accent_color": "#456789",
        }
    )

    updated_company = service.update_company(
        company["id"],
        {"name": "Hermes Labs", "icon": "HL", "accent_color": "#abcdef"},
    )
    updated_department = service.update_department(
        department["id"],
        {"name": "Product Research", "icon": "PR", "accent_color": "#fedcba"},
    )
    updated_position = service.update_position(
        position["id"],
        {"name": "Senior Analyst", "icon": "SA", "accent_color": "#112233"},
    )
    updated_agent = service.update_agent(
        agent["id"],
        {
            "name": "Senior Analyst Agent",
            "avatar_url": "https://example.test/new-avatar.png",
            "accent_color": "#332211",
        },
    )

    assert updated_company["name"] == "Hermes Labs"
    assert updated_company["icon"] == "HL"
    assert updated_company["accent_color"] == "#abcdef"
    assert updated_department["icon"] == "PR"
    assert updated_department["accent_color"] == "#fedcba"
    assert updated_position["icon"] == "SA"
    assert updated_position["accent_color"] == "#112233"
    assert updated_agent["avatar_url"] == "https://example.test/new-avatar.png"
    assert updated_agent["accent_color"] == "#332211"


def test_invalid_agent_create_rolls_back(tmp_path):
    service = make_service(tmp_path)

    try:
        service.create_agent(
            {
                "position_id": 99,
                "name": "Missing Position Agent",
                "role_summary": "Unavailable",
            }
        )
    except Exception:
        pass

    assert service.store.query_all("SELECT * FROM agents") == []
    assert service.store.query_all("SELECT * FROM profile_agents") == []


def test_bootstrap_block_records_profile_error(tmp_path):
    service = make_service(tmp_path)
    company = service.create_company({"name": "Hermes AI Lab", "goal": "Build agent teams"})
    department = service.create_department(
        {"company_id": company["id"], "name": "QA", "goal": "Improve quality"}
    )
    position = service.create_position(
        {
            "department_id": department["id"],
            "name": "Reviewer",
            "responsibilities": "Review implementation changes.",
            "template_key": "qa-reviewer",
        }
    )
    service.store.execute(
        """
        INSERT INTO subagent_bootstrap_requirements(
            scope_type, scope_id, template_key, requirement_type, requirement_key,
            required_level, expected_source, validation_status, validation_message,
            created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "template",
            None,
            "qa-reviewer",
            "asset",
            "provider-api-key",
            "required",
            "master_agent_assets",
            "missing",
            "Provider API key is missing",
            1.0,
            1.0,
        ),
    )

    agent = service.create_agent(
        {
            "position_id": position["id"],
            "name": "QA Review Agent",
            "role_summary": "Reviewer",
        }
    )

    assert agent["profile_agent"]["profile_status"] == "blocked"
    assert "Provider API key is missing" in agent["profile_agent"]["error_message"]


def test_foreign_keys_enabled(tmp_path):
    service = make_service(tmp_path)

    try:
        service.store.execute(
            """
            INSERT INTO departments(
                company_id, code, name, goal, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (999, "bad", "Bad", "Bad", 1.0, 1.0),
        )
    except sqlite3.IntegrityError:
        return

    raise AssertionError("foreign key constraint was not enforced")
