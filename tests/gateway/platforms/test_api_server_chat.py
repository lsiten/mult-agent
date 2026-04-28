import json
import os
import tempfile
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import web

os.environ.setdefault("HERMES_HOME", tempfile.mkdtemp(prefix="hermes-chat-api-test-"))

from gateway.platforms.api_server_chat import ChatAPIHandlers


def make_request(match_info=None, authorized=True):
    request = Mock(spec=web.Request)
    request.headers = {"Authorization": "Bearer test-token"} if authorized else {}
    request.query = {}
    request.match_info = match_info or {}
    return request


@pytest.mark.asyncio
async def test_stop_stream_interrupts_agent_and_cancels_task(monkeypatch):
    handlers = ChatAPIHandlers("test-token")

    fake_db = Mock()
    fake_db.resolve_session_id.return_value = "chat_123"
    fake_db.close.return_value = None

    class FakeSessionDB:
        def __init__(self):
            pass

        def resolve_session_id(self, session_id):
            return fake_db.resolve_session_id(session_id)

        def close(self):
            fake_db.close()

    interrupt_agent = Mock()
    task = Mock()
    handlers._active_streams["chat_123"] = {"task": task, "agent": interrupt_agent}

    monkeypatch.setattr("hermes_state.SessionDB", FakeSessionDB)

    response = await handlers.handle_stop_stream(
        make_request(match_info={"session_id": "chat_123"})
    )
    payload = json.loads(response.text)

    assert response.status == 200
    assert payload["ok"] is True
    interrupt_agent.interrupt.assert_called_once_with()
    task.cancel.assert_called_once_with()


def test_tool_invocations_handle_out_of_order_completion():
    handlers = ChatAPIHandlers("test-token")
    invocations = []
    invocation_map = {}

    handlers._start_tool_invocation(
        invocations,
        invocation_map,
        "tool_a",
        "terminal",
        {"command": "echo a"},
        started_at=10.0,
    )
    handlers._start_tool_invocation(
        invocations,
        invocation_map,
        "tool_b",
        "read_file",
        {"path": "/tmp/demo"},
        started_at=20.0,
    )

    completed_a = handlers._complete_tool_invocation(
        invocation_map,
        "tool_a",
        "ok-a",
        completed_at=12.0,
    )
    completed_b = handlers._complete_tool_invocation(
        invocation_map,
        "tool_b",
        "ok-b",
        completed_at=21.5,
    )

    assert completed_a is invocations[0]
    assert completed_a["status"] == "success"
    assert completed_a["duration"] == 2000
    assert completed_a["result"] == "ok-a"

    assert completed_b is invocations[1]
    assert completed_b["status"] == "success"
    assert completed_b["duration"] == 1500
    assert completed_b["result"] == "ok-b"


def test_selected_skill_context_loads_prompt_and_status(monkeypatch):
    handlers = ChatAPIHandlers("test-token")

    def fake_build_preloaded_skills_prompt(skill_names):
        assert skill_names == ["job-posting-image-sqlite", "missing-skill"]
        return "loaded skill prompt", ["job-posting-image-sqlite"], ["missing-skill"]

    monkeypatch.setattr(
        "agent.skill_commands.build_preloaded_skills_prompt",
        fake_build_preloaded_skills_prompt,
    )

    prompt, skills_info = handlers._build_selected_skill_context([
        "job-posting-image-sqlite",
        "missing-skill",
    ])

    assert prompt == "loaded skill prompt"
    assert skills_info == [
        {
            "name": "job-posting-image-sqlite",
            "status": "loaded",
            "category": "other",
        },
        {
            "name": "missing-skill",
            "status": "unavailable",
            "category": "other",
        },
    ]


@pytest.mark.asyncio
async def test_safe_write_sse_returns_false_for_closing_transport():
    handlers = ChatAPIHandlers("test-token")
    response = Mock()
    response.write = AsyncMock(side_effect=RuntimeError("Cannot write to closing transport"))

    ok = await handlers._safe_write_sse(
        response,
        "done",
        {"finish_reason": "stop"},
        log_context="test done",
    )

    assert ok is False


@pytest.mark.asyncio
async def test_stream_listener_snapshot_exposes_unsaved_tail_and_current_tool():
    handlers = ChatAPIHandlers("test-token")
    stream_state = handlers._new_stream_state()
    stream_state["current_text_segment"] = "hello world"
    stream_state["saved_segment_chars"] = 6
    stream_state["current_tool"] = {"name": "read_file", "startTime": 123}
    stream_state["tool_invocations"] = [
        {
            "id": "tool_1",
            "tool": "read_file",
            "args": {"path": "/tmp/demo"},
            "status": "pending",
            "start_time": 100.0,
        }
    ]

    queue, snapshot = await handlers._add_stream_listener(stream_state)

    assert snapshot["streaming_content"] == "world"
    assert snapshot["current_tool"] == {"name": "read_file", "startTime": 123}
    assert snapshot["tool_invocations"] == [
        {
            "id": "tool_1",
            "tool": "read_file",
            "args": {"path": "/tmp/demo"},
            "result": None,
            "status": "pending",
            "duration": None,
        }
    ]

    await handlers._remove_stream_listener(stream_state, queue)


@pytest.mark.asyncio
async def test_broadcast_stream_event_fans_out_and_marks_done():
    handlers = ChatAPIHandlers("test-token")
    stream_state = handlers._new_stream_state()

    queue, _ = await handlers._add_stream_listener(stream_state)

    await handlers._broadcast_stream_event(stream_state, "content", {"delta": "hi"})
    assert await queue.get() == ("content", {"delta": "hi"})
    assert stream_state["done"] is False

    await handlers._broadcast_stream_event(stream_state, "done", {"finish_reason": "stop"})
    assert await queue.get() == ("done", {"finish_reason": "stop"})
    assert stream_state["done"] is True
