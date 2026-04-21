## ADDED Requirements

### Requirement: System SHALL display real-time installation progress
The system SHALL provide visual feedback during skill installation, showing current step and progress percentage.

#### Scenario: Installation progress is displayed
- **WHEN** skill installation begins
- **THEN** system displays progress indicator (spinner or progress bar)
- **THEN** system shows current installation step (e.g., "Downloading...", "Validating...", "Installing...")
- **THEN** system updates progress percentage if available

#### Scenario: Long-running installation provides feedback
- **WHEN** installation takes longer than 5 seconds
- **THEN** system continues showing progress indicator
- **THEN** system does not timeout or appear frozen
- **THEN** user can see installation is still active

### Requirement: System SHALL notify user of installation success
The system SHALL clearly indicate when a skill has been successfully installed and make it immediately available.

#### Scenario: Installation completes successfully
- **WHEN** skill installation finishes without errors
- **THEN** system displays success notification "Skill '<skill-name>' installed successfully"
- **THEN** system automatically closes installation modal/drawer after 2 seconds
- **THEN** system refreshes skills list to show newly installed skill

#### Scenario: User can immediately use installed skill
- **WHEN** installation succeeds
- **THEN** skill appears in skills list with "Active" status
- **THEN** skill is available for immediate use without app restart
- **THEN** system hot-reloads skill registry (for Python/JS skills) or displays restart prompt (for binary/native skills)

#### Scenario: Concurrent installations are queued
- **WHEN** user initiates installation while another is in progress
- **THEN** system displays "Installation queued" message
- **THEN** system shows queue position (e.g., "2nd in queue")
- **THEN** system begins installation automatically when previous task completes

### Requirement: System SHALL provide actionable error messages
The system SHALL display clear, specific error messages when installation fails, with guidance on how to resolve the issue.

#### Scenario: Installation fails with network error
- **WHEN** download from online repository fails (timeout, DNS, connection error)
- **THEN** system displays error "Failed to download skill: network error"
- **THEN** system suggests "Check your internet connection and try again"
- **THEN** system provides "Retry" button

#### Scenario: Installation fails due to validation error
- **WHEN** skill validation fails (missing files, invalid format)
- **THEN** system displays error with specific reason (e.g., "Invalid skill package: missing skill.yaml")
- **THEN** system suggests checking skill documentation or using different version

#### Scenario: Installation fails due to system error
- **WHEN** installation fails due to permissions or disk space
- **THEN** system displays error with technical details
- **THEN** system suggests checking logs or contacting support
- **THEN** system logs full error trace for debugging

### Requirement: System SHALL allow cancellation of ongoing installation
The system SHALL provide a way to cancel skill installation while it is in progress.

#### Scenario: User cancels installation
- **WHEN** user clicks "Cancel" button during installation
- **THEN** system sends cancellation request to backend task
- **THEN** backend aborts download/extraction within 2 seconds
- **THEN** system cleans up any partially created files
- **THEN** system displays "Installation cancelled" message
- **THEN** system returns to skills list without changes

#### Scenario: Cleanup after cancelled installation
- **WHEN** installation is cancelled mid-process
- **THEN** system removes any partially extracted files from skills directory
- **THEN** system does not leave corrupted or incomplete skill files
- **THEN** skills list does not show the cancelled skill
