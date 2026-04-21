## Context

The Electron app currently runs two Python HTTP servers:
- **Gateway** (aiohttp, port 8642): Provides OpenAI-compatible API (`/v1/chat/completions`) and platform integrations, but sits idle in Electron mode
- **WebServer** (FastAPI, port 9119): Serves Dashboard SPA and 41 REST API endpoints

Chat communication uses IPC to spawn a new Python CLI process per message (~500ms overhead), while the running Gateway is never utilized. This architecture wastes resources (duplicate processes, unused Gateway), degrades performance (spawn overhead), and creates maintenance complexity (two codebases for HTTP serving).

The existing Gateway (`gateway/platforms/api_server.py`) is built on aiohttp and already serves OpenAI-compatible APIs. The WebServer (`hermes_cli/web_server.py`, ~2400 LOC) uses FastAPI with automatic Pydantic validation, CORS middleware, and session token injection for SPA authentication.

**Constraints:**
- Must maintain backward compatibility with existing Dashboard frontend
- Cannot change OpenAI API contract (used by external tools)
- Electron mode must remain single-user (no robust authentication needed)
- Must work in both development and production/packaged modes

**Stakeholders:**
- Electron app users (expect improved performance)
- Dashboard frontend (must not break)
- Gateway platform users (OpenAI API compatibility)

## Goals / Non-Goals

**Goals:**
- Consolidate all HTTP services into Gateway on single port (8642)
- Eliminate WebServer process and dual-server architecture
- Replace spawn-per-message chat with HTTP calls to Gateway
- Achieve 10x+ chat performance improvement
- Reduce memory footprint by ~30% (single process)
- Maintain 100% backward compatibility with Dashboard frontend

**Non-Goals:**
- Changing OpenAI API contract or behavior
- Adding new Dashboard features (pure refactoring)
- Improving Gateway's external platform integrations
- Robust multi-user authentication (Electron is single-user)
- Performance optimization beyond architectural consolidation

## Decisions

### Decision 1: Migrate Dashboard APIs to aiohttp handlers

**Choice:** Create modular handler classes in `gateway/platforms/api_server_*.py` files, one per API domain (config, sessions, env, logs, cron, skills, analytics, oauth, plugins, themes).

**Rationale:**
- Keeps Gateway codebase organized (12 files ~200 LOC each vs one 2500+ LOC monolith)
- Matches existing Gateway pattern (handler classes with method-based endpoints)
- Easier to review and test individual API domains
- Allows parallel development if needed

**Alternatives considered:**
- Monolithic: Add all endpoints to `api_server.py` → Rejected (poor maintainability)
- Keep FastAPI embedded: Run uvicorn in background thread → Rejected (still dual-server complexity)

### Decision 2: Manual validation layer instead of Pydantic

**Choice:** Create lightweight validation helpers in `api_server_validation.py` with functions like `validate_json_body(schema: Dict[str, type])` and `require_fields(*fields)`.

**Rationale:**
- aiohttp has no built-in validation like FastAPI's Pydantic integration
- Dashboard APIs have simple schemas (mostly dict/string/int fields)
- Custom helpers provide enough type safety without Pydantic dependency
- Explicit validation matches aiohttp's philosophy (FastAPI magic is implicit)

**Alternatives considered:**
- Add Pydantic to Gateway: Manually create models and validate → Rejected (overkill for simple schemas)
- marshmallow library: Another validation framework → Rejected (unnecessary dependency)
- No validation: Trust frontend → Rejected (unsafe, breaks on malformed input)

Example validation helper:
```python
def validate_json_body(body: bytes, schema: Dict[str, type]) -> Dict[str, Any]:
    data = json.loads(body)
    for field, expected_type in schema.items():
        if field in data and not isinstance(data[field], expected_type):
            raise ValidationError(f"Field '{field}' must be {expected_type.__name__}")
    return data
```

### Decision 3: Session token injection via string replacement

**Choice:** Read `index.html`, inject `<script>window.__HERMES_SESSION_TOKEN__="...";</script>` before `</head>` tag using string replacement, return as HTML response.

**Rationale:**
- Identical to WebServer's current implementation (no behavior change)
- Simple and reliable (no HTML parsing overhead)
- Token generation remains fresh on each Gateway start (secrets.token_urlsafe(32))

**Implementation:**
```python
async def _handle_spa_fallback(self, request: web.Request) -> web.Response:
    html_content = (self._web_dist / "index.html").read_text(encoding="utf-8")
    token_script = f'<script>window.__HERMES_SESSION_TOKEN__="{self._session_token}";</script>'
    html_content = html_content.replace("</head>", f"{token_script}</head>", 1)
    return web.Response(
        text=html_content,
        content_type="text/html",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate"}
    )
```

### Decision 4: Static file serving with aiohttp StaticFiles

