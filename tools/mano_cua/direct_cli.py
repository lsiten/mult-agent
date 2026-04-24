#!/usr/bin/env python3
"""
Mano-CUA Direct Action Interface for Hermes.

- No remote model/session calls
- Preserves Mano computer control and overlay GUI
- Can be used directly or through Hermes computer-use tools
"""

import argparse
import json
import time

from tools.mano_cua.runtime import get_runtime


def main():
    parser = argparse.ArgumentParser(description="Hermes Mano direct control")
    parser.add_argument(
        "action",
        choices=[
            "open",
            "click",
            "click_left",
            "click_right",
            "double_click",
            "type",
            "key",
            "move",
            "drag",
            "scroll",
            "open_url",
            "screenshot",
            "close",
        ],
        help="Action to perform",
    )
    parser.add_argument("--task-name", default="Hermes Direct Control", help="Task name displayed in UI")
    parser.add_argument("--x", type=float, help="X coordinate (1280x720 normalized)")
    parser.add_argument("--y", type=float, help="Y coordinate (1280x720 normalized)")
    parser.add_argument("--text", help="Text to type or app/url to open")
    parser.add_argument("--key", help="Key name for hotkey (e.g. enter, cmd+c)")
    parser.add_argument("--direction", choices=["up", "down", "left", "right"], help="Scroll direction")
    parser.add_argument("--end-x", type=float, help="End X for drag")
    parser.add_argument("--end-y", type=float, help="End Y for drag")
    parser.add_argument("--amount", type=int, default=10, help="Scroll amount")
    parser.add_argument("--json", action="store_true", help="Output JSON result")
    args = parser.parse_args()

    runtime = get_runtime(task_name=args.task_name)

    if args.action == "open":
        from tools.mano_cua.visual.view_model.direct_task_view_model import DirectTaskViewModel

        view_model = DirectTaskViewModel()
        if not view_model.init_task(args.task_name):
            result = {"ok": False, "message": "UI failed to start. Check customtkinter/Tk on the local Python environment."}
            if args.json:
                print(json.dumps(result))
            else:
                print(result["message"])
            raise SystemExit(1)
        result = {"ok": True, "message": "UI started"}
        if args.json:
            print(json.dumps(result))
        else:
            print("UI monitor started")
        try:
            view_model.run_mainloop()
        except KeyboardInterrupt:
            view_model.close()
        return

    if args.action == "screenshot":
        shot = runtime.capture_screenshot()
        result = {"ok": True, "message": f"Screenshot saved to {shot['path']}", "path": shot["path"]}
    elif args.action == "close":
        runtime.close()
        result = {"ok": True, "message": "Closed"}
    else:
        action_dict = _build_action_dict(args)
        result = runtime.execute_action(action_dict)

    if args.json:
        print(json.dumps(result, indent=2))
    elif result.get("ok"):
        print(result.get("message", "Success"))
    else:
        print(result.get("message", "Failed"))


def _build_action_dict(args) -> dict:
    if args.action in {"click", "click_left"}:
        return {"name": "computer", "input": {"action": "left_click", "coordinate": [args.x, args.y]}}
    if args.action == "click_right":
        return {"name": "computer", "input": {"action": "right_click", "coordinate": [args.x, args.y]}}
    if args.action == "double_click":
        return {"name": "computer", "input": {"action": "double_click", "coordinate": [args.x, args.y]}}
    if args.action == "type":
        return {"name": "computer", "input": {"action": "type", "text": args.text}}
    if args.action == "key":
        key_input = args.key or args.text or ""
        parts = [part for part in key_input.split("+") if part]
        return {
            "name": "computer",
            "input": {
                "action": "key",
                "modifiers": parts[:-1] if len(parts) > 1 else [],
                "mains": [parts[-1]] if parts else [],
            },
        }
    if args.action == "move":
        return {"name": "computer", "input": {"action": "mouse_move", "coordinate": [args.x, args.y]}}
    if args.action == "drag":
        return {
            "name": "computer",
            "input": {
                "action": "left_click_drag",
                "start_coordinate": [args.x, args.y],
                "coordinate": [args.end_x, args.end_y],
            },
        }
    if args.action == "scroll":
        return {
            "name": "computer",
            "input": {
                "action": "scroll",
                "scroll_direction": args.direction,
                "scroll_amount": args.amount,
            },
        }
    if args.action == "open_url":
        text = args.text or ""
        if text.startswith("http://") or text.startswith("https://"):
            return {"name": "open_url", "input": {"url": text}}
        return {"name": "open_app", "input": {"app_name": text}}
    raise ValueError(f"Unsupported action: {args.action}")


if __name__ == "__main__":
    main()
