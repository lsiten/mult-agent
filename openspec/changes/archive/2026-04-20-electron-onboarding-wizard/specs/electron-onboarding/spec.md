## ADDED Requirements

### Requirement: First-run detection
The system SHALL detect whether the user is launching the Electron app for the first time by checking for the existence of a `.onboarding-complete` marker file in the userData config directory.

#### Scenario: First launch without marker file
- **WHEN** the Electron app launches and no `.onboarding-complete` file exists in `userData/config/`
- **THEN** the system SHALL trigger the onboarding wizard display

#### Scenario: Subsequent launch with marker file
- **WHEN** the Electron app launches and `.onboarding-complete` file exists
- **THEN** the system SHALL skip the onboarding wizard and load the main application

#### Scenario: User dismisses onboarding
- **WHEN** the user clicks "Skip Guide" during onboarding
- **THEN** the system SHALL create the `.onboarding-complete` marker file and load the main application

### Requirement: Multi-step wizard flow
The onboarding wizard SHALL present a 4-step sequential flow: Language Selection → LLM Provider Configuration → Optional Features → Completion.

#### Scenario: Step navigation forward
- **WHEN** the user completes step N and clicks "Next"
- **THEN** the system SHALL validate current step data, save configuration, and navigate to step N+1

#### Scenario: Step navigation backward
- **WHEN** the user clicks "Previous" on step N
- **THEN** the system SHALL navigate to step N-1 without validation and retain previously entered data

#### Scenario: Wizard completion
- **WHEN** the user completes step 4 and clicks "Start Using Hermes"
- **THEN** the system SHALL create the `.onboarding-complete` marker file, close the wizard modal, and show the main application

### Requirement: Language selection
The system SHALL allow users to select their preferred interface language from Chinese (Simplified) and English options.

#### Scenario: Default language selection
- **WHEN** the onboarding wizard displays step 1
- **THEN** the system SHALL pre-select Chinese (Simplified) as the default language

#### Scenario: Language change
- **WHEN** the user selects a different language from the dropdown
- **THEN** the system SHALL immediately update all UI text in the wizard to the selected language

#### Scenario: Language persistence
- **WHEN** the user selects a language and proceeds to the next step
- **THEN** the system SHALL persist the language preference to application settings

### Requirement: Dynamic LLM provider configuration
The system SHALL provide a dropdown list of 13+ LLM providers with dynamic form fields based on the selected provider.

#### Scenario: Provider selection
- **WHEN** the user selects a provider from the dropdown
- **THEN** the system SHALL display the appropriate form fields for that provider's configuration requirements

#### Scenario: OAuth provider handling
- **WHEN** the user selects an OAuth-based provider (e.g., Qwen OAuth)
- **THEN** the system SHALL display OAuth-specific instructions with terminal command instead of API key input fields

#### Scenario: API key validation
- **WHEN** the user clicks "Test Connection" with entered API credentials
- **THEN** the system SHALL validate the credentials by making a test API call and display success or error feedback

#### Scenario: Required field validation
- **WHEN** the user attempts to proceed without filling required fields
- **THEN** the system SHALL prevent navigation and display validation error messages

### Requirement: Optional features configuration
The system SHALL provide optional configuration sections for Vision/Image Generation, Browser Automation (with 3 modes), and Web Search tools, all skippable.

#### Scenario: Section toggle
- **WHEN** the user checks or unchecks an optional feature checkbox
- **THEN** the system SHALL show or hide the corresponding configuration fields

#### Scenario: Browser mode selection
- **WHEN** the user selects a browser automation mode (Local Chromium / CDP Local / Browserbase Cloud)
- **THEN** the system SHALL display the relevant configuration fields for that mode only

#### Scenario: Skip optional features
- **WHEN** the user clicks "Skip" on the optional features step
- **THEN** the system SHALL proceed to completion without saving any optional feature configurations

#### Scenario: Save optional configurations
- **WHEN** the user clicks "Save and Complete" with configured optional features
- **THEN** the system SHALL persist all enabled feature configurations to environment variables

### Requirement: Re-trigger capability
The system SHALL provide a mechanism for users to re-open the onboarding wizard after initial completion.

#### Scenario: Re-open from settings
- **WHEN** the user clicks "Show Onboarding Guide" in the application settings or menu
- **THEN** the system SHALL display the onboarding wizard with current configuration pre-filled

#### Scenario: Configuration preservation on re-trigger
- **WHEN** the onboarding wizard is re-opened after initial setup
- **THEN** the system SHALL pre-populate all form fields with existing configuration values

### Requirement: Non-blocking UI
The onboarding wizard SHALL appear as a modal overlay that does not block access to the underlying application interface.

#### Scenario: Wizard dismissal
- **WHEN** the user clicks outside the modal or presses the Escape key
- **THEN** the system SHALL close the wizard modal and allow interaction with the main application

#### Scenario: Incomplete configuration warning
- **WHEN** the user dismisses the wizard without completing LLM provider configuration
- **THEN** the system SHALL display a warning banner indicating limited functionality

### Requirement: Configuration persistence
The system SHALL save user configuration to the `.env` file incrementally as each step is completed.

#### Scenario: Incremental save on step completion
- **WHEN** the user completes a configuration step and proceeds to the next
- **THEN** the system SHALL immediately write the configured environment variables to the `.env` file

#### Scenario: Partial configuration recovery
- **WHEN** the user dismisses the wizard mid-flow and later re-opens it
- **THEN** the system SHALL restore previously saved configuration from the `.env` file
