"""Tests for Organization Store - DirectorOfficeRepository."""

import pytest


@pytest.fixture
def store():
    """Create an in-memory OrganizationStore for testing."""
    import sqlite3
    from pathlib import Path
    from gateway.org.store import OrganizationStore, SCHEMA_VERSION

    # Use in-memory database
    store = OrganizationStore.__new__(OrganizationStore)
    store.db_path = Path(":memory:")
    store._lock = __import__("threading").RLock()
    store._conn = sqlite3.connect(":memory:", check_same_thread=False)
    store._conn.row_factory = sqlite3.Row
    store._conn.execute("PRAGMA journal_mode=WAL")
    store._conn.execute("PRAGMA foreign_keys=ON")
    store._init_schema()
    return store


def test_director_office_repository(store):
    """Test DirectorOfficeRepository CRUD operations."""
    from gateway.org.store import DirectorOfficeRepository

    repo = DirectorOfficeRepository(store)

    # Test create
    office = repo.create({
        "company_id": 1,
        "department_id": 2,
        "office_name": "Test Office"
    })

    assert office["id"] is not None
    assert office["office_name"] == "Test Office"

    # Test list by company
    offices = repo.list_by_company(1)
    assert len(offices) == 1
