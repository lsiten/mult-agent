## ADDED Requirements

### Requirement: Skill invocation message type
The system SHALL support a new message type `skill_use` to represent skill activations in the conversation.

#### Scenario: Skill invocation message structure
- **WHEN** agent loads a skill during response
- **THEN** system creates a message with role `skill_use` containing skill name and activation context

#### Scenario: Message placement
- **WHEN** skill is activated during conversation
- **THEN** system inserts skill_use message before the first tool call that uses that skill

### Requirement: Skill activation display
Skill invocation messages SHALL display the skill name, category, and activation reason in a compact format.

#### Scenario: Skill activation card
- **WHEN** skill_use message is rendered
- **THEN** system displays skill icon, name, and category in a colored badge

#### Scenario: Activation reason
- **WHEN** user hovers over skill_use message
- **THEN** system shows tooltip explaining why skill was activated

### Requirement: Skill icon and theming
Each skill invocation SHALL use the skill's category icon and theme color.

#### Scenario: Category-based styling
- **WHEN** displaying skill_use message
- **THEN** system applies category color and icon (e.g., blue computer icon for "software-development")

#### Scenario: Default styling
- **WHEN** skill has no category or unknown category
- **THEN** system uses neutral gray color and generic icon

### Requirement: Multiple skill display
When multiple skills are used in a response, the system SHALL group them visually.

#### Scenario: Skill group display
- **WHEN** assistant response uses 3+ skills
- **THEN** system displays them as a horizontal badge group with "+N more" collapse

#### Scenario: Expanding skill group
- **WHEN** user clicks "+N more" on skill group
- **THEN** system expands to show all skill names

### Requirement: Skill invocation timing
Skill invocation messages SHALL display when the skill was loaded and first used.

#### Scenario: Activation timestamp
- **WHEN** skill_use message is displayed
- **THEN** system shows "Loaded at [time]" timestamp

### Requirement: Skill unavailability indicator
If a skill was selected but not available, the system SHALL display a warning indicator.

#### Scenario: Missing skill warning
- **WHEN** user selected a skill that is disabled or uninstalled
- **THEN** system displays yellow warning badge with "Skill unavailable" message

#### Scenario: Skill not loaded warning
- **WHEN** agent skipped loading a selected skill due to error
- **THEN** system displays orange warning badge with error reason

### Requirement: Skill context information
Expanded skill invocation messages SHALL show which tools from the skill were made available.

#### Scenario: Skill tools list
- **WHEN** user expands skill_use message
- **THEN** system displays list of tools loaded from that skill

#### Scenario: Tool usage count
- **WHEN** skill tools are displayed
- **THEN** system shows usage count for each tool (e.g., "web_search: used 3 times")