**Choice:** Use `app.router.add_static("/assets", web_dist / "assets")` for hashed assets, custom handler for SPA fallback routing.

**Rationale:**
- aiohttp's `add_static` handles content-type detection and caching automatically
- SPA fallback requires custom logic (serve index.html for non-file paths)
- Matches FastAPI's StaticFiles pattern (minimal migration risk)

**Routing order matters:**
1. API routes (`/api/*`, `/v1/*`) - highest priority
2. Plugin assets (`/dashboard-plugins/*`)
3. Static assets (`/assets/*`)
4. SPA fallback (`/*`) - lowest priority (catch-all)

### Decision 5: Authentication bypass in Electron mode

**Choice:** Check `HERMES_ELECTRON_MODE` environment variable; if true, skip token validation in auth middleware.

**Rationale:**
- Electron is single-user desktop app (no network exposure)
- Maintains security model for web mode (token required)
- Simplifies Electron integration (no token management in IPC)

**Implementation:**
```python
def _check_auth(self, request: web.Request) -> bool:
    if os.getenv("HERMES_ELECTRON_MODE") == "true":
        return True  # Skip auth in Electron
    auth = request.headers.get("Authorization", "")
    expected = f"Bearer {self._session_token}"
    return hmac.compare_digest(auth.encode(), expected.encode())
```

### Decision 6: Plugin system uses dynamic import and route registration

**Choice:** Discover plugins at Gateway startup, dynamically import `router` from plugin API files, mount routes under `/api/plugins/{name}/`.

**Rationale:**
- Maintains existing plugin contract (plugins export FastAPI router)
- Gateway converts FastAPI router to aiohttp routes automatically
- Plugins remain framework-agnostic in manifest

**Note:** This requires a FastAPI→aiohttp router adapter or constraining plugins to aiohttp routers. **Open question** - see below.

### Decision 7: Electron chat uses OpenAI format with session header

**Choice:** Main process sends POST to `/v1/chat/completions` with body `{"model": "hermes-agent", "messages": [...], "stream": false}` and optional `X-Hermes-Session-Id` header.

**Rationale:**
- Gateway already implements OpenAI-compatible API
- Session header enables stateful conversations (Gateway maintains context)
- Stream: false simplifies IPC (no SSE handling in Electron)
- Reuses existing Gateway agent creation logic

**Electron IPC handler:**
```typescript
ipcMain.handle('chat:sendMessage', async (_event, message: string) => {
  const response = await fetch('http://localhost:8642/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hermes-Session-Id': currentSessionId  // Optional for continuity
    },
    body: JSON.stringify({
      model: 'hermes-agent',
      messages: [{ role: 'user', content: message }],
      stream: false
    })
  });
  const data = await response.json();
  return data.choices[0].message.content;
});
```

### Decision 8: Path resolution for web_dist in Electron

**Choice:** 
- Electron mode: `Path(__file__).parent.parent / "hermes_cli" / "web_dist"`
- Standard mode: `hermes_cli.__file__).parent / "web_dist"`

**Rationale:**
- Electron bundles Python code in `app/python/` directory
- Standard install has web_dist alongside hermes_cli package
- Fallback to CWD for development mode

**Implementation:**
```python
def _resolve_web_dist_path(self) -> Path:
    if os.getenv("HERMES_ELECTRON_MODE"):
        return Path(__file__).parent.parent / "hermes_cli" / "web_dist"
    try:
        import hermes_cli
        return Path(hermes_cli.__file__).parent / "web_dist"
    except ImportError:
        return Path.cwd() / "hermes_cli" / "web_dist"
```

## Risks / Trade-offs

### Risk 1: FastAPI → aiohttp API compatibility issues
**Risk:** Subtle differences in request/response handling break frontend.

**Mitigation:**
- Comprehensive endpoint-by-endpoint testing with actual frontend
- Unit tests comparing response schemas against WebServer behavior
- Incremental migration: implement 1-2 API domains, test thoroughly, then continue

### Risk 2: Plugin API router incompatibility
**Risk:** Existing plugins export FastAPI routers, Gateway uses aiohttp routing.

**Mitigation:**
- Option A: Require plugins to provide aiohttp routers (BREAKING change)
- Option B: Build FastAPI→aiohttp adapter that converts route definitions
- Option C: Embed minimal FastAPI server for plugins only (contained scope)
- **Decision deferred** - needs plugin ecosystem audit

### Risk 3: Session token injection breaks with SPA build changes
**Risk:** String replacement fails if build tool changes HTML structure.

**Mitigation:**
- Add integration test verifying token appears in served HTML
- Document injection requirement in web build pipeline
- Consider HTML comment marker: `<!-- HERMES_TOKEN_INJECTION -->`

### Risk 4: Gateway startup timing issues in Electron
**Risk:** Renderer tries to connect before Gateway is ready.

