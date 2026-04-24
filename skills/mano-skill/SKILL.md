---
name: mano-skill
description: Use desktop GUI automation with screenshot-driven planning. Invoke when the user wants to operate apps, browsers, or desktop UI by natural language.
---

# Mano Skill

Use this skill for GUI automation tasks on the local desktop.

This skill replaces the old `computer-use` skill wrapper. It keeps execution local through Hermes desktop tools and uses the project's configured vision runtime for screenshot understanding. Do not assume any external Mano cloud endpoint is available.

## When To Use

Invoke this skill when the user wants to:

- Open, switch, or control desktop applications
- Click buttons, menus, tabs, or form fields
- Type text into native apps or browser pages
- Complete a GUI workflow that needs visual confirmation between steps
- Inspect the current screen before deciding the next action

## Available Tools

Use these tools directly:

- `computer_open_app`
- `computer_open_url`
- `computer_screenshot`
- `computer_mouse`
- `computer_keyboard`
- `computer_key`
- `vision_analyze`

## Core Workflow

1. Take a fresh screenshot with `computer_screenshot`.
2. Read the returned `path` field from the screenshot result.
3. Ask `vision_analyze` a targeted question against that screenshot path.
4. Convert the visual answer into one precise desktop action.
5. Execute the action with the desktop tools.
6. Re-screenshot after meaningful state changes and verify before continuing.

## Operating Rules

- Prefer one action at a time unless the next action is deterministic.
- Prefer `computer_open_app` and `computer_open_url` when the task starts by launching an app or page.
- Re-check the UI after clicks, app launches, tab changes, form submissions, or scrolling.
- Use `computer_key` for shortcuts like `cmd+l`, `enter`, `esc`, arrows, and modifiers.
- Use `computer_keyboard` for text entry.
- Use `computer_mouse` only when you have a confident coordinate target.
- If the UI is ambiguous, ask a narrower `vision_analyze` question instead of guessing.

## Vision Guidance

Use focused questions, for example:

- "Identify the search input location and any nearby label."
- "Which visible button most likely means Continue or Next?"
- "Is the login form currently visible, and where are the email and password fields?"
- "What changed compared with the prior state: did a dialog open, page navigate, or menu expand?"

Do not claim visual facts that were not returned by `vision_analyze`.

## Safety

- Confirm destructive actions when the UI suggests delete, send, purchase, submit, or irreversible changes unless the user explicitly requested them.
- Stop and ask for clarification if multiple similar targets are visible and confidence is low.
- If a task depends on credentials, OTP, captcha, or human judgment, pause and ask the user.

## Example Pattern

1. `computer_open_app` or `computer_open_url`
2. `computer_screenshot`
3. `vision_analyze` on screenshot `path`
4. `computer_mouse` or `computer_key`
5. `computer_screenshot`
6. `vision_analyze` to verify outcome

## Notes

- Screenshot understanding follows the current Hermes system model and provider configuration automatically.
- Desktop execution now runs on the vendored Mano-CUA local controller and overlay GUI.
- This skill is prompt-only guidance; the actual execution happens through Hermes built-in desktop and vision tools.
