# Skill Installation - Async Task Architecture

## Overview

This document defines the async task management architecture for skill installation in Hermes Agent.

## Key Decisions

### 1. Async Framework: asyncio (not threading)

**Rationale:**
- Gateway already uses aiohttp with asyncio event loop
- Maintains architectural consistency
- Better resource efficiency and task coordination
- Native support for cancellation and timeouts

**Implementation:**
```python
# Create background tasks
task = asyncio.create_task(install_skill_async(task_id, skill_data))

# Task state shared via SQLite + in-memory dict for fast reads
```

### 2. Task State Storage: SQLite (persistent)

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS skill_install_tasks (
    task_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,  -- pending, queued, in_progress, completed, failed, cancelled
    skill_id TEXT,
    skill_name TEXT,
    source TEXT,  -- online, upload
    progress INTEGER DEFAULT 0,  -- 0-100
    current_step TEXT,
    error_message TEXT,
    error_details TEXT,  -- JSON with threat detection details if applicable
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    started_at REAL,
    completed_at REAL
);
```

**Rationale:**
- Survives process restart (unlike in-memory dict)
- Enables task history queries
- Already using SQLite for hermes_state

### 3. Progress Updates: WebSocket (primary) + Polling (fallback)

**WebSocket:**
- Gateway already has WebSocket infrastructure
- Real-time push for better UX
- Path: `ws://localhost:8642/ws/skill-install/{task_id}`

**Polling Fallback:**
- HTTP GET `/api/skills/install/{task_id}` every 500ms
- Activated if WebSocket connection fails
- Ensures compatibility with all clients

### 4. Concurrency Control: Queue with max 2 parallel installs

**Rationale:**
- Prevent file system contention in skills/ directory
- Limit CPU/network usage during extraction/download
- Simple queue management with asyncio.Semaphore

**Implementation:**
```python
# Semaphore limits concurrent installs
install_semaphore = asyncio.Semaphore(2)

async def install_with_queue(task_id):
    async with install_semaphore:
        await perform_installation(task_id)
```

### 5. Task Cancellation: Graceful with 2-second timeout

**Flow:**
1. Client sends POST `/api/skills/install/{task_id}/cancel`
2. Backend sets cancellation flag in DB
3. Install task checks flag at each step and aborts
4. Cleanup runs within 2 seconds
5. Task status set to `cancelled`

## Task Lifecycle

```
pending → queued → in_progress → completed/failed/cancelled
```

**State Transitions:**
- `pending`: Task created, waiting to enter queue
- `queued`: In queue, waiting for semaphore slot (shows queue position)
- `in_progress`: Actively installing (downloading/validating/extracting)
- `completed`: Successfully installed
- `failed`: Error occurred (with error_message and error_details)
- `cancelled`: User cancelled mid-process

## Progress Steps

Standard installation steps with progress ranges:

| Step | Progress % | Description |
|------|-----------|-------------|
| Downloading | 0-40 | Fetching ZIP from online source |
| Validating | 40-60 | ZIP integrity, skills_guard scan, schema validation |
| Extracting | 60-80 | Unzipping to temp directory |
| Installing | 80-95 | Moving to skills/, registering |
| Finalizing | 95-100 | Hot-reload, cleanup |

## Integration with Existing Infrastructure

### skills_hub.py
- Extend `SkillBundle` with `from_zip()` class method for ZIP uploads
- Reuse `HubLockFile` for tracking installed skills
- Reuse audit logging mechanism

### skills_guard.py
- Integrate threat scanning during validation step
- Store scan results in `error_details` if threats detected

### rate_limit_tracker.py
- Track GitHub API calls during online skill search/download
- Show warning to user when approaching rate limit

## File Structure

New file: `tools/skill_installer.py`

```python
class AsyncTaskManager:
    """Manages async skill installation tasks with SQLite persistence."""
    
    async def create_task(skill_id, source, data) -> str:
        """Create new installation task, returns task_id."""
        
    async def get_status(task_id) -> dict:
        """Get current task status."""
        
    async def cancel_task(task_id) -> bool:
        """Request task cancellation."""
        
    async def run_installation(task_id):
        """Execute installation with progress updates."""
```

## WebSocket Message Format

```json
{
  "event": "progress",
  "task_id": "uuid-here",
  "status": "in_progress",
  "progress": 45,
  "step": "Validating skill package..."
}
```

## Error Handling

Errors stored in both `error_message` (user-friendly) and `error_details` (technical):

```json
{
  "error_message": "Skill validation failed: suspicious code patterns detected",
  "error_details": {
    "threat_type": "code_injection",
    "detected_patterns": ["eval()", "exec()"],
    "file_paths": ["malicious_skill.py:42"]
  }
}
```

## Queue Position Display

When task is `queued`:
```json
{
  "status": "queued",
  "queue_position": 2,
  "step": "Waiting in queue... (2nd in line)"
}
```

## Testing Strategy

1. **Unit tests**: TaskManager methods (create, get, cancel)
2. **Integration tests**: Full install flow with mock GitHub/ZIP
3. **Concurrency tests**: Queue behavior with 3+ simultaneous installs
4. **Cancellation tests**: Cancel at various progress points

---

**Status**: Architecture defined  
**Next**: Implement AsyncTaskManager in tools/skill_installer.py
