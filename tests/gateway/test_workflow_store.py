# tests/gateway/test_workflow_store.py
"""Tests for workflow database tables."""
import sqlite3
import time
from gateway.org.store import OrganizationStore


def test_workflows_table_exists():
    """Test that workflows table is created."""
    store = OrganizationStore()
    conn = store._conn
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workflows'"
    )
    assert cursor.fetchone() is not None


def test_workflow_edges_table_exists():
    """Test that workflow_edges table is created."""
    store = OrganizationStore()
    conn = store._conn
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_edges'"
    )
    assert cursor.fetchone() is not None


def test_workflow_instances_table_exists():
    """Test that workflow_instances table is created."""
    store = OrganizationStore()
    conn = store._conn
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_instances'"
    )
    assert cursor.fetchone() is not None


def test_workflow_insert_and_fetch():
    """Test inserting and fetching a workflow."""
    store = OrganizationStore()
    conn = store._conn
    
    # Insert a company first (required FK)
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co", "Test Co", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    # Insert workflow
    now = time.time()
    conn.execute(
        "INSERT INTO workflows (company_id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (company_id, "Test Workflow", "Desc", "draft", now, now)
    )
    workflow_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    # Fetch
    cursor = conn.execute("SELECT * FROM workflows WHERE id = ?", (workflow_id,))
    row = cursor.fetchone()
    assert row is not None
    assert row["name"] == "Test Workflow"
    assert row["company_id"] == company_id
    assert row["status"] == "draft"


def test_workflow_store_create_workflow():
    """Test WorkflowStore.create_workflow()"""
    from gateway.org.workflow_store import WorkflowStore
    
    store = OrganizationStore()
    conn = store._conn
    
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co-2", "Test Co 2", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    workflow_store = WorkflowStore(store.db_path)
    
    result = workflow_store.create_workflow(company_id, {
        "name": "Main Workflow",
        "description": "Company workflow",
    })
    
    assert result["id"] is not None
    assert result["name"] == "Main Workflow"
    assert result["company_id"] == company_id
    assert result["status"] == "draft"


def test_workflow_store_get_workflow_with_edges():
    """Test getting workflow with edges."""
    from gateway.org.workflow_store import WorkflowStore
    
    store = OrganizationStore()
    conn = store._conn
    
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co-3", "Test Co 3", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    conn.execute(
        "INSERT INTO departments (company_id, code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (company_id, "dept-a", "Dept A", "Goal A", "active", time.time(), time.time())
    )
    dept_a = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    conn.execute(
        "INSERT INTO departments (company_id, code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (company_id, "dept-b", "Dept B", "Goal B", "active", time.time(), time.time())
    )
    dept_b = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    workflow_store = WorkflowStore(store.db_path)
    
    workflow = workflow_store.create_workflow(company_id, {"name": "Main Workflow"})
    workflow_id = workflow["id"]
    
    workflow_store.add_edge(workflow_id, {
        "source_department_id": dept_a,
        "target_department_id": dept_b,
        "action_description": "Review and approve",
        "trigger_condition": "task.status == 'pending'",
    })
    
    result = workflow_store.get_workflow_by_company(company_id)
    
    assert result is not None
    assert result["id"] == workflow_id
    assert len(result["edges"]) == 1
    assert result["edges"][0]["source_department_id"] == dept_a
    assert result["edges"][0]["target_department_id"] == dept_b


def test_workflow_store_update_workflow():
    """Test updating workflow (name, status)."""
    from gateway.org.workflow_store import WorkflowStore
    
    store = OrganizationStore()
    conn = store._conn
    
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co-4", "Test Co 4", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    workflow_store = WorkflowStore(store.db_path)
    workflow = workflow_store.create_workflow(company_id, {"name": "Original"})
    workflow_id = workflow["id"]
    
    result = workflow_store.update_workflow(workflow_id, {
        "name": "Updated Name",
        "status": "active",
    })
    
    assert result["name"] == "Updated Name"
    assert result["status"] == "active"


def test_workflow_store_delete_workflow():
    """Test deleting workflow (cascades to edges)."""
    from gateway.org.workflow_store import WorkflowStore
    
    store = OrganizationStore()
    conn = store._conn
    
    conn.execute(
        "INSERT INTO companies (code, name, goal, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        ("test-co-5", "Test Co 5", "Goal", "active", time.time(), time.time())
    )
    company_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    workflow_store = WorkflowStore(store.db_path)
    workflow = workflow_store.create_workflow(company_id, {"name": "To Delete"})
    workflow_id = workflow["id"]
    
    workflow_store.delete_workflow(workflow_id)
    
    result = workflow_store.get_workflow_by_company(company_id)
    assert result is None
