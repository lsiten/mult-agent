"""
Config API handlers for Gateway Dashboard.

Provides endpoints for configuration management:
- GET /api/config - Current configuration
- GET /api/config/defaults - Default configuration
- GET /api/config/schema - Configuration schema
- PUT /api/config - Update configuration
- GET /api/config/raw - Raw YAML configuration
- PUT /api/config/raw - Update raw YAML
"""

import hmac
import json
import logging
import os
from typing import Any, Dict
from aiohttp import web

logger = logging.getLogger(__name__)


class ConfigAPIHandlers:
    """Configuration management API handlers."""

    def __init__(self, session_token: str):
        self._session_token = session_token

    def _check_auth(self, request: web.Request) -> bool:
        """Check session token (bypassed in Electron mode)."""
        if os.getenv("HERMES_ELECTRON_MODE") == "true":
            return True

        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._session_token}"
        return hmac.compare_digest(auth.encode(), expected.encode())

    async def handle_get_config(self, request: web.Request) -> web.Response:
        """GET /api/config - Return current configuration."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import load_config
            config = load_config()

            # Strip internal keys (starting with _)
            config = {k: v for k, v in config.items() if not k.startswith("_")}

            return web.json_response(config)
        except Exception as e:
            logger.error(f"Failed to load config: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_config_defaults(self, request: web.Request) -> web.Response:
        """GET /api/config/defaults - Return default configuration."""
        try:
            from hermes_cli.config import DEFAULT_CONFIG
            return web.json_response(DEFAULT_CONFIG)
        except Exception as e:
            logger.error(f"Failed to load default config: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_config_schema(self, request: web.Request) -> web.Response:
        """GET /api/config/schema - Return configuration schema."""
        try:
            from hermes_cli.config import DEFAULT_CONFIG

            # Build schema from DEFAULT_CONFIG
            schema = self._build_simple_schema(DEFAULT_CONFIG)

            return web.json_response({
                "fields": schema,
                "category_order": ["general", "agent", "terminal", "display", "security"]
            })
        except Exception as e:
            logger.error(f"Failed to build config schema: {e}")
            return web.json_response({"error": str(e)}, status=500)

    def _build_simple_schema(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Build a simple schema from config dict."""
        schema = {}
        for key, value in config.items():
            if isinstance(value, dict):
                # Nested config - flatten keys
                for subkey, subvalue in value.items():
                    full_key = f"{key}.{subkey}"
                    schema[full_key] = {
                        "type": type(subvalue).__name__,
                        "default": subvalue,
                        "category": key
                    }
            else:
                schema[key] = {
                    "type": type(value).__name__,
                    "default": value,
                    "category": "general"
                }
        return schema

    async def handle_put_config(self, request: web.Request) -> web.Response:
        """PUT /api/config - Update configuration."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"config": dict}, required=["config"])

            from hermes_cli.config import save_config
            save_config(data["config"])

            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_config_raw(self, request: web.Request) -> web.Response:
        """GET /api/config/raw - Return raw YAML configuration."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from hermes_cli.config import get_config_path
            config_path = get_config_path()

            if not config_path.exists():
                return web.json_response({"yaml": ""})

            yaml_text = config_path.read_text(encoding="utf-8")
            return web.json_response({"yaml": yaml_text})

        except Exception as e:
            logger.error(f"Failed to read raw config: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_put_config_raw(self, request: web.Request) -> web.Response:
        """PUT /api/config/raw - Update raw YAML configuration."""
        if not self._check_auth(request):
            return web.json_response({"error": "Unauthorized"}, status=401)

        try:
            from gateway.platforms.api_server_validation import parse_request_json
            data = await parse_request_json(request, {"yaml_text": str}, required=["yaml_text"])

            from hermes_cli.config import get_config_path
            config_path = get_config_path()

            # Validate YAML before writing
            import yaml
            try:
                yaml.safe_load(data["yaml_text"])
            except yaml.YAMLError as e:
                return web.json_response(
                    {"error": f"Invalid YAML: {e}"},
                    status=400
                )

            config_path.write_text(data["yaml_text"], encoding="utf-8")
            return web.json_response({"ok": True})

        except web.HTTPBadRequest as e:
            raise
        except Exception as e:
            logger.error(f"Failed to save raw config: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_get_model_info(self, request: web.Request) -> web.Response:
        """GET /api/model/info - Return model metadata."""
        try:
            from hermes_cli.config import load_config

            cfg = load_config()
            model_cfg = cfg.get("model", "")

            # Extract model name and provider
            if isinstance(model_cfg, dict):
                model_name = model_cfg.get("default", model_cfg.get("name", ""))
                provider = model_cfg.get("provider", "")
                base_url = model_cfg.get("base_url", "")
                config_ctx = model_cfg.get("context_length")
            else:
                model_name = str(model_cfg) if model_cfg else ""
                provider = ""
                base_url = ""
                config_ctx = None

            if not model_name:
                return web.json_response({
                    "model": "",
                    "provider": provider,
                    "auto_context_length": 0,
                    "config_context_length": 0,
                    "effective_context_length": 0,
                    "capabilities": {}
                })

            # Resolve context length
            auto_ctx = 0
            try:
                from agent.model_metadata import get_model_context_length
                auto_ctx = get_model_context_length(
                    model=model_name,
                    base_url=base_url,
                    provider=provider,
                    config_context_length=None
                )
            except Exception:
                pass

            config_ctx_int = 0
            if isinstance(config_ctx, int) and config_ctx > 0:
                config_ctx_int = config_ctx

            effective_ctx = config_ctx_int if config_ctx_int > 0 else auto_ctx

            # Get capabilities
            caps = {}
            try:
                from agent.models_dev import get_model_capabilities
                mc = get_model_capabilities(provider=provider, model=model_name)
                if mc:
                    caps = {
                        "vision": mc.vision,
                        "reasoning": mc.reasoning,
                        "tools": mc.tools
                    }
            except Exception:
                pass

            return web.json_response({
                "model": model_name,
                "provider": provider,
                "auto_context_length": auto_ctx,
                "config_context_length": config_ctx_int,
                "effective_context_length": effective_ctx,
                "capabilities": caps
            })

        except Exception as e:
            logger.error(f"Failed to get model info: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_detect_chrome(self, request):
        """Detect running Chrome instances and check if debugging is enabled."""
        import subprocess
        import platform

        try:
            # Check if Chrome is running
            is_running = False
            is_debug_enabled = False
            instances = []

            # Check Chrome process
            try:
                if platform.system() == "Darwin":  # macOS
                    result = subprocess.run(
                        ["ps", "aux"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    for line in result.stdout.split("\n"):
                        if "Google Chrome" in line or "chrome" in line.lower():
                            is_running = True
                            # Check if has remote-debugging-port
                            if "remote-debugging-port" in line:
                                is_debug_enabled = True
                            break
                elif platform.system() == "Linux":
                    result = subprocess.run(
                        ["ps", "aux"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    for line in result.stdout.split("\n"):
                        if "chrome" in line.lower() or "chromium" in line.lower():
                            is_running = True
                            if "remote-debugging-port" in line:
                                is_debug_enabled = True
                            break
                elif platform.system() == "Windows":
                    result = subprocess.run(
                        ["tasklist", "/FI", "IMAGENAME eq chrome.exe"],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if "chrome.exe" in result.stdout.lower():
                        is_running = True
            except Exception as e:
                logger.warning(f"Failed to check Chrome process: {e}")

            # Try to detect debugging endpoints on common ports
            if is_running:
                import aiohttp
                for port in range(9222, 9234):  # Check ports 9222-9233
                    try:
                        async with aiohttp.ClientSession() as session:
                            async with session.get(
                                f"http://localhost:{port}/json/version",
                                timeout=aiohttp.ClientTimeout(total=0.5)
                            ) as resp:
                                if resp.status == 200:
                                    data = await resp.json()
                                    instances.append({
                                        "port": port,
                                        "wsUrl": data.get("webSocketDebuggerUrl", ""),
                                        "version": data.get("Browser", "Unknown"),
                                        "available": True
                                    })
                                    is_debug_enabled = True
                    except Exception:
                        pass

            return web.json_response({
                "running": is_running,
                "debug_enabled": is_debug_enabled,
                "instances": instances,
                "count": len(instances),
                "message": (
                    "Chrome 正在运行且已开启远程调试" if is_debug_enabled
                    else "Chrome 正在运行但未开启远程调试，需要重启" if is_running
                    else "Chrome 未运行"
                )
            })

        except Exception as e:
            logger.error(f"Failed to detect Chrome: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_restart_chrome(self, request):
        """Restart Chrome with remote debugging enabled, preserving session."""
        import subprocess
        import platform
        import signal

        try:
            data = await request.json() if request.body_exists else {}
            port = data.get("port", 9222)

            # Get Chrome executable path
            chrome_path = None
            if platform.system() == "Darwin":  # macOS
                chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            elif platform.system() == "Linux":
                for path in ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]:
                    if os.path.exists(path):
                        chrome_path = path
                        break
            elif platform.system() == "Windows":
                for path in [
                    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
                ]:
                    if os.path.exists(path):
                        chrome_path = path
                        break

            if not chrome_path or not os.path.exists(chrome_path):
                return web.json_response({
                    "ok": False,
                    "error": "未找到 Chrome 可执行文件"
                }, status=404)

            # Kill existing Chrome processes
            try:
                if platform.system() == "Darwin":
                    subprocess.run(["killall", "Google Chrome"], timeout=5)
                elif platform.system() == "Linux":
                    subprocess.run(["killall", "chrome"], timeout=5)
                elif platform.system() == "Windows":
                    subprocess.run(["taskkill", "/F", "/IM", "chrome.exe"], timeout=5)

                # Wait for Chrome to fully exit
                import time
                time.sleep(2)
            except Exception as e:
                logger.warning(f"Failed to kill Chrome: {e}")

            # Start Chrome with remote debugging
            cmd = [
                chrome_path,
                f"--remote-debugging-port={port}",
                "--restore-last-session"  # Restore all tabs
            ]

            try:
                if platform.system() == "Windows":
                    subprocess.Popen(cmd, creationflags=subprocess.DETACHED_PROCESS)
                else:
                    subprocess.Popen(
                        cmd,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True
                    )

                # Wait a bit for Chrome to start
                import time
                time.sleep(3)

                # Verify debugging endpoint is available
                import aiohttp
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"http://localhost:{port}/json/version",
                            timeout=aiohttp.ClientTimeout(total=2)
                        ) as resp:
                            if resp.status == 200:
                                data = await resp.json()
                                return web.json_response({
                                    "ok": True,
                                    "port": port,
                                    "wsUrl": data.get("webSocketDebuggerUrl", ""),
                                    "version": data.get("Browser", "Unknown"),
                                    "message": "Chrome 已重启并开启远程调试，您的标签页已恢复"
                                })
                except Exception as e:
                    logger.warning(f"Chrome started but debugging endpoint not ready: {e}")

                return web.json_response({
                    "ok": True,
                    "port": port,
                    "message": "Chrome 已启动，请稍等片刻等待调试端口就绪"
                })

            except Exception as e:
                logger.error(f"Failed to start Chrome: {e}")
                return web.json_response({
                    "ok": False,
                    "error": f"启动 Chrome 失败: {str(e)}"
                }, status=500)

        except Exception as e:
            logger.error(f"Failed to restart Chrome: {e}")
            return web.json_response({"error": str(e)}, status=500)

    async def handle_launch_chrome(self, request):
        """Launch Chrome with remote debugging (or restart if already running)."""
        # First check if Chrome is already running
        detect_resp = await self.handle_detect_chrome(request)
        detect_data = json.loads(detect_resp.text)

        if detect_data.get("running") and not detect_data.get("debug_enabled"):
            # Chrome is running but debug not enabled, need to restart
            return await self.handle_restart_chrome(request)
        elif detect_data.get("debug_enabled"):
            # Already running with debug enabled
            instances = detect_data.get("instances", [])
            if instances:
                return web.json_response({
                    "ok": True,
                    "already_running": True,
                    **instances[0]
                })

        # Not running, start fresh
        return await self.handle_restart_chrome(request)
