#!/usr/bin/env python3
"""
Mano-CUA Direct Control CLI
- Removes all remote model/API calling capabilities
- Only keeps GUI and computer control capabilities
- For Hermes Agent to directly control: one task -> one GUI -> auto close when done

Usage:
  ./mano-direct --task "任务描述" click --x 400 --y 80 [--step 1] [--reasoning "Hermes 分析"]
  ./mano-direct --task "任务描述" screenshot
  ./mano-direct --task "任务描述" type --text "输入文字" [--x 400 --y 80]
  ./mano-direct --task "任务描述" key --key enter
"""

import sys
import os
import argparse
import threading
import time
import queue
from typing import Optional

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from visual.computer.computer_action_executor import ComputerActionExecutor
from visual.view.task_overlay_view import TaskOverlayView
from visual.view_model.task_view_model import TaskViewModel
from visual.config.visual_config import WINDOW_CONFIG, TEXT_CONSTANTS, TASK_STATUS, AUTOMATION_CONFIG

# Global queue for UI communication
_result_queue = queue.Queue()


class DirectTaskController:
    """Controller for direct task execution - one task per instance"""
    
    def __init__(self, task_name: str):
        self.task_name = task_name
        self.view: Optional[TaskOverlayView] = None
        self.task_view_model: Optional[TaskViewModel] = None
        self.current_step = 0
        self.running = True
        self.stop_requested = False
        
    def start_ui(self):
        """Start the GUI - must be called on main thread"""
        # Create view model and initialize task
        self.task_view_model = TaskViewModel()
        self.task_view_model.init_task(self.task_name)
        
        # Create view
        self.view = TaskOverlayView()
        self.view.set_view_model(self.task_view_model)
        
        # Bind commands
        self.view.on_stop_command = self._on_stop
        self.view.on_close_command = self._on_close
        self.view.on_continue_command = self._on_continue
        
        # Initial state
        self.task_view_model.update_task_status(TASK_STATUS["RUNNING"])
        
        # Start main loop
        if self.view.root:
            self.view.root.mainloop()
    
    def update_step(self, step: int, action: str, reasoning: str = ""):
        """Update UI for current step"""
        self.current_step = step
        if self.task_view_model and self.task_view_model.model:
            self.task_view_model.model.update_progress(step, action, reasoning)
    
    def _on_stop(self):
        """Stop button clicked"""
        self.stop_requested = True
        self.running = False
        if self.task_view_model:
            self.task_view_model.update_task_status(TASK_STATUS["STOPPED"])
        if self.view and self.view.root:
            self.view.root.after(1000, self._on_close)
    
    def _on_continue(self):
        """Continue button clicked (for user confirmation)"""
        _result_queue.put("continue")
    
    def _on_close(self):
        """Close window"""
        self.running = False
        if self.view and self.view.root:
            self.view.root.destroy()
    
    def request_user_confirmation(self, message: str = "Position uncertain, proceed?") -> bool:
        """Request user confirmation - shows Proceed/Stop buttons"""
        if not self.view or not self.task_view_model:
            return True
        
        # Change to CALL_USER state (shows two buttons)
        self.task_view_model.update_task_status(TASK_STATUS["CALL_USER"])
        self.task_view_model.update_log_text("", message)
        
        if self.view and self.view.root:
            self.view.root.update()
        
        # Wait for user response
        while self.running:
            time.sleep(0.1)
            if not _result_queue.empty():
                result = _result_queue.get()
                if result == "continue":
                    # Switch back to running state
                    self.task_view_model.update_task_status(TASK_STATUS["RUNNING"])
                    return True
                else:
                    return False
            if self.stop_requested:
                return False
        
        return False
    
    def complete(self, message: str):
        """Mark action as completed and schedule close"""
        if self.task_view_model and self.task_view_model.model:
            self.task_view_model.model.state.status = TASK_STATUS["COMPLETED"]
            self.task_view_model.on_model_state_changed(self.task_view_model.model.state)
            
        if self.view and self.view.root:
            # Auto-close after 5 seconds
            self.view.root.after(5000, self._on_close)
    
    def set_error(self, message: str):
        """Mark task as error"""
        if self.task_view_model and self.task_view_model.model:
            self.task_view_model.model.state.status = TASK_STATUS["ERROR"]
            self.task_view_model.model.state.error_msg = message
            self.task_view_model.on_model_state_changed(self.task_view_model.model.state)


