import threading
from typing import Any, Callable, Dict, Optional

from tools.mano_cua.visual.computer.computer_action_executor import ComputerActionExecutor
from tools.mano_cua.visual.computer.computer_use_util import screenshot_to_bytes
from tools.mano_cua.visual.config.visual_config import AUTOMATION_CONFIG, TASK_STATUS
from tools.mano_cua.visual.model.task_progress import TaskProgress
from tools.mano_cua.visual.model.task_state import TaskState


class DirectTaskModel:
    """Local-only Mano task model used by Hermes desktop tools."""

    def __init__(self):
        self.state = TaskState()
        self.stop_event = threading.Event()
        self._on_state_changed: Optional[Callable[[TaskState], None]] = None
        self.on_minimize_panel: Optional[Callable[[], None]] = None
        self.executor: Optional[ComputerActionExecutor] = None

    def set_state_changed_callback(self, callback: Callable[[TaskState], None]) -> None:
        self._on_state_changed = callback

    def _notify_state_changed(self) -> None:
        if self._on_state_changed:
            self._on_state_changed(self.state)

    def init_task(self, task_name: str) -> None:
        self.state.task_name = task_name
        self.state.status = TASK_STATUS["RUNNING"]
        self.state.is_running = True
        self.state.error_msg = None
        self.state.progress = TaskProgress()
        self.stop_event.clear()
        self.executor = ComputerActionExecutor(on_minimize_panel=self.on_minimize_panel)
        self._notify_state_changed()

    def update_progress(
        self,
        action_desc: str,
        reasoning: str = "",
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.state.is_running:
            return
        self.state.progress = TaskProgress(
            step_idx=self.state.progress.step_idx + 1,
            action=action_desc,
            reasoning=reasoning,
            action_meta=meta or {},
        )
        self._notify_state_changed()

    def execute_action(
        self,
        action_dict: Dict[str, Any],
        reasoning: str = "",
        auto_delay: bool = True,
    ) -> Dict[str, Any]:
        if not self.executor:
            raise RuntimeError("Mano executor not initialized")
        action_name = (action_dict.get("input") or {}).get("action") or action_dict.get("name") or "unknown"
        self.update_progress(action_name, reasoning, meta={"action_dict": action_dict})
        result = self.executor.run_one(action_dict)
        if not result.get("ok"):
            self.mark_error(result.get("message", "Action failed"))
            return result
        if auto_delay:
            import time

            time.sleep(AUTOMATION_CONFIG["ACTION_DELAY"])
        self._notify_state_changed()
        return result

    def capture_screenshot(self) -> bytes:
        self.update_progress("screenshot")
        return screenshot_to_bytes()

    def mark_completed(self) -> None:
        self.state.status = TASK_STATUS["COMPLETED"]
        self.state.is_running = False
        self.stop_event.set()
        self._notify_state_changed()

    def mark_stopped(self) -> None:
        self.state.status = TASK_STATUS["STOPPED"]
        self.state.is_running = False
        self.stop_event.set()
        self._notify_state_changed()

    def mark_error(self, error_msg: str) -> None:
        self.state.status = TASK_STATUS["ERROR"]
        self.state.error_msg = error_msg
        self.state.is_running = False
        self.stop_event.set()
        self._notify_state_changed()

    def stop_task(self) -> None:
        if self.state.is_running:
            self.mark_stopped()
