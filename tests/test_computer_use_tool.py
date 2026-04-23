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
    computer_screenshot_handler,
    computer_mouse_handler,
    computer_keyboard_handler,
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
