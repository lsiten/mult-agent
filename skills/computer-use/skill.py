#!/usr/bin/env python3
"""
Computer Use Skill - High-level Desktop Automation

Orchestrates multiple computer use tools to accomplish complex GUI tasks:
- Application launching and switching
- Multi-step workflows
- Form filling
- Visual element location
- Context-aware actions

This skill wraps the basic computer_use tools with higher-level logic.
"""

import json
import logging
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


def execute(args: dict, context: dict) -> dict:
    """Execute a computer use task.

    Args:
        args: Task parameters
            - task: Task description (e.g., "Open Chrome and navigate to google.com")
            - steps: Optional list of predefined steps
        context: Execution context with tool access

    Returns:
        Execution result
    """
    task = args.get("task", "")
    steps = args.get("steps", [])

    if not task and not steps:
        return {
            "success": False,
            "error": "Either 'task' or 'steps' must be provided"
        }

    logger.info(f"Computer Use Skill: executing task: {task}")

    if steps:
        return _execute_steps(steps, context)
    else:
        return _execute_natural_language_task(task, context)


def _execute_steps(steps: List[Dict], context: dict) -> dict:
    """Execute a list of predefined steps.

    Each step is a dict with:
        - type: "screenshot" | "click" | "type" | "key" | "scroll" | "drag" | "bash"
        - params: parameters for the action
    """
    results = []

    for i, step in enumerate(steps):
        step_type = step.get("type")
        params = step.get("params", {})

        logger.info(f"Executing step {i+1}/{len(steps)}: {step_type}")

        try:
            if step_type == "screenshot":
                result = _take_screenshot(context)
            elif step_type == "click":
                result = _click(params, context)
            elif step_type == "type":
                result = _type_text(params, context)
            elif step_type == "key":
                result = _press_key(params, context)
            elif step_type == "scroll":
                result = _scroll(params, context)
            elif step_type == "drag":
                result = _drag(params, context)
            elif step_type == "bash":
                result = _run_bash(params, context)
            else:
                result = {"success": False, "error": f"Unknown step type: {step_type}"}

            results.append({
                "step": i + 1,
                "type": step_type,
                "result": result
            })

            if not result.get("success"):
                logger.warning(f"Step {i+1} failed: {result.get('error')}")
                return {
                    "success": False,
                    "error": f"Step {i+1} failed",
                    "completed_steps": results
                }

            # Small delay between steps
            if i < len(steps) - 1:
                time.sleep(0.5)

        except Exception as e:
            logger.exception(f"Step {i+1} raised exception")
            return {
                "success": False,
                "error": str(e),
                "completed_steps": results
            }

    return {
        "success": True,
        "steps_completed": len(results),
        "results": results
    }


def _execute_natural_language_task(task: str, context: dict) -> dict:
    """Execute a natural language task description.

    This delegates to the LLM agent to break down the task and use tools.
    """
    return {
        "success": True,
        "message": (
            f"Task received: {task}. "
            "The agent will now use computer_screenshot, computer_mouse, "
            "and computer_keyboard tools to accomplish this task."
        ),
        "task": task,
        "note": "This skill provides high-level coordination. The main agent will use the computer_use tools directly."
    }


def _take_screenshot(context: dict) -> dict:
    """Take a screenshot using computer_screenshot tool."""
    try:
        tool = context.get("tools", {}).get("computer_screenshot")
        if not tool:
            return {"success": False, "error": "computer_screenshot tool not available"}

        result = tool({})
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Screenshot failed")
        return {"success": False, "error": str(e)}


def _click(params: dict, context: dict) -> dict:
    """Execute a mouse click."""
    try:
        tool = context.get("tools", {}).get("computer_mouse")
        if not tool:
            return {"success": False, "error": "computer_mouse tool not available"}

        result = tool(params)
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Click failed")
        return {"success": False, "error": str(e)}


def _type_text(params: dict, context: dict) -> dict:
    """Type text using keyboard."""
    try:
        tool = context.get("tools", {}).get("computer_keyboard")
        if not tool:
            return {"success": False, "error": "computer_keyboard tool not available"}

        result = tool(params)
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Type failed")
        return {"success": False, "error": str(e)}


def _run_bash(params: dict, context: dict) -> dict:
    """Run a bash command (e.g., to open applications)."""
    try:
        command = params.get("command")
        if not command:
            return {"success": False, "error": "Missing command"}

        import subprocess
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=10
        )

        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        logger.exception("Bash command failed")
        return {"success": False, "error": str(e)}


def _press_key(params: dict, context: dict) -> dict:
    """Press a special key or keyboard shortcut."""
    try:
        tool = context.get("tools", {}).get("computer_key")
        if not tool:
            return {"success": False, "error": "computer_key tool not available"}

        result = tool(params)
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Key press failed")
        return {"success": False, "error": str(e)}


def _scroll(params: dict, context: dict) -> dict:
    """Scroll the mouse wheel."""
    try:
        tool = context.get("tools", {}).get("computer_mouse")
        if not tool:
            return {"success": False, "error": "computer_mouse tool not available"}

        direction = params.get("direction", "down")
        coordinate = params.get("coordinate")
        action = "scroll_down" if direction == "down" else "scroll_up"
        params_out = {"action": action, "coordinate": coordinate}

        result = tool(params_out)
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Scroll failed")
        return {"success": False, "error": str(e)}


def _drag(params: dict, context: dict) -> dict:
    """Drag from start coordinate to target coordinate."""
    try:
        tool = context.get("tools", {}).get("computer_mouse")
        if not tool:
            return {"success": False, "error": "computer_mouse tool not available"}

        start = params.get("start_coordinate") or params.get("start")
        target = params.get("target_coordinate") or params.get("target")
        
        if not start or not target:
            return {"success": False, "error": "drag requires start_coordinate and target_coordinate"}

        params_out = {
            "action": "drag",
            "coordinate": start,
            "target_coordinate": target
        }

        result = tool(params_out)
        return json.loads(result) if isinstance(result, str) else result
    except Exception as e:
        logger.exception("Drag failed")
        return {"success": False, "error": str(e)}
