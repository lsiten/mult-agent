#!/usr/bin/env python3
"""
Unit tests for AsyncTaskManager (skill installation).
"""

import asyncio
import pytest
import tempfile
import time
from pathlib import Path
from tools.skill_installer import AsyncTaskManager, TaskStatus, TaskState


@pytest.fixture
def temp_db():
    """Create temporary database for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = Path(f.name)
    yield db_path
    db_path.unlink(missing_ok=True)


@pytest.fixture
def manager(temp_db):
    """Create AsyncTaskManager instance."""
    return AsyncTaskManager(db_path=temp_db)


@pytest.mark.asyncio
async def test_create_task(manager):
    """Test task creation."""
    task_id = await manager.create_task(
        skill_id="test-skill",
        source="online",
        skill_name="Test Skill"
    )

    assert task_id is not None
    assert len(task_id) == 36  # UUID format

    state = await manager.get_status(task_id)
    assert state is not None
    assert state.status == TaskStatus.PENDING
    assert state.skill_id == "test-skill"
    assert state.skill_name == "Test Skill"
    assert state.source == "online"
    assert state.progress == 0


@pytest.mark.asyncio
async def test_task_lifecycle(manager):
    """Test complete task lifecycle: pending → queued → in_progress → completed."""
    task_id = await manager.create_task(
        skill_id="lifecycle-test",
        source="upload"
    )

    # Simulate installation function
    async def mock_install(task_id, progress_callback):
        await progress_callback(25, "Downloading...")
        await asyncio.sleep(0.1)
        await progress_callback(50, "Validating...")
        await asyncio.sleep(0.1)
        await progress_callback(75, "Installing...")
        await asyncio.sleep(0.1)
        await progress_callback(95, "Finalizing...")

    # Run installation
    manager.start_task(task_id, mock_install)

    # Wait for completion
    await asyncio.sleep(0.5)

    state = await manager.get_status(task_id)
    assert state.status == TaskStatus.COMPLETED
    assert state.progress == 100
    assert state.started_at is not None
    assert state.completed_at is not None


@pytest.mark.asyncio
async def test_task_cancellation(manager):
    """Test task cancellation during execution."""
    task_id = await manager.create_task(
        skill_id="cancel-test",
        source="online"
    )

    # Simulate long-running installation
    async def slow_install(task_id, progress_callback):
        await progress_callback(10, "Starting...")
        await asyncio.sleep(5)  # Long operation
        await progress_callback(100, "Done")

    # Start task
    manager.start_task(task_id, slow_install)

    # Wait for it to start
    await asyncio.sleep(0.1)

    # Cancel it
    cancelled = await manager.cancel_task(task_id)
    assert cancelled is True

    # Wait for cancellation to complete
    await asyncio.sleep(0.2)

    state = await manager.get_status(task_id)
    assert state.status == TaskStatus.CANCELLED


@pytest.mark.asyncio
async def test_task_failure(manager):
    """Test task failure handling."""
    task_id = await manager.create_task(
        skill_id="fail-test",
        source="upload"
    )

    # Simulate failing installation
    async def failing_install(task_id, progress_callback):
        await progress_callback(30, "Validating...")
        raise ValueError("Validation failed: invalid ZIP format")

    # Run installation
    manager.start_task(task_id, failing_install)

    # Wait for failure
    await asyncio.sleep(0.2)

    state = await manager.get_status(task_id)
    assert state.status == TaskStatus.FAILED
    assert "Validation failed" in state.error_message


@pytest.mark.asyncio
async def test_concurrent_queue_management(manager):
    """Test concurrent task queue with semaphore (max 2 parallel)."""
    task_ids = []

    # Simulate installation that takes 0.2s
    async def timed_install(task_id, progress_callback):
        await progress_callback(50, "Installing...")
        await asyncio.sleep(0.2)
        await progress_callback(100, "Done")

    # Create 4 tasks
    for i in range(4):
        task_id = await manager.create_task(
            skill_id=f"concurrent-{i}",
            source="online"
        )
        task_ids.append(task_id)
        manager.start_task(task_id, timed_install)

    # Check queue positions
    await asyncio.sleep(0.05)

    # First 2 should be in_progress, others queued
    statuses = [await manager.get_status(tid) for tid in task_ids]
    in_progress = sum(1 for s in statuses if s.status == TaskStatus.IN_PROGRESS)
    queued = sum(1 for s in statuses if s.status == TaskStatus.QUEUED)

    # At least 2 should be in progress (semaphore limit)
    assert in_progress <= 2
    # Others should be queued or pending
    assert queued + in_progress >= 3

    # Wait for all to complete
    await asyncio.sleep(0.6)

    statuses = [await manager.get_status(tid) for tid in task_ids]
    assert all(s.status == TaskStatus.COMPLETED for s in statuses)


@pytest.mark.asyncio
async def test_progress_callback(manager):
    """Test progress callback for WebSocket notifications."""
    task_id = await manager.create_task(
        skill_id="progress-test",
        source="online"
    )

    # Track progress updates
    progress_updates = []

    async def progress_callback(state: TaskState):
        progress_updates.append((state.progress, state.current_step))

    # Register callback
    manager._progress_callbacks[task_id] = progress_callback

    # Simulate installation
    async def tracked_install(task_id, progress_cb):
        await progress_cb(20, "Step 1")
        await progress_cb(40, "Step 2")
        await progress_cb(80, "Step 3")

    manager.start_task(task_id, tracked_install)

    # Wait for completion
    await asyncio.sleep(0.2)

    # Check that progress was tracked
    assert len(progress_updates) >= 3
    assert any(p == 20 for p, _ in progress_updates)
    assert any(p == 40 for p, _ in progress_updates)


@pytest.mark.asyncio
async def test_cleanup_old_tasks(manager):
    """Test cleanup of old completed tasks."""
    # Create completed task with old timestamp
    task_id = await manager.create_task(
        skill_id="old-task",
        source="upload"
    )

    state = await manager.get_status(task_id)
    state.status = TaskStatus.COMPLETED
    state.completed_at = time.time() - (10 * 86400)  # 10 days ago
    manager._save_state(state)

    # Run cleanup
    deleted = await manager.cleanup_old_tasks(max_age_days=7)

    assert deleted == 1
    assert await manager.get_status(task_id) is None


@pytest.mark.asyncio
async def test_task_state_serialization(manager):
    """Test TaskState to_dict() serialization."""
    task_id = await manager.create_task(
        skill_id="serialize-test",
        source="online",
        skill_name="Test"
    )

    state = await manager.get_status(task_id)
    state_dict = state.to_dict()

    assert isinstance(state_dict, dict)
    assert state_dict['task_id'] == task_id
    assert state_dict['status'] == 'pending'
    assert state_dict['skill_id'] == "serialize-test"
    assert state_dict['progress'] == 0
