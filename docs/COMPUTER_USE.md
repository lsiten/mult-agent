# Computer Use Integration

Desktop automation capabilities for Hermes Agent v2.

## Overview

Computer Use enables Hermes to directly control your desktop environment:
- Capture screenshots
- Move mouse cursor and click
- Type keyboard input
- Automate GUI applications

**Key Feature**: No external API required - uses system tools directly.

## Architecture

```
┌─────────────────────────────────────┐
│  Hermes Agent                       │
│  ┌───────────────────────────────┐ │
│  │ Skill: mano-skill             │ │
│  │ (Task orchestration)          │ │
│  └───────────┬───────────────────┘ │
│              │                      │
│  ┌───────────┼───────────────────┐ │
│  │           │                   │ │
│  │  ┌────────▼──────┐  ┌─────────▼────┐
│  │  │ computer_     │  │ computer_    │
│  │  │ screenshot    │  │ mouse        │
│  │  └────────┬──────┘  └─────────┬────┘
│  │           │                   │
│  │  ┌────────▼───────────────────▼────┐
│  │  │ computer_keyboard                │
│  │  └────────┬─────────────────────────┘
│  └───────────┼──────────────────────────┘
│              │
└──────────────┼───────────────────────────┘
               │
    ┌──────────▼──────────┐
    │  System Tools       │
    │  • screencapture    │  macOS
    │  • cliclick         │  macOS
    │  • scrot            │  Linux
    │  • xdotool          │  Linux
    └─────────────────────┘
```

## Installation

### macOS

```bash
# Install cliclick for mouse/keyboard control
brew install cliclick

# PIL/Pillow for screenshot (should already be installed)
pip install pillow
```

### Linux

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install xdotool scrot

# Python dependencies
pip install pillow
```

### Verify Installation

```bash
# Check if tools are registered
hermes status

# Should show:
# ✓ computer-use toolset available
#   - computer_screenshot
#   - computer_mouse
#   - computer_keyboard
```

## Usage

### Basic Tool Usage

#### Screenshot

```python
# Capture current screen
{
  "tool": "computer_screenshot"
}

# Returns:
{
  "success": true,
  "image": "iVBORw0KGgoAAAANS...",  # base64 PNG
  "format": "png",
  "width": 1920,
  "height": 1080,
  "timestamp": 1682345678.123
}
```

#### Mouse Control

```python
# Left click at coordinates
{
  "tool": "computer_mouse",
  "action": "left_click",
  "coordinate": [500, 300]
}

# Available actions:
# - mouse_move: Move cursor without clicking
# - left_click: Single left click
# - right_click: Right click (context menu)
# - middle_click: Middle mouse button
# - double_click: Double left click
```

#### Keyboard Input

```python
# Type text
{
  "tool": "computer_keyboard",
  "text": "Hello World"
}

# Note: Special keys (Cmd, Ctrl, etc.) not supported yet
```

### High-Level Skill Usage

The `mano-skill` skill provides screenshot-driven task orchestration:

```python
# Natural language task
{
  "skill": "mano-skill",
  "task": "Open Safari and search for 'Anthropic Claude'"
}

# Predefined workflow
{
  "skill": "mano-skill",
  "steps": [
    {
      "type": "bash",
      "params": {"command": "open -a Safari"}
    },
    {
      "type": "screenshot"
    },
    {
      "type": "click",
      "params": {
        "action": "left_click",
        "coordinate": [960, 60]
      }
    },
    {
      "type": "type",
      "params": {"text": "Anthropic Claude"}
    }
  ]
}
```

### Conversation Examples

#### Example 1: Screenshot and Analysis

```
User: 截图看看我的桌面上有什么

Agent: [调用 computer_screenshot]
      [分析截图内容]
      您的桌面上有:
      - Finder 窗口 (位于左侧)
      - Chrome 浏览器 (中间, 打开了多个标签页)
      - Terminal 窗口 (右下角)
      - Dock 栏在底部
```

#### Example 2: Application Control

```
User: 帮我打开 VS Code 并创建一个新文件

Agent: [执行步骤]
      1. 使用 bash 打开 VS Code: open -a "Visual Studio Code"
      2. 等待 2 秒
      3. 截图确认窗口已打开
      4. 点击 "New File" 按钮坐标 [100, 50]
      5. 完成！新文件已创建
```

#### Example 3: Form Automation

```
User: 在这个表单里填入: 用户名 test@example.com, 密码 demo123

Agent: [分析当前屏幕截图]
      发现表单字段位置:
      - 用户名字段: [400, 300]
      - 密码字段: [400, 350]

      [执行操作]
      1. 点击用户名字段
      2. 输入 "test@example.com"
      3. 点击密码字段
      4. 输入 "demo123"
      完成！
```

## Configuration

Environment variables (`.env`):

```bash
# Display configuration (optional - auto-detected)
COMPUTER_USE_DISPLAY_WIDTH=1920
COMPUTER_USE_DISPLAY_HEIGHT=1080

