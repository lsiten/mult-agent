## ADDED Requirements

### Requirement: Tool invocation message type
The system SHALL support a new message type `tool_use` to represent tool invocations in the conversation.

#### Scenario: Tool invocation message structure
- **WHEN** agent invokes a tool during response
- **THEN** system creates a message with role `tool_use` containing tool name, parameters, and result

#### Scenario: Message ordering
- **WHEN** assistant message includes tool calls
- **THEN** system inserts tool_use messages in execution order between user and assistant messages

### Requirement: Tool call display format
Tool invocation messages SHALL display the tool name, input parameters, and execution result in a collapsed format by default.

#### Scenario: Collapsed view
- **WHEN** tool_use message is rendered
- **THEN** system displays tool name and execution status in a compact card

#### Scenario: Expanding details
- **WHEN** user clicks on a collapsed tool invocation
- **THEN** system expands to show full parameters and result

### Requirement: Tool execution status indicators
The system SHALL visually indicate the execution status of tool calls (pending, success, error).

#### Scenario: Pending execution
- **WHEN** tool is currently executing
- **THEN** system displays loading indicator with "Executing..." status

#### Scenario: Successful execution
- **WHEN** tool completes successfully
- **THEN** system displays green checkmark icon with result preview

#### Scenario: Failed execution
- **WHEN** tool execution fails
- **THEN** system displays red error icon with error message

### Requirement: Parameter formatting
Tool input parameters SHALL be formatted as syntax-highlighted JSON when expanded.

#### Scenario: JSON parameter display
- **WHEN** user expands tool invocation details
- **THEN** system displays parameters as formatted, syntax-highlighted JSON

#### Scenario: Large parameter handling
- **WHEN** tool parameters exceed 1000 characters
- **THEN** system truncates display with "Show more" option

### Requirement: Result formatting
Tool results SHALL be formatted according to their content type (text, JSON, code, image).

#### Scenario: Text result
- **WHEN** tool returns plain text result
- **THEN** system displays it in a monospace font with line wrapping

#### Scenario: JSON result
- **WHEN** tool returns JSON result
- **THEN** system displays it as syntax-highlighted, formatted JSON

#### Scenario: Error result
- **WHEN** tool returns an error
- **THEN** system displays error message in red with error icon

### Requirement: Tool invocation filtering
Users SHALL be able to toggle visibility of tool invocation messages.

#### Scenario: Hiding tool calls
- **WHEN** user toggles "Hide tool calls" option
- **THEN** system hides all tool_use messages from conversation view

#### Scenario: Showing tool calls
- **WHEN** "Hide tool calls" is disabled (default)
- **THEN** system displays all tool_use messages inline with conversation

### Requirement: Timestamp display
Each tool invocation SHALL display execution time and duration.

#### Scenario: Execution timing
- **WHEN** tool_use message is displayed
- **THEN** system shows timestamp and execution duration (e.g., "2.3s")