**Mitigation:**
- Implement health check polling in PythonManager (GET /health with 3s timeout)
- Show loading screen in renderer until API connectivity confirmed
- Log Gateway startup errors prominently for debugging

### Risk 5: Validation layer misses edge cases
**Risk:** Manual validation is less robust than Pydantic's automatic validation.

**Mitigation:**
- Port existing WebServer validation tests to Gateway
- Add fuzz testing for malformed JSON payloads
- Review all WebServer endpoints for implicit Pydantic validation behavior

### Risk 6: Performance regression from aiohttp
**Risk:** aiohttp slower than FastAPI for Dashboard APIs.

**Mitigation:**
- Benchmark critical endpoints (sessions list, config load) before/after
- aiohttp is generally faster than FastAPI (less abstraction overhead)
- Expected performance gain from eliminating dual-server architecture

### Risk 7: Electron bundling misses web_dist
**Risk:** electron-builder doesn't include web_dist in packaged app.

**Mitigation:**
- Update bundle-python.sh to explicitly copy web_dist
- Add verification step in packaging script (check web_dist exists in app/)
- Test packaged app startup, not just development mode

## Migration Plan

### Phase 1: Gateway Foundation (Week 1)
1. Implement validation helpers (`api_server_validation.py`)
2. Add static file serving and SPA fallback to Gateway
3. Implement session token injection
4. Add web_dist path resolution logic
5. Unit test static serving and token injection

### Phase 2: Dashboard API Migration (Week 2-3)
Migrate in this order (dependencies first):
1. Config API (4 endpoints) - foundational
2. Env API (4 endpoints) - foundational
3. Sessions API (4 endpoints) - depends on Config
4. Logs API (1 endpoint)
5. Skills API (2 endpoints)
6. Cron API (8 endpoints)
7. Tools API (1 endpoint)
8. Analytics API (1 endpoint)
9. OAuth Providers API (5 endpoints)
10. Dashboard Plugins API (3 endpoints)
11. Theme API (2 endpoints)

**Per-domain checklist:**
- [ ] Create handler class in `api_server_*.py`
- [ ] Port endpoints with validation
- [ ] Write unit tests against handler
- [ ] Integration test with actual frontend
- [ ] Document any behavior changes

### Phase 3: Electron Integration (Week 4)
1. Modify `python-manager.ts`: Remove WebServer startup
2. Modify `main.ts`: Implement HTTP-based chat IPC handler
3. Modify `api.ts`: Change base URL to 8642
4. Update `bundle-python.sh`: Ensure web_dist copied
5. Test Electron startup, chat, and dashboard access
6. Test Gateway shutdown on app quit

### Phase 4: Cleanup (Week 4)
1. Delete `hermes_cli/web_server.py`
2. Update CLI commands (`hermes dashboard` now starts Gateway)
3. Update documentation and README
4. Remove WebServer tests from test suite

### Rollback Strategy
- Keep WebServer code in git history (easy revert)
- If critical bug found post-merge, temporarily revert Electron to spawn WebServer
- Frontend changes are minimal (base URL) - easy to revert

### Testing Gates
Before merging:
- [ ] All 41 Dashboard API endpoints pass integration tests
- [ ] Frontend works identically (Config, Env, Sessions, Logs, Cron, Skills)
- [ ] Chat performance improved (measure spawn vs HTTP latency)
- [ ] Electron app starts successfully in development and packaged mode
- [ ] Plugin system works (if applicable)
- [ ] No memory leaks (run Gateway for 1+ hour with traffic)

## Open Questions

### Q1: Plugin API framework compatibility
**Question:** How do we handle existing plugins that export FastAPI routers?

**Options:**
- A: Require plugins update to aiohttp (breaking change, migration guide)
- B: Build FastAPI→aiohttp adapter (technical complexity)
- C: Run minimal FastAPI for plugin routes only (hybrid approach)

**Action:** Audit existing Dashboard plugins (if any) to determine impact.

### Q2: Gateway port configuration
**Question:** Should Electron allow configuring Gateway port (default 8642)?

**Options:**
- Hardcode 8642 (simplest, matches default)
- Add config option in Electron settings (flexibility, complexity)

**Current decision:** Hardcode 8642. Users can modify gateway.yaml if needed.

### Q3: WebServer deprecation timeline
**Question:** Can we delete WebServer immediately or need deprecation period?

**Current decision:** Delete immediately in Electron context (single codebase). Standalone `hermes dashboard` command will invoke Gateway instead.

### Q4: Chat session management UI
**Question:** Should Electron expose session management (new chat, view history)?

**Current decision:** Out of scope (this is architectural refactoring). Can add in future with sessions API.

### Q5: Gateway configuration for dashboard mode
**Question:** Should dashboard serving be opt-in or automatic in Electron mode?

**Current decision:** Automatic when `HERMES_ELECTRON_MODE=true`. No manual config needed.
