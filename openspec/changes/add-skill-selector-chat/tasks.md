## 1. Database Schema Updates

- [x] 1.1 Add `selected_skills` JSON column to sessions table (nullable)
- [x] 1.2 Add migration script for schema update
- [x] 1.3 Update hermes_state.py to support tool_use and skill_use message types
- [x] 1.4 Add metadata field to Message model for storing tool_calls and skill info

## 2. Backend API - Chat Endpoint

- [x] 2.1 Update chat API request schema to accept `selected_skills` array parameter
- [x] 2.2 Add skill name validation logic in chat handler
- [x] 2.3 Store selected_skills in session metadata on first message
- [x] 2.4 Add validation to prevent skill changes mid-session (return 400)
- [ ] 2.5 Add unit tests for skill validation logic

## 3. Backend API - Agent Initialization

- [ ] 3.1 Modify agent init to read selected_skills from session metadata (DEFERRED - complex)
- [ ] 3.2 Implement skill filtering logic at agent startup (DEFERRED - complex)
- [ ] 3.3 Add skill_loaded and skill_failed event emission (DEFERRED)
- [ ] 3.4 Update skill loading to respect selection filter (DEFERRED)
- [ ] 3.5 Add integration test for filtered skill loading (DEFERRED)

## 4. Backend API - Message Types

- [x] 4.1 Create tool_use message type handler
- [ ] 4.2 Create skill_use message type handler
- [x] 4.3 Update streaming response to emit tool_use events
- [x] 4.4 Update streaming response to emit skill_loaded events
- [x] 4.5 Add message serialization for new types

## 5. Frontend - Skill Selector Component

- [x] 5.1 Create SkillSelector.tsx component with multi-select
- [x] 5.2 Implement skill grouping by category
- [x] 5.3 Add popover trigger button in chat input area
- [x] 5.4 Implement checkbox state management
- [x] 5.5 Add skill description tooltips on hover
- [x] 5.6 Add keyboard shortcuts (Ctrl+K to open, arrow navigation)

## 6. Frontend - Selected Skills Display

- [x] 6.1 Create SkillBadge component for showing active skills
- [x] 6.2 Add badge container in chat input area
- [x] 6.3 Implement remove-skill-on-click for badges
- [x] 6.4 Add visual feedback when no skills selected
- [x] 6.5 Style badges with category colors

## 7. Frontend - State Management

- [x] 7.1 Create useSkillSelectionStore Zustand store
- [x] 7.2 Add selectedSkills state and actions (add, remove, clear)
- [x] 7.3 Implement session-based persistence (load from API)
- [x] 7.4 Add skill list fetching from /api/skills endpoint
- [ ] 7.5 Sync selection state with session metadata

## 8. Frontend - Message Rendering

- [x] 8.1 Create ToolInvocationMessage.tsx component
- [x] 8.2 Implement collapsed/expanded state for tool invocations
- [x] 8.3 Add syntax highlighting for JSON parameters
- [x] 8.4 Add status indicators (pending/success/error)
- [x] 8.5 Create SkillInvocationMessage.tsx component
- [x] 8.6 Add skill icon and category theming
- [x] 8.7 Implement skill group display for multiple skills
- [x] 8.8 Add timestamp and duration display

## 9. Frontend - Chat API Integration

- [x] 9.1 Update chat API client to send selected_skills parameter
- [x] 9.2 Add error handling for invalid skill names (400 responses)
- [x] 9.3 Update message type discriminator to handle tool_use and skill_use
- [x] 9.4 Parse and render tool_use messages from stream
- [x] 9.5 Parse and render skill_loaded events from stream

## 10. Frontend - UI Controls

- [x] 10.1 Add "Hide tool calls" toggle in chat settings
- [x] 10.2 Implement filter logic to hide/show tool_use messages
- [x] 10.3 Add visual indicator when tool calls are hidden
- [x] 10.4 Add warning badge for unavailable skills
- [x] 10.5 Update input placeholder when skills are selected

## 11. Internationalization

- [x] 11.1 Add translation keys for skill selector UI (en/zh)
- [x] 11.2 Add translation keys for tool invocation messages
- [x] 11.3 Add translation keys for skill invocation messages
- [x] 11.4 Add translation keys for error messages

## 12. Testing

- [ ] 12.1 Add unit tests for SkillSelector component
- [ ] 12.2 Add unit tests for message rendering components
- [x] 12.3 Add integration test for skill selection flow
- [x] 12.4 Add integration test for tool invocation display
- [ ] 12.5 Add E2E test for complete chat with skill selection
- [ ] 12.6 Test skill persistence across page reload
- [x] 12.7 Test OpenAI API compatibility (no selected_skills param)

## 13. Documentation

- [x] 13.1 Update API documentation for selected_skills parameter
- [x] 13.2 Add user guide for skill selector feature
- [x] 13.3 Document new message types in schema
- [x] 13.4 Add examples of tool_use and skill_use messages
- [x] 13.5 Update CHANGELOG with new features
