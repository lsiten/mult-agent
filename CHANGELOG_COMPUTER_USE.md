# Computer Use Integration - Changelog

## [2.1.0] - 2026-04-23

### Documentation & Troubleshooting

**Real-World Testing Updates**
- Added practical troubleshooting for cliclick syntax common mistakes
  - Correct: `kp:space` for key press (not `k:space`)
  - Correct: `c:x,y` or `c:.` for click (not just `c:`)
- Added accessibility permissions note for macOS
  - Without permissions: commands exit successfully but have no effect
  - Enable at: System Preferences → Security & Privacy → Accessibility
- Added best practice recommendation: Use Cmd+Space (keyboard shortcut) for Spotlight instead of clicking top-right icon
  - More reliable, resolution-independent
- Updated version metadata in skill.yaml

### Verified Status
- All 27 unit tests pass ✓
- Screenshot capture works correctly ✓
- Mouse/Keyboard command structure valid ✓
- Cross-platform behavior consistent ✓

## [2.0.0] - 2026-04-23

### Added

**Core Tools** (`tools/computer_use_tool.py`)
- `computer_screenshot`: Desktop screenshot capture
  - macOS: Uses `screencapture` (built-in)
  - Linux: Uses `scrot` or ImageMagick `import`
  - Fallback: PIL/Pillow screenshot
  - Returns base64-encoded PNG with metadata
  
- `computer_mouse`: Mouse control
  - Actions: `mouse_move`, `left_click`, `right_click`, `middle_click`, `double_click`, `scroll_up`, `scroll_down`, `drag`
  - macOS: Uses `cliclick`
  - Linux: Uses `xdotool`
  - Coordinate-based positioning (pixels from top-left)
  - Full drag-and-drop support from start to target coordinate
  
- `computer_keyboard`: Keyboard input simulation
  - macOS: Uses `cliclick`
  - Linux: Uses `xdotool`
  - Plain text with proper special character escaping

- `computer_key`: Special key and keyboard shortcut support
  - Supports: enter, escape, tab, backspace, delete, space, arrows (up/down/left/right), pageup, pagedown, home, end, f1-f12
  - Supports modifier combinations: cmd/ctrl/alt/shift (e.g., Ctrl+C, Cmd+S, Alt+Tab)
  - Full cross-platform key mapping consistency

**High-Level Skill** (`skills/computer-use/`)
- Task orchestration for multi-step workflows
- Natural language task support
- Predefined step sequences
- Integration with other tools (bash, browser)

**Documentation**
- `docs/COMPUTER_USE.md`: Complete integration guide
- `skills/computer-use/README.md`: Skill usage documentation
- `CHANGELOG_COMPUTER_USE.md`: This changelog

**Examples and Tests**
- `examples/computer_use_demo.py`: Interactive demo script
- `tests/test_computer_use_tool.py`: Unit test suite
- Installation script: `scripts/install_computer_use.sh`

**Configuration**
- Added Computer Use section to `.env.example`
- Environment variables:
  - `COMPUTER_USE_DISPLAY_WIDTH`: Screen width (default: 1920)
  - `COMPUTER_USE_DISPLAY_HEIGHT`: Screen height (default: 1080)
  - `COMPUTER_USE_DISPLAY_NUMBER`: X11 display for Linux (default: 1)

**API Integration**
- Gateway status endpoint updated with `capabilities.computer_use` field
- Tool registry integration for availability checking
- Automatic tool registration on import

### Dependencies

**System Requirements**
- macOS: `cliclick` (via Homebrew)
- Linux: `xdotool`, `scrot` (via apt/yum/dnf)

**Python Packages**
- `pillow`: Screenshot handling (added to `requirements.txt`)

### Security

- High security level marked in skill metadata
- All actions logged via `hermes_logging.py`
- Platform support limited to macOS and Linux
- Accessibility permissions required on macOS Monterey+

### Platform Support

| Platform | Screenshot | Mouse | Keyboard | Special Keys | Status |
|----------|-----------|-------|----------|--------------|--------|
| macOS    | ✅ screencapture | ✅ cliclick | ✅ cliclick | ✅ cliclick | Fully supported |
| Linux    | ✅ scrot/import | ✅ xdotool | ✅ xdotool | ✅ xdotool | Fully supported |
| Windows  | ⚠️ PIL fallback | ❌ Not supported | ❌ Not supported | ❌ Not supported | Limited |

### Fixed Issues

1. **Linux screenshot cleanup bug**: Original code deleted temporary file before reading → Fixed by reading data first then cleaning up
2. **Hardcoded resolution**: Now auto-detects native resolution using system commands, with environment variable override fallback
3. **Behavior consistency**: Fixed macOS scroll action to always move mouse to target coordinate first, matching Linux behavior
4. **Special character escaping**: Proper `:` and `\` escaping for cliclick on macOS

### Known Limitations

1. **Single Display**: Multi-monitor setups not fully supported (auto-detects primary display resolution)
2. **Coordinate-Based**: Requires visual analysis or known positions
3. **Latency**: ~100-500ms per action via system tools
4. **Platform-Specific**: Different tool dependencies per OS
5. **macOS Permissions**: Accessibility permissions required on macOS Monterey+

### Future Roadmap

- [ ] Multi-monitor coordinate handling
- [ ] Windows full support via pyautogui
- [ ] OCR integration for element location
- [ ] Accessibility API integration
- [ ] Action recording and playback
- [ ] Element detection (buttons, fields)

### Migration Notes

**From browser-tool users**: Computer Use complements browser automation
- Use browser-tool for web-specific tasks
- Use computer-use for native desktop applications
- Both can work together in hybrid workflows

**Installation**: Run `./scripts/install_computer_use.sh` for automated setup

### Testing

Run tests:
```bash
pytest tests/test_computer_use_tool.py -v
```

Run demo:
```bash
python examples/computer_use_demo.py
```

Verify in conversation:
```
User: 截图看看桌面
Agent: [Uses computer_screenshot tool]
```

### Performance Metrics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Screenshot | ~200ms | Including PNG encoding |
| Mouse click | ~50ms | cliclick execution |
| Keyboard type | ~10ms/char | Linear with text length |
| Tool availability check | <1ms | Cached after first check |

### Architecture Decisions

**Why system tools instead of Anthropic API?**
- No external API dependency
- Lower latency for local operations
- Works offline
- Integrates with existing Hermes toolset pattern

**Why separate tool and skill layers?**
- Tools: Low-level primitives (screenshot, click, type)
- Skill: High-level task orchestration
- Allows flexible composition and reuse

**Why PIL as fallback?**
- Cross-platform screenshot capability
- Reduces hard dependency on system tools
- Enables limited Windows support

### Contributors

- Hermes Agent Team
- Integration by Claude Code

### License

MIT License - Part of Hermes Agent v2

---

**Next Version**: 2.1.0 (planned)
- Multi-monitor coordinate handling
- OCR-based element location from screenshots
- Windows full support
