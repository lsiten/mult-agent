"""
Chat API handlers for unified chat interface.

Provides session management, streaming responses, and message handling
for the Electron app's unified chat interface.
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Optional, Dict, Any

from aiohttp import web

from gateway.platforms.api_server_validation import (
    parse_request_json,
    require_fields,
    ValidationError,
)
from gateway.org.runtime import request_agent_id, resolve_request_profile
from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)


class ChatAPIHandlers:
    """Handlers for unified chat interface APIs."""

    def __init__(self, session_token: str):
        self._session_token = session_token
        self._active_streams = {}  # session_id -> {"task": asyncio.Task, "agent": AIAgent | None}

        # In Electron mode, use HERMES_GATEWAY_TOKEN if available
        import os
        if os.getenv("HERMES_ELECTRON_MODE", "").lower() in ("true", "1"):
            gateway_token = os.getenv("HERMES_GATEWAY_TOKEN")
            if gateway_token:
                self._expected_token = gateway_token
            else:
                self._expected_token = session_token
        else:
            self._expected_token = session_token

    def _check_auth(self, request: web.Request) -> None:
        """Validate token. Raises 401 on failure.

        For EventSource/SSE endpoints that cannot send custom headers,
        the token can be passed as a URL parameter 'token'.

        In Electron mode, validates against HERMES_GATEWAY_TOKEN.
        In web mode, validates against session_token.
        """
        # Check Authorization header first
        auth = request.headers.get("Authorization", "")
        expected = f"Bearer {self._expected_token}"
        if auth == expected:
            return

        # Fallback: check URL parameter (for EventSource/SSE)
        url_token = request.query.get("token", "")
        if url_token == self._expected_token:
            return

        # Neither header nor URL param matched
        raise web.HTTPUnauthorized(text="Unauthorized")

    @staticmethod
    def _start_tool_invocation(
        tool_invocations: list[Dict[str, Any]],
        tool_invocation_map: Dict[str, Dict[str, Any]],
        tool_call_id: str,
        tool_name: str,
        tool_args: Dict[str, Any],
        *,
        started_at: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Track a tool invocation by ID so out-of-order completion is safe."""
        invocation = {
            "id": tool_call_id,
            "tool": tool_name,
            "args": tool_args,
            "status": "pending",
            "start_time": started_at if started_at is not None else time.time(),
        }
        tool_invocations.append(invocation)
        tool_invocation_map[tool_call_id] = invocation
        return invocation

    @staticmethod
    def _complete_tool_invocation(
        tool_invocation_map: Dict[str, Dict[str, Any]],
        tool_call_id: str,
        result: str,
        *,
        completed_at: Optional[float] = None,
    ) -> Optional[Dict[str, Any]]:
        """Complete a tracked tool invocation, even if callbacks arrive out of order."""
        invocation = tool_invocation_map.get(tool_call_id)
        if invocation is None:
            return None

        end_time = completed_at if completed_at is not None else time.time()
        invocation["result"] = result
        invocation["status"] = "success"
        invocation["duration"] = max(0, int((end_time - invocation["start_time"]) * 1000))
        return invocation

    async def _safe_write_sse(
        self,
        response: web.StreamResponse,
        event_name: str,
        payload: Dict[str, Any],
        *,
        log_context: str,
    ) -> bool:
        """Write an SSE event and treat closing transports as best-effort disconnects."""
        try:
            event = f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"
            await response.write(event.encode())
            return True
        except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError):
            _log.warning("Could not send %s (%s): client disconnected", event_name, log_context)
            return False
        except Exception as exc:
            if "closing transport" in str(exc).lower():
                _log.warning("Could not send %s (%s): %s", event_name, log_context, exc)
                return False
            raise

    @staticmethod
    def _extract_model_settings(config: Dict[str, Any]) -> tuple[str, Optional[str], Optional[str]]:
        """Return model, provider, and base URL from string or dict config."""
        model_cfg = config.get("model", "")
        model = ""
        provider = None
        base_url = None

        if isinstance(model_cfg, dict):
            model = str(model_cfg.get("default") or model_cfg.get("name") or "").strip()
            raw_provider = str(model_cfg.get("provider") or "").strip()
            raw_base_url = str(model_cfg.get("base_url") or "").strip()
            provider = raw_provider if raw_provider and raw_provider != "auto" else None
            base_url = raw_base_url or None
        elif isinstance(model_cfg, str):
            model = model_cfg.strip()

        if model and "/" in model and not provider:
            provider = model.split("/", 1)[0].strip() or None

        return model, provider, base_url

    async def handle_create_session(self, request: web.Request) -> web.Response:
        """POST /api/chat/sessions/create

        Create a new chat session.

        Request body:
            {
                "source": "unified-chat",
                "user_id": "local-user",
                "title": "Optional title"
            }

        Response:
            {
                "session_id": "chat_abc123",
                "created_at": 1234567890.0,
                "title": "Chat title or null"
            }
        """
        self._check_auth(request)

        try:
            data = await parse_request_json(
                request,
                schema={"source": str, "user_id": str, "title": str},
                required=["source", "user_id"]
            )

            from hermes_state import SessionDB

            db = SessionDB()
            try:
                session_id = f"chat_{uuid.uuid4().hex[:12]}"
                # Tag the session with the active sub-agent id so future
                # list/history queries can scope by identity. ``None`` means
                # master agent — the existing behaviour for web/CLI clients.
                scope_agent_id = request_agent_id(request)
                db.create_session(
                    session_id=session_id,
                    source=data["source"],
                    user_id=data["user_id"],
                    agent_id=scope_agent_id,
                )

                # Update title if provided
                if data.get("title"):
                    db._conn.execute(
                        "UPDATE sessions SET title = ? WHERE id = ?",
                        (data["title"], session_id),
                    )
                    db._conn.commit()

                return web.json_response({
                    "session_id": session_id,
                    "created_at": time.time(),
                    "title": data.get("title"),
                })
            finally:
                db.close()

        except ValidationError as e:
            return web.json_response({"detail": str(e)}, status=e.status_code)
        except Exception as e:
            _log.exception("POST /api/chat/sessions/create failed")
            return web.json_response({"detail": str(e)}, status=500)

    async def handle_list_sessions(self, request: web.Request) -> web.Response:
        """GET /api/chat/sessions

        List chat sessions with optional filtering.

        Query params:
            - limit: int (default: 20)
            - offset: int (default: 0)
            - source: str (optional filter)

        Response:
            {
                "sessions": [...],
                "total": 10,
                "limit": 20,
                "offset": 0
            }
        """
        self._check_auth(request)

        try:
            # Parse query params
            limit = int(request.query.get("limit", "20"))
            offset = int(request.query.get("offset", "0"))
            source = request.query.get("source")

            from hermes_state import SessionDB

            db = SessionDB()
            try:
                # Scope to the active sub-agent (or master when header absent).
                # ``request_agent_id`` returns ``None`` for master; we forward
                # that into the store, whose ``agent_id=None`` semantics is
                # "only agent_id IS NULL rows".
                scope_agent_id = request_agent_id(request)
                all_sessions = db.list_sessions_rich(
                    limit=1000,
                    offset=0,
                    agent_id=scope_agent_id,
                )

                # Filter by source if provided
                if source:
                    all_sessions = [s for s in all_sessions if s.get("source") == source]

                # Apply pagination
                sessions = all_sessions[offset:offset + limit]
                total = len(all_sessions)

                return web.json_response({
                    "sessions": sessions,
                    "total": total,
                    "limit": limit,
                    "offset": offset,
                })
            finally:
                db.close()

        except Exception as e:
            _log.exception("GET /api/chat/sessions failed")
            return web.json_response({"detail": str(e)}, status=500)

    async def handle_update_session(self, request: web.Request) -> web.Response:
        """PUT /api/sessions/{session_id}

        Update session metadata (e.g., title).

        Request body:
            {
                "title": "New title"
            }

        Response:
            {
                "ok": true,
                "session_id": "chat_abc123"
            }
        """
        self._check_auth(request)

        try:
            session_id = request.match_info["session_id"]
            data = await parse_request_json(
                request,
                schema={"title": str}
            )

            from hermes_state import SessionDB

            db = SessionDB()
            try:
                sid = db.resolve_session_id(session_id)
                if not sid:
                    return web.json_response({"detail": "Session not found"}, status=404)

                if "title" in data:
                    db._conn.execute(
                        "UPDATE sessions SET title = ? WHERE id = ?",
                        (data["title"], sid),
                    )
                    db._conn.commit()

                return web.json_response({"ok": True, "session_id": sid})
            finally:
                db.close()

        except Exception as e:
            _log.exception("PUT /api/sessions/{session_id} failed")
            return web.json_response({"detail": str(e)}, status=500)

    async def handle_stream_messages(self, request: web.Request) -> web.StreamResponse:
        """GET /api/sessions/{session_id}/stream

        Stream AI response using Server-Sent Events (SSE).

        Query params:
            - message: str (user message)

        SSE Events:
            - event: content, data: {"delta": "word "}
            - event: done, data: {"finish_reason": "stop"}
            - event: error, data: {"error": "message"}
        """
        self._check_auth(request)

        session_id = request.match_info["session_id"]
        message = request.query.get("message", "")

        # Parse attachments from query parameter
        attachments = None
        attachments_param = request.query.get("attachments")
        if attachments_param:
            try:
                attachments = json.loads(attachments_param)
            except json.JSONDecodeError:
                _log.warning("Failed to parse attachments parameter: %s", attachments_param)

        # Parse selected_skills from query parameter
        selected_skills = None
        skills_param = request.query.get("selected_skills")
        _log.info("[DEBUG] Query params: %s", dict(request.query))
        if skills_param:
            try:
                selected_skills = json.loads(skills_param)
                _log.info("[SKILL_SELECTION] Selected skills for session %s: %s", session_id, selected_skills)
            except json.JSONDecodeError:
                _log.warning("Failed to parse selected_skills parameter: %s", skills_param)
        else:
            _log.info("[SKILL_SELECTION] No skills selected for session %s", session_id)

        # Optional org sub-agent identity.  When provided, the chat handler
        # will build the AIAgent using the provisioned profile's SOUL.md,
        # config.yaml and .env so the conversation speaks "as" that agent.
        # Validation failure (bad id, unprovisioned profile, etc.) falls
        # back to the master agent rather than blocking the chat stream.
        requested_agent_id_raw = request.query.get("agent_id")
        requested_agent_id: Optional[int] = None
        if requested_agent_id_raw:
            try:
                requested_agent_id = int(requested_agent_id_raw)
            except ValueError:
                _log.warning("Invalid agent_id query parameter: %s", requested_agent_id_raw)

        # Create SSE response
        response = web.StreamResponse()
        response.headers["Content-Type"] = "text/event-stream"
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Connection"] = "keep-alive"
        response.headers["X-Accel-Buffering"] = "no"

        # Add CORS headers for browser access (must be set before prepare())
        origin = request.headers.get("Origin", "")
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"

        await response.prepare(request)

        try:
            from hermes_state import SessionDB

            db = SessionDB()
            try:
                sid = db.resolve_session_id(session_id)
                if not sid:
                    error_event = f'event: error\ndata: {json.dumps({"error": "Session not found"})}\n\n'
                    await response.write(error_event.encode())
                    return response

                # Save user message with attachments
                db.append_message(
                    session_id=sid,
                    role="user",
                    content=message,
                    attachments=attachments
                )

                # Check if this is the first message in the session
                # If so, add system messages for auth and tools
                cursor = db._conn.execute(
                    "SELECT message_count FROM sessions WHERE id = ?",
                    (sid,)
                )
                row = cursor.fetchone()
                is_first_message = row and row["message_count"] == 1

                if is_first_message:
                    # Save authorization system message
                    db.append_message(
                        session_id=sid,
                        role="system",
                        content="✅ API 授权成功"
                    )
                    _log.info("Saved authorization system message for session %s", sid)

                    # Count available tools and save tools loaded message
                    try:
                        from model_tools import get_available_toolsets
                        toolsets = get_available_toolsets()
                        total_tools = sum(len(ts.get("tools", [])) for ts in toolsets.values())

                        tools_message = f"🛠️ 工具已加载：{total_tools} 个工具可用"
                        db.append_message(
                            session_id=sid,
                            role="system",
                            content=tools_message
                        )
                        _log.info("Saved tools loaded message: %d tools", total_tools)
                    except Exception as e:
                        _log.warning("Failed to count tools: %s", e)

                # Check if model is configured
                import yaml

                hermes_home = get_hermes_home()
                config_path = hermes_home / "config.yaml"

                config = {}
                model = ""
                provider = None
                config_base_url = None
                model_configured = False
                if config_path.exists():
                    try:
                        with open(config_path) as f:
                            config = yaml.safe_load(f) or {}
                            model, provider, config_base_url = self._extract_model_settings(config)
                            model_configured = bool(model)
                    except Exception as e:
                        _log.warning("Failed to load config: %s", e)

                # If the caller targeted an org sub-agent, resolve its
                # provisioned profile and overlay model/provider/base_url.
                # Missing or unready profiles silently fall back to the
                # master agent so chat never hard-fails on identity issues.
                org_profile = None
                org_api_key: Optional[str] = None
                if requested_agent_id is not None:
                    try:
                        from gateway.org.runtime import resolve_chat_profile
                        org_profile = resolve_chat_profile(requested_agent_id)
                    except Exception as exc:
                        _log.warning(
                            "Failed to resolve org chat profile for agent_id=%s: %s",
                            requested_agent_id, exc,
                        )
                        org_profile = None
                    if org_profile and org_profile.is_ready():
                        if org_profile.model:
                            model = org_profile.model
                            model_configured = True
                        if org_profile.provider:
                            provider = org_profile.provider
                        if org_profile.base_url:
                            config_base_url = org_profile.base_url
                        org_api_key = org_profile.api_key
                        _log.info(
                            "Chat session %s acting as org agent %s (profile_home=%s, model=%s)",
                            sid, requested_agent_id, org_profile.profile_home, model or "<inherited>",
                        )
                    elif org_profile is not None:
                        _log.info(
                            "Org agent %s profile not ready (status=%s); using master defaults",
                            requested_agent_id, org_profile.profile_status,
                        )
                    else:
                        _log.warning(
                            "Org agent %s not found; using master defaults", requested_agent_id,
                        )

                if not model_configured:
                    # Send configuration guide response
                    guide_response = (
                        "👋 欢迎使用 Hermes Agent！\n\n"
                        "检测到您还未配置 AI 模型。请按照以下步骤配置：\n\n"
                        "**方法 1：使用 Dashboard 配置**\n"
                        "1. 点击左侧导航栏的 \"⚙️ Config\"\n"
                        "2. 在 Model 字段选择或输入模型名称（如 `claude-sonnet-4-5`）\n"
                        "3. 在 Providers 部分配置 API Key\n"
                        "4. 点击保存\n\n"
                        "**方法 2：使用命令行配置**\n"
                        "```bash\n"
                        "hermes model claude-sonnet-4-5  # 设置模型\n"
                        "hermes setup                    # 配置向导\n"
                        "```\n\n"
                        "**方法 3：设置环境变量**\n"
                        "```bash\n"
                        "export ANTHROPIC_API_KEY='your-key-here'\n"
                        "```\n\n"
                        f"配置文件位置: `{config_path}`\n\n"
                        "配置完成后，刷新页面即可开始对话！ 🚀"
                    )

                    # Stream the guide message character by character
                    for char in guide_response:
                        content_event = f'event: content\ndata: {json.dumps({"delta": char})}\n\n'
                        await response.write(content_event.encode())
                        await asyncio.sleep(0.003)  # Faster streaming for guide

                    # Save guide message
                    db.append_message(session_id=sid, role="assistant", content=guide_response)

                    # Send done event
                    done_event = f'event: done\ndata: {json.dumps({"finish_reason": "stop"})}\n\n'
                    await response.write(done_event.encode())

                else:
                    # Model configured - use real agent
                    # Get conversation history for context (including the just-added user message with attachments)
                    messages = db.get_messages(sid)
                    conversation_history = []
                    for msg in messages[:-1]:  # Exclude the just-added user message (will be passed separately)
                        hist_msg = {
                            "role": msg["role"],
                            "content": msg["content"],
                        }
                        # Include attachments if present
                        if msg.get("attachments"):
                            hist_msg["attachments"] = msg["attachments"]
                        conversation_history.append(hist_msg)

                    # Get the current user message with attachments from DB
                    current_user_msg = messages[-1] if messages else None
                    user_message_content = message

                    # Load provider credentials from config (needed for vision analysis)
                    api_key = None
                    base_url = config_base_url

                    # Extract provider from model name if it has provider/ prefix
                    if not provider and model and "/" in model:
                        provider, _ = model.split("/", 1)
                        _log.info("Extracted provider from model: %s", provider)

                    # When acting as an org sub-agent, its provisioned .env
                    # (filtered by the inheritance whitelist) takes priority
                    # over the master agent's credential store.  If the
                    # profile did not carry a usable key we still fall back
                    # below through the normal resolution chain.
                    if org_api_key:
                        api_key = org_api_key
                        _log.info(
                            "Using org profile api_key for session %s (provider=%s)",
                            sid, provider or "<unknown>",
                        )

                    # Try to resolve credentials using hermes_cli.auth
                    if provider:
                        try:
                            from hermes_cli.auth import PROVIDER_REGISTRY, resolve_api_key_provider_credentials
                            pconfig = PROVIDER_REGISTRY.get(provider)
                            if pconfig and pconfig.auth_type == "api_key":
                                try:
                                    creds = resolve_api_key_provider_credentials(provider)
                                    api_key = creds.get("api_key")
                                    base_url = base_url or creds.get("base_url")
                                    _log.info("Loaded credentials for %s provider: base_url=%s", provider, base_url)
                                except Exception as e:
                                    _log.warning("Failed to resolve %s credentials: %s", provider, e)
                        except ImportError:
                            _log.warning("Could not import PROVIDER_REGISTRY")

                    # Fallback: check legacy config.providers for bedrock/anthropic
                    if not (api_key and base_url):
                        try:
                            providers = config.get("providers", {})

                            # Check bedrock provider first
                            bedrock = providers.get("bedrock", {})
                            if bedrock.get("enabled"):
                                api_key = bedrock.get("apiKey")
                                base_url = bedrock.get("baseUrl")
                                provider = "bedrock"
                                _log.info("Using Bedrock provider from config.providers: %s", base_url)
                            else:
                                # Check anthropic provider
                                anthropic = providers.get("anthropic", {})
                                if anthropic.get("enabled"):
                                    api_key = anthropic.get("apiKey")
                                    base_url = anthropic.get("baseUrl")
                                    provider = "anthropic"
                                    _log.info("Using Anthropic provider from config.providers: %s", base_url)
                        except Exception as e:
                            _log.warning("Failed to load provider config: %s", e)

                    # If user sent attachments, directly tell Agent to analyze them
                    if attachments:
                        # For vision-capable models, explicitly instruct agent to analyze images
                        image_refs = []
                        for att in attachments:
                            if att.get("type") == "image":
                                # Convert URL to local file path for agent to read
                                # URL format: http://localhost:8642/api/attachments/session_id/filename
                                url = att.get("url", "")
                                _log.info("Processing attachment URL: %s", url)

                                if "/api/attachments/" in url:
                                    # Extract relative path from URL (e.g., "chat_xxx/file.jpg")
                                    rel_path = url.split("/api/attachments/", 1)[1] if "/api/attachments/" in url else ""
                                    _log.info("Extracted rel_path: %s", rel_path)

                                    if rel_path:
                                        # Convert to absolute path
                                        hermes_home = get_hermes_home()
                                        # rel_path already contains "session_id/filename", so use it directly
                                        image_path = hermes_home / "data" / "attachments" / rel_path
                                        _log.info("Constructed image path: %s", image_path)

                                        # Verify file exists
                                        if image_path.exists():
                                            image_refs.append(str(image_path))
                                            _log.info("Image file exists: %s", image_path)
                                        else:
                                            _log.warning("Image file not found: %s", image_path)

                        # Analyze images directly using vision API before sending to Agent
                        if image_refs:
                            # Use the same provider config as Agent
                            vision_results = []
                            for img_path in image_refs:
                                try:
                                    _log.info("Starting vision analysis for: %s", img_path)

                                    # Read image and convert to base64
                                    import base64
                                    from pathlib import Path
                                    image_data = Path(img_path).read_bytes()
                                    b64_data = base64.b64encode(image_data).decode('ascii')

                                    # Detect mime type
                                    mime_type = "image/jpeg"
                                    if img_path.endswith('.png'):
                                        mime_type = "image/png"
                                    elif img_path.endswith('.gif'):
                                        mime_type = "image/gif"
                                    elif img_path.endswith('.webp'):
                                        mime_type = "image/webp"

                                    data_url = f"data:{mime_type};base64,{b64_data}"

                                    # Construct vision message
                                    vision_prompt = f"Describe this image in detail. The user's question is: {message}"
                                    vision_messages = [{
                                        "role": "user",
                                        "content": [
                                            {"type": "text", "text": vision_prompt},
                                            {"type": "image_url", "image_url": {"url": data_url}}
                                        ]
                                    }]

                                    # Call vision API directly using configured provider
                                    if provider == "anthropic":
                                        from anthropic import AsyncAnthropic
                                        client = AsyncAnthropic(api_key=api_key, base_url=base_url)
                                        response = await client.messages.create(
                                            model=model,
                                            messages=vision_messages,
                                            temperature=0.1,
                                            max_tokens=2000
                                        )
                                        if response.content:
                                            analysis = response.content[0].text if response.content else None
                                            if analysis:
                                                vision_results.append(analysis)
                                                _log.info("Vision analysis successful: %d chars", len(analysis))
                                    else:
                                        _log.warning("Unsupported provider for vision: %s", provider)

                                except Exception as e:
                                    _log.error("Vision analysis error: %s", e, exc_info=True)

                            # Prepend vision analysis to user message
                            if vision_results:
                                vision_context = "[Image Analysis]\n" + "\n\n".join(vision_results) + "\n\n"
                                user_message_content = vision_context + message
                                _log.info("Added %d vision analysis results to user message", len(vision_results))
                            else:
                                _log.warning("No successful vision analysis results")
                        else:
                            _log.warning("No valid image files found in attachments")

                    # Create SSE stream consumer
                    full_response = []
                    tool_invocations = []
                    tool_invocation_map: Dict[str, Dict[str, Any]] = {}

                    # Event queue for cross-thread communication
                    tool_events = asyncio.Queue()

                    # Capture event loop reference in main thread
                    main_loop = asyncio.get_running_loop()

                    # Track assistant message timestamp for proper ordering
                    assistant_msg_timestamp = time.time()

                    # Track current text segment for message splitting
                    current_text_segment = []
                    segment_saved = False  # Track if current segment was saved
                    client_disconnected = False

                    def on_delta(text: str):
                        """Callback for streaming deltas from agent."""
                        if text:
                            full_response.append(text)
                            current_text_segment.append(text)

                    def on_tool_start(tool_call_id: str, tool_name: str, tool_args: Dict[str, Any]):
                        """Callback when a tool invocation starts (called from thread pool)."""
                        nonlocal segment_saved
                        self._start_tool_invocation(
                            tool_invocations,
                            tool_invocation_map,
                            tool_call_id,
                            tool_name,
                            tool_args,
                        )
                        _log.info("[TOOL_CALLBACK] Tool started: %s (id=%s)", tool_name, tool_call_id)

                        # Mark that we need to save the current text segment
                        segment_saved = False

                        # Queue event for async processing using captured loop
                        try:
                            asyncio.run_coroutine_threadsafe(
                                tool_events.put(("start", tool_call_id, tool_name)),
                                main_loop
                            )
                        except Exception as e:
                            _log.warning("Failed to queue tool_start event: %s", e)

                    def on_tool_complete(tool_call_id: str, tool_name: str, tool_args: Dict[str, Any], result: str):
                        """Callback when a tool invocation completes (called from thread pool)."""
                        nonlocal segment_saved
                        invocation = self._complete_tool_invocation(
                            tool_invocation_map,
                            tool_call_id,
                            result,
                        )
                        if invocation is None:
                            _log.warning("[TOOL_CALLBACK] Tool completed with unknown id: %s (id=%s)", tool_name, tool_call_id)
                            return

                        _log.info("[TOOL_CALLBACK] Tool completed: %s (id=%s, duration=%dms)", tool_name, tool_call_id, invocation["duration"])

                        # Reset segment_saved flag so new text after tool can be saved
                        segment_saved = False

                        # Queue event for async processing using captured loop
                        try:
                            asyncio.run_coroutine_threadsafe(
                                tool_events.put(("complete", tool_call_id, tool_name, invocation["duration"])),
                                main_loop
                            )
                        except Exception as e:
                            _log.warning("Failed to queue tool_complete event: %s", e)

                    # Run agent in thread pool to avoid blocking event loop
                    from run_agent import AIAgent
                    from concurrent.futures import ThreadPoolExecutor

                    executor = ThreadPoolExecutor(max_workers=1)

                    async def stream_agent_response():
                        loop = asyncio.get_event_loop()

                        # Create agent instance with explicit credentials.
                        # ``profile_home`` is set only when the caller is
                        # conversing AS an org sub-agent so its provisioned
                        # SOUL.md / context wins over the master identity.
                        agent = AIAgent(
                            session_id=sid,
                            stream_delta_callback=on_delta,
                            tool_start_callback=on_tool_start,
                            tool_complete_callback=on_tool_complete,
                            model=model,
                            api_key=api_key,
                            base_url=base_url,
                            provider=provider,
                            profile_home=(
                                org_profile.profile_home
                                if org_profile and org_profile.is_ready()
                                else None
                            ),
                        )
                        if sid in self._active_streams:
                            self._active_streams[sid]["agent"] = agent

                        # Send skill_loaded event if skills are selected
                        # Use selected_skills from query parameter to show which skills were loaded
                        if selected_skills:
                            skills_info = []
                            hermes_home = get_hermes_home()
                            skills_dir = hermes_home / "skills"

                            for skill_name in selected_skills:
                                skill_path = skills_dir / skill_name
                                # Check if skill exists and is enabled
                                status = "loaded"
                                if not skill_path.exists():
                                    status = "unavailable"

                                # Try to read category from skill.yaml
                                category = "other"
                                yaml_path = skill_path / "skill.yaml"
                                if yaml_path.exists():
                                    try:
                                        import yaml
                                        with open(yaml_path) as f:
                                            skill_yaml = yaml.safe_load(f) or {}
                                            category = skill_yaml.get("category", "other")
                                    except Exception:
                                        pass

                                skills_info.append({
                                    "name": skill_name,
                                    "status": status,
                                    "category": category,
                                })

                            if skills_info:
                                skill_event = f'event: skill_loaded\ndata: {json.dumps({"skills": skills_info})}\n\n'
                                await response.write(skill_event.encode())
                                _log.info("Sent skill_loaded event: %s", skills_info)

                        # Run agent in thread pool with formatted message
                        result = await loop.run_in_executor(
                            executor,
                            lambda: agent.run_conversation(
                                user_message=user_message_content,
                                conversation_history=conversation_history,
                            )
                        )

                        return result

                    # Start streaming with real agent
                    try:
                        # Store active stream for cancellation
                        self._active_streams[sid] = {"task": None, "agent": None}

                        # Stream deltas as they arrive
                        agent_task = asyncio.create_task(stream_agent_response())
                        self._active_streams[sid]["task"] = agent_task
                        _log.info("Started streaming task for session %s", sid)

                        # Poll for deltas and send SSE events
                        last_sent = 0
                        last_tool_sent = 0
                        last_saved = 0  # Track last saved content length
                        assistant_msg_id = None  # Track assistant message ID for updates
                        skill_use_msg_saved = False  # Track if skill_use message is saved
                        tool_use_msg_id = None  # Track tool_use message ID for updates

                        async def send_sse_event(event_name: str, payload: Dict[str, Any], *, log_context: str) -> bool:
                            nonlocal client_disconnected
                            if client_disconnected:
                                return False
                            ok = await self._safe_write_sse(
                                response,
                                event_name,
                                payload,
                                log_context=log_context,
                            )
                            if not ok:
                                client_disconnected = True
                            return ok

                        async def process_tool_events() -> None:
                            nonlocal segment_saved, assistant_msg_id
                            while not tool_events.empty():
                                try:
                                    event = tool_events.get_nowait()
                                    event_type = event[0]

                                    if event_type == "start":
                                        _, tool_call_id, tool_name = event

                                        # Save current text segment before tool starts
                                        if current_text_segment and not segment_saved:
                                            segment_text = "".join(current_text_segment)
                                            db.append_message(
                                                session_id=sid,
                                                role="assistant",
                                                content=segment_text
                                            )
                                            _log.info("[MESSAGE_SPLIT] Saved text segment (%d chars) before tool %s", len(segment_text), tool_name)
                                            current_text_segment.clear()
                                            segment_saved = True
                                            assistant_msg_id = None  # Reset for next segment

                                        await send_sse_event(
                                            "tool_progress",
                                            {"tool": tool_name, "status": "started", "id": tool_call_id},
                                            log_context=f"tool_progress start for {tool_name}",
                                        )
                                        if not client_disconnected:
                                            _log.info("[SSE] Sent tool_progress start: %s", tool_name)
                                    elif event_type == "complete":
                                        _, tool_call_id, tool_name, duration = event
                                        await send_sse_event(
                                            "tool_progress",
                                            {"tool": tool_name, "status": "completed", "id": tool_call_id, "duration": duration},
                                            log_context=f"tool_progress complete for {tool_name}",
                                        )
                                        if not client_disconnected:
                                            _log.info("[SSE] Sent tool_progress complete: %s (%dms)", tool_name, duration)
                                except asyncio.QueueEmpty:
                                    break
                                except Exception as e:
                                    _log.warning("Failed to process tool event: %s", e)

                        # Save skill_use message immediately if skills were selected
                        if selected_skills and not skill_use_msg_saved:
                            skills_info = []
                            hermes_home = get_hermes_home()
                            skills_dir = hermes_home / "skills"

                            for skill_name in selected_skills:
                                skill_path = skills_dir / skill_name
                                status = "loaded" if skill_path.exists() else "unavailable"

                                # Try to read category from skill.yaml
                                category = "other"
                                yaml_path = skill_path / "skill.yaml"
                                if yaml_path.exists():
                                    try:
                                        import yaml
                                        with open(yaml_path) as f:
                                            skill_yaml = yaml.safe_load(f) or {}
                                            category = skill_yaml.get("category", "other")
                                    except Exception:
                                        pass

                                skills_info.append({
                                    "name": skill_name,
                                    "status": status,
                                    "category": category,
                                })

                            if skills_info:
                                db.append_message(
                                    session_id=sid,
                                    role="skill_use",
                                    content=None,
                                    metadata={"skills": skills_info}
                                )
                                skill_use_msg_saved = True
                                _log.info("Saved skill_use message immediately: %s", skills_info)

                        while not agent_task.done():
                            try:
                                # Process tool events from queue (non-blocking)
                                await process_tool_events()

                                if len(full_response) > last_sent:
                                    # Send accumulated new content
                                    new_content = "".join(full_response[last_sent:])
                                    if await send_sse_event(
                                        "content",
                                        {"delta": new_content},
                                        log_context=f"content delta for session {sid}",
                                    ):
                                        last_sent = len(full_response)

                                    # Save/update current segment assistant message every 10 deltas to reduce DB writes
                                    if len(current_text_segment) >= 10 and not segment_saved:
                                        current_content = "".join(current_text_segment)
                                        if assistant_msg_id is None:
                                            # Create new assistant message for this segment
                                            assistant_msg_id = db.append_message(
                                                session_id=sid,
                                                role="assistant",
                                                content=current_content
                                            )
                                        else:
                                            # Update existing assistant message
                                            db.update_message_content(assistant_msg_id, current_content)

                                # Send tool invocation updates and save to DB (each tool as separate message)
                                if len(tool_invocations) > last_tool_sent:
                                    new_invocations = tool_invocations[last_tool_sent:]

                                    # Send SSE event with new invocations
                                    await send_sse_event(
                                        "tool_use",
                                        {"invocations": new_invocations},
                                        log_context=f"tool_use update for session {sid}",
                                    )

                                    # Save each new tool invocation as a separate message
                                    for inv in new_invocations:
                                        db.append_message(
                                            session_id=sid,
                                            role="tool_use",
                                            content=None,
                                            metadata={"tool_invocations": [inv]}
                                        )
                                        _log.info("[MESSAGE_SPLIT] Saved tool_use message: %s", inv["tool"])

                                    last_tool_sent = len(tool_invocations)
                                    tool_use_msg_id = None  # Reset since we're creating separate messages

                                await asyncio.sleep(0.05)  # Check for new content every 50ms

                            except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError):
                                # Client disconnected, stop streaming but let agent finish
                                _log.warning("Client disconnected during streaming for session %s", sid)
                                client_disconnected = True
                                break
                            except Exception as e:
                                # Unexpected error, log but continue
                                _log.error("Error during streaming loop: %s", e)
                                break

                        # Drain any tool events queued right before agent completion.
                        await process_tool_events()

                        # Send any remaining content
                        if len(full_response) > last_sent:
                            new_content = "".join(full_response[last_sent:])
                            if await send_sse_event(
                                "content",
                                {"delta": new_content},
                                log_context=f"final content delta for session {sid}",
                            ):
                                last_sent = len(full_response)

                        # Send any remaining tool invocations
                        if len(tool_invocations) > last_tool_sent:
                            new_invocations = tool_invocations[last_tool_sent:]
                            await send_sse_event(
                                "tool_use",
                                {"invocations": new_invocations},
                                log_context=f"final tool_use update for session {sid}",
                            )

                            # Save remaining tool invocations as separate messages
                            for inv in new_invocations:
                                db.append_message(
                                    session_id=sid,
                                    role="tool_use",
                                    content=None,
                                    metadata={"tool_invocations": [inv]}
                                )
                                _log.info("[MESSAGE_SPLIT] Saved final tool_use message: %s", inv["tool"])
                            last_tool_sent = len(tool_invocations)

                        # Update tool statuses in their individual messages
                        # (tool status may have changed after initial save)
                        if tool_invocations:
                            cursor = db._conn.execute(
                                "SELECT id, metadata FROM messages WHERE session_id = ? AND role = 'tool_use' ORDER BY timestamp",
                                (sid,)
                            )
                            tool_messages = cursor.fetchall()

                            # Match tool messages with updated tool_invocations by tool_call_id
                            for tool_msg in tool_messages:
                                msg_id = tool_msg["id"]
                                metadata = json.loads(tool_msg["metadata"]) if tool_msg["metadata"] else {}
                                msg_invocations = metadata.get("tool_invocations", [])

                                if msg_invocations:
                                    # Find matching invocation in tool_invocations by id
                                    msg_tool_id = msg_invocations[0].get("id")
                                    updated_inv = next((inv for inv in tool_invocations if inv["id"] == msg_tool_id), None)

                                    if updated_inv:
                                        # Update with latest status
                                        db.update_message_metadata(msg_id, {"tool_invocations": [updated_inv]})
                                        _log.debug("[MESSAGE_SPLIT] Updated tool_use message status: %s -> %s",
                                                  updated_inv["tool"], updated_inv["status"])

                        # Get final result
                        result = await agent_task

                        # Save or update final text message
                        if not full_response:
                            result_text = ""
                            if isinstance(result, dict):
                                result_text = result.get("final_response") or ""
                                if not result_text and result.get("error"):
                                    result_text = f"API call failed: {result.get('error')}"

                            if result_text.strip():
                                full_response.append(result_text)
                                await send_sse_event(
                                    "content",
                                    {"delta": result_text},
                                    log_context=f"final fallback content for session {sid}",
                                )

                        final_text = "".join(full_response)
                        if final_text.strip():
                            if assistant_msg_id is not None:
                                # Already have a message from streaming saves, update it with final content
                                db.update_message_content(assistant_msg_id, final_text)
                                _log.info("[MESSAGE_SPLIT] Updated final assistant message (%d chars)", len(final_text))
                            elif current_text_segment and not segment_saved:
                                # Text segment was never saved (no tools called), save it now
                                db.append_message(
                                    session_id=sid,
                                    role="assistant",
                                    content=final_text
                                )
                                _log.info("[MESSAGE_SPLIT] Saved final text segment (%d chars)", len(final_text))
                            # else: text was already saved when tools were called

                        # Generate session title if this is the first assistant response
                        # Since messages are now split, check if title was already generated
                        try:
                            cursor = db._conn.execute(
                                "SELECT title FROM sessions WHERE id = ?",
                                (sid,)
                            )
                            row = cursor.fetchone()
                            if row:
                                current_title = row["title"]

                                # Check if title is still default (not yet generated)
                                # Default title format: "新对话 MM/DD HH:MM" or empty
                                is_default_title = (
                                    not current_title or
                                    current_title.strip() == "" or
                                    current_title.startswith("新对话 ")
                                )

                                if is_default_title:
                                    # Use first 30 chars of user message as title
                                    title = message[:30] + ("..." if len(message) > 30 else "")
                                    db._conn.execute(
                                        "UPDATE sessions SET title = ? WHERE id = ?",
                                        (title, sid)
                                    )
                                    db._conn.commit()
                                    _log.info("Generated title for session %s: %s", sid, title)
                        except Exception as title_error:
                            _log.warning("Failed to generate session title: %s", title_error)

                        # skill_use and tool_use messages are now saved during streaming
                        # No need to save again here

                        # Send done event (may fail if client disconnected, but data is already saved)
                        if await send_sse_event(
                            "done",
                            {"finish_reason": "stop"},
                            log_context=f"done event for session {sid}",
                        ):
                            _log.info("Sent done event for session %s", sid)
                        elif client_disconnected:
                            _log.warning("Could not send done event (client disconnected), but data saved for session %s", sid)

                    except asyncio.CancelledError:
                        _log.info("Agent task cancelled for session %s", sid)
                        # Send cancelled event
                        await self._safe_write_sse(
                            response,
                            "cancelled",
                            {"message": "Task stopped by user"},
                            log_context=f"cancelled event for session {sid}",
                        )
                        raise  # Re-raise to properly clean up

                    except Exception as agent_error:
                        _log.exception("Agent execution failed: %s", agent_error)
                        # Send error event
                        await self._safe_write_sse(
                            response,
                            "error",
                            {"error": str(agent_error)},
                            log_context=f"error event for session {sid}",
                        )

                    finally:
                        # Clean up active stream
                        if sid in self._active_streams:
                            del self._active_streams[sid]
                            _log.info("Cleaned up streaming task for session %s", sid)

            finally:
                db.close()

        except Exception as e:
            _log.exception("Stream error")
            await self._safe_write_sse(
                response,
                "error",
                {"error": str(e)},
                log_context="outer stream error",
            )

        return response

    async def handle_stop_stream(self, request: web.Request) -> web.Response:
        """POST /api/sessions/{session_id}/stop

        Stop the active streaming task for a session.

        Response:
            {
                "ok": true,
                "message": "Task stopped"
            }
        """
        self._check_auth(request)

        try:
            session_id = request.match_info["session_id"]

            from hermes_state import SessionDB

            db = SessionDB()
            try:
                sid = db.resolve_session_id(session_id)
                if not sid:
                    return web.json_response({"detail": "Session not found"}, status=404)

                # Check if there's an active stream
                if sid not in self._active_streams:
                    return web.json_response({"detail": "No active task for this session"}, status=404)

                # Interrupt the underlying agent first so tool / model execution
                # can observe the stop request even when it is already running
                # inside a worker thread.
                stream_state = self._active_streams[sid]
                agent = stream_state.get("agent")
                if agent is not None:
                    try:
                        agent.interrupt()
                        _log.info("Interrupted agent for session %s", sid)
                    except Exception:
                        _log.exception("Failed to interrupt agent for session %s", sid)

                # Then cancel the SSE task so the streaming loop exits promptly.
                task = stream_state.get("task")
                if task is not None:
                    task.cancel()
                    _log.info("Cancelled streaming task for session %s", sid)

                return web.json_response({
                    "ok": True,
                    "message": "Task stopped"
                })

            finally:
                db.close()

        except Exception as e:
            _log.exception("POST /api/sessions/{session_id}/stop failed")
            return web.json_response({"detail": str(e)}, status=500)

    async def handle_get_session_messages(self, request: web.Request) -> web.Response:
        """GET /api/sessions/{session_id}/messages

        Get all messages for a session.

        Response:
            {
                "session_id": "chat_abc123",
                "messages": [...]
            }
        """
        self._check_auth(request)

        try:
            session_id = request.match_info["session_id"]

            from hermes_state import SessionDB

            db = SessionDB()
            try:
                sid = db.resolve_session_id(session_id)
                if not sid:
                    return web.json_response({"detail": "Session not found"}, status=404)

                messages = db.get_messages(sid)

                # Convert relative attachment URLs to absolute URLs for Electron
                # In Electron, frontend needs http://localhost:8642 prefix
                for msg in messages:
                    if msg.get("attachments"):
                        for att in msg["attachments"]:
                            url = att.get("url", "")
                            # Only convert if it's a relative URL
                            if url and not url.startswith("http"):
                                att["url"] = f"http://localhost:8642{url}"

                return web.json_response({
                    "session_id": sid,
                    "messages": messages,
                })
            finally:
                db.close()

        except Exception as e:
            _log.exception("GET /api/sessions/{session_id}/messages failed")
            return web.json_response({"detail": str(e)}, status=500)
