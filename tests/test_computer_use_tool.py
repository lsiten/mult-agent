#!/usr/bin/env python3
"""
Tests for Computer Use Tool

Run: pytest tests/test_computer_use_tool.py -v
"""

import json
import platform
import pytest
from unittest.mock import Mock, patch, MagicMock

from tools.computer_use_tool import (
    _check_computer_use_available,
    capture_screenshot,
    execute_mouse_action,
    execute_keyboard_action,
    execute_special_key,
    computer_screenshot_handler,
    computer_mouse_handler,
    computer_keyboard_handler,
    computer_key_handler,
    get_display_config,
)


class TestAvailabilityCheck:
    """Test Computer Use availability detection."""

    @patch("platform.system")
    def test_available_on_macos(self, mock_platform):
        """Should be available on macOS with PIL."""
        mock_platform.return_value = "Darwin"
        # PIL should already be installed
        assert _check_computer_use_available() is True

    @patch("platform.system")
    def test_available_on_linux(self, mock_platform):
        """Should be available on Linux with PIL."""
        mock_platform.return_value = "Linux"
        # PIL should already be installed
        assert _check_computer_use_available() is True

    @patch("platform.system")
    def test_unavailable_on_windows(self, mock_platform):
        """Should be unavailable on Windows."""
        mock_platform.return_value = "Windows"
        assert _check_computer_use_available() is False


class TestScreenshotCapture:
    """Test screenshot capture functionality."""

    @pytest.mark.skipif(
        platform.system() not in ["Darwin", "Linux"],
        reason="Screenshot requires macOS or Linux"
    )
    def test_capture_screenshot_returns_bytes(self):
        """Should return PNG bytes."""
        result = capture_screenshot()
        assert isinstance(result, bytes)
        assert len(result) > 0
        assert result[:8] == b'\x89PNG\r\n\x1a\n'  # PNG magic number

    @patch("subprocess.run")
    @patch("platform.system")
    def test_capture_screenshot_macos(self, mock_platform, mock_run):
        """Should use screencapture on macOS."""
        mock_platform.return_value = "Darwin"
        mock_run.return_value = Mock(returncode=0)

        with patch("builtins.open", create=True) as mock_open:
            mock_open.return_value.__enter__.return_value.read.return_value = b"fake_png_data"
            result = capture_screenshot()

        assert result == b"fake_png_data"
        mock_run.assert_called_once()
        assert "screencapture" in mock_run.call_args[0][0]


class TestMouseControl:
    """Test mouse control functionality."""

    def test_execute_mouse_action_validates_coordinate(self):
        """Should validate coordinate format."""
        with pytest.raises(ValueError, match="Coordinate must be"):
            execute_mouse_action("left_click", [100])

        with pytest.raises(ValueError, match="Coordinate must be"):
            execute_mouse_action("left_click", [100, 200, 300])

    @pytest.mark.skipif(
        platform.system() != "Darwin",
        reason="Requires macOS with cliclick"
    )
    def test_execute_mouse_action_macos(self):
        """Should execute mouse action on macOS."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            result = execute_mouse_action("left_click", [500, 300])

            assert result["success"] is True
            assert result["action"] == "left_click"
            assert result["coordinate"] == [500, 300]

    def test_execute_mouse_action_unsupported_platform(self):
        """Should raise error on unsupported platform."""
        with patch("platform.system", return_value="Windows"):
            with pytest.raises(RuntimeError, match="not supported"):
                execute_mouse_action("left_click", [100, 100])


class TestKeyboardControl:
    """Test keyboard control functionality."""

    @pytest.mark.skipif(
        platform.system() != "Darwin",
        reason="Requires macOS with cliclick"
    )
    def test_execute_keyboard_action_macos(self):
        """Should type text on macOS."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            result = execute_keyboard_action("Hello World")

            assert result["success"] is True
            assert result["text"] == "Hello World"

    def test_execute_keyboard_action_escapes_special_chars(self):
        """Should escape special characters for cliclick."""
        with patch("platform.system", return_value="Darwin"):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = Mock(returncode=0)

                execute_keyboard_action("test:value")

                cmd = mock_run.call_args[0][0]
                assert "test\\:value" in " ".join(cmd)


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

    @patch("platform.system", return_value="Darwin")
    def test_execute_special_key_macos(self, mock_platform):
        """Should handle special keys on macOS."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            result = execute_special_key("enter")
            assert result["success"] is True
            assert result["key"] == "enter"

    @patch("platform.system", return_value="Linux")
    def test_execute_special_key_linux(self, mock_platform):
        """Should handle special keys on Linux."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            result = execute_special_key("escape")
            assert result["success"] is True
            assert result["key"] == "escape"

    @patch("platform.system", return_value="Darwin")
    def test_execute_special_key_with_modifier(self, mock_platform):
        """Should handle keyboard shortcuts with modifiers."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = Mock(returncode=0)

            result = execute_special_key("tab", modifiers=["ctrl"])
            assert result["success"] is True


class TestNewMouseActions:
    """Test new mouse actions: scroll and drag."""

    def test_scroll_action_macos(self):
        """Should handle scroll actions."""
        with patch("platform.system", return_value="Darwin"):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = Mock(returncode=0)

                result = execute_mouse_action("scroll_up", [500, 300])
                assert result["success"] is True
                assert result["action"] == "scroll_up"

    def test_scroll_action_linux(self):
        """Should handle scroll actions on Linux."""
        with patch("platform.system", return_value="Linux"):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = Mock(returncode=0)

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
        with patch("platform.system", return_value="Darwin"):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value = Mock(returncode=0)

                result = execute_mouse_action("drag", [100, 100], [200, 200])
                assert result["success"] is True
                assert result["action"] == "drag"
                assert result["start_coordinate"] == [100, 100]
                assert result["target_coordinate"] == [200, 200]

    def test_display_config_auto_detect(self):
        """Should auto-detect display configuration."""
        config = get_display_config()
        assert "width" in config
        assert "height" in config
        assert config["width"] > 0
        assert config["height"] > 0
