"""Tests for director office discussion orchestration."""
import pytest
from unittest.mock import MagicMock, AsyncMock

from gateway.org.discussion import DiscussionOrchestrator


@pytest.mark.asyncio
async def test_start_discussion():
    """Test start_discussion triggers agent conversation."""
    # Mock service with get_company and get_agents_by_department_name
    mock_service = MagicMock()
    mock_service.get_company.return_value = {"id": 1, "name": "Test Co", "goal": "Grow"}
    mock_service.get_agents_by_department_name.return_value = [
        {"id": 1, "role": "CEO"},
        {"id": 2, "role": "CTO"},
        {"id": 3, "role": "CFO"}
    ]
    
    orch = DiscussionOrchestrator(mock_service)    
    messages = await orch.start_discussion(company_id=1)    
    
    assert len(messages) > 0
    assert any(m.get("sender_agent_role") for m in messages)
