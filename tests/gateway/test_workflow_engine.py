"""Tests for workflow task routing engine."""

import time
from gateway.org.store import OrganizationStore
from gateway.org.workflow_store import WorkflowStore
from gateway.org.workflow_engine import WorkflowEngine


def _setup_test_db():
    """Helper to set up test DB with sample data."""
    store = OrganizationStore()
    conn = store._conn
    
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co-eng", "Test Co Eng", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    for name in ["Sales", "Engineering", "QA"]:
        conn.execute(
            "INSERT INTO departments (company_id, code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (company_id, f"dept-{name.lower()}", name, f"{name} Goal", "active", time.time(), time.time())
        )
    
    depts = {}
    for row in conn.execute("SELECT id, name FROM departments WHERE company_id = ?", (company_id,)):
        depts[row["name"]] = row["id"]
    
    for dept_name, title in [("Sales", "Sales Rep"), ("Engineering", "Dev"), ("QA", "Tester")]:
        conn.execute(
            "INSERT INTO positions (department_id, code, name, goal, responsibilities, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (depts[dept_name], f"pos-{title.lower()}", title, f"{title} Goal", f"{title} Responsibilities", "active", time.time(), time.time())
        )
    
    agents = {}
    for name, dept_name in [("Alice", "Sales"), ("Bob", "Engineering"), ("Charlie", "QA")]:
        pos_id = conn.execute("SELECT id FROM positions WHERE department_id = ?", (depts[dept_name],)).fetchone()[0]
        conn.execute(
            "INSERT INTO agents (company_id, department_id, position_id, name, role_summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (company_id, depts[dept_name], pos_id, name, f"{name} Summary", "active", time.time(), time.time())
        )
        agents[name] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    return store, WorkflowStore(store.db_path), company_id, depts, agents


def test_workflow_engine_match_by_creator_department():
    """Test that workflow matches task to creator's department."""
    store, workflow_store, company_id, depts, agents = _setup_test_db()
    
    workflow = workflow_store.create_workflow(company_id, {"name": "Sales Flow"})
    workflow_store.add_edge(workflow["id"], {
        "source_department_id": depts["Sales"],
        "target_department_id": depts["Engineering"],
        "action_description": "Develop feature",
    })
    
    engine = WorkflowEngine(WorkflowStore(store.db_path))
    
    result = engine.match_workflow(store._conn, agents["Alice"], "Build website", "Need a new site")
    
    assert result is not None
    assert result["workflow_id"] == workflow["id"]
    assert result["current_department_id"] == depts["Sales"]


def test_workflow_engine_no_workflow_for_company():
    """Test returns None when company has no workflow."""
    store, workflow_store, company_id, depts, agents = _setup_test_db()
    
    engine = WorkflowEngine(WorkflowStore(store.db_path))
    
    result = engine.match_workflow(store._conn, agents["Alice"], "Task", "Desc")
    assert result is None


def test_workflow_engine_create_instance():
    """Test creating a workflow_instance record."""
    store, workflow_store, company_id, depts, agents = _setup_test_db()
    
    conn = store._conn
    conn.execute(
        "INSERT INTO tasks (title, description, creator_agent_id, assignee_agent_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("Test Task", "Desc", agents["Alice"], agents["Alice"], "pending", time.time(), time.time())
    )
    task_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    workflow = workflow_store.create_workflow(company_id, {"name": "Flow"})
    workflow_store.add_edge(workflow["id"], {
        "source_department_id": depts["Sales"],
        "target_department_id": depts["Engineering"],
        "action_description": "Pass it on",
    })
    
    engine = WorkflowEngine(WorkflowStore(store.db_path))
    
    instance = engine.create_instance(
        workflow["id"], company_id, task_id, depts["Sales"]
    )
    
    assert instance is not None
    assert instance["workflow_id"] == workflow["id"]
    assert instance["task_id"] == task_id
    assert instance["status"] == "running"
