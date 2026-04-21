## ADDED Requirements

### Requirement: Gateway SHALL serve static SPA assets

The Gateway SHALL serve all static assets (HTML, CSS, JavaScript, images, fonts) for the Dashboard single-page application from the configured web distribution directory.

#### Scenario: Index HTML served at root path
- **WHEN** client navigates to `/`
- **THEN** Gateway serves `index.html` from web_dist directory

#### Scenario: JavaScript bundles served from assets path
- **WHEN** client requests `/assets/index-ABC123.js`
- **THEN** Gateway serves the JavaScript file with correct `Content-Type: application/javascript`

#### Scenario: CSS files served with correct content type
- **WHEN** client requests `/assets/index-DEF456.css`
- **THEN** Gateway serves the CSS file with `Content-Type: text/css`

#### Scenario: Image assets served
- **WHEN** client requests `/assets/logo.svg`
- **THEN** Gateway serves the SVG file with `Content-Type: image/svg+xml`

#### Scenario: Font files served
- **WHEN** client requests `/assets/font.woff2`
- **THEN** Gateway serves the font file with `Content-Type: font/woff2`

### Requirement: Gateway SHALL inject session token into index.html

The Gateway SHALL inject an ephemeral session token into the `index.html` file before serving it, making the token available to the frontend JavaScript via `window.__HERMES_SESSION_TOKEN__`.

#### Scenario: Token injected in head section
- **WHEN** Gateway serves `index.html`
- **THEN** HTML contains `<script>window.__HERMES_SESSION_TOKEN__="...";</script>` before `</head>` tag

#### Scenario: Token is fresh on each server start
- **WHEN** Gateway process starts
- **THEN** a new cryptographically secure token is generated

#### Scenario: Token remains constant during server lifetime
- **WHEN** multiple clients request `index.html` from same Gateway instance
- **THEN** all receive the same session token

### Requirement: Gateway SHALL support client-side routing fallback

The Gateway SHALL serve `index.html` for all non-file paths to support client-side routing in the SPA, while returning 404 for missing static files.

#### Scenario: Client-side route serves index.html
- **WHEN** client navigates to `/sessions` (no file extension)
- **THEN** Gateway serves `index.html` with token injection

#### Scenario: Deep client-side route serves index.html
- **WHEN** client navigates to `/sessions/abc-123/messages`
- **THEN** Gateway serves `index.html` with token injection

#### Scenario: Missing static file returns 404
- **WHEN** client requests `/assets/nonexistent.js`
- **THEN** Gateway returns 404 Not Found

#### Scenario: API routes not intercepted by fallback
- **WHEN** client requests `/api/config`
- **THEN** Gateway routes to API handler, not SPA fallback

### Requirement: Gateway SHALL set cache control headers appropriately

The Gateway SHALL set appropriate cache control headers for static assets to optimize performance while ensuring index.html is never cached.

#### Scenario: Index HTML not cached
- **WHEN** Gateway serves `index.html`
- **THEN** response includes `Cache-Control: no-store, no-cache, must-revalidate`

#### Scenario: Hashed assets cacheable
- **WHEN** Gateway serves `/assets/index-ABC123.js` (content-hashed filename)
- **THEN** response includes cache headers allowing long-term caching

### Requirement: Gateway SHALL resolve web distribution directory correctly

The Gateway SHALL locate the web distribution directory in both development and production environments, including Electron bundled mode.

#### Scenario: Electron mode uses bundled web_dist
- **WHEN** `HERMES_ELECTRON_MODE=true` environment variable is set
- **THEN** Gateway resolves web_dist from bundled Python code location

#### Scenario: Standard installation uses package web_dist
- **WHEN** running in standard CLI mode
- **THEN** Gateway resolves web_dist from installed hermes_cli package

#### Scenario: Missing web_dist returns helpful error
- **WHEN** web_dist directory does not exist
- **THEN** Gateway returns JSON error indicating frontend not built

### Requirement: Gateway SHALL serve 404 page for unknown routes

The Gateway SHALL return appropriate 404 response for paths that don't match API routes, static assets, or valid SPA routes.

#### Scenario: Unknown API endpoint returns JSON 404
- **WHEN** client requests `/api/unknown/endpoint`
- **THEN** Gateway returns 404 with JSON error response

#### Scenario: Malformed path returns 404
- **WHEN** client requests path with invalid characters
- **THEN** Gateway returns 404 Not Found
