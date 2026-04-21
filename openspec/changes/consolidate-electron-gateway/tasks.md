## 1. Gateway Foundation

- [x] 1.1 Create `gateway/platforms/api_server_validation.py` with validation helpers
- [x] 1.2 Add `validate_json_body()` function with schema dict support
- [x] 1.3 Add `require_fields()` function for required field checking
- [x] 1.4 Add `parse_request_json()` async helper for request parsing
- [x] 1.5 Add `ValidationError` exception class with status code
- [x] 1.6 Write unit tests for validation helpers

## 2. Static File Serving

- [x] 2.1 Add `_resolve_web_dist_path()` method to APIServerAdapter
- [x] 2.2 Implement Electron mode path resolution (app/python/hermes_cli/web_dist)
- [x] 2.3 Implement standard mode path resolution (package hermes_cli/web_dist)
- [x] 2.4 Add `_session_token` generation in APIServerAdapter.__init__
- [x] 2.5 Implement `_handle_spa_fallback()` with index.html serving
- [x] 2.6 Add session token injection via string replacement
- [x] 2.7 Add cache control headers for index.html (no-store)
- [x] 2.8 Add static assets route `/assets/*` using aiohttp StaticFiles
- [x] 2.9 Add SPA fallback route `/*` (must be last in routing order)
- [x] 2.10 Handle missing web_dist with helpful error response
- [x] 2.11 Write tests for token injection and SPA routing

## 3. Config API Handlers

- [x] 3.1 Create `gateway/platforms/api_server_config.py` with ConfigAPIHandlers class
- [x] 3.2 Implement `_check_auth()` method with Electron mode bypass
- [x] 3.3 Implement `handle_get_config()` - GET /api/config
- [x] 3.4 Implement `handle_get_config_defaults()` - GET /api/config/defaults
- [x] 3.5 Implement `handle_get_config_schema()` - GET /api/config/schema
- [x] 3.6 Implement `handle_put_config()` - PUT /api/config with validation
- [x] 3.7 Implement `handle_get_config_raw()` - GET /api/config/raw
- [x] 3.8 Implement `handle_put_config_raw()` - PUT /api/config/raw
- [x] 3.9 Write unit tests for Config API handlers
- [ ] 3.10 Integration test Config API with actual frontend

## 4. Env API Handlers

- [x] 4.[1-7] Create `gateway/platforms/api_server_env.py` with EnvAPIHandlers class
- [x] 4.[1-7] Implement `handle_get_env()` - GET /api/env (masked values)
- [x] 4.[1-7] Implement `handle_set_env()` - PUT /api/env with key/value validation
- [x] 4.[1-7] Implement `handle_delete_env()` - DELETE /api/env with key validation
- [x] 4.[1-7] Implement `handle_reveal_env()` - POST /api/env/reveal with rate limiting
- [x] 4.[1-7] Add rate limit tracking for reveal endpoint (5 per 30s window)
- [x] 4.[1-7] Write unit tests for Env API handlers
- [ ] 4.8 Integration test Env API with actual frontend

## 5. Sessions API Handlers

- [x] 5.[1-8] Create `gateway/platforms/api_server_sessions.py` with SessionsAPIHandlers class
- [x] 5.[1-8] Implement `handle_get_sessions()` - GET /api/sessions with pagination
- [x] 5.[1-8] Implement `handle_search_sessions()` - GET /api/sessions/search with FTS5
- [x] 5.[1-8] Add FTS5 prefix query preparation (term* matching)
- [x] 5.[1-8] Implement `handle_get_session()` - GET /api/sessions/{id}
- [x] 5.[1-8] Implement `handle_get_messages()` - GET /api/sessions/{id}/messages
- [x] 5.[1-8] Implement `handle_delete_session()` - DELETE /api/sessions/{id}
- [x] 5.[1-8] Write unit tests for Sessions API handlers
- [ ] 5.9 Integration test Sessions API with actual frontend

## 6. Logs API Handlers

- [x] 6.[1-4] Create `gateway/platforms/api_server_logs.py` with LogsAPIHandlers class
- [x] 6.[1-4] Implement `handle_get_logs()` - GET /api/logs with query params
- [x] 6.[1-4] Add support for file, lines, level, component filters
- [x] 6.[1-4] Write unit tests for Logs API handlers
- [ ] 6.5 Integration test Logs API with actual frontend

## 7. Cron API Handlers

- [x] 7.1 Create `gateway/platforms/api_server_cron.py` with CronAPIHandlers class
- [x] 7.2 Implement `handle_list_jobs()` - GET /api/cron/jobs
- [x] 7.3 Implement `handle_get_job()` - GET /api/cron/jobs/{id}
- [x] 7.4 Implement `handle_create_job()` - POST /api/cron/jobs with validation
- [x] 7.5 Implement `handle_update_job()` - PUT /api/cron/jobs/{id}
- [x] 7.6 Implement `handle_pause_job()` - POST /api/cron/jobs/{id}/pause
- [x] 7.7 Implement `handle_resume_job()` - POST /api/cron/jobs/{id}/resume
- [x] 7.8 Implement `handle_trigger_job()` - POST /api/cron/jobs/{id}/trigger
- [x] 7.9 Implement `handle_delete_job()` - DELETE /api/cron/jobs/{id}
- [x] 7.10 Write unit tests for Cron API handlers
- [ ] 7.11 Integration test Cron API with actual frontend

