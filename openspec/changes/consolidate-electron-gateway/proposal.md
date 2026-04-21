## Why

The current Electron app architecture runs two separate HTTP servers (Gateway on 8642, WebServer on 9119) but uses neither effectively. Gateway sits idle while chat spawns a new Python CLI process for every message, and WebServer only serves Dashboard APIs. This creates unnecessary resource overhead, poor chat performance, and architectural confusion with three different communication patterns (IPC spawn, HTTP to WebServer, unused Gateway).

## What Changes

- **Consolidate all HTTP services into Gateway**: Migrate 41 Dashboard API endpoints from FastAPI (WebServer) to aiohttp (Gateway), add static file serving with session token injection
- **Remove WebServer entirely**: Delete `hermes_cli/web_server.py` (~2400 LOC) and all WebServer process management from Electron
- **HTTP-based chat**: Replace spawn-per-message with HTTP calls to Gateway's `/v1/chat/completions`, enabling session continuity and 10x+ performance improvement
- **Single process model**: Electron starts only Gateway, which serves OpenAI API, Dashboard API, and SPA frontend on unified port 8642
- **Simplified frontend**: Web app connects to single base URL instead of routing between two servers

## Capabilities

### New Capabilities
- `unified-gateway-dashboard`: Gateway serves Dashboard REST APIs (/api/config, /api/sessions, /api/env, /api/logs, /api/cron, /api/skills, /api/analytics, /api/tools, /api/providers, /api/dashboard/plugins, /api/dashboard/themes)
- `gateway-spa-serving`: Gateway serves static SPA files with session token injection for authentication
- `gateway-plugin-system`: Gateway supports Dashboard plugin static assets and dynamic API route mounting

### Modified Capabilities
- `electron-chat-integration`: Chat changes from IPC spawn to HTTP-based Gateway calls (requirement change: must support stateful sessions via X-Hermes-Session-Id header)

## Impact

**Code Changes**:
- Gateway: +12 new handler files (~2250 LOC) in `gateway/platforms/api_server_*.py`
- Electron: Modify `python-manager.ts` (remove WebServer), `main.ts` (HTTP chat), `api.ts` (base URL)
- Cleanup: Delete `hermes_cli/web_server.py`

**Runtime Impact**:
- HTTP processes: 2 → 1 (50% reduction)
- Ports: 2 (8642, 9119) → 1 (8642)
- Chat performance: ~500ms per spawn → ~50ms HTTP call (10x improvement)
- Memory: ~30% reduction (no duplicate server processes)

**Migration Risk**:
- FastAPI → aiohttp API translation requires careful validation layer implementation
- Session token injection mechanism must work identically
- All 41 endpoints must maintain backward compatibility
- Plugin system must work with aiohttp routing

**Testing Surface**:
- All Dashboard features (Config, Env, Sessions, Logs, Cron, Skills, Analytics)
- Chat functionality with session continuity
- Static file serving and SPA routing
- Plugin loading and API mounting
- Electron app startup and shutdown