# Linux X11 display (optional)
COMPUTER_USE_DISPLAY_NUMBER=1
```

## Security Considerations

### Threat Model

Computer Use has **full desktop access**:
- ✅ Can read all screen content
- ✅ Can control all applications
- ✅ Can type passwords visible on screen
- ✅ Can execute system commands

### Recommended Protections

1. **Approval Gates**: Require user confirmation for sensitive actions

   ```yaml
   # In skill.yaml
   security:
     approval_required: true
   ```

2. **Logging**: All actions are logged to `hermes_logging.py`

   ```python
   logger.info(f"Computer Use: {action} at {coordinate}")
   ```

3. **Isolated Environment**: Run in dedicated user account or VM

   ```bash
   # macOS: Create dedicated user
   sudo dscl . -create /Users/hermes
   sudo dscl . -create /Users/hermes UserShell /bin/bash
   ```

4. **Permission Restrictions**: macOS Accessibility permissions

   System Preferences → Security & Privacy → Accessibility
   → Add only Python interpreter (not entire Terminal)

### Audit Trail

All computer use actions are logged:

```
[2026-04-23 10:30:45] INFO: Computer Use: screenshot captured (1920x1080)
[2026-04-23 10:30:47] INFO: Computer Use: left_click at [500, 300]
[2026-04-23 10:30:48] INFO: Computer Use: keyboard input (8 chars)
```

## Limitations

### Current Limitations

1. **No Special Keys**: Cannot send Cmd+C, Ctrl+V, Alt+Tab
2. **Single Display**: Multi-monitor not fully supported
3. **Coordinate-Based**: Requires visual analysis for element location
4. **Platform-Specific**: macOS and Linux only
5. **Latency**: ~100-500ms per action via system tools

### Future Enhancements

- [ ] Special key combinations (Cmd/Ctrl/Alt)
- [ ] Multi-monitor support
- [ ] Windows support via pyautogui
- [ ] OCR for text location
- [ ] Accessibility API integration
- [ ] Action recording/playback
- [ ] Element detection (buttons, fields)

## Troubleshooting

### Issue: "cliclick not found" (macOS)

```bash
brew install cliclick
```

### Issue: "xdotool not found" (Linux)

```bash
sudo apt-get install xdotool scrot
```

### Issue: Accessibility Permission Denied (macOS)

1. Open System Preferences
2. Go to Security & Privacy → Accessibility
3. Click lock icon and enter password
4. Add Terminal or Python interpreter
5. Restart Hermes Agent

### Issue: Wrong Coordinates

Check actual display resolution:

```bash
# macOS
system_profiler SPDisplaysDataType | grep Resolution

# Linux
xdpyinfo | grep dimensions
```

Update `.env`:

```bash
COMPUTER_USE_DISPLAY_WIDTH=2560   # Your actual width
COMPUTER_USE_DISPLAY_HEIGHT=1440  # Your actual height
```

### Issue: Screenshot is Blank

On Linux with Wayland (not X11):

```bash
# Switch to X11 session or install different tools
sudo apt-get install gnome-screenshot

# Or use Wayland-compatible tools
```

## Performance

### Benchmarks (macOS M1)

| Operation | Latency | Notes |
|-----------|---------|-------|
| Screenshot | ~200ms | Including PNG encoding |
| Mouse click | ~50ms | cliclick execution |
| Keyboard type | ~10ms/char | Linear with text length |

### Optimization Tips

1. **Batch Actions**: Group multiple actions to reduce roundtrips
2. **Cache Screenshots**: Reuse recent screenshots when possible
3. **Coordinate Precision**: Store known element positions
4. **Parallel Tasks**: Use async for independent actions

## Integration Examples

### With Browser Tool

```python
# Hybrid approach: Browser tool for web, Computer Use for desktop
if is_web_url(target):
    use browser_tool
else:
    use computer_use
```

### With Electron Skill

```python
# Electron for supported apps, Computer Use as fallback
if app in ELECTRON_APPS:
    use electron_skill
else:
    use computer_use
```

### With Terminal Tool

```python
# Terminal for CLI, Computer Use for GUI
if has_cli_interface(task):
    use terminal_tool
else:
    use computer_use
```

## API Reference

See detailed API documentation in:
- `tools/computer_use_tool.py` - Implementation
- `tests/test_computer_use_tool.py` - Usage examples
- `skills/mano-skill/SKILL.md` - Skill guidance

## Contributing

To extend Computer Use:

1. **Add New Actions**: Edit `execute_mouse_action()` or `execute_keyboard_action()`
2. **Support New Platform**: Add platform detection in `_check_computer_use_available()`
3. **Improve Accuracy**: Integrate OCR or accessibility APIs
4. **Add Tests**: Update `tests/test_computer_use_tool.py`

## License

Part of Hermes Agent v2 - MIT License

---

**Related Documentation**:
- [Browser Tool](BROWSER_TOOL.md)
- [Electron Skill](../skills/electron/README.md)
- [Security Guidelines](SECURITY.md)