## 8. Skills API Handlers

- [x] 8.[1-4] Create `gateway/platforms/api_server_skills.py` with SkillsAPIHandlers class
- [x] 8.[1-4] Implement `handle_list_skills()` - GET /api/skills
- [x] 8.[1-4] Implement `handle_toggle_skill()` - PUT /api/skills/toggle
- [x] 8.[1-4] Write unit tests for Skills API handlers
- [ ] 8.5 Integration test Skills API with actual frontend

## 9. Tools API Handlers

- [x] 9.[1-3] Create `gateway/platforms/api_server_tools.py` with ToolsAPIHandlers class
- [x] 9.[1-3] Implement `handle_get_toolsets()` - GET /api/tools/toolsets
- [x] 9.[1-3] Write unit tests for Tools API handlers
- [ ] 9.4 Integration test Tools API with actual frontend

## 10. Analytics API Handlers

- [x] 10.[1-4] Create `gateway/platforms/api_server_analytics.py` with AnalyticsAPIHandlers class
- [x] 10.[1-4] Implement `handle_get_usage()` - GET /api/analytics/usage
- [x] 10.[1-4] Add support for days parameter
- [x] 10.[1-4] Write unit tests for Analytics API handlers
- [ ] 10.5 Integration test Analytics API with actual frontend

## 11. OAuth Providers API Handlers

- [x] 11.[1-8] Create `gateway/platforms/api_server_oauth.py` with OAuthAPIHandlers class
- [x] 11.[1-8] Implement `handle_list_providers()` - GET /api/providers/oauth
- [x] 11.[1-8] Implement `handle_delete_provider()` - DELETE /api/providers/oauth/{id}
- [x] 11.[1-8] Implement `handle_start_oauth()` - POST /api/providers/oauth/{id}/start
- [x] 11.[1-8] Implement `handle_submit_oauth()` - POST /api/providers/oauth/{id}/submit
- [x] 11.[1-8] Implement `handle_poll_oauth()` - GET /api/providers/oauth/{id}/poll/{session_id}
- [x] 11.[1-8] Implement `handle_delete_session()` - DELETE /api/providers/oauth/sessions/{id}
- [x] 11.[1-8] Write unit tests for OAuth API handlers
- [ ] 11.9 Integration test OAuth API with actual frontend

## 12. Dashboard Plugins API Handlers

- [x] 12.1 Create `gateway/platforms/api_server_plugins.py` with PluginsAPIHandlers class
- [x] 12.2 Port `_discover_dashboard_plugins()` function from web_server.py
- [x] 12.3 Implement plugin discovery from skills and optional-skills directories
- [x] 12.4 Add plugin manifest validation (dashboard-plugin.json)
- [x] 12.5 Implement `handle_get_plugins()` - GET /api/dashboard/plugins
- [x] 12.6 Implement `handle_rescan_plugins()` - GET /api/dashboard/plugins/rescan
- [x] 12.7 Implement `handle_plugin_asset()` - GET /dashboard-plugins/{name}/{path}
- [x] 12.8 Add path traversal protection for plugin assets
- [x] 12.9 Implement plugin API route mounting (`_mount_plugin_api_routes()`)
- [x] 12.10 Add content-type detection for plugin assets
- [x] 12.11 Write unit tests for Plugins API handlers
- [ ] 12.12 Integration test Plugins API with actual frontend

## 13. Theme API Handlers

- [x] 13.[1-4] Create `gateway/platforms/api_server_themes.py` with ThemesAPIHandlers class
- [x] 13.[1-4] Implement `handle_get_themes()` - GET /api/dashboard/themes
- [x] 13.[1-4] Implement `handle_set_theme()` - PUT /api/dashboard/theme
- [x] 13.[1-4] Write unit tests for Theme API handlers
- [ ] 13.5 Integration test Theme API with actual frontend

## 14. Gateway Route Integration

- [x] 14.1 Import all handler classes in api_server.py __init__
- [x] 14.2 Instantiate handler classes with session_token in APIServerAdapter
- [x] 14.3 Create `_setup_dashboard_api_routes()` method
- [x] 14.4 Add all Config API routes to router
- [x] 14.5 Add all Env API routes to router
- [x] 14.6 Add all Sessions API routes to router
- [x] 14.7 Add all Logs API routes to router
- [x] 14.8 Add all Cron API routes to router
- [x] 14.9 Add all Skills API routes to router
- [x] 14.10 Add all Tools API routes to router
- [x] 14.11 Add all Analytics API routes to router
- [x] 14.12 Add all OAuth API routes to router
- [x] 14.13 Add all Plugins API routes to router
- [x] 14.14 Add all Theme API routes to router
- [x] 14.15 Call `_setup_dashboard_api_routes()` in `_setup_routes()`
- [x] 14.16 Ensure API routes registered before static/SPA routes

