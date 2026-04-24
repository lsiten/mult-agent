#!/usr/bin/env python3
"""
Tests for Computer Use Tool

Run: pytest tests/test_computer_use_tool.py -v
"""

import json
import platform
import sys
import pytest
from unittest.mock import Mock, patch, MagicMock

from tools.computer_use_tool import (
    _check_computer_use_available,
    capture_screenshot,
    execute_mouse_action,
    execute_keyboard_action,
    execute_special_key,
    execute_open_app,
    execute_open_url,
    computer_screenshot_handler,
    computer_mouse_handler,
    computer_keyboard_handler,
    computer_key_handler,
    computer_open_app_handler,
    computer_open_url_handler,
    get_display_config,
)


class TestAvailabilityCheck:
    """Test Computer Use availability detection."""

    @patch("platform.system")
    def test_available_on_macos(self, mock_platform):
        """Should be available on macOS with PIL."""
        mock_platform.return_value = "Darwin"
        with patch.dict(sys.modules, {"mss": MagicMock(), "pynput": MagicMock()}):
            assert _check_computer_use_available() is True

    @patch("platform.system")
    def test_available_on_linux(self, mock_platform):
        """Should be available on Linux with PIL."""
        mock_platform.return_value = "Linux"
        with patch.dict(sys.modules, {"mss": MagicMock(), "pynput": MagicMock()}):
            assert _check_computer_use_available() is True

    @patch("platform.system")
    def test_unavailable_on_windows(self, mock_platform):
        """Should be unavailable on Windows."""
        mock_platform.return_value = "Windows"
        with patch.dict(sys.modules, {"mss": MagicMock(), "pynput": MagicMock()}):
            assert _check_computer_use_available() is False


class TestScreenshotCapture:
    """Test screenshot capture functionality."""

    def test_capture_screenshot_uses_mano_runtime(self):
        """Should return screenshot bytes from Mano runtime."""
        runtime = Mock()
        runtime.capture_screenshot.return_value = {"bytes": b"fake_png_data"}

        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            result = capture_screenshot()

        assert result == b"fake_png_data"
        runtime.capture_screenshot.assert_called_once()


class TestMouseControl:
    """Test mouse control functionality."""

    def test_execute_mouse_action_validates_coordinate(self):
        """Should validate coordinate format."""
        with pytest.raises(ValueError, match="Coordinate must be"):
            execute_mouse_action("left_click", [100])

        with pytest.raises(ValueError, match="Coordinate must be"):
            execute_mouse_action("left_click", [100, 200, 300])

    def test_execute_mouse_action_via_mano_runtime(self):
        """Should translate pixel coordinates and delegate to Mano runtime."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "left_click"}}
        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            with patch(
                "tools.computer_use_tool.get_display_config",
                return_value={"width": 1280, "height": 720, "x_offset": 0, "y_offset": 0},
            ):
                result = execute_mouse_action("left_click", [500, 300])

        assert result["success"] is True
        assert result["action"] == "left_click"
        assert result["coordinate"] == [500, 300]
        payload = runtime.execute_action.call_args.args[0]
        assert payload["input"]["coordinate"] == [500.0, 300.0]

    def test_execute_mouse_action_unsupported_platform(self):
        """Should still reject unsupported platforms from availability checks."""
        with patch("platform.system", return_value="Windows"):
            assert _check_computer_use_available() is False


class TestKeyboardControl:
    """Test keyboard control functionality."""

    def test_execute_keyboard_action_via_mano_runtime(self):
        """Should type text through Mano runtime."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "type"}}

        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            result = execute_keyboard_action("Hello World")

        assert result["success"] is True
        assert result["text"] == "Hello World"


class TestToolHandlers:
    """Test tool handler functions."""

    def test_computer_screenshot_handler_success(self):
        """Should return success result with base64 image."""
        with patch("tools.computer_use_tool.capture_screenshot") as mock_capture:
            mock_capture.return_value = b"fake_png_data"

            result_str = computer_screenshot_handler({})
            result = json.loads(result_str)

            assert result["success"] is True
            assert "image" in result
            assert "path" in result
            assert result["format"] == "png"

    def test_computer_screenshot_handler_error(self):
        """Should return error on failure."""
        with patch("tools.computer_use_tool.capture_screenshot") as mock_capture:
            mock_capture.side_effect = RuntimeError("Screenshot failed")

            result_str = computer_screenshot_handler({})
            result = json.loads(result_str)

            assert "error" in result

    def test_computer_mouse_handler_validates_params(self):
        """Should validate required parameters."""
        result = json.loads(computer_mouse_handler({}))
        assert "error" in result
        assert "action" in result["error"]

        result = json.loads(computer_mouse_handler({"action": "left_click"}))
        assert "error" in result
        assert "coordinate" in result["error"]

    def test_computer_mouse_handler_validates_action(self):
        """Should validate action type."""
        result = json.loads(computer_mouse_handler({
            "action": "invalid_action",
            "coordinate": [100, 100]
        }))
        assert "error" in result
        assert "Invalid action" in result["error"]

    def test_computer_mouse_handler_success(self):
        """Should execute mouse action successfully."""
        with patch("tools.computer_use_tool.execute_mouse_action") as mock_action:
            mock_action.return_value = {
                "success": True,
                "action": "left_click",
                "coordinate": [100, 100]
            }

            result_str = computer_mouse_handler({
                "action": "left_click",
                "coordinate": [100, 100]
            })
            result = json.loads(result_str)

            assert result["success"] is True

    def test_computer_keyboard_handler_validates_params(self):
        """Should validate required parameters."""
        result = json.loads(computer_keyboard_handler({}))
        assert "error" in result
        assert "text" in result["error"]

        result = json.loads(computer_keyboard_handler({"text": 123}))
        assert "error" in result
        assert "string" in result["error"]

    def test_computer_keyboard_handler_success(self):
        """Should type text successfully."""
        with patch("tools.computer_use_tool.execute_keyboard_action") as mock_action:
            mock_action.return_value = {"success": True, "text": "test"}

            result_str = computer_keyboard_handler({"text": "test"})
            result = json.loads(result_str)

            assert result["success"] is True


class TestSpecialKey:
    """Test special key functionality."""

    def test_computer_key_handler_validates_params(self):
        """Should validate required parameters."""
        result = json.loads(computer_key_handler({}))
        assert "error" in result
        assert "key" in result["error"]

    def test_computer_key_handler_success(self):
        """Should execute key press successfully."""
        with patch("tools.computer_use_tool.execute_special_key") as mock_action:
            mock_action.return_value = {"success": True, "key": "enter"}

            result_str = computer_key_handler({"key": "enter"})
            result = json.loads(result_str)

            assert result["success"] is True

    def test_execute_special_key_via_mano_runtime(self):
        """Should handle special keys through Mano runtime."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "key"}}

        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            result = execute_special_key("tab", modifiers=["ctrl"])

        assert result["success"] is True
        assert result["key"] == "tab"
        payload = runtime.execute_action.call_args.args[0]
        assert payload["input"]["mains"] == ["tab"]
        assert payload["input"]["modifiers"] == ["ctrl"]


class TestNewMouseActions:
    """Test new mouse actions: scroll and drag."""

    def test_scroll_action_macos(self):
        """Should handle scroll actions."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "scroll"}}
        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            with patch(
                "tools.computer_use_tool.get_display_config",
                return_value={"width": 1280, "height": 720, "x_offset": 0, "y_offset": 0},
            ):
                result = execute_mouse_action("scroll_up", [500, 300])
        assert result["success"] is True
        assert result["action"] == "scroll_up"

    def test_scroll_action_linux(self):
        """Should handle scroll actions on Linux."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "scroll"}}
        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            with patch(
                "tools.computer_use_tool.get_display_config",
                return_value={"width": 1280, "height": 720, "x_offset": 0, "y_offset": 0},
            ):
                result = execute_mouse_action("scroll_down", [500, 300])
        assert result["success"] is True

    def test_drag_action_requires_target_coordinate(self):
        """Should validate target_coordinate for drag action."""
        with patch("platform.system", return_value="Darwin"):
            result_str = computer_mouse_handler({
                "action": "drag",
                "coordinate": [100, 100]
            })
            result = json.loads(result_str)
            assert "error" in result
            assert "target_coordinate" in result["error"]

    def test_drag_action_success(self):
        """Should execute drag action successfully."""
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "left_click_drag"}}
        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            with patch(
                "tools.computer_use_tool.get_display_config",
                return_value={"width": 1280, "height": 720, "x_offset": 0, "y_offset": 0},
            ):
                result = execute_mouse_action("drag", [100, 100], [200, 200])
        assert result["success"] is True
        assert result["action"] == "drag"
        assert result["start_coordinate"] == [100, 100]
        assert result["target_coordinate"] == [200, 200]

    def test_open_app_handler_success(self):
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "open_app"}}

        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            result = json.loads(computer_open_app_handler({"app_name": "WeChat"}))

        assert result["success"] is True
        assert result["app_name"] == "WeChat"

    def test_open_url_handler_success(self):
        runtime = Mock()
        runtime.execute_action.return_value = {"ok": True, "meta": {"action": "open_url"}}

        with patch("tools.computer_use_tool.get_runtime", return_value=runtime):
            result = json.loads(computer_open_url_handler({"url": "https://example.com"}))

        assert result["success"] is True
        assert result["url"] == "https://example.com"

    def test_display_config_auto_detect(self):
        """Should auto-detect display configuration."""
        config = get_display_config()
        assert "width" in config
        assert "height" in config
        assert config["width"] > 0
        assert config["height"] > 0
