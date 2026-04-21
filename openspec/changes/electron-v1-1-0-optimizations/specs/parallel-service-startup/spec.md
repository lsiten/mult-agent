## ADDED Requirements

### Requirement: Application calculates dependency layers

The Application class SHALL analyze service dependencies and group services into layers where services in the same layer have no interdependencies.

#### Scenario: Independent services grouped in same layer
- **WHEN** service A depends on nothing and service B depends on nothing
- **THEN** both services are placed in layer 0

#### Scenario: Dependent services in different layers
- **WHEN** service B depends on service A
- **THEN** service A is in layer 0 and service B is in layer 1

#### Scenario: Transitive dependencies create multiple layers
- **WHEN** service C depends on B which depends on A
- **THEN** service A is in layer 0, B in layer 1, and C in layer 2

### Requirement: Services in same layer start concurrently

The Application class SHALL start all services in the same dependency layer using Promise.all() to maximize parallelism.

#### Scenario: Layer 0 services start in parallel
- **WHEN** starting application with 3 services in layer 0
- **THEN** all 3 services start concurrently via Promise.all()

#### Scenario: Layer 1 waits for layer 0 completion
- **WHEN** layer 0 services are starting
- **THEN** layer 1 services wait until all layer 0 services complete

#### Scenario: Failure in one service does not block others in same layer
- **WHEN** service A fails but service B succeeds in layer 0
- **THEN** service B completes successfully and layer 1 can proceed

### Requirement: Failed services trigger rollback

The Application class SHALL stop all successfully started services in reverse layer order when any required service fails during startup.

#### Scenario: Required service failure triggers rollback
- **WHEN** a required service in layer 1 fails
- **THEN** all started services in layer 0 are stopped in reverse order

#### Scenario: Optional service failure allows continuation
- **WHEN** an optional service fails
- **THEN** startup continues and no rollback occurs

### Requirement: Startup time metrics tracked per layer

The Application class SHALL record start time for each layer to measure parallelization effectiveness.

#### Scenario: Layer timing recorded
- **WHEN** starting services
- **THEN** Application logs time spent on each layer

#### Scenario: Total time vs sequential time comparison
- **WHEN** startup completes
- **THEN** Application logs actual time and theoretical sequential time for comparison
