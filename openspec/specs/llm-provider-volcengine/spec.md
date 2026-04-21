# LLM Provider: Volcano Engine (Doubao)

## Purpose

Enable users to configure and use Volcano Engine (火山引擎) / Doubao (豆包) as an LLM provider through the ARK API, supporting API key authentication and optional custom base URL configuration.

## Requirements

### Requirement: Volcano Engine provider registration
The system SHALL support Volcano Engine (Doubao/豆包) as an LLM provider option with the identifier "volcengine" in the provider configuration system.

#### Scenario: Provider appears in dropdown
- **WHEN** the user opens the LLM provider selection dropdown in onboarding or settings
- **THEN** the system SHALL display "🔥 火山引擎 (豆包/Doubao)" as a selectable option

#### Scenario: Provider appears in EnvPage
- **WHEN** the user navigates to the Keys management page
- **THEN** the system SHALL display Volcano Engine in the LLM Providers section with appropriate grouping

### Requirement: ARK API Key configuration
The system SHALL accept and store an ARK API Key for Volcano Engine provider authentication.

#### Scenario: API key input
- **WHEN** the user selects Volcano Engine provider in onboarding
- **THEN** the system SHALL display an API key input field labeled "ARK API Key" marked as required

#### Scenario: API key validation format
- **WHEN** the user enters an ARK API Key
- **THEN** the system SHALL accept any non-empty string value as a valid key format

#### Scenario: API key persistence
- **WHEN** the user saves Volcano Engine configuration
- **THEN** the system SHALL write the API key to the `ARK_API_KEY` environment variable in `.env` file

#### Scenario: API key redaction in UI
- **WHEN** the system displays a configured ARK API Key in the Keys page
- **THEN** the system SHALL show only the first 4 and last 4 characters with "..." in between

### Requirement: Optional base URL configuration
The system SHALL allow users to optionally configure a custom base URL for Volcano Engine API endpoint.

#### Scenario: Default base URL
- **WHEN** the user configures Volcano Engine without specifying a base URL
- **THEN** the system SHALL use "https://ark.cn-beijing.volces.com/api/v3" as the default endpoint

#### Scenario: Custom base URL input
- **WHEN** the user enters a custom base URL value in the optional field
- **THEN** the system SHALL validate it as a valid HTTP/HTTPS URL format

#### Scenario: Custom base URL persistence
- **WHEN** the user saves Volcano Engine configuration with a custom base URL
- **THEN** the system SHALL write the URL to the `ARK_BASE_URL` environment variable in `.env` file

### Requirement: Provider documentation link
The system SHALL provide a direct link to Volcano Engine API key acquisition page.

#### Scenario: Documentation link display
- **WHEN** the user views Volcano Engine configuration form
- **THEN** the system SHALL display a clickable link labeled "🔗 获取密钥: console.volcengine.com/ark"

#### Scenario: External link navigation
- **WHEN** the user clicks the documentation link
- **THEN** the system SHALL open "https://console.volcengine.com/ark" in the user's default browser

### Requirement: Connection testing
The system SHALL support testing Volcano Engine API connectivity before finalizing configuration.

#### Scenario: Test connection button
- **WHEN** the user fills in ARK API Key and clicks "Test Connection"
- **THEN** the system SHALL make a test API call to Volcano Engine endpoint and display connection status

#### Scenario: Successful connection test
- **WHEN** the test API call succeeds with valid credentials
- **THEN** the system SHALL display a success message and enable the "Next" button

#### Scenario: Failed connection test
- **WHEN** the test API call fails due to invalid credentials or network error
- **THEN** the system SHALL display an error message with failure reason and keep the "Next" button disabled

### Requirement: Provider metadata
The system SHALL provide descriptive metadata for Volcano Engine provider to guide user selection.

#### Scenario: Provider description display
- **WHEN** the user hovers over or selects Volcano Engine in the provider dropdown
- **THEN** the system SHALL display the description "字节跳动 ARK API，支持豆包系列模型"

#### Scenario: Provider emoji icon
- **WHEN** the system displays Volcano Engine in any provider list
- **THEN** the system SHALL prefix the provider name with the 🔥 emoji for visual identification

### Requirement: Configuration file updates
The system SHALL update relevant configuration template files to include Volcano Engine provider documentation.

#### Scenario: Environment example update
- **WHEN** the system generates or distributes `.env.example` file
- **THEN** the file SHALL include a section documenting `ARK_API_KEY` and `ARK_BASE_URL` with usage instructions

#### Scenario: CLI config example update
- **WHEN** the system generates or distributes `cli-config.yaml.example` file
- **THEN** the file SHALL list "volcengine" as a valid provider option in the provider selection comments

#### Scenario: Provider groups update
- **WHEN** the EnvPage renders LLM provider groups
- **THEN** the system SHALL include Volcano Engine in the PROVIDER_GROUPS array with prefix "ARK_" and display name "火山引擎（豆包）"
