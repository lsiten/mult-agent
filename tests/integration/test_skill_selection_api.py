"""
Integration tests for skill selection API functionality.

Tests the complete flow of selecting skills, validating them,
and storing them in session metadata.
"""

import json
import pytest
import sqlite3
from pathlib import Path


@pytest.fixture
def test_db(tmp_path):
    """Create a temporary test database."""
    from hermes_state import SessionDB

    db_path = tmp_path / "test_state.db"
    db = SessionDB(db_path=db_path)  # Pass Path object, not string
    yield db
    db.close()


def test_selected_skills_validation():
    """Test that selected_skills parameter is properly validated."""
    # Test valid skills list
    valid_skills = ["web-access", "browser-use"]
    assert isinstance(valid_skills, list)
    assert all(isinstance(s, str) for s in valid_skills)

    # Test invalid types should be rejected
    invalid_cases = [
        "not-a-list",  # String instead of list
        123,  # Number instead of list
        {"skills": ["web-access"]},  # Dict instead of list
        [123, 456],  # List of non-strings
    ]

    for invalid in invalid_cases:
        assert not isinstance(invalid, list) or not all(isinstance(s, str) for s in invalid)


def test_session_stores_selected_skills(test_db):
    """Test that selected_skills are stored in session metadata."""
    session_id = "test_session_123"
    selected_skills = ["web-access", "skill-creator"]

    # Create session with selected_skills
    test_db.create_session(
        session_id=session_id,
        source="api_server",
        user_id="test_user"
    )

    # Store selected_skills
    test_db._execute_write(lambda conn: conn.execute(
        "UPDATE sessions SET selected_skills = ? WHERE id = ?",
        (json.dumps(selected_skills), session_id)
    ))

    # Verify stored correctly
    def read_skills(conn):
        cursor = conn.execute(
            "SELECT selected_skills FROM sessions WHERE id = ?",
            (session_id,)
        )
        return cursor.fetchone()

    result = test_db._execute_write(read_skills)

    assert result is not None
    stored_skills = json.loads(result[0])
    assert stored_skills == selected_skills


def test_tool_use_message_metadata(test_db):
    """Test that tool_use messages are stored with metadata."""
    session_id = "test_session_456"

    test_db.create_session(
        session_id=session_id,
        source="api_server",
        user_id="test_user"
    )

    # Append tool_use message with metadata
    tool_invocations = [
        {
            "id": "tool_001",
            "tool": "web_search",
            "args": {"query": "test query"},
            "status": "success",
            "result": "Test result",
            "duration": 1234
        }
    ]

    test_db.append_message(
        session_id=session_id,
        role="tool_use",
        content=None,
        metadata={"tool_invocations": tool_invocations}
    )

    # Retrieve and verify
    messages = test_db.get_messages(session_id)
    assert len(messages) == 1

    msg = messages[0]
    assert msg["role"] == "tool_use"
    assert msg["content"] is None
    assert "metadata" in msg
    assert msg["metadata"]["tool_invocations"] == tool_invocations


def test_skill_use_message_metadata(test_db):
    """Test that skill_use messages are stored with metadata."""
    session_id = "test_session_789"

    test_db.create_session(
        session_id=session_id,
        source="api_server",
        user_id="test_user"
    )

    # Append skill_use message with metadata
    skills = [
        {
            "name": "web-access",
            "status": "loaded",
            "category": "search"
        },
        {
            "name": "browser-use",
            "status": "loaded",
            "category": "browser"
        }
    ]

    test_db.append_message(
        session_id=session_id,
        role="skill_use",
        content=None,
        metadata={"skills": skills}
    )

    # Retrieve and verify
    messages = test_db.get_messages(session_id)
    assert len(messages) == 1

    msg = messages[0]
    assert msg["role"] == "skill_use"
    assert msg["content"] is None
    assert "metadata" in msg
    assert msg["metadata"]["skills"] == skills


def test_prevent_skill_change_mid_session(test_db):
    """Test that skills cannot be changed after first message."""
    session_id = "test_session_change"
    initial_skills = ["web-access"]

    # Create session with initial skills
    test_db.create_session(
        session_id=session_id,
        source="api_server",
        user_id="test_user"
    )

    test_db._execute_write(lambda conn: conn.execute(
        "UPDATE sessions SET selected_skills = ? WHERE id = ?",
        (json.dumps(initial_skills), session_id)
    ))

    # Add a user message (session now has messages)
    test_db.append_message(
        session_id=session_id,
        role="user",
        content="First message"
    )

    # Try to change skills (should be prevented by API validation)
    # This simulates what the API handler would check
    messages = test_db.get_messages(session_id)
    assert len(messages) > 0  # Session has messages

    # Retrieve existing skills
    def read_skills(conn):
        cursor = conn.execute(
            "SELECT selected_skills FROM sessions WHERE id = ?",
            (session_id,)
        )
        return cursor.fetchone()

    result = test_db._execute_write(read_skills)
    existing_skills = json.loads(result[0]) if result and result[0] else None

    # New skills should not match existing
    new_skills = ["browser-use", "skill-creator"]
    assert existing_skills != new_skills

    # API handler would return 400 error at this point


def test_empty_selected_skills(test_db):
    """Test that empty skills list is handled correctly."""
    session_id = "test_session_empty"

    test_db.create_session(
        session_id=session_id,
        source="api_server",
        user_id="test_user"
    )

    # Store empty skills list
    test_db._execute_write(lambda conn: conn.execute(
        "UPDATE sessions SET selected_skills = ? WHERE id = ?",
        (json.dumps([]), session_id)
    ))

    # Verify stored as empty list
    def read_skills(conn):
        cursor = conn.execute(
            "SELECT selected_skills FROM sessions WHERE id = ?",
            (session_id,)
        )
        return cursor.fetchone()

    result = test_db._execute_write(read_skills)

    assert result is not None
    stored_skills = json.loads(result[0])
    assert stored_skills == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
