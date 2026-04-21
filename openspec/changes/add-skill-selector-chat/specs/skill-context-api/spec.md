## ADDED Requirements

### Requirement: Accept skill selection in chat API
The chat completions endpoint SHALL accept an optional `selected_skills` parameter containing an array of skill names.

#### Scenario: Skill selection in request
- **WHEN** client sends POST /v1/chat/completions with `selected_skills: ["imessage", "notes"]`
- **THEN** system stores selection in session metadata and filters available skills

#### Scenario: Missing skill selection parameter
- **WHEN** client omits `selected_skills` parameter
- **THEN** system loads all enabled skills (backward compatible behavior)

#### Scenario: Empty skill selection
- **WHEN** client sends `selected_skills: []`
- **THEN** system loads no skills (agent has base tools only)

### Requirement: Skill name validation
The system SHALL validate skill names in the `selected_skills` parameter.

#### Scenario: Valid skill names
- **WHEN** all skill names in `selected_skills` match installed skills
- **THEN** system accepts request and loads specified skills

#### Scenario: Invalid skill name
- **WHEN** `selected_skills` contains unknown skill name
- **THEN** system returns 400 error with message "Unknown skills: [name1, name2]"

#### Scenario: Disabled skill
- **WHEN** `selected_skills` contains disabled skill
- **THEN** system accepts request but logs warning and skips that skill

### Requirement: Session skill persistence
Selected skills SHALL be persisted in session metadata for the duration of the session.

#### Scenario: Skill storage
- **WHEN** system receives `selected_skills` for first message in session
- **THEN** system stores skill list in sessions table `metadata` JSON column

#### Scenario: Skill restoration
- **WHEN** subsequent messages are sent in same session
- **THEN** system uses stored skill selection (client need not resend)

#### Scenario: Skill update
- **WHEN** client sends new `selected_skills` list in existing session
- **THEN** system returns 400 error "Cannot change skills mid-session, start new session"

### Requirement: Agent skill filtering
The agent initialization process SHALL filter available skills based on session metadata.

#### Scenario: Skill filtering at init
- **WHEN** agent initializes for session with `selected_skills: ["imessage"]`
- **THEN** agent loads only imessage skill tools, ignoring other enabled skills

#### Scenario: No skill metadata
- **WHEN** agent initializes for session without skill metadata
- **THEN** agent loads all enabled skills (default behavior)

### Requirement: Tool metadata in responses
The system SHALL include tool invocation metadata in streaming responses.

#### Scenario: Tool use in stream
- **WHEN** agent invokes tool during streaming response
- **THEN** system sends `tool_use` event with tool name, parameters, and execution start time

#### Scenario: Tool result in stream
- **WHEN** tool execution completes
- **THEN** system sends `tool_result` event with output and execution duration

### Requirement: Skill loading events
The system SHALL emit skill loading events during agent initialization.

#### Scenario: Skill loaded event
- **WHEN** agent successfully loads a selected skill
- **THEN** system sends `skill_loaded` event with skill name and tool count

#### Scenario: Skill failed event
- **WHEN** agent fails to load a selected skill
- **THEN** system sends `skill_failed` event with skill name and error reason

### Requirement: Message type storage
The database SHALL support storing tool_use and skill_use message types.

#### Scenario: Tool use message storage
- **WHEN** system creates tool_use message
- **THEN** database stores with role='tool_use' and metadata containing tool_calls JSON

#### Scenario: Skill use message storage
- **WHEN** system creates skill_use message
- **THEN** database stores with role='skill_use' and metadata containing skill_name and tools array

#### Scenario: Message retrieval
- **WHEN** system loads session history
- **THEN** database returns all messages including tool_use and skill_use types

### Requirement: OpenAI API compatibility
The chat API response format SHALL remain compatible with OpenAI API clients when `selected_skills` is omitted.

#### Scenario: Standard OpenAI request
- **WHEN** client sends request matching OpenAI spec (no Hermes extensions)
- **THEN** system processes request and returns OpenAI-compatible response

#### Scenario: Tool use in OpenAI format
- **WHEN** agent uses tools and client expects OpenAI format
- **THEN** system returns tool_calls array in assistant message (OpenAI spec)
