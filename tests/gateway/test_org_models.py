"""Tests for organization management models."""

import pytest
from datetime import datetime
from gateway.org.models import DirectorOffice


def test_director_office_model():
    """Test DirectorOffice dataclass structure."""
    office = DirectorOffice(
        company_id=1,
        department_id=2,
        director_agent_id=3,
        office_name="董事办",
        responsibilities="Strategic planning",
        status="active"
    )
    
    assert office.company_id == 1
    assert office.office_name == "董事办"
    assert office.status == "active"
    assert office.department_id == 2
    assert office.director_agent_id == 3
    assert office.responsibilities == "Strategic planning"