def execute_action(executor: ComputerActionExecutor, args) -> bool:
    """Execute a single action based on CLI arguments"""
    
    if hasattr(args, 'x') and args.command == 'click':
        executor._do_click('left_click', {'start_coordinate': [args.x, args.y]})
        return True
    
    elif args.command == 'right_click':
        executor._do_click('right_click', {'start_coordinate': [args.x, args.y]})
        return True
    
    elif args.command == 'double_click':
        executor._do_click('double_click', {'start_coordinate': [args.x, args.y]})
        return True
    
    elif args.command == 'move':
        executor._mouse_move({'start_coordinate': [args.x, args.y]})
        return True
    
    elif args.command == 'drag':
        executor._do_left_click_drag({'start_coordinate': [args.x1, args.y1], 'end_coordinate': [args.x2, args.y2]})
        return True
    
    elif args.command == 'type':
        executor._type_text(args.text)
        return True
    
    elif args.command == 'key':
        executor._do_hotkey({'action': 'key', 'text': args.key})
        return True
    
    elif args.command == 'scroll':
        executor._do_scroll({'direction': args.direction})
        return True
    
    elif args.command == 'open_app':
        # Open application by name
        executor._open_app(args.text)
        return True
    
    elif args.command == 'open_url':
        # Open URL in browser
        executor._open_url(args.text)
        return True
    
    elif args.command == 'screenshot':
        # Capture full screen and save to temp file
        from visual.computer.computer_use_util import screenshot_to_bytes
        png_bytes = screenshot_to_bytes()
        output_path = '/tmp/mano-direct-screenshot.png'
        with open(output_path, 'wb') as f:
            f.write(png_bytes)
        print(f"Screenshot saved to {output_path}")
        return True
    
    else:
        print(f"Unknown action: {args.command}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Mano-CUA Direct Control - Hermes Agent direct computer control\nOne task/step = One GUI, GUI auto closes after action completes'
    )
    
    # Task information (always available for GUI)
    parser.add_argument('--task', help='Task description (shown in GUI)', default="Direct Control")
    parser.add_argument('--step', type=int, default=1, help='Current step number')
    parser.add_argument('--reasoning', default='', help='Hermes reasoning for this step')
    
    # Subparsers for different commands
    subparsers = parser.add_subparsers(dest='command', required=True)
    
    # click
    click_parser = subparsers.add_parser('click', help='Click at normalized coordinates (1280x720)')
    click_parser.add_argument('--x', type=float, required=True, help='X coordinate (0-1280)')
    click_parser.add_argument('--y', type=float, required=True, help='Y coordinate (0-720)')
    
    # right_click
    right_click_parser = subparsers.add_parser('right_click', help='Right click')
    right_click_parser.add_argument('--x', type=float, required=True)
    right_click_parser.add_argument('--y', type=float, required=True)
    
    # double_click
    double_click_parser = subparsers.add_parser('double_click', help='Double click')
    double_click_parser.add_argument('--x', type=float, required=True)
    double_click_parser.add_argument('--y', type=float, required=True)
    
    # type
    type_parser = subparsers.add_parser('type', help='Type text')
    type_parser.add_argument('--text', required=True, help='Text to type')
    type_parser.add_argument('--x', type=float, help='Click at this position first')
    type_parser.add_argument('--y', type=float, help='Click at this position first')
    
    # key
    key_parser = subparsers.add_parser('key', help='Press a key')
    key_parser.add_argument('--key', required=True, help='Key name (enter, esc, tab, etc.)')
    
    # scroll
    scroll_parser = subparsers.add_parser('scroll', help='Scroll')
    scroll_parser.add_argument('--direction', choices=['up', 'down', 'left', 'right'], required=True)
    
    # open_app
    open_app_parser = subparsers.add_parser('open_app', help='Open application')
    open_app_parser.add_argument('--text', required=True, help='App name (macOS Spotlight matching)')
    
    # open_url
    open_url_parser = subparsers.add_parser('open_url', help='Open URL')
    open_url_parser.add_argument('--text', required=True, help='URL')
    
    # screenshot
    screenshot_parser = subparsers.add_parser('screenshot', help='Capture screenshot')
    
    # drag
    drag_parser = subparsers.add_parser('drag', help='Drag from (x1,y1) to (x2,y2)')
    drag_parser.add_argument('--x1', type=float, required=True)
    drag_parser.add_argument('--y1', type=float, required=True)
    drag_parser.add_argument('--x2', type=float, required=True)
    drag_parser.add_argument('--y2', type=float, required=True)
    
    # move
    move_parser = subparsers.add_parser('move', help='Move mouse to position')
    move_parser.add_argument('--x', type=float, required=True)
    move_parser.add_argument('--y', type=float, required=True)
    
    args = parser.parse_args()
    
    # Get task info
    task_name = args.task
    step_num = args.step
    reasoning = args.reasoning
    
    # Create action executor
    executor = ComputerActionExecutor()
    
    # Create task controller (one per invocation)
    controller = DirectTaskController(task_name)
    
    # Get action description
    if args.command == 'click':
        action_desc = f"Click at ({args.x:.0f}, {args.y:.0f})"
    elif args.command == 'right_click':
        action_desc = f"Right click at ({args.x:.0f}, {args.y:.0f})"
    elif args.command == 'double_click':
        action_desc = f"Double click at ({args.x:.0f}, {args.y:.0f})"
    elif args.command == 'type':
        action_desc = f"Type: {args.text[:30]}{'...' if len(args.text) > 30 else ''}"
    elif args.command == 'key':
        action_desc = f"Press key: {args.key}"
    elif args.command == 'scroll':
        action_desc = f"Scroll {args.direction}"
    elif args.command == 'open_app':
        action_desc = f"Open app: {args.text}"
    elif args.command == 'open_url':
        action_desc = f"Open URL: {args.text}"
    elif args.command == 'screenshot':
        action_desc = "Capture screenshot"
    elif args.command == 'drag':
        action_desc = f"Drag from ({args.x1:.0f}, {args.y1:.0f}) to ({args.x2:.0f}, {args.y2:.0f})"
    elif args.command == 'move':
        action_desc = f"Move mouse to ({args.x:.0f}, {args.y:.0f})"
    else:
        action_desc = args.command
    
    # Function to run after GUI is up
    def after_ui_start():
        # Update UI with current step
        controller.update_step(step_num, action_desc, reasoning)
        
        # Execute the actual action
        success = False
        try:
            # For type with position: click first
            if args.command == 'type' and hasattr(args, 'x') and args.x is not None:
                executor.mouse_left_click(args.x, args.y)
                time.sleep(0.2)
            
            success = execute_action(executor, args)
        except Exception as e:
            print(f"Action execution error: {e}")
            import traceback
            traceback.print_exc()
            success = False
        
        # Wait a bit for the action to complete (same as original)
        time.sleep(AUTOMATION_CONFIG["ACTION_DELAY"])
        
        # Complete or error
        if success:
            controller.complete(f"Action completed: {action_desc}")
        else:
            controller.set_error(f"Action failed: {action_desc}")
            # Still auto-close after 5s
            if controller.view and controller.view.root:
                controller.view.root.after(5000, controller._on_close)
    
    # Let original MVVM structure do its thing - it has all the correct styling
    # Original architecture: ViewModel creates the View, binds everything automatically
    controller.task_view_model = TaskViewModel()
    
    # IMPORTANT: Call init_task on model - this sets task_name, initial step_idx, etc.
    # This ensures step number and task name display correctly in GUI
    controller.task_view_model.model.init_task(task_name)
    # Update progress with actual step/action/reasoning BEFORE any UI refresh
    # This overrides the default update_progress(0, "Initializing") called inside init_task
    controller.update_step(args.step, action_desc, args.reasoning)
    
    # Get the view that ViewModel already created (already styled correctly by original code)
    # - size 320x240, alpha 0.92, #1e1e1e bg, corner radius 14px
    # - positioned top-right, always on top, dark-blue CustomTkinter theme
    # - EXACTLY the same as original Mano-CUA GUI
    controller.view = controller.task_view_model.view
    
    # Override the command callbacks to our own - keep it simple
    controller.view.on_stop_command = controller._on_stop
    controller.view.on_close_command = controller._on_close
    controller.view.on_continue_command = controller._on_continue
    
    # Set initial running status - model has already been initialized
    controller.task_view_model.model.state.status = TASK_STATUS["RUNNING"]
    controller.task_view_model.model.state.is_running = True
    # Notify state change so UI updates and shows the window (deiconify)
    controller.task_view_model.model._notify_state_changed()
    
    # View is already packed and ready by original code - just use it
    print("UI panel initialized successfully")
    print(f"Window: {controller.view}, root: {controller.view.root}")

    # Now schedule the action to run after GUI is fully initialized
    # Original initialization does some delayed work (after 100ms), so we wait longer
    if controller.view and controller.view.root:
        controller.view.root.after(300, after_ui_start)
        controller.view.root.mainloop()


if __name__ == "__main__":
    main()
