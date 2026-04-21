## ADDED Requirements

### Requirement: Main process generates auth token in production

The main process SHALL generate a cryptographically secure 32-byte random token when NODE_ENV is 'production'.

#### Scenario: Production environment generates token
- **WHEN** NODE_ENV is 'production'
- **THEN** main process generates 32-byte hex token using crypto.randomBytes(32)

#### Scenario: Development environment skips token
- **WHEN** NODE_ENV is 'development' or 'test'
- **THEN** no auth token is generated and Gateway allows all requests

#### Scenario: Token is logged at startup
- **WHEN** auth token is generated
- **THEN** main process logs "Generated Gateway auth token" (without the actual token)

### Requirement: Main process passes token to Gateway via environment

The main process SHALL pass the auth token to the Gateway process through the GATEWAY_AUTH_TOKEN environment variable.

#### Scenario: Token set in Gateway environment
- **WHEN** GatewayService starts with authToken
- **THEN** GATEWAY_AUTH_TOKEN environment variable contains the token

#### Scenario: No token in development mode
- **WHEN** GatewayService starts without authToken
- **THEN** GATEWAY_AUTH_TOKEN is not set

### Requirement: Gateway validates auth token on API requests

The Python Gateway SHALL validate the Authorization header Bearer token against GATEWAY_AUTH_TOKEN for all API requests except /health.

#### Scenario: Valid token allows request
- **WHEN** request includes "Authorization: Bearer <correct-token>"
- **THEN** Gateway processes the request normally

#### Scenario: Missing token returns 401
- **WHEN** request has no Authorization header
- **THEN** Gateway returns 401 Unauthorized with error "Missing authorization"

#### Scenario: Invalid token returns 403
- **WHEN** request includes "Authorization: Bearer <wrong-token>"
- **THEN** Gateway returns 403 Forbidden with error "Invalid authorization token"

#### Scenario: Health endpoint bypasses auth
- **WHEN** request to /health has no Authorization header
- **THEN** Gateway returns health status without requiring token

### Requirement: Renderer retrieves token via IPC

The renderer process SHALL retrieve the Gateway auth token by calling the gateway:getAuthToken IPC handler.

#### Scenario: Token returned via IPC
- **WHEN** renderer calls gateway:getAuthToken IPC
- **THEN** main process returns { ok: true, data: { token: "<token>" } }

#### Scenario: Development mode returns null token
- **WHEN** renderer calls gateway:getAuthToken in development mode
- **THEN** main process returns { ok: true, data: { token: null } }

### Requirement: ApiClient automatically includes auth token

The web ApiClient class SHALL automatically retrieve and include the auth token in all Gateway API requests.

#### Scenario: Token fetched on first request
- **WHEN** ApiClient makes first request
- **THEN** ApiClient calls gateway:getAuthToken IPC and caches result

#### Scenario: Token included in Authorization header
- **WHEN** ApiClient makes Gateway request
- **THEN** request includes "Authorization: Bearer <token>" header

#### Scenario: Null token skips header
- **WHEN** token is null (development mode)
- **THEN** Authorization header is not added

### Requirement: Token validation added to integration tests

The integration test suite SHALL verify Gateway auth token validation behavior.

#### Scenario: Test valid token acceptance
- **WHEN** test sends request with correct token
- **THEN** test verifies 200 response

#### Scenario: Test missing token rejection
- **WHEN** test sends request without token
- **THEN** test verifies 401 response

#### Scenario: Test invalid token rejection
- **WHEN** test sends request with wrong token
- **THEN** test verifies 403 response
