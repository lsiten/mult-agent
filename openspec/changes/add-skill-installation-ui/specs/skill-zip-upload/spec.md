## ADDED Requirements

### Requirement: System SHALL accept ZIP file upload for skill installation
The system SHALL provide a file upload interface that accepts skill ZIP files and validates the file format before processing.

#### Scenario: User selects ZIP file for upload
- **WHEN** user clicks "Upload ZIP File" button
- **THEN** system opens file picker dialog
- **THEN** system accepts files with .zip extension only

#### Scenario: User uploads valid skill ZIP file
- **WHEN** user selects a valid skill ZIP file
- **THEN** system validates file size (MUST be < 50MB)
- **THEN** system validates ZIP archive integrity
- **THEN** system proceeds to skill validation and installation

#### Scenario: User uploads invalid file
- **WHEN** user selects a non-ZIP file or corrupted ZIP
- **THEN** system rejects the file
- **THEN** system displays error message "Invalid file format. Please upload a valid skill ZIP file."

#### Scenario: User uploads oversized ZIP file
- **WHEN** user selects a ZIP file larger than 50MB
- **THEN** system rejects the file
- **THEN** system displays error message "File too large. Maximum size is 50MB."

### Requirement: System SHALL validate skill package structure
The system SHALL verify that uploaded ZIP files contain required skill components (skill.yaml, README.md, main implementation file) before installation.

#### Scenario: ZIP contains valid skill structure
- **WHEN** system extracts uploaded ZIP file
- **THEN** system verifies presence of skill.yaml in root directory
- **THEN** system verifies presence of at least one .py, .js, or executable file
- **THEN** system proceeds to install the skill

#### Scenario: ZIP missing required files
- **WHEN** system extracts ZIP and skill.yaml is missing
- **THEN** system aborts installation
- **THEN** system displays error "Invalid skill package: missing skill.yaml"

#### Scenario: ZIP contains malicious content
- **WHEN** system detects suspicious patterns via skills_guard.py scanner:
  - Path traversal attempts (../ in file paths, symlinks outside skill directory)
  - Dangerous code patterns (eval, exec, os.system without declaration)
  - Network exfiltration patterns (urllib, requests without network permission)
  - Destructive commands (rm -rf, file deletion outside skill directory)
- **THEN** system aborts installation
- **THEN** system displays specific security warning (e.g., "Detected path traversal attempt")
- **THEN** system logs the attempt with threat details for audit

#### Scenario: ZIP bomb attack
- **WHEN** ZIP file has excessive compression ratio (>4:1) or expands beyond 200MB
- **THEN** system aborts extraction before completing
- **THEN** system displays error "Suspicious file detected: compression ratio too high"

### Requirement: System SHALL extract and install skill from ZIP
The system SHALL extract the ZIP contents to the appropriate skills directory and register the skill with the system.

#### Scenario: Successful skill extraction and installation
- **WHEN** ZIP validation passes
- **THEN** system extracts files to `skills/<skill-name>/` directory
- **THEN** system preserves file permissions and directory structure
- **THEN** system registers skill in skill registry
- **THEN** system displays success message with installed skill name

#### Scenario: Skill name collision
- **WHEN** uploaded skill has same name as existing installed skill
- **THEN** system prompts user with options: "Overwrite", "Keep Both", "Cancel"
- **THEN** if user selects "Overwrite", system backs up existing skill to quarantine directory, then replaces files
- **THEN** if user selects "Keep Both", system renames new skill (appends timestamp) and installs
- **THEN** if user cancels, system aborts installation

#### Scenario: Rollback after failed installation
- **WHEN** installation fails after files are partially extracted
- **THEN** system removes all extracted files from skills directory
- **THEN** system restores backup if this was an overwrite operation
- **THEN** system displays error message with rollback confirmation

#### Scenario: Extraction fails due to permissions
- **WHEN** system lacks write permissions to skills directory
- **THEN** system aborts installation
- **THEN** system displays error "Failed to install: insufficient permissions"
