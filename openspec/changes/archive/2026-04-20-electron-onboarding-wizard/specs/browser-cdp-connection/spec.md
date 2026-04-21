## ADDED Requirements

### Requirement: CDP connection mode option
The system SHALL provide "CDP Local Chrome" as a browser automation mode option alongside existing "Local Chromium" and "Browserbase Cloud" options.

#### Scenario: Mode selection display
- **WHEN** the user views browser automation configuration in onboarding optional features step
- **THEN** the system SHALL display three radio button options: "Local Chromium (推荐，免费)", "CDP 连接本地 Chrome", and "Browserbase 云端浏览器"

#### Scenario: CDP mode selection
- **WHEN** the user selects "CDP 连接本地 Chrome" radio button
- **THEN** the system SHALL hide fields for other modes and display CDP-specific configuration fields

### Requirement: CDP WebSocket URL configuration
The system SHALL accept and store a Chrome DevTools Protocol WebSocket URL for connecting to a local Chrome instance.

#### Scenario: CDP URL input field
- **WHEN** the user selects CDP connection mode
- **THEN** the system SHALL display an input field labeled "CDP URL" with placeholder "ws://localhost:9222"

#### Scenario: WebSocket URL validation
- **WHEN** the user enters a CDP URL value
- **THEN** the system SHALL validate that the URL starts with "ws://" or "wss://" protocol

#### Scenario: CDP URL persistence
- **WHEN** the user saves browser configuration with CDP URL
- **THEN** the system SHALL write the URL to the `BROWSER_CDP_URL` environment variable in `.env` file

#### Scenario: Empty CDP URL handling
- **WHEN** the user selects CDP mode but leaves the URL field empty
- **THEN** the system SHALL treat it as unconfigured and not set `BROWSER_CDP_URL` environment variable

### Requirement: CDP setup instructions
The system SHALL provide user-friendly instructions for obtaining the CDP WebSocket URL from Chrome browser.

#### Scenario: Instruction display
- **WHEN** the user selects CDP connection mode
- **THEN** the system SHALL display a help text "💡 在 Chrome 中访问 chrome://inspect/#remote-debugging 复制 WebSocket URL"

#### Scenario: Chrome inspect page guidance
- **WHEN** the CDP URL input field is focused
- **THEN** the system SHALL show tooltip or inline help explaining how to enable remote debugging in Chrome

### Requirement: CDP endpoint resolution
The system SHALL support automatic resolution of CDP endpoints from discovery URLs when possible.

#### Scenario: Full WebSocket URL input
- **WHEN** the user enters a complete WebSocket URL like "ws://localhost:9222/devtools/browser/xxxxx"
- **THEN** the system SHALL accept and use it directly without modification

#### Scenario: Host-only URL input
- **WHEN** the user enters a host-only URL like "ws://localhost:9222"
- **THEN** the system SHALL attempt to discover the full WebSocket debugger URL via the CDP version endpoint

#### Scenario: Discovery failure fallback
- **WHEN** CDP endpoint discovery fails for a host-only URL
- **THEN** the system SHALL use the provided URL as-is and log a warning about potential connection issues

### Requirement: Connection testing
The system SHALL allow users to test CDP connection before saving configuration.

#### Scenario: Test connection availability
- **WHEN** the user enters a CDP URL and clicks "Test Connection"
- **THEN** the system SHALL attempt to connect to the WebSocket endpoint and report success or failure

#### Scenario: Successful CDP test
- **WHEN** the CDP connection test succeeds
- **THEN** the system SHALL display a success message confirming Chrome browser is accessible

#### Scenario: Failed CDP test
- **WHEN** the CDP connection test fails
- **THEN** the system SHALL display an error message with troubleshooting guidance (check Chrome is running with remote debugging enabled)

### Requirement: Visual distinction from cloud options
The system SHALL clearly indicate that CDP connection is a local, zero-cost option compared to cloud services.

#### Scenario: Mode description display
- **WHEN** the user views browser automation mode options
- **THEN** each mode SHALL display a brief description: Local Chromium shows "零成本本地方案", CDP shows "连接本地 Chrome 浏览器", Browserbase shows "云端浏览器服务"

#### Scenario: Cost indicator
- **WHEN** the user compares browser automation modes
- **THEN** the system SHALL visually indicate that Local Chromium and CDP are free options while Browserbase requires paid credentials

### Requirement: Configuration precedence
The system SHALL prioritize CDP connection over other browser modes when `BROWSER_CDP_URL` is set.

#### Scenario: CDP override behavior
- **WHEN** both `BROWSER_CDP_URL` and Browserbase credentials are configured
- **THEN** the browser tool SHALL use the CDP connection and ignore Browserbase configuration

#### Scenario: CDP to default fallback
- **WHEN** `BROWSER_CDP_URL` is set but the connection fails
- **THEN** the system SHALL fall back to Local Chromium mode with a warning log

### Requirement: Environment variable exposure
The system SHALL expose `BROWSER_CDP_URL` configuration in the onboarding UI even though the underlying browser tool already supports it.

#### Scenario: Pre-existing configuration detection
- **WHEN** the onboarding wizard loads and `BROWSER_CDP_URL` is already set in `.env`
- **THEN** the system SHALL pre-select CDP mode and pre-fill the URL input field with the existing value

#### Scenario: Documentation consistency
- **WHEN** the system generates or distributes `.env.example` file
- **THEN** the file SHALL include a section documenting `BROWSER_CDP_URL` with Chrome inspect URL guidance

### Requirement: Chrome remote debugging guidance
The system SHALL provide actionable instructions for enabling Chrome remote debugging.

#### Scenario: Chrome launch command display
- **WHEN** the user views CDP configuration help documentation
- **THEN** the system SHALL display example Chrome launch commands with `--remote-debugging-port=9222` flag for different platforms

#### Scenario: Security warning
- **WHEN** the user configures CDP connection
- **THEN** the system SHALL display a notice that remote debugging exposes Chrome to local network and should be used on trusted networks only
