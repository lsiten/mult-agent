import base64
import logging
import threading
from pathlib import Path
from tempfile import gettempdir
from time import time
from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from tools.mano_cua.visual.model.direct_task_model import DirectTaskModel
    from tools.mano_cua.visual.view_model.direct_task_view_model import DirectTaskViewModel

logger = logging.getLogger(__name__)

_DEFAULT_WIDTH = 1280
_DEFAULT_HEIGHT = 720


class ManoRuntimeController:
    """Persistent local Mano runtime for desktop control and overlay UI."""

    def __init__(self, task_name: str = "Hermes Mano Control"):
        self.task_name = task_name
        self.view_model: Optional["DirectTaskViewModel"] = None
        self._headless_model: Optional["DirectTaskModel"] = None
        self._ui_thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()
        self._ready = threading.Event()
        self._startup_error: Optional[Exception] = None
        self._headless = False

    def ensure_started(self) -> None:
        with self._lock:
            if self.view_model:
                return
            self._ready.clear()
            self._startup_error = None

            def _boot() -> None:
                try:
                    from tools.mano_cua.visual.view_model.direct_task_view_model import DirectTaskViewModel

                    vm = DirectTaskViewModel()
                    if not vm.init_task(self.task_name):
                        raise ImportError("customtkinter unavailable")
                    self.view_model = vm
                except ImportError as exc:
                    from tools.mano_cua.visual.model.direct_task_model import DirectTaskModel

                    logger.warning("Mano overlay unavailable, continuing headless: %s", exc)
                    self._headless = True
                    model = DirectTaskModel()
                    model.init_task(self.task_name)
                    self._headless_model = model
                except Exception as exc:  # pragma: no cover - UI startup depends on host env
                    logger.warning("Mano overlay startup failed, continuing headless: %s", exc)
                    from tools.mano_cua.visual.model.direct_task_model import DirectTaskModel

                    self._headless = True
                    model = DirectTaskModel()
                    model.init_task(self.task_name)
                    self._headless_model = model
                finally:
                    self._ready.set()

                if self.view_model and not self._headless:
                    try:
                        self.view_model.run_mainloop()
                    except Exception as exc:  # pragma: no cover - host UI runtime
                        logger.warning("Mano overlay mainloop stopped: %s", exc)

            self._ui_thread = threading.Thread(target=_boot, daemon=True, name="mano-overlay")
            self._ui_thread.start()
            self._ready.wait(timeout=2)

            if self._startup_error:
                raise RuntimeError(f"Failed to start Mano runtime: {self._startup_error}") from self._startup_error
            if not self.view_model and not self._headless_model:
                raise RuntimeError("Failed to initialize Mano runtime")

    def set_task_name(self, task_name: str) -> None:
        with self._lock:
            self.task_name = task_name
            if self.view_model:
                self.view_model.model.state.task_name = task_name
                self.view_model.model._notify_state_changed()

    def execute_action(self, action_dict: Dict[str, Any], reasoning: str = "") -> Dict[str, Any]:
        self.ensure_started()
        model = self.view_model.model if self.view_model else self._headless_model
        assert model is not None
        return model.execute_action(action_dict, reasoning=reasoning)

    def capture_screenshot(self) -> Dict[str, Any]:
        self.ensure_started()
        model = self.view_model.model if self.view_model else self._headless_model
        assert model is not None
        png_data = model.capture_screenshot()
        screenshot_dir = Path(gettempdir()) / "hermes-computer-use"
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        screenshot_path = screenshot_dir / f"screenshot-{int(time() * 1000)}.png"
        screenshot_path.write_bytes(png_data)
        return {
            "bytes": png_data,
            "base64": base64.b64encode(png_data).decode("utf-8"),
            "path": str(screenshot_path),
        }

    def close(self) -> None:
        with self._lock:
            if self.view_model:
                try:
                    self.view_model.close()
                finally:
                    self.view_model = None
                    self._headless = False
            if self._headless_model:
                self._headless_model.stop_task()
                self._headless_model = None
            self._headless = False


_runtime: Optional[ManoRuntimeController] = None
_runtime_lock = threading.Lock()


def get_runtime(task_name: str = "Hermes Mano Control") -> ManoRuntimeController:
    global _runtime
    with _runtime_lock:
        if _runtime is None:
            _runtime = ManoRuntimeController(task_name=task_name)
        elif task_name:
            _runtime.set_task_name(task_name)
        return _runtime


def normalize_coordinate(
    coordinate: list[int],
    width: int,
    height: int,
    x_offset: int = 0,
    y_offset: int = 0,
) -> list[float]:
    local_x = coordinate[0] - x_offset
    local_y = coordinate[1] - y_offset
    return [
        max(0.0, min(_DEFAULT_WIDTH, (local_x / max(width, 1)) * _DEFAULT_WIDTH)),
        max(0.0, min(_DEFAULT_HEIGHT, (local_y / max(height, 1)) * _DEFAULT_HEIGHT)),
    ]
