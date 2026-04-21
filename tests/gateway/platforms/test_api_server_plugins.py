"""
Tests for Plugins API handlers.
"""

import os
import pytest
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from aiohttp import web

from gateway.platforms.api_server_plugins import PluginsAPIHandlers


@pytest.fixture
def plugins_handlers():
    """Create PluginsAPIHandlers instance with test token."""
    return PluginsAPIHandlers(session_token="test-token-123")


@pytest.fixture
def mock_request():
    """Create mock request."""
    request = Mock(spec=web.Request)
    request.headers = {}
    request.match_info = {}
    return request


class TestPluginsAPIHandlers:
    """Tests for PluginsAPIHandlers class."""

    def test_check_auth_with_valid_token(self, plugins_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        result = plugins_handlers._check_auth(mock_request)

        assert result is True

    def test_check_auth_bypassed_in_electron_mode(self, plugins_handlers, mock_request):
        with patch.dict(os.environ, {"HERMES_ELECTRON_MODE": "true"}):
            result = plugins_handlers._check_auth(mock_request)

        assert result is True

    @pytest.mark.asyncio
    async def test_handle_get_plugins_unauthorized(self, plugins_handlers, mock_request):
        # No authorization header, should return 401
        response = await plugins_handlers.handle_get_plugins(mock_request)

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_handle_get_plugins_success(self, plugins_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_plugins = [
            {
                "name": "test-plugin",
                "label": "Test Plugin",
                "description": "A test plugin",
                "version": "1.0.0",
                "tab": {"path": "/test", "position": "main"},
                "source": "skills"
            }
        ]

        with patch.object(plugins_handlers, "_discover_dashboard_plugins", return_value=mock_plugins):
            response = await plugins_handlers.handle_get_plugins(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert "test-plugin" in body
        assert "Test Plugin" in body

    @pytest.mark.asyncio
    async def test_handle_rescan_plugins_success(self, plugins_handlers, mock_request):
        mock_request.headers = {"Authorization": "Bearer test-token-123"}

        mock_plugins = [{"name": "plugin1"}, {"name": "plugin2"}]

        with patch.object(plugins_handlers, "_discover_dashboard_plugins", return_value=mock_plugins):
            response = await plugins_handlers.handle_rescan_plugins(mock_request)

        assert response.status == 200
        body = response.body.decode()
        assert '"count": 2' in body

    def test_discover_dashboard_plugins_empty(self, plugins_handlers, tmp_path):
        """Test plugin discovery with no plugins."""
        with patch("hermes_cli.config.get_hermes_home") as mock_home:
            mock_home.return_value = tmp_path

            plugins = plugins_handlers._discover_dashboard_plugins()

        assert plugins == []

    def test_discover_dashboard_plugins_with_valid_plugin(self, plugins_handlers, tmp_path):
        """Test plugin discovery with a valid plugin."""
        # Create mock plugin directory
        skills_dir = tmp_path / "skills"
        plugin_dir = skills_dir / "test-plugin"
        plugin_dir.mkdir(parents=True)

        # Create manifest
        manifest = {
            "name": "test-plugin",
            "label": "Test Plugin",
            "description": "A test plugin",
            "icon": "test.svg",
            "version": "1.0.0",
            "tab": {"path": "/test", "position": "main"},
            "entry": "index.html"
        }

        manifest_path = plugin_dir / "dashboard-plugin.json"
        import json
        manifest_path.write_text(json.dumps(manifest))

        # Create entry file
        (plugin_dir / "index.html").write_text("<html></html>")

        with patch("hermes_cli.config.get_hermes_home") as mock_home:
            mock_home.return_value = tmp_path

            plugins = plugins_handlers._discover_dashboard_plugins()

        assert len(plugins) == 1
        assert plugins[0]["name"] == "test-plugin"
        assert plugins[0]["label"] == "Test Plugin"

    def test_discover_dashboard_plugins_invalid_manifest(self, plugins_handlers, tmp_path):
        """Test plugin discovery with invalid manifest."""
        skills_dir = tmp_path / "skills"
        plugin_dir = skills_dir / "bad-plugin"
        plugin_dir.mkdir(parents=True)

        # Create invalid manifest
        manifest_path = plugin_dir / "dashboard-plugin.json"
        manifest_path.write_text("invalid json")

        with patch("hermes_cli.config.get_hermes_home") as mock_home:
            mock_home.return_value = tmp_path

            plugins = plugins_handlers._discover_dashboard_plugins()

        # Should skip invalid plugin
        assert len(plugins) == 0

    def test_discover_dashboard_plugins_missing_entry(self, plugins_handlers, tmp_path):
        """Test plugin discovery with missing entry file."""
        skills_dir = tmp_path / "skills"
        plugin_dir = skills_dir / "no-entry-plugin"
        plugin_dir.mkdir(parents=True)

        manifest = {
            "name": "no-entry-plugin",
            "label": "No Entry Plugin",
            "description": "Missing entry file",
            "version": "1.0.0",
            "tab": {"path": "/test", "position": "main"},
            "entry": "missing.html"
        }

        manifest_path = plugin_dir / "dashboard-plugin.json"
        import json
        manifest_path.write_text(json.dumps(manifest))

        with patch("hermes_cli.config.get_hermes_home") as mock_home:
            mock_home.return_value = tmp_path

            plugins = plugins_handlers._discover_dashboard_plugins()

        # Should skip plugin without entry file
        assert len(plugins) == 0

    @pytest.mark.asyncio
    async def test_handle_plugin_asset_path_traversal_blocked(self, plugins_handlers, mock_request):
        """Test that path traversal attempts are blocked."""
        mock_request.match_info = {
            "plugin_name": "test-plugin",
            "asset_path": "../../../etc/passwd"
        }

        mock_home = Path("/fake/home")
        with patch("hermes_cli.config.get_hermes_home", return_value=mock_home):
            response = await plugins_handlers.handle_plugin_asset(mock_request)

        assert response.status == 403

    @pytest.mark.asyncio
    async def test_handle_plugin_asset_not_found(self, plugins_handlers, mock_request):
        """Test asset not found."""
        mock_request.match_info = {
            "plugin_name": "test-plugin",
            "asset_path": "missing.js"
        }

        mock_home = Path("/fake/home")
        with patch("hermes_cli.config.get_hermes_home", return_value=mock_home):
            response = await plugins_handlers.handle_plugin_asset(mock_request)

        assert response.status == 404
