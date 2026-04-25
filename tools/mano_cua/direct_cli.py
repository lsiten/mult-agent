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
import time
import queue

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from visual.computer.computer_action_executor import ComputerActionExecutor
from visual.view.task_overlay_view import TaskOverlayView
from visual.view_model.direct_task_view_model import DirectTaskViewModel
from visual.config.visual_config import WINDOW_CONFIG, TEXT_CONSTANTS, TASK_STATUS, AUTOMATION_CONFIG

_result_queue = queue.Queue()


class DirectTaskController:
    def __init__(self, task_name: str):
        self.task_name = task_name
        self.view_model: DirectTaskViewModel = None
        self.view: TaskOverlayView = None
        self.current_step = 0
        self.running = True
        self.stop_requested = False

    def update_step(self, step: int, action: str, reasoning: str = ""):
        self.current_step = step
        if self.view_model and self.view_model.model:
            self.view_model.model.update_progress(action, reasoning)

    def _on_stop(self):
        self.stop_requested = True
        self.running = False
        if self.view_model:
            self.view_model.model.mark_stopped()
        if self.view and self.view.root:
            self.view.root.after(1000, self._on_close)

    def _on_continue(self):
        _result_queue.put("continue")

    def _on_close(self):
        self.running = False
        if self.view and self.view.root:
            self.view.root.destroy()

    def complete(self, message: str):
        if self.view_model and self.view_model.model:
            self.view_model.model.mark_completed()
        if self.view and self.view.root:
            self.view.root.after(5000, self._on_close)

    def set_error(self, message: str):
        if self.view_model and self.view_model.model:
            self.view_model.model.mark_error(message)


def execute_action(executor: ComputerActionExecutor, args) -> bool:
    if hasattr(args, 'x') and args.command == 'click':
        executor._do_click('left_click', {'coordinate': [args.x, args.y]})
        return True

    elif args.command == 'right_click':
        executor._do_click('right_click', {'coordinate': [args.x, args.y]})
        return True

    elif args.command == 'double_click':
        executor._do_click('double_click', {'coordinate': [args.x, args.y]})
        return True

    elif args.command == 'move':
        executor._mouse_move({'coordinate': [args.x, args.y]})
        return True

    elif args.command == 'drag':
        executor._do_left_click_drag({'start_coordinate': [args.x1, args.y1], 'coordinate': [args.x2, args.y2]})
        return True

    elif args.command == 'type':
        executor._type_text(args.text)
        return True

    elif args.command == 'key':
        executor._do_hotkey({'action': 'key', 'text': args.key})
        return True

    elif args.command == 'scroll':
        executor._do_scroll({'scroll_direction': args.direction})
        return True

    elif args.command == 'open_app':
        executor._open_app(args.text)
        return True

    elif args.command == 'open_url':
        executor._open_url(args.text)
        return True

    elif args.command == 'screenshot':
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

    parser.add_argument('--task', help='Task description (shown in GUI)', default="Direct Control")
    parser.add_argument('--step', type=int, default=1, help='Current step number')
    parser.add_argument('--reasoning', default='', help='Hermes reasoning for this step')

    subparsers = parser.add_subparsers(dest='command', required=True)

    click_parser = subparsers.add_parser('click', help='Click at normalized coordinates (1280x720)')
    click_parser.add_argument('--x', type=float, required=True, help='X coordinate (0-1280)')
    click_parser.add_argument('--y', type=float, required=True, help='Y coordinate (0-720)')

    right_click_parser = subparsers.add_parser('right_click', help='Right click')
    right_click_parser.add_argument('--x', type=float, required=True)
    right_click_parser.add_argument('--y', type=float, required=True)

    double_click_parser = subparsers.add_parser('double_click', help='Double click')
    double_click_parser.add_argument('--x', type=float, required=True)
    double_click_parser.add_argument('--y', type=float, required=True)

    type_parser = subparsers.add_parser('type', help='Type text')
    type_parser.add_argument('--text', required=True, help='Text to type')
    type_parser.add_argument('--x', type=float, help='Click at this position first')
    type_parser.add_argument('--y', type=float, help='Click at this position first')

    key_parser = subparsers.add_parser('key', help='Press a key')
    key_parser.add_argument('--key', required=True, help='Key name (enter, esc, tab, etc.)')

    scroll_parser = subparsers.add_parser('scroll', help='Scroll')
    scroll_parser.add_argument('--direction', choices=['up', 'down', 'left', 'right'], required=True)

    open_app_parser = subparsers.add_parser('open_app', help='Open application')
    open_app_parser.add_argument('--text', required=True, help='App name (macOS Spotlight matching)')

    open_url_parser = subparsers.add_parser('open_url', help='Open URL')
    open_url_parser.add_argument('--text', required=True, help='URL')

    screenshot_parser = subparsers.add_parser('screenshot', help='Capture screenshot')

    drag_parser = subparsers.add_parser('drag', help='Drag from (x1,y1) to (x2,y2)')
    drag_parser.add_argument('--x1', type=float, required=True)
    drag_parser.add_argument('--y1', type=float, required=True)
    drag_parser.add_argument('--x2', type=float, required=True)
    drag_parser.add_argument('--y2', type=float, required=True)

    move_parser = subparsers.add_parser('move', help='Move mouse to position')
    move_parser.add_argument('--x', type=float, required=True)
    move_parser.add_argument('--y', type=float, required=True)

    args = parser.parse_args()

    task_name = args.task
    step_num = args.step
    reasoning = args.reasoning

    executor = ComputerActionExecutor()
    controller = DirectTaskController(task_name)

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

    def after_ui_start():
        controller.update_step(step_num, action_desc, reasoning)

        success = False
        try:
            if args.command == 'type' and hasattr(args, 'x') and args.x is not None:
                executor._do_click('left_click', {'coordinate': [args.x, args.y]})
                time.sleep(0.2)

            success = execute_action(executor, args)
        except Exception as e:
            print(f"Action execution error: {e}")
            import traceback
            traceback.print_exc()
            success = False

        time.sleep(AUTOMATION_CONFIG["ACTION_DELAY"])

        if success:
            controller.complete(f"Action completed: {action_desc}")
        else:
            controller.set_error(f"Action failed: {action_desc}")
            if controller.view and controller.view.root:
                controller.view.root.after(5000, controller._on_close)

    controller.view_model = DirectTaskViewModel()
    controller.view_model.model.init_task(task_name)
    controller.update_step(args.step, action_desc, args.reasoning)

    controller.view = controller.view_model.view
    controller.view.on_stop_command = controller._on_stop
    controller.view.on_close_command = controller._on_close
    controller.view.on_continue_command = controller._on_continue

    print("UI panel initialized successfully")
    print(f"Window: {controller.view}, root: {controller.view.root}")

    if controller.view and controller.view.root:
        controller.view.root.after(300, after_ui_start)
        controller.view.root.mainloop()


if __name__ == "__main__":
    main()