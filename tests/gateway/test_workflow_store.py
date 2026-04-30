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
