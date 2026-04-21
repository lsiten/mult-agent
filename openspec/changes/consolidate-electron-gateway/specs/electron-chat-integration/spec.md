## ADDED Requirements

### Requirement: Electron SHALL use HTTP for chat communication

The Electron main process SHALL communicate with the Gateway via HTTP POST requests to `/v1/chat/completions` instead of spawning CLI processes for each message.

#### Scenario: Chat message sent via HTTP
- **WHEN** user sends chat message in Electron app
- **THEN** main process sends POST request to `http://localhost:8642/v1/chat/completions`

#### Scenario: Request uses OpenAI format
- **WHEN** main process sends chat request
- **THEN** request body includes `{"model": "hermes-agent", "messages": [{"role": "user", "content": "..."}], "stream": false}`

#### Scenario: Response parsed from OpenAI format
- **WHEN** Gateway returns completion response
- **THEN** main process extracts assistant message from `response.choices[0].message.content`

#### Scenario: HTTP error handled gracefully
- **WHEN** Gateway returns non-200 status code
- **THEN** main process catches error and returns error message to renderer

### Requirement: Electron SHALL support stateful chat sessions

The Electron app SHALL maintain session continuity by including session identifier in chat requests via `X-Hermes-Session-Id` header.

#### Scenario: New chat creates session
- **WHEN** user starts first chat in Electron app
- **THEN** main process generates new session ID

#### Scenario: Session ID included in subsequent messages
- **WHEN** user sends followup message in same chat
- **THEN** main process includes same session ID in `X-Hermes-Session-Id` header

#### Scenario: Session persists across messages
- **WHEN** user sends multiple messages in conversation
- **THEN** Gateway maintains context using session ID

#### Scenario: New session started on reset
- **WHEN** user explicitly starts new chat
- **THEN** main process generates fresh session ID

### Requirement: Electron SHALL wait for Gateway readiness

The Electron main process SHALL wait for Gateway HTTP server to be ready before marking Python services as started.

#### Scenario: Startup waits for Gateway port
- **WHEN** PythonManager starts Gateway process
- **THEN** main process waits for HTTP port 8642 to be listening

#### Scenario: Health check validates Gateway
- **WHEN** Gateway port is listening
- **THEN** main process optionally sends GET to `/health` to confirm readiness

#### Scenario: Timeout on Gateway startup
- **WHEN** Gateway fails to start within timeout period
- **THEN** main process logs error and notifies user

### Requirement: Electron SHALL connect to single Gateway port

The Electron renderer process SHALL connect to Gateway on port 8642 for both chat API and Dashboard API requests.

#### Scenario: API base URL points to Gateway
- **WHEN** renderer initializes API client
- **THEN** base URL is set to `http://localhost:8642`

#### Scenario: Chat requests go to Gateway
- **WHEN** renderer sends chat message
- **THEN** request goes to `http://localhost:8642/v1/chat/completions`

#### Scenario: Dashboard API requests go to Gateway
- **WHEN** renderer fetches config or sessions
- **THEN** requests go to `http://localhost:8642/api/*`

### Requirement: Electron SHALL remove WebServer process management

The Electron PythonManager SHALL not start or manage the WebServer process, eliminating the dual-server architecture.

#### Scenario: Only Gateway process spawned
- **WHEN** PythonManager starts Python services
- **THEN** only Gateway process is spawned, no WebServer process

#### Scenario: WebServer startup code removed
- **WHEN** reviewing PythonManager implementation
- **THEN** no code references WebServer, port 9119, or dashboard command

#### Scenario: Process cleanup only kills Gateway
- **WHEN** Electron app quits
- **THEN** PythonManager only kills Gateway process

### Requirement: Electron SHALL configure Gateway for dashboard mode

The Electron main process SHALL set environment variables to enable Gateway's integrated dashboard serving.

#### Scenario: Dashboard mode enabled via environment variable
- **WHEN** PythonManager spawns Gateway
- **THEN** environment includes `GATEWAY_ENABLE_DASHBOARD=true`

#### Scenario: Electron mode flag set
- **WHEN** PythonManager spawns Gateway
- **THEN** environment includes `HERMES_ELECTRON_MODE=true` to bypass authentication

#### Scenario: Config path provided to Gateway
- **WHEN** PythonManager spawns Gateway
- **THEN** environment includes `HERMES_CONFIG_PATH` pointing to Electron user data directory

### Requirement: Electron SHALL handle Gateway startup failures

The Electron main process SHALL detect Gateway startup failures and display appropriate error messages to the user.

#### Scenario: Port already in use error handled
- **WHEN** Gateway fails to start because port 8642 is occupied
- **THEN** main process logs error and shows user notification about port conflict

#### Scenario: Python import error handled
- **WHEN** Gateway fails due to missing dependencies
- **THEN** main process logs Python error output and notifies user

#### Scenario: Gateway crash during startup detected
- **WHEN** Gateway process exits with non-zero code during startup
- **THEN** main process logs exit code and error output

### Requirement: Electron SHALL provide Gateway logs to renderer

The Electron main process SHALL forward Gateway stdout/stderr to renderer process for debugging and monitoring.

#### Scenario: Gateway logs sent to renderer
- **WHEN** Gateway process outputs log messages
- **THEN** main process sends logs to renderer via IPC

#### Scenario: Renderer displays Gateway status
- **WHEN** renderer receives Gateway logs
- **THEN** logs displayed in developer console or debug panel
