import sqlite3
from pathlib import Path

from gateway.org import OrganizationService, OrganizationStore


def make_service(tmp_path):
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


def test_init_director_office(tmp_path):
    """Test init_director_office creates department + agents."""
    service = make_service(tmp_path)

    # Create a company first (required for foreign key)
    company = service.create_company({"name": "Test Co", "goal": "Grow fast"})

    # Call init_director_office
    result = service.init_director_office(
        company_id=company["id"],
        agent_count=3
    )

    assert "department_id" in result
    assert "office_id" in result
    assert "agents" in result
    assert len(result["agents"]) == 3


def test_init_director_office_default_agent_count(tmp_path):
    """Test init_director_office uses default agent_count=3."""
    service = make_service(tmp_path)

    company = service.create_company({"name": "Test Co2", "goal": "Scale"})
    result = service.init_director_office(company_id=company["id"])

    assert len(result["agents"]) == 3


def test_init_director_office_creates_department(tmp_path):
    """Test that a director office department is created."""
    service = make_service(tmp_path)

    company = service.create_company({"name": "Test Co3", "goal": "Grow"})
    result = service.init_director_office(company_id=company["id"], agent_count=2)

    # Verify department exists and is management department
    dept = service.store.query_one(
        "SELECT * FROM departments WHERE id = ?", (result["department_id"],)
    )
    assert dept is not None
    assert dept["is_management_department"] == 1
    assert "董事办" in dept["name"]


def test_init_director_office_creates_office_record(tmp_path):
    """Test that director office record is created."""
    service = make_service(tmp_path)

    company = service.create_company({"name": "Test Co4", "goal": "Grow"})
    result = service.init_director_office(company_id=company["id"], agent_count=2)

    # Verify office record exists
    office = service.store.query_one(
        "SELECT * FROM director_offices WHERE id = ?", (result["office_id"],)
    )
    assert office is not None
    assert office["company_id"] == company["id"]
