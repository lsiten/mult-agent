"""Tests for organization creation tools."""

import json
import pytest
from unittest.mock import patch, MagicMock

from tools.org_creation_tool import create_department, create_position


class TestCreateDepartment:
    def test_create_department_success(self):
        """Test successful department creation."""
        mock_service = MagicMock()
        mock_service.create_department.return_value = {
            "id": 1,
            "company_id": 1,
            "name": "Engineering",
            "goal": "Build great products",
            "status": "active",
        }

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_department(
                company_id=1,
                name="Engineering",
                goal="Build great products",
            )
            result = json.loads(result_json)

        assert "error" not in result
        assert result["name"] == "Engineering"
        assert result["goal"] == "Build great products"
        mock_service.create_department.assert_called_once()

    def test_create_department_with_optional_params(self):
        """Test department creation with optional parameters."""
        mock_service = MagicMock()
        mock_service.create_department.return_value = {"id": 2, "name": "Sales"}

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_department(
                company_id=1,
                name="Sales",
                goal="Drive revenue",
                description="Sales department",
                parent_id=1,
            )
            result = json.loads(result_json)

        assert result["name"] == "Sales"
        call_args = mock_service.create_department.call_args[0][0]
        assert call_args["description"] == "Sales department"
        assert call_args["parent_id"] == 1


class TestCreatePosition:
    def test_create_position_success(self):
        """Test successful position creation."""
        mock_service = MagicMock()
        mock_service.create_position.return_value = {
            "id": 1,
            "department_id": 1,
            "name": "Software Engineer",
            "responsibilities": "Develop and maintain software",
            "status": "active",
        }

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_position(
                department_id=1,
                name="Software Engineer",
                responsibilities="Develop and maintain software",
            )
            result = json.loads(result_json)

        assert "error" not in result
        assert result["name"] == "Software Engineer"
        mock_service.create_position.assert_called_once()

    def test_create_position_management(self):
        """Test creating a management position."""
        mock_service = MagicMock()
        mock_service.create_position.return_value = {"id": 2, "name": "CTO"}

        with patch("tools.org_creation_tool._get_org_service", return_value=mock_service):
            result_json = create_position(
                department_id=1,
                name="CTO",
                responsibilities="Lead technology strategy",
                is_management_position=True,
                headcount=1,
            )
            result = json.loads(result_json)

        call_args = mock_service.create_position.call_args[0][0]
        assert call_args["is_management_position"] is True
        assert call_args["headcount"] == 1