## 15. Model Info API

- [x] 15.1 Add `handle_get_model_info()` to existing or new handler
- [x] 15.2 Implement GET /api/model/info endpoint
- [x] 15.3 Return model configuration from runtime config
- [x] 15.4 Write unit tests for model info endpoint
- [ ] 15.5 Integration test with actual frontend

## 16. Electron PythonManager Changes

- [x] 16.1 Remove `webServerProcess` property from PythonManager class
- [x] 16.2 Remove `startWebServer()` method from PythonManager
- [x] 16.3 Remove WebServer process management from `stop()` method
- [x] 16.4 Add `GATEWAY_ENABLE_DASHBOARD=true` to Gateway environment
- [x] 16.5 Remove WebServer stdout/stderr handlers
- [x] 16.6 Update `isRunning()` to only check Gateway process
- [x] 16.7 Update log messages to remove WebServer references

## 17. Electron Chat IPC Handler

- [x] 17.1 Remove old `chat:sendMessage` IPC handler that spawns CLI
- [x] 17.2 Implement new HTTP-based `chat:sendMessage` handler
- [x] 17.3 Add fetch call to `http://localhost:8642/v1/chat/completions`
- [x] 17.4 Format request body as OpenAI chat completions format
- [x] 17.5 Set `stream: false` in request body
- [x] 17.6 Add session ID management (generate on first chat)
- [x] 17.7 Include `X-Hermes-Session-Id` header in requests
- [x] 17.8 Parse response and extract assistant message content
- [x] 17.9 Add error handling for HTTP failures
- [x] 17.10 Add error handling for Gateway not ready

## 18. Electron Gateway Readiness Check

- [x] 18.1 Add Gateway health check function to PythonManager
- [x] 18.2 Implement polling GET /health with timeout
- [x] 18.3 Call health check after Gateway process spawn
- [x] 18.4 Add 3 second startup delay before declaring success
- [x] 18.5 Log Gateway startup errors prominently
- [x] 18.6 Show user notification on Gateway startup failure

## 19. Electron Frontend Changes

- [x] 19.1 Update `web/src/lib/api.ts` BASE constant
- [x] 19.2 Change Electron mode base URL from 9119 to 8642
- [x] 19.3 Verify all API calls use BASE prefix
- [x] 19.4 Test frontend connects successfully to Gateway

## 20. Electron Build and Packaging

- [x] 20.1 Update `bundle-python.sh` to copy web_dist directory
- [x] 20.2 Add web_dist to `electron-app/app/` structure
- [x] 20.3 Verify web_dist exists in packaged app bundle
- [x] 20.4 Test packaged Electron app startup
- [x] 20.5 Test Dashboard access in packaged app
- [x] 20.6 Test chat functionality in packaged app

## 21. Testing

- [x] 21.1 Run all unit tests for Gateway handlers
- [ ] 21.2 Run all integration tests with actual frontend
- [x] 21.3 Manual test: Start Electron app in dev mode
- [x] 21.4 Manual test: Access Dashboard at http://localhost:8642/
- [x] 21.5 Manual test: Send chat messages and verify responses
- [ ] 21.6 Manual test: Test Config page (read/write)
- [ ] 21.7 Manual test: Test Env page (add/reveal/delete)
- [ ] 21.8 Manual test: Test Sessions page (list/search)
- [ ] 21.9 Manual test: Test Logs page
- [ ] 21.10 Manual test: Test Cron page (create/pause/resume/trigger)
- [ ] 21.11 Manual test: Test Skills page (toggle)
- [ ] 21.12 Manual test: Test Analytics page
- [x] 21.13 Manual test: Verify no WebServer process running
- [x] 21.14 Manual test: Verify only Gateway on port 8642
- [ ] 21.15 Performance test: Measure chat latency (should be <100ms)
- [ ] 21.16 Stress test: Send 50 chat messages rapidly
- [ ] 21.17 Memory test: Run Gateway for 1 hour, check memory usage

## 22. Cleanup and Documentation

- [x] 22.1 Delete `hermes_cli/web_server.py`
- [x] 22.2 Delete WebServer tests from test suite
- [x] 22.3 Update CLI commands (hermes dashboard now uses Gateway)
- [x] 22.4 Update README.md with new architecture
- [x] 22.5 Update Electron documentation
- [x] 22.6 Add migration notes for developers
- [x] 22.7 Update CHANGELOG.md with breaking changes (if any)
- [x] 22.8 Add comments explaining token injection mechanism
- [x] 22.9 Document plugin API compatibility considerations
