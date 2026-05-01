import sqlite3
from pathlib import Path

from gateway.org import OrganizationService, OrganizationStore


def make_service(tmp_path):
    return OrganizationService(OrganizationStore(tmp_path / "org.db"))


def test_confirm_architecture(tmp_path):
    """Test confirm_architecture creates departments, positions, and agents."""
    service = make_service(tmp_path)

    # Create a company first
    company = service.create_company({"name": "Test Co", "goal": "Grow"})

    architecture = {
        "departments": [
            {"name": "技术部", "goal": "技术研发"},
            {"name": "产品部", "goal": "产品设计", "parent_name": "技术部"},
        ],
        "positions": [
            {"department_name": "技术部", "name": "Frontend工程师", "responsibilities": "前端开发"},
            {"department_name": "技术部", "name": "Backend工程师", "responsibilities": "后端开发"},
        ],
        "agents": [
            {"department_name": "技术部", "position_name": "Frontend工程师", "name": "Frontend Agent", "role_summary": "前端开发Agent"},
        ],
    }

    result = service.confirm_architecture(company["id"], architecture)

    assert "created" in result
    assert len(result["created"]["departments"]) == 2
    assert len(result["created"]["positions"]) == 2
    assert len(result["created"]["agents"]) == 1

    # Verify departments were created
    depts = service.store.query("SELECT * FROM departments WHERE company_id = ?", (company["id"],))
    dept_names = [d["name"] for d in depts]
    assert "技术部" in dept_names
    assert "产品部" in dept_names

    # Verify parent relationship
    product_dept = [d for d in depts if d["name"] == "产品部"][0]
    tech_dept = [d for d in depts if d["name"] == "技术部"][0]
    assert product_dept["parent_id"] == tech_dept["id"]


def test_confirm_architecture_empty(tmp_path):
    """Test confirm_architecture with empty architecture."""
    service = make_service(tmp_path)

    company = service.create_company({"name": "Test Co2", "goal": "Grow"})

    result = service.confirm_architecture(company["id"], {})

    assert "created" in result
    assert result["created"]["departments"] == []
    assert result["created"]["positions"] == []
    assert result["created"]["agents"] == []


def test_confirm_architecture_nonexistent_department(tmp_path):
    """Test that positions/agents with nonexistent department are skipped."""
    service = make_service(tmp_path)

    company = service.create_company({"name": "Test Co3", "goal": "Grow"})

    architecture = {
        "departments": [],
        "positions": [
            {"department_name": "不存在的部门", "name": "Position", "responsibilities": ""},
        ],
        "agents": [
            {"department_name": "不存在的部门", "name": "Agent", "role_summary": ""},
        ],
    }

    result = service.confirm_architecture(company["id"], architecture)

    assert len(result["created"]["positions"]) == 0
    assert len(result["created"]["agents"]) == 0


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
