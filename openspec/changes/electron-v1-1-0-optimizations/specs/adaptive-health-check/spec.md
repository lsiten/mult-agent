## ADDED Requirements

### Requirement: HealthMonitor supports on-demand mode

The HealthMonitor class SHALL support two operational modes: continuous polling and on-demand checking.

#### Scenario: Continuous mode polls at regular intervals
- **WHEN** HealthMonitor is created with mode='continuous' and interval=30000
- **THEN** health checks execute every 30 seconds

#### Scenario: On-demand mode only checks when requested
- **WHEN** HealthMonitor is created with mode='on-demand'
- **THEN** no automatic polling occurs, only manual checkHealth() calls

#### Scenario: Mode can be switched at runtime
- **WHEN** HealthMonitor.setMode('on-demand') is called
- **THEN** continuous polling stops immediately

### Requirement: HealthMonitor stops polling on service stop

The HealthMonitor class SHALL provide a stop() method that halts all polling activity and clears timers.

#### Scenario: Stop clears polling timer
- **WHEN** HealthMonitor.stop() is called during continuous mode
- **THEN** the polling interval timer is cleared

#### Scenario: Stop is idempotent
- **WHEN** HealthMonitor.stop() is called multiple times
- **THEN** no errors occur and polling remains stopped

#### Scenario: Stop does not affect on-demand mode
- **WHEN** HealthMonitor.stop() is called in on-demand mode
- **THEN** future checkHealth() calls still work

### Requirement: GatewayService uses adaptive health check strategy

The GatewayService SHALL use continuous polling during startup (until first success) then switch to on-demand mode during normal operation.

#### Scenario: Startup uses exponential backoff polling
- **WHEN** GatewayService starts
- **THEN** HealthMonitor polls with exponential backoff (50ms, 100ms, 200ms, ...)

#### Scenario: First success switches to on-demand
- **WHEN** first health check succeeds
- **THEN** HealthMonitor switches from continuous to on-demand mode

#### Scenario: IPC calls trigger health check in on-demand mode
- **WHEN** python:getStatus IPC is called and HealthMonitor is in on-demand mode
- **THEN** a health check executes before returning status

### Requirement: Health check failures update circuit breaker

The HealthMonitor SHALL notify the CircuitBreaker on each health check result to enable fail-fast behavior.

#### Scenario: Success resets circuit breaker
- **WHEN** health check succeeds
- **THEN** CircuitBreaker records a success

#### Scenario: Failure increments circuit breaker counter
- **WHEN** health check fails
- **THEN** CircuitBreaker records a failure

#### Scenario: Circuit open prevents further health checks
- **WHEN** CircuitBreaker enters OPEN state
- **THEN** HealthMonitor skips health checks until circuit closes
