"""
Tests for Config API handlers.
"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from aiohttp import web

from gateway.platforms.api_server_config import ConfigAPIHandlers


@pytest.fixture
def config_handlers():
    """Create ConfigAPIHandlers instance with test token."""
    return ConfigAPIHandlers(session_token="test-token-123")


@pytest.fixture
def mock_request():
    """Create mock request."""
    request = Mock(spec=web.Request)
    request.headers = {}
    return request


class TestConfigAPIHandlers:
    """Tests for ConfigAPIHandlers class."""

    def test_check_auth_with_valid_token(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        result = config_handlers._check_auth(mock_request)

        assert result is True

    def test_check_auth_with_invalid_token(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer wrong-token"}

        result = config_handlers._check_auth(mock_request)

        assert result is False

    def test_check_auth_without_header(self, config_handlers, mock_request):
        result = config_handlers._check_auth(mock_request)

        assert result is False

    def test_check_auth_bypassed_in_electron_mode(self, config_handlers, mock_request):
        with patch.dict(os.environ, {"HERMES_ELECTRON_MODE": "true"}):
            result = config_handlers._check_auth(mock_request)

        assert result is True

    @pytest.mark.asyncio
    async def test_handle_get_config_unauthorized(self, config_handlers, mock_request):
        response = await config_handlers.handle_get_config(mock_request)

        assert response.status == 401
        assert response.content_type == "application/json"

    @pytest.mark.asyncio
    async def test_handle_get_config_success(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_config = {
            "model": "gpt-4",
            "max_tokens": 4096,
            "_internal_field": "should_be_filtered"
        }

        with patch("hermes_cli.config.load_config", return_value=mock_config):
            response = await config_handlers.handle_get_config(mock_request)

        assert response.status == 200
        # Internal fields should be filtered
        body = response.body.decode()
        assert "_internal_field" not in body
        assert "model" in body

    @pytest.mark.asyncio
    async def test_handle_get_config_defaults(self, config_handlers):
        mock_default = {"model": "default-model", "max_tokens": 2048}

        with patch("hermes_cli.config.DEFAULT_CONFIG", mock_default):
            response = await config_handlers.handle_get_config_defaults(Mock())

        assert response.status == 200

    @pytest.mark.asyncio
    async def test_handle_get_config_schema(self, config_handlers):
        response = await config_handlers.handle_get_config_schema(Mock())

        assert response.status == 200
        body = response.body.decode()
        assert "fields" in body
        assert "category_order" in body

    @pytest.mark.asyncio
    async def test_handle_put_config_unauthorized(self, config_handlers, mock_request):
        response = await config_handlers.handle_put_config(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_put_config_success(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        async def mock_read():
            return b'{"config": {"model": "gpt-4"}}'

        mock_request.read = mock_read

        with patch("hermes_cli.config.save_config") as mock_save:
            response = await config_handlers.handle_put_config(mock_request)

        assert response.status == 200
        mock_save.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_get_config_raw_unauthorized(self, config_handlers, mock_request):
        response = await config_handlers.handle_get_config_raw(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_get_config_raw_success(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_path = Mock()
        mock_path.exists.return_value = True
        mock_path.read_text.return_value = "model: gpt-4\n"

        with patch("hermes_cli.config.get_config_path", return_value=mock_path):
            response = await config_handlers.handle_get_config_raw(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert "model: gpt-4" in body

    @pytest.mark.asyncio
    async def test_handle_get_config_raw_file_not_exists(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_path = Mock()
        mock_path.exists.return_value = False

        with patch("hermes_cli.config.get_config_path", return_value=mock_path):
            response = await config_handlers.handle_get_config_raw(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert '"yaml": ""' in body

    @pytest.mark.asyncio
    async def test_handle_put_config_raw_invalid_yaml(self, config_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        async def mock_read():
            return b'{"yaml_text": "invalid: yaml: : :"}'

        mock_request.read = mock_read

        response = await config_handlers.handle_put_config_raw(mock_request)

        assert response.status == 400
        body = response.body.decode()
        assert "Invalid YAML" in body

    @pytest.mark.asyncio
    async def test_handle_get_model_info_no_model(self, config_handlers):
        with patch("hermes_cli.config.load_config", return_value={}):
            response = await config_handlers.handle_get_model_info(Mock())

        assert response.status == 200
        body = response.body.decode()
        assert '"model": ""' in body

    @pytest.mark.asyncio
    async def test_handle_get_model_info_with_model(self, config_handlers):
        mock_config = {
            "model": {
                "default": "gpt-4",
                "provider": "openai",
                "context_length": 8192
            }
        }

        with patch("hermes_cli.config.load_config", return_value=mock_config):
            with patch("agent.model_metadata.get_model_context_length", return_value=8192):
                response = await config_handlers.handle_get_model_info(Mock())

        assert response.status == 200
        body = response.body.decode()
        assert "gpt-4" in body
        assert "openai" in body
