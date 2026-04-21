## ADDED Requirements

### Requirement: Gateway SHALL serve plugin static assets

The Gateway SHALL serve static assets (JavaScript, CSS, images) from Dashboard plugin directories via the `/dashboard-plugins/{plugin_name}/{file_path}` route.

#### Scenario: Plugin JavaScript file served
- **WHEN** client requests `/dashboard-plugins/my-plugin/dist/index.js`
- **THEN** Gateway serves the JavaScript file from plugin's dashboard directory

#### Scenario: Plugin CSS file served
- **WHEN** client requests `/dashboard-plugins/my-plugin/dist/styles.css`
- **THEN** Gateway serves the CSS file with `Content-Type: text/css`

#### Scenario: Plugin image asset served
- **WHEN** client requests `/dashboard-plugins/my-plugin/assets/icon.png`
- **THEN** Gateway serves the image file with correct content type

#### Scenario: Nonexistent plugin returns 404
- **WHEN** client requests `/dashboard-plugins/unknown-plugin/index.js`
- **THEN** Gateway returns 404 Not Found

#### Scenario: Nonexistent file in valid plugin returns 404
- **WHEN** client requests `/dashboard-plugins/my-plugin/missing.js`
- **THEN** Gateway returns 404 Not Found

### Requirement: Gateway SHALL prevent path traversal in plugin assets

The Gateway SHALL validate that requested plugin asset paths are within the plugin's directory and reject attempts to access files outside it.

#### Scenario: Normal plugin file access allowed
- **WHEN** client requests `/dashboard-plugins/my-plugin/dist/index.js`
- **THEN** Gateway serves the file if it exists within plugin directory

#### Scenario: Path traversal attempt blocked
- **WHEN** client requests `/dashboard-plugins/my-plugin/../../secrets.yaml`
- **THEN** Gateway returns 403 Forbidden

#### Scenario: Absolute path attempt blocked
- **WHEN** client requests `/dashboard-plugins/my-plugin//etc/passwd`
- **THEN** Gateway returns 403 Forbidden

#### Scenario: Symbolic link traversal blocked
- **WHEN** plugin directory contains symlink pointing outside plugin directory
- **THEN** Gateway rejects request if resolved path is outside plugin directory

### Requirement: Gateway SHALL discover and list Dashboard plugins

The Gateway SHALL discover Dashboard plugins from the skills directory and expose plugin metadata via `/api/dashboard/plugins` endpoint.

#### Scenario: Plugin list includes all discovered plugins
- **WHEN** client requests `/api/dashboard/plugins`
- **THEN** Gateway returns array of plugin metadata (name, label, description, icon, version, tab, entry, css)

#### Scenario: Plugin metadata excludes internal fields
- **WHEN** client requests `/api/dashboard/plugins`
- **THEN** response does not include fields starting with underscore

#### Scenario: Force rescan updates plugin cache
- **WHEN** client requests `/api/dashboard/plugins/rescan`
- **THEN** Gateway re-scans plugin directories and returns updated count

### Requirement: Gateway SHALL mount plugin API routes dynamically

The Gateway SHALL dynamically import and mount API router modules from plugins that declare backend API endpoints.

#### Scenario: Plugin with API routes mounted
- **WHEN** plugin manifest declares `api: "backend.py"` with exported `router`
- **THEN** Gateway mounts routes under `/api/plugins/{plugin_name}/`

#### Scenario: Plugin API endpoint accessible
- **WHEN** client requests `/api/plugins/my-plugin/data`
- **THEN** Gateway routes to plugin's registered handler

#### Scenario: Plugin without API file skipped
- **WHEN** plugin declares `api` but file does not exist
- **THEN** Gateway logs warning and continues without mounting routes

#### Scenario: Plugin module without router attribute skipped
- **WHEN** plugin API file exists but has no `router` export
- **THEN** Gateway logs warning and continues without mounting routes

#### Scenario: Plugin API loading error logged
- **WHEN** plugin API file contains import errors or syntax errors
- **THEN** Gateway logs error details and continues without crashing

### Requirement: Gateway SHALL validate plugin manifests

The Gateway SHALL parse plugin `dashboard-plugin.json` manifests and validate required fields before registering plugins.

#### Scenario: Valid plugin manifest loaded
- **WHEN** plugin directory contains valid `dashboard-plugin.json`
- **THEN** Gateway registers plugin with extracted metadata

#### Scenario: Invalid JSON manifest skipped
- **WHEN** plugin manifest contains malformed JSON
- **THEN** Gateway logs warning and skips the plugin

#### Scenario: Missing required fields logged
- **WHEN** plugin manifest missing required fields (name, label)
- **THEN** Gateway logs warning with missing field names

### Requirement: Gateway SHALL cache plugin discovery results

The Gateway SHALL cache discovered plugin list in memory and only re-scan when explicitly requested.

#### Scenario: Initial plugin discovery caches results
- **WHEN** Gateway first accesses plugin list
- **THEN** plugins discovered and stored in memory cache

#### Scenario: Subsequent requests use cache
- **WHEN** client requests `/api/dashboard/plugins` multiple times
- **THEN** Gateway returns cached results without re-scanning filesystem

#### Scenario: Rescan endpoint clears cache
- **WHEN** client requests `/api/dashboard/plugins/rescan`
- **THEN** Gateway clears cache and performs fresh filesystem scan

### Requirement: Gateway SHALL determine plugin source location

The Gateway SHALL correctly locate plugin directories in both skill-based and optional-skills directories.

#### Scenario: Plugin in skills directory discovered
- **WHEN** plugin exists in `HERMES_HOME/skills/{name}/dashboard/`
- **THEN** Gateway registers plugin with source "skills"

#### Scenario: Plugin in optional-skills directory discovered
- **WHEN** plugin exists in `HERMES_HOME/optional-skills/{name}/dashboard/`
- **THEN** Gateway registers plugin with source "optional-skills"
