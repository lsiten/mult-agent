#!/usr/bin/env python3
"""
Async Task Manager for Skill Installation.

Manages skill installation tasks with SQLite persistence and real-time progress updates.
Supports concurrent installations with queue management and WebSocket/polling progress delivery.

Architecture: asyncio-based (not threading) for consistency with Gateway's aiohttp event loop.
"""

import asyncio
import json
import logging
import sqlite3
import time
import uuid
from dataclasses import dataclass, asdict
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, Callable, Awaitable
from hermes_constants import get_hermes_home

logger = logging.getLogger(__name__)

# Database path
HERMES_HOME = get_hermes_home()
TASK_DB_PATH = HERMES_HOME / "skill_tasks.db"

# Task concurrency limit
MAX_CONCURRENT_INSTALLS = 2


class TaskStatus(Enum):
    """Task lifecycle states."""
    PENDING = "pending"
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskState:
    """Task state snapshot."""
    task_id: str
    status: TaskStatus
    skill_id: Optional[str]
    skill_name: Optional[str]
    source: str  # 'online' or 'upload'
    progress: int  # 0-100
    current_step: str
    error_message: Optional[str]
    error_details: Optional[Dict[str, Any]]  # JSON with threat detection details
    queue_position: Optional[int]
    created_at: float
    updated_at: float
    started_at: Optional[float]
    completed_at: Optional[float]

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dict."""
        result = asdict(self)
        result['status'] = self.status.value
        return result


class AsyncTaskManager:
    """
    Manages async skill installation tasks with SQLite persistence.

    Features:
    - asyncio-based task execution (consistent with Gateway)
    - SQLite persistence (survives process restart)
    - Concurrent task queue with semaphore (max 2 parallel)
    - Real-time progress callbacks for WebSocket push
    - Cancellation support with 2-second timeout
    """

    def __init__(self, db_path: Path = TASK_DB_PATH):
        self.db_path = db_path
        self._semaphore = asyncio.Semaphore(MAX_CONCURRENT_INSTALLS)
        self._tasks: Dict[str, asyncio.Task] = {}  # task_id -> asyncio.Task
        self._cancellation_flags: Dict[str, bool] = {}  # task_id -> cancelled flag
        self._progress_callbacks: Dict[str, Callable[[TaskState], Awaitable[None]]] = {}
        self._queue_lock = asyncio.Lock()
        self._init_db()

    def _init_db(self):
        """Initialize SQLite schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skill_install_tasks (
                    task_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    skill_id TEXT,
                    skill_name TEXT,
                    source TEXT NOT NULL,
                    progress INTEGER DEFAULT 0,
                    current_step TEXT,
                    error_message TEXT,
                    error_details TEXT,
                    queue_position INTEGER,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    started_at REAL,
                    completed_at REAL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON skill_install_tasks(status)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_created ON skill_install_tasks(created_at DESC)
            """)
            conn.commit()
            logger.info(f"Skill installation task database initialized at {self.db_path}")

    async def create_task(
        self,
        skill_id: Optional[str],
        source: str,
        skill_name: Optional[str] = None,
        progress_callback: Optional[Callable[[TaskState], Awaitable[None]]] = None
    ) -> str:
        """
        Create a new installation task.

        Args:
            skill_id: Online skill identifier (None for ZIP upload)
            source: 'online' or 'upload'
            skill_name: Human-readable skill name
            progress_callback: Async callback for progress updates (WebSocket push)

        Returns:
            task_id: UUID string
        """
        task_id = str(uuid.uuid4())
        now = time.time()

        state = TaskState(
            task_id=task_id,
            status=TaskStatus.PENDING,
            skill_id=skill_id,
            skill_name=skill_name,
            source=source,
            progress=0,
            current_step="Initializing...",
            error_message=None,
            error_details=None,
            queue_position=None,
            created_at=now,
            updated_at=now,
            started_at=None,
            completed_at=None
        )

        self._save_state(state)

        if progress_callback:
            self._progress_callbacks[task_id] = progress_callback

        logger.info(f"Created installation task {task_id} for {source} skill: {skill_name or skill_id}")
        return task_id

    async def get_status(self, task_id: str) -> Optional[TaskState]:
        """Get current task status from database."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT * FROM skill_install_tasks WHERE task_id = ?",
                (task_id,)
            )
            row = cursor.fetchone()

        if not row:
            return None

        return self._row_to_state(row)

    async def cancel_task(self, task_id: str) -> bool:
        """
        Request task cancellation.

        Task will abort at next checkpoint and clean up within 2 seconds.

        Returns:
            True if cancellation requested, False if task not found or already terminal
        """
        state = await self.get_status(task_id)
        if not state or state.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
            return False

        # Set cancellation flag
        self._cancellation_flags[task_id] = True

        # Update database status
        state.status = TaskStatus.CANCELLED
        state.current_step = "Cancelling..."
        state.updated_at = time.time()
        self._save_state(state)

        # Cancel asyncio task if running
        if task_id in self._tasks:
            self._tasks[task_id].cancel()

        logger.info(f"Cancellation requested for task {task_id}")
        return True

    async def run_installation(
        self,
        task_id: str,
        install_func: Callable[[str, Callable[[int, str], Awaitable[None]]], Awaitable[None]]
    ):
        """
        Execute installation task with queue management.

        Args:
            task_id: Task UUID
            install_func: Async function that performs installation
                         Signature: async def install(task_id, progress_callback)
        """
        async with self._queue_lock:
            # Update status to queued and calculate queue position
            queue_pos = await self._calculate_queue_position()
            state = await self.get_status(task_id)
            if not state:
                logger.error(f"Task {task_id} not found")
                return

            state.status = TaskStatus.QUEUED
            state.queue_position = queue_pos
            state.current_step = f"Waiting in queue... ({queue_pos} in line)"
            state.updated_at = time.time()
            self._save_state(state)
            await self._notify_progress(state)

        # Acquire semaphore (blocks if 2 tasks already running)
        async with self._semaphore:
            # Check cancellation before starting
            if self._cancellation_flags.get(task_id, False):
                state.status = TaskStatus.CANCELLED
                state.current_step = "Cancelled before start"
                state.completed_at = time.time()
                state.updated_at = time.time()
                self._save_state(state)
                await self._notify_progress(state)
                return

            # Update status to in_progress
            state = await self.get_status(task_id)
            state.status = TaskStatus.IN_PROGRESS
            state.queue_position = None
            state.current_step = "Starting installation..."
            state.started_at = time.time()
            state.updated_at = time.time()
            self._save_state(state)
            await self._notify_progress(state)

            # Define progress callback wrapper
            async def progress_callback(progress: int, step: str):
                """Update progress in database and notify via WebSocket."""
                if self._cancellation_flags.get(task_id, False):
                    raise asyncio.CancelledError("Installation cancelled by user")

                state = await self.get_status(task_id)
                if state:
                    state.progress = progress
                    state.current_step = step
                    state.updated_at = time.time()
                    self._save_state(state)
                    await self._notify_progress(state)

            try:
                # Run actual installation
                await install_func(task_id, progress_callback)

                # Mark as completed
                state = await self.get_status(task_id)
                state.status = TaskStatus.COMPLETED
                state.progress = 100
                state.current_step = "Installation complete"
                state.completed_at = time.time()
                state.updated_at = time.time()
                self._save_state(state)
                await self._notify_progress(state)
                logger.info(f"Task {task_id} completed successfully")

            except asyncio.CancelledError:
                # Handle cancellation
                state = await self.get_status(task_id)
                state.status = TaskStatus.CANCELLED
                state.current_step = "Installation cancelled"
                state.completed_at = time.time()
                state.updated_at = time.time()
                self._save_state(state)
                await self._notify_progress(state)
                logger.info(f"Task {task_id} cancelled")

            except Exception as e:
                # Handle failure
                state = await self.get_status(task_id)
                state.status = TaskStatus.FAILED
                state.error_message = str(e)
                state.current_step = "Installation failed"
                state.completed_at = time.time()
                state.updated_at = time.time()

                # Parse error details if JSON available
                try:
                    if hasattr(e, 'details'):
                        state.error_details = e.details
                except:
                    pass

                self._save_state(state)
                await self._notify_progress(state)
                logger.error(f"Task {task_id} failed: {e}", exc_info=True)

            finally:
                # Cleanup
                self._cancellation_flags.pop(task_id, None)
                self._tasks.pop(task_id, None)
                self._progress_callbacks.pop(task_id, None)

    async def install_from_bundle(
        self,
        task_id: str,
        bundle: "SkillBundle",
        temp_zip_path: Optional[Path] = None
    ):
        """
        Install a skill from a SkillBundle (ZIP or online source).

        Args:
            task_id: Installation task ID
            bundle: SkillBundle with validated metadata and files
            temp_zip_path: Optional path to temporary ZIP file (for cleanup)

        This function handles the complete installation flow:
        1. Quarantine the bundle
        2. Scan with skills_guard
        3. Check for conflicts
        4. Install to skills directory
        5. Register in lock file
        6. Clean up temporary files
        """
        from tools.skills_hub import (
            quarantine_bundle,
            install_from_quarantine,
            HubLockFile,
            SKILLS_DIR,
            QUARANTINE_DIR
        )
        from tools.skills_guard import scan_skill
        import shutil
        from datetime import datetime

        # Progress callback for this task
        async def progress_callback(progress: int, step: str):
            """Update progress in database."""
            state = await self.get_status(task_id)
            if state:
                state.progress = progress
                state.current_step = step
                state.updated_at = time.time()
                self._save_state(state)
                await self._notify_progress(state)

        try:
            # Step 1: Quarantine bundle (10%)
            await progress_callback(10, "Quarantining skill package...")
            quarantine_path = quarantine_bundle(bundle)

            # Step 2: Scan with skills_guard (30%)
            await progress_callback(30, "Scanning for security threats...")
            scan_result = scan_skill(quarantine_path)

            if not scan_result.is_safe:
                # Security threat detected - abort
                raise ValueError(
                    f"Security scan failed: {scan_result.verdict}. "
                    f"Found {len(scan_result.threats)} threats: {', '.join(scan_result.threats[:3])}"
                )

            # Step 3: Check for existing skill (50%)
            await progress_callback(50, "Checking for conflicts...")
            lock = HubLockFile()
            existing = lock.get_installed(bundle.name)

            if existing:
                # Skill already exists - backup to quarantine
                existing_path = SKILLS_DIR / bundle.name
                if existing_path.exists():
                    backup_name = f"{bundle.name}_backup_{int(datetime.now().timestamp())}"
                    backup_path = QUARANTINE_DIR / backup_name
                    await progress_callback(60, "Backing up existing skill...")
                    shutil.move(str(existing_path), str(backup_path))
                    logger.info(f"Backed up existing skill to {backup_path}")

            # Step 4: Install from quarantine (80%)
            await progress_callback(80, "Installing skill...")
            install_path = install_from_quarantine(
                quarantine_path=quarantine_path,
                skill_name=bundle.name,
                category="",  # No category for uploaded skills
                bundle=bundle,
                scan_result=scan_result
            )

            # Step 5: Clean up temporary ZIP file (95%)
            if temp_zip_path and temp_zip_path.exists():
                await progress_callback(95, "Cleaning up temporary files...")
                temp_zip_path.unlink()

            # Step 6: Complete (100%)
            await progress_callback(100, f"Successfully installed {bundle.name}")
            logger.info(f"Successfully installed skill: {bundle.name} at {install_path}")

        except Exception as e:
            # Clean up on failure
            if temp_zip_path and temp_zip_path.exists():
                try:
                    temp_zip_path.unlink()
                except:
                    pass
            raise

    def start_task(
        self,
        task_id: str,
        install_func: Callable[[str, Callable[[int, str], Awaitable[None]]], Awaitable[None]]
    ) -> asyncio.Task:
        """
        Start installation task in background.

        Returns:
            asyncio.Task object (for testing/monitoring)
        """
        task = asyncio.create_task(self.run_installation(task_id, install_func))
        self._tasks[task_id] = task
        return task

    async def _calculate_queue_position(self) -> int:
        """Calculate current task's position in queue."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT COUNT(*) FROM skill_install_tasks WHERE status IN ('pending', 'queued', 'in_progress')"
            )
            count = cursor.fetchone()[0]
        return count

    async def _notify_progress(self, state: TaskState):
        """Notify progress callback (for WebSocket push)."""
        callback = self._progress_callbacks.get(state.task_id)
        if callback:
            try:
                await callback(state)
            except Exception as e:
                logger.warning(f"Progress callback failed for task {state.task_id}: {e}")

    def _save_state(self, state: TaskState):
        """Save task state to database."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO skill_install_tasks
                (task_id, status, skill_id, skill_name, source, progress, current_step,
                 error_message, error_details, queue_position, created_at, updated_at,
                 started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                state.task_id,
                state.status.value,
                state.skill_id,
                state.skill_name,
                state.source,
                state.progress,
                state.current_step,
                state.error_message,
                json.dumps(state.error_details) if state.error_details else None,
                state.queue_position,
                state.created_at,
                state.updated_at,
                state.started_at,
                state.completed_at
            ))
            conn.commit()

    def _row_to_state(self, row: tuple) -> TaskState:
        """Convert database row to TaskState."""
        return TaskState(
            task_id=row[0],
            status=TaskStatus(row[1]),
            skill_id=row[2],
            skill_name=row[3],
            source=row[4],
            progress=row[5] or 0,
            current_step=row[6] or "",
            error_message=row[7],
            error_details=json.loads(row[8]) if row[8] else None,
            queue_position=row[9],
            created_at=row[10],
            updated_at=row[11],
            started_at=row[12],
            completed_at=row[13]
        )

    async def cleanup_old_tasks(self, max_age_days: int = 7):
        """Remove completed/failed/cancelled tasks older than max_age_days."""
        cutoff = time.time() - (max_age_days * 86400)
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("""
                DELETE FROM skill_install_tasks
                WHERE status IN ('completed', 'failed', 'cancelled')
                AND completed_at < ?
            """, (cutoff,))
            deleted = cursor.rowcount
            conn.commit()

        if deleted > 0:
            logger.info(f"Cleaned up {deleted} old installation tasks")
        return deleted
