## ADDED Requirements

### Requirement: Skill selector display
The chat input area SHALL display a skill selector button that opens a multi-select dropdown showing all available skills grouped by category.

#### Scenario: Opening skill selector
- **WHEN** user clicks the skill selector button in chat input area
- **THEN** system displays a popover with skills grouped by category

#### Scenario: Empty skill list
- **WHEN** no skills are installed
- **THEN** skill selector button is hidden or disabled

### Requirement: Multi-select skill interaction
Users SHALL be able to select and deselect multiple skills from the dropdown list.

#### Scenario: Selecting a skill
- **WHEN** user clicks on an unchecked skill
- **THEN** system checks the skill checkbox and adds it to selected list

#### Scenario: Deselecting a skill
- **WHEN** user clicks on a checked skill
- **THEN** system unchecks the skill checkbox and removes it from selected list

#### Scenario: Select all in category
- **WHEN** user clicks category header
- **THEN** system toggles all skills in that category

### Requirement: Selected skills visual indicator
The system SHALL display active skills as badges in the chat input area.

#### Scenario: Showing active skills
- **WHEN** user has selected skills
- **THEN** system displays skill names as removable badges near the input field

#### Scenario: Removing skill from badge
- **WHEN** user clicks X on a skill badge
- **THEN** system removes that skill from selection

### Requirement: Skill selection persistence
Selected skills SHALL persist for the current session and be restored on page reload.

#### Scenario: Session restoration
- **WHEN** user refreshes page with an active session
- **THEN** system restores the previously selected skills

#### Scenario: New session
- **WHEN** user starts a new chat session
- **THEN** skill selector starts with empty selection (no default skills)

### Requirement: Skill information display
Each skill in the selector SHALL display its name, category, and description on hover.

#### Scenario: Hover information
- **WHEN** user hovers over a skill in the dropdown
- **THEN** system displays a tooltip with skill description

### Requirement: Keyboard shortcuts
The skill selector SHALL support keyboard navigation and shortcuts.

#### Scenario: Opening with keyboard
- **WHEN** user presses Ctrl+K (or Cmd+K on Mac) in chat input
- **THEN** system opens the skill selector

#### Scenario: Navigation with arrows
- **WHEN** skill selector is open and user presses arrow keys
- **THEN** system navigates through skill list

#### Scenario: Selection with spacebar
- **WHEN** skill is focused and user presses spacebar
- **THEN** system toggles that skill's selection
