"""
Tests for Cron API handlers.
"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from aiohttp import web

from gateway.platforms.api_server_cron import CronAPIHandlers


@pytest.fixture
def cron_handlers():
    """Create CronAPIHandlers instance with test token."""
    return CronAPIHandlers(session_token="test-token-123")


@pytest.fixture
def mock_request():
    """Create mock request."""
    request = Mock(spec=web.Request)
    request.headers = {}
    request.match_info = {}
    return request


class TestCronAPIHandlers:
    """Tests for CronAPIHandlers class."""

    def test_check_auth_with_valid_token(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        result = cron_handlers._check_auth(mock_request)

        assert result is True

    def test_check_auth_bypassed_in_electron_mode(self, cron_handlers, mock_request):
        with patch.dict(os.environ, {"HERMES_ELECTRON_MODE": "true"}):
            result = cron_handlers._check_auth(mock_request)

        assert result is True

    @pytest.mark.asyncio
    async def test_handle_list_jobs_unauthorized(self, cron_handlers, mock_request):
        response = await cron_handlers.handle_list_jobs(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_list_jobs_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_jobs = [
            {
                "id": "job1",
                "name": "Daily Report",
                "schedule": "0 9 * * *",
                "enabled": True
            },
            {
                "id": "job2",
                "name": "Weekly Backup",
                "schedule": "0 0 * * 0",
                "enabled": False
            }
        ]

        with patch("cron.jobs.list_jobs", return_value=mock_jobs):
            response = await cron_handlers.handle_list_jobs(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert "job1" in body
        assert "Daily Report" in body

    @pytest.mark.asyncio
    async def test_handle_get_job_unauthorized(self, cron_handlers, mock_request):
        mock_request.match_info = {"job_id": "job1"}

        response = await cron_handlers.handle_get_job(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_get_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "job1"}

        mock_job = {
            "id": "job1",
            "name": "Daily Report",
            "schedule": "0 9 * * *",
            "enabled": True
        }

        with patch("cron.jobs.get_job", return_value=mock_job):
            response = await cron_handlers.handle_get_job(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert "job1" in body

    @pytest.mark.asyncio
    async def test_handle_get_job_not_found(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "nonexistent"}

        with patch("cron.jobs.get_job", return_value=None):
            response = await cron_handlers.handle_get_job(mock_request)

        assert response.status == 404

    @pytest.mark.asyncio
    async def test_handle_create_job_unauthorized(self, cron_handlers, mock_request):
        response = await cron_handlers.handle_create_job(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_create_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        async def mock_read():
            return b'{"prompt": "Generate daily report", "schedule": "0 9 * * *", "name": "Daily Report"}'

        mock_request.read = mock_read

        mock_created_job = {
            "id": "new-job-id",
            "name": "Daily Report",
            "prompt": "Generate daily report",
            "schedule": "0 9 * * *"
        }

        with patch("cron.jobs.create_job", return_value=mock_created_job):
            response = await cron_handlers.handle_create_job(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert "new-job-id" in body

    @pytest.mark.asyncio
    async def test_handle_pause_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "job1"}

        mock_job = {"id": "job1", "enabled": False}
        with patch("cron.jobs.pause_job", return_value=mock_job) as mock_pause:
            response = await cron_handlers.handle_pause_job(mock_request)

        assert response.status == 200
        mock_pause.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_handle_resume_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "job1"}

        mock_job = {"id": "job1", "enabled": True}
        with patch("cron.jobs.resume_job", return_value=mock_job) as mock_resume:
            response = await cron_handlers.handle_resume_job(mock_request)

        assert response.status == 200
        mock_resume.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_handle_trigger_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "job1"}

        mock_result = {"ok": True, "triggered": True}
        with patch("cron.jobs.trigger_job", return_value=mock_result) as mock_trigger:
            response = await cron_handlers.handle_trigger_job(mock_request)

        assert response.status == 200
        mock_trigger.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_handle_delete_job_success(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}
        mock_request.match_info = {"job_id": "job1"}

        with patch("cron.jobs.remove_job", return_value=True) as mock_remove:
            response = await cron_handlers.handle_delete_job(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert '"ok": true' in body
        mock_remove.assert_called_once_with("job1")

    @pytest.mark.asyncio
    async def test_handle_create_job_missing_fields(self, cron_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        async def mock_read():
            return b'{"prompt": "test"}'  # Missing schedule

        mock_request.read = mock_read

        # parse_request_json will raise HTTPBadRequest for missing required fields
        with pytest.raises(Exception):  # HTTPBadRequest or validation error
            response = await cron_handlers.handle_create_job(mock_request)
