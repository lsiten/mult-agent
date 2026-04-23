# Computer Use Skill

Desktop automation using direct system control - no external API required.

## Features

- **Screenshot Capture**: Get visual feedback of current desktop state
- **Mouse Control**: Move cursor, click, double-click at precise coordinates
- **Keyboard Input**: Type text into any application
- **Application Control**: Launch and interact with GUI applications
- **Workflow Automation**: Chain multiple actions together

## How It Works

This skill uses **system-level tools** for desktop control:

- **macOS**: `screencapture` (built-in) + `cliclick` (installable)
- **Linux**: `scrot`/`import` + `xdotool`
- **Fallback**: PIL/Pillow for cross-platform screenshot

**No external API or Anthropic API key needed** - all operations are local.

## Installation

### macOS

```bash
brew install cliclick
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get install xdotool scrot
```

### Python Dependencies

```bash
pip install pillow
```

## Usage

### Basic Tools

```python
# Take screenshot
{
  "tool": "computer_screenshot"
}

# Click at coordinates
{
  "tool": "computer_mouse",
  "action": "left_click",
  "coordinate": [500, 300]
}

# Type text
{
  "tool": "computer_keyboard",
  "text": "Hello World"
}
```

### High-Level Skill

```python
# Natural language task
{
  "skill": "computer-use",
  "task": "Open Safari and navigate to anthropic.com"
}

# Predefined steps
{
  "skill": "computer-use",
  "steps": [
    {"type": "screenshot"},
    {"type": "click", "params": {"action": "left_click", "coordinate": [100, 50]}},
    {"type": "type", "params": {"text": "https://anthropic.com"}},
    {"type": "bash", "params": {"command": "sleep 2"}}
  ]
}
```

## Architecture

```
┌─────────────────────────────────────┐
│   Skill: computer-use               │
│   (High-level task orchestration)   │
└─────────────┬───────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼───┐ ┌───▼───┐ ┌───▼────┐
│ screen│ │ mouse │ │keyboard│
│ shot  │ │       │ │        │
└───┬───┘ └───┬───┘ └───┬────┘
    │         │         │
┌───▼─────────▼─────────▼────┐
│  System Tools (cliclick,   │
│  xdotool, screencapture)   │
└────────────────────────────┘
```

## Security

**Security Level**: HIGH

Computer Use has **full desktop access** including:
- Reading all screen content
- Controlling all applications
- Accessing files visible in GUI
- Executing system commands

**Recommendations**:
1. Enable approval prompts for sensitive actions
2. Run in isolated user account or VM
3. Log all computer use actions
4. Review screen content before acting

## Configuration

Environment variables in `.env`:

```bash
# Display configuration
COMPUTER_USE_DISPLAY_WIDTH=1920
COMPUTER_USE_DISPLAY_HEIGHT=1080

# Linux specific (if using X11)
COMPUTER_USE_DISPLAY_NUMBER=1
```

## Examples

### Example 1: Screenshot and Analysis

```
User: "Take a screenshot and tell me what's on screen"
Agent:
  1. Uses computer_screenshot
  2. Receives base64 PNG
  3. Analyzes with vision model
  4. Describes screen content
```

### Example 2: Application Workflow

```
User: "Open Notes app and create a new note titled 'Meeting'"
Agent:
  1. Screenshots to locate Notes app icon
  2. Clicks at Notes icon coordinates
  3. Waits 2 seconds for app launch
  4. Clicks "New Note" button
  5. Types "Meeting" in title field
```

### Example 3: Form Filling

```
User: "Fill in the login form - username: test@example.com, password: demo123"
Agent:
  1. Screenshots to locate form fields
  2. Clicks username field
  3. Types "test@example.com"
  4. Clicks password field
  5. Types "demo123"
  6. Clicks login button
```

## Limitations

1. **Platform Support**: macOS and Linux only (Windows limited)
2. **Accuracy**: Coordinate-based clicking requires precise screen analysis
3. **Speed**: System tools have ~100-500ms latency
4. **No Special Keys**: Cannot send Cmd/Ctrl/Alt combinations (yet)
5. **Single Display**: Multi-monitor setups not fully supported

## Integration with Hermes

The tools are automatically registered in `tools/registry.py`:

```python
# Check availability
hermes status  # Shows "computer-use" toolset if available

# Use in conversation
User: "截图看看桌面上有什么"
Agent: [使用 computer_screenshot 工具]
```

## Troubleshooting

### macOS: "cliclick not found"

```bash
brew install cliclick
```

### Linux: "xdotool not found"

```bash
sudo apt-get update
sudo apt-get install xdotool scrot
```

### Permissions Denied

On macOS Monterey+, grant Accessibility permissions:
1. System Preferences → Security & Privacy → Accessibility
2. Add Terminal or your Python interpreter
3. Restart application

### Coordinates Wrong

Check your display resolution:

```bash
# macOS
system_profiler SPDisplaysDataType | grep Resolution

# Linux
xdpyinfo | grep dimensions
```

Update `.env`:

```bash
COMPUTER_USE_DISPLAY_WIDTH=2560  # Your actual width
COMPUTER_USE_DISPLAY_HEIGHT=1440 # Your actual height
```

## Roadmap

- [ ] Special key support (Cmd+C, Ctrl+V)
- [ ] Multi-monitor support
- [ ] Windows support via pyautogui
- [ ] OCR integration for text location
- [ ] Element detection via accessibility APIs
- [ ] Recording and playback of workflows

## Related Skills

- `/agent-browser`: Web-specific automation
- `/electron`: Electron app control
- `/slack`: Slack workspace automation

## License

Part of Hermes Agent v2 - MIT License
