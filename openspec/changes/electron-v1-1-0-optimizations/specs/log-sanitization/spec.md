## ADDED Requirements

### Requirement: sanitizeLog function redacts API keys

The sanitizeLog utility function SHALL detect and redact API keys in various formats using regular expressions.

#### Scenario: OpenAI API key redacted
- **WHEN** log contains "OPENAI_API_KEY=sk-abc123xyz"
- **THEN** output is "OPENAI_API_KEY=[REDACTED]"

#### Scenario: Generic API key pattern redacted
- **WHEN** log contains "api_key: AIzaSyD_abc123"
- **THEN** output is "api_key: [REDACTED]"

#### Scenario: Anthropic API key redacted
- **WHEN** log contains "ANTHROPIC_API_KEY=sk-ant-api03-xyz"
- **THEN** output is "ANTHROPIC_API_KEY=[REDACTED]"

### Requirement: sanitizeLog function redacts Bearer tokens

The sanitizeLog utility function SHALL detect and redact Bearer tokens in Authorization headers.

#### Scenario: Bearer token in header redacted
- **WHEN** log contains "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
- **THEN** output is "Authorization: Bearer [REDACTED]"

#### Scenario: Case-insensitive Bearer detection
- **WHEN** log contains "authorization: bearer abc123"
- **THEN** output is "authorization: bearer [REDACTED]"

### Requirement: sanitizeLog function redacts passwords

The sanitizeLog utility function SHALL detect and redact password fields in various formats.

#### Scenario: Password in key-value pair redacted
- **WHEN** log contains "password=mysecretpass"
- **THEN** output is "password=[REDACTED]"

#### Scenario: Password in JSON redacted
- **WHEN** log contains '{"password": "abc123"}'
- **THEN** output is '{"password": "[REDACTED]"}'

#### Scenario: Password in URL query string redacted
- **WHEN** log contains "?username=user&password=secret123"
- **THEN** output is "?username=user&password=[REDACTED]"

### Requirement: sanitizeLog function redacts JWT tokens

The sanitizeLog utility function SHALL detect and redact JWT tokens by their distinctive structure (three base64 segments separated by dots).

#### Scenario: JWT token redacted
- **WHEN** log contains "token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
- **THEN** output is "token: [REDACTED]"

### Requirement: sanitizeLog function redacts email addresses

The sanitizeLog utility function SHALL detect and redact email addresses to prevent PII leakage.

#### Scenario: Email address redacted
- **WHEN** log contains "user@example.com registered"
- **THEN** output is "[EMAIL_REDACTED] registered"

#### Scenario: Multiple emails in one line
- **WHEN** log contains "from: alice@test.com to: bob@test.com"
- **THEN** output is "from: [EMAIL_REDACTED] to: [EMAIL_REDACTED]"

### Requirement: GatewayService applies sanitization to all logs

The GatewayService SHALL pass all stdout and stderr output through sanitizeLog before forwarding to the window or writing to log files.

#### Scenario: Gateway stdout sanitized
- **WHEN** Gateway prints "Starting with API_KEY=sk-abc123"
- **THEN** window receives "Starting with API_KEY=[REDACTED]"

#### Scenario: Gateway stderr sanitized
- **WHEN** Gateway error includes Bearer token
- **THEN** error callback receives sanitized message

### Requirement: ProcessManager sanitizes process output

The ProcessManager class SHALL apply sanitizeLog to all process stdout and stderr before invoking callbacks.

#### Scenario: Stdout callback receives sanitized output
- **WHEN** process outputs "password=secret"
- **THEN** stdout callback receives "password=[REDACTED]"

#### Scenario: Exit messages do not leak secrets
- **WHEN** process exits with error containing API key
- **THEN** exit callback receives sanitized error message
