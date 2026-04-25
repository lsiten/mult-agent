from visual.config.visual_config import ANIMATION_CONFIG
from visual.model.direct_task_model import DirectTaskModel
from visual.view.task_overlay_view import TaskOverlayView


class DirectTaskViewModel:
    """Local-only Mano view-model that drives the overlay for Hermes actions."""

    def __init__(self):
        self.model = DirectTaskModel()
        self.view = TaskOverlayView()
        self._is_running = False

        self.view.on_stop_command = self.on_stop_command
        self.view.on_close_command = self.on_close_command
        self.model.set_state_changed_callback(self.on_model_state_changed)

    def on_model_state_changed(self, task_state):
        self.view.root.after(0, lambda: self.view.update_task_state(task_state))

    def on_stop_command(self):
        if self._is_running:
            self.view.root.after(
                0,
                lambda: self.view.stop_button.configure(text="Stopping…", state="disabled"),
            )
            self.view.root.after(ANIMATION_CONFIG["STOP_DELAY"], self.model.stop_task)

    def on_close_command(self):
        self._is_running = False
        self.model.stop_task()
        self.view.close()

    def init_task(self, task_name: str) -> bool:
        try:
            import customtkinter as ctk

            ctk.set_appearance_mode("dark")
            ctk.set_default_color_theme("dark-blue")

            def _minimize_if_needed():
                if not self.view._minimized:
                    self.view._toggle_minimize()

            self.model.on_minimize_panel = lambda: self.view.root.after(0, _minimize_if_needed)
            self.model.init_task(task_name)
            self.view.show()
            self._is_running = True
            return True
        except ImportError:
            return False

    def run_mainloop(self) -> None:
        self.view.run_mainloop()

    def close(self) -> None:
        self.on_close_command()