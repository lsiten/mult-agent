#!/usr/bin/env python3

import sys
import platform
import argparse


def run_task(task: str):
    from visual.view_model.direct_task_view_model import DirectTaskViewModel

    view_model = DirectTaskViewModel()
    if not view_model.init_task(task):
        print("Failed to initialize visualization overlay.")
        return 1

    try:
        view_model.run_mainloop()
    except Exception as e:
        print(f"UI runtime exception: {e}")
        view_model.close()
        return 1

    view_model.close()
    return 0


def main():
    parser = argparse.ArgumentParser(description="Mano-CUA Direct Desktop Control")
    parser.add_argument("command", choices=["run"], help="Command to execute")
    parser.add_argument("task", nargs="?", help="Task description (required for 'run')")

    args = parser.parse_args()

    if args.command == "run":
        if not args.task:
            print("Error: task is required for 'run' command")
            return 1
        return run_task(args.task)

    return 1


if __name__ == "__main__":
    sys.exit(main())