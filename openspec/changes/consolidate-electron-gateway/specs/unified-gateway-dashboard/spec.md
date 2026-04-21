## ADDED Requirements

### Requirement: Gateway SHALL serve all Dashboard REST API endpoints

The Gateway server SHALL provide all Dashboard management API endpoints under the `/api/` path prefix, supporting configuration management, session management, environment variables, logs, cron jobs, skills, analytics, tools, OAuth providers, and plugin management.

#### Scenario: Config API endpoints available
- **WHEN** client sends GET request to `/api/config`
- **THEN** Gateway returns current configuration as JSON

#### Scenario: Session listing endpoint available
- **WHEN** client sends GET request to `/api/sessions?limit=20&offset=0`
- **THEN** Gateway returns paginated list of sessions

#### Scenario: Environment variable update endpoint available
- **WHEN** client sends PUT request to `/api/env` with `{"key": "API_KEY", "value": "secret"}`
- **THEN** Gateway updates the environment variable and returns `{"ok": true}`

#### Scenario: Logs retrieval endpoint available
- **WHEN** client sends GET request to `/api/logs?lines=100`
- **THEN** Gateway returns the last 100 log lines

#### Scenario: Cron job management endpoints available
- **WHEN** client sends GET request to `/api/cron/jobs`
- **THEN** Gateway returns list of all cron jobs

### Requirement: Gateway SHALL authenticate Dashboard API requests

The Gateway SHALL enforce session token authentication on all `/api/` endpoints except explicitly public ones, using Bearer token verification with constant-time comparison.

#### Scenario: Authenticated request succeeds
- **WHEN** client sends request to `/api/config` with valid `Authorization: Bearer <token>` header
- **THEN** Gateway processes the request and returns data

#### Scenario: Unauthenticated request fails
- **WHEN** client sends request to `/api/config` without Authorization header
- **THEN** Gateway returns 401 Unauthorized

#### Scenario: Invalid token fails
- **WHEN** client sends request to `/api/config` with invalid token
- **THEN** Gateway returns 401 Unauthorized

#### Scenario: Electron mode bypasses authentication
- **WHEN** `HERMES_ELECTRON_MODE=true` environment variable is set
- **THEN** Gateway allows all Dashboard API requests without token validation

### Requirement: Gateway SHALL maintain API backward compatibility

The Gateway SHALL provide identical request/response schemas as the original WebServer for all Dashboard API endpoints to ensure frontend compatibility.

#### Scenario: Config API response format matches WebServer
- **WHEN** client requests `/api/config`
- **THEN** response structure matches original FastAPI WebServer format

#### Scenario: Error response format matches WebServer
- **WHEN** API request fails with validation error
- **THEN** error response uses same JSON structure as WebServer `{"error": "message"}`

#### Scenario: Pagination parameters work identically
- **WHEN** client requests `/api/sessions?limit=10&offset=20`
- **THEN** pagination behaves identically to WebServer implementation

### Requirement: Gateway SHALL validate request payloads

The Gateway SHALL validate all incoming request JSON payloads for required fields and correct types before processing.

#### Scenario: Valid config update accepted
- **WHEN** client sends PUT to `/api/config` with `{"config": {"model": "claude-4"}}`
- **THEN** Gateway validates the payload and processes the update

#### Scenario: Invalid JSON rejected
- **WHEN** client sends malformed JSON to `/api/config`
- **THEN** Gateway returns 400 Bad Request with error message

#### Scenario: Missing required field rejected
- **WHEN** client sends PUT to `/api/env` without `key` field
- **THEN** Gateway returns 400 Bad Request indicating missing field

#### Scenario: Incorrect type rejected
- **WHEN** client sends PUT to `/api/config` with `{"config": "not-a-dict"}`
- **THEN** Gateway returns 400 Bad Request indicating type error

### Requirement: Gateway SHALL support full-text session search

The Gateway SHALL provide FTS5-based full-text search across session message content via `/api/sessions/search` endpoint.

#### Scenario: Search query returns matching sessions
- **WHEN** client sends GET to `/api/sessions/search?q=docker&limit=20`
- **THEN** Gateway returns sessions containing "docker" in messages

#### Scenario: Empty query rejected
- **WHEN** client sends GET to `/api/sessions/search` without `q` parameter
- **THEN** Gateway returns 400 Bad Request

#### Scenario: Prefix matching works
- **WHEN** client searches with query "kub"
- **THEN** Gateway matches messages containing "kubernetes", "kubectl", etc.

### Requirement: Gateway SHALL support OAuth provider management

The Gateway SHALL provide endpoints for managing OAuth provider configurations and handling OAuth flows for third-party integrations.

#### Scenario: List OAuth providers
- **WHEN** client sends GET to `/api/providers/oauth`
- **THEN** Gateway returns list of configured OAuth providers

#### Scenario: Delete OAuth provider
- **WHEN** client sends DELETE to `/api/providers/oauth/{provider_id}`
- **THEN** Gateway removes the provider configuration

#### Scenario: Initiate OAuth flow
- **WHEN** client sends POST to `/api/providers/oauth/{provider_id}/start`
- **THEN** Gateway initiates OAuth flow and returns session info

### Requirement: Gateway SHALL support cron job operations

The Gateway SHALL provide full CRUD operations for cron job management including creation, update, pause, resume, trigger, and deletion.

#### Scenario: Create new cron job
- **WHEN** client sends POST to `/api/cron/jobs` with job definition
- **THEN** Gateway creates the job and returns job ID

#### Scenario: Pause running cron job
- **WHEN** client sends POST to `/api/cron/jobs/{job_id}/pause`
- **THEN** Gateway pauses the job and returns success

#### Scenario: Manually trigger cron job
- **WHEN** client sends POST to `/api/cron/jobs/{job_id}/trigger`
- **THEN** Gateway executes the job immediately
