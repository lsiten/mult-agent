# Changelog

All notable changes to Hermes Agent will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Skill Selector UI**: Multi-select skill chooser with category grouping and search
  - Keyboard shortcut (Ctrl/Cmd+K) to open skill selector
  - Color-coded skill badges with category indicators
  - Warning indicators for unavailable skills
  - Session-scoped skill persistence
- **Tool Invocation Display**: Real-time tool execution visualization
  - Collapsible tool invocation cards with parameters and results
  - Status indicators (pending/success/error)
  - Execution duration tracking
  - Toggle visibility for all tool calls via eye icon
- **Skill Loading Status**: Visual feedback when skills are initialized
  - Skill loading events in message stream
  - Category-based skill grouping
  - Success/failure status indicators
- **Message Type Extensions**: New message types for richer interactions
  - `tool_use` messages with tool invocation metadata
  - `skill_use` messages with skill loading status
  - Metadata field in messages table for structured data
- **API Enhancements**: Extended streaming API with skill selection
  - `selected_skills` query parameter for session-specific skill filtering
  - SSE events for `tool_use` and `skill_loaded`
  - Validation to prevent mid-session skill changes
- **Database Schema v7**: Enhanced storage for skill selection
  - `selected_skills` JSON column in sessions table
  - `metadata` JSON column in messages table
  - Automatic migration from v6 to v7

### Changed
- Chat input placeholder now shows selected skill count
- Tool callbacks (`tool_start_callback`, `tool_complete_callback`) added to AIAgent
- Skill badges display above attachments in input area

### Fixed
- Tool invocation state tracking during streaming responses
- Proper JSON serialization of tool arguments and results

### Technical Details
- **Frontend**: React components with Zustand state management
- **Backend**: Python aiohttp SSE streaming with callback architecture
- **Database**: SQLite schema migration with JSON metadata storage
- **i18n**: Complete English and Chinese translations

## [1.1.0] - Previous Release

### Added
- Electron desktop app with optimized startup (v1.1.0)
- Gateway authentication for production mode
- On-demand health checking
- IPC health check caching

### Changed
- Startup time reduced from ~3s to ~2.25s (25% improvement)
- CPU usage reduced ~20% via on-demand checks
- Concurrent service initialization (BFS algorithm)

[Unreleased]: https://github.com/nousresearch/hermes-agent-v2/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/nousresearch/hermes-agent-v2/releases/tag/v1.1.0
