from typing import Any, Optional

from pydantic import BaseModel, Field


class ActionResult(BaseModel):
    """Result of an action execution"""
    extracted_content: str = Field(default="", description="Content extracted from the action")
    is_done: bool = Field(default=False, description="Whether the task is done")
    error: Optional[str] = Field(default=None, description="Error message if action failed")
    current_app_pid: Optional[int] = Field(default=None, description="PID of the current foreground app")
