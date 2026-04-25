from dataclasses import dataclass, field
from typing import Optional

from visual.model.task_progress import TaskProgress


@dataclass
class TaskState:
    task_name: str = ""
    status: str = ""
    progress: TaskProgress = field(default_factory=TaskProgress)
    error_msg: Optional[str] = None
    is_running: bool = False