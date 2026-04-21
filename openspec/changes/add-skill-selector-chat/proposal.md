## Why

Users need to explicitly select which skills are available to the agent during a conversation. Currently, all enabled skills are loaded by default, which can be inefficient and lack context control. Additionally, users cannot see when tools or skills are being invoked during the conversation, making the agent's actions opaque.

## What Changes

- Add skill selector UI component in chat input area with multi-select support
- Persist selected skills per session and send to backend with messages
- Add new message types to display tool invocations and skill invocations in chat
- Update chat API to accept and process skill context
- Add visual indicators for tool/skill execution in message stream

## Capabilities

### New Capabilities
- `skill-selector-ui`: Multi-select dropdown in chat input for choosing active skills
- `tool-invocation-display`: Message type and UI components to show tool calls with parameters and results
- `skill-invocation-display`: Message type and UI components to show skill activations
- `skill-context-api`: Backend API changes to accept and enforce skill context per message

### Modified Capabilities
<!-- No existing capabilities are being modified at the requirement level -->

## Impact

**Frontend**:
- ChatPage.tsx: Add skill selector component
- Message rendering: New message types for tool/skill invocations
- API client: Include selected skills in chat requests
- New UI components: SkillSelector, ToolInvocationMessage, SkillInvocationMessage

**Backend**:
- Chat API handler: Accept `selected_skills` parameter
- Message schema: Support tool_use and skill_use message types
- Agent context: Filter available skills based on selection

**Database**:
- Session state: Store selected skills per session
- Message types: Extend to include tool_use and skill_use
