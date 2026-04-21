# Migration Guide: v1.0.0 → v1.1.0

This guide covers upgrading the Hermes Electron Desktop Application from v1.0.0 to v1.1.0.

## Overview

v1.1.0 is a **non-breaking performance and security enhancement release**. All existing code and configurations continue to work without modification.

**Key Improvements**:
- 25% faster startup time (~3s → ~2.25s)
- ~20% lower CPU usage during runtime
- Production-grade Gateway authentication
- Automatic log sanitization for sensitive data

## Breaking Changes

**None**. This is a backward-compatible release.

## New Features

### 1. Layered Parallel Service Startup

**What Changed**: Services now start in parallel within dependency layers using BFS algorithm.

**Before (v1.0.0)**: Serial startup
```
env → config → gateway → vite-dev → window → dev-watcher
Total: ~3s
```

**After (v1.1.0)**: Layered parallel startup
```
Layer 0: env
Layer 1: config
Layer 2: gateway (1610ms)
Layer 3: vite-dev (28ms)
Layer 4: window (611ms)
Layer 5: dev-watcher (0ms)
Total: ~2.25s (25% faster)
```

**Impact**: Automatic optimization, no code changes needed.

### 2. Adaptive Health Check Mode

**What Changed**: Health monitoring switches modes after startup completes.

**Before (v1.0.0)**: Continuous polling throughout runtime
```
Gateway health check every 1000ms → High CPU usage
```

**After (v1.1.0)**: Adaptive mode switching
```
Startup: Continuous polling (exponential backoff 50ms → 1000ms)
Runtime: On-demand (triggered by IPC calls)
Result: ~20% CPU reduction
```

**Impact**: Automatic optimization, no code changes needed.

### 3. Gateway Authentication (Production Mode)

**What Changed**: Production builds now require Bearer token authentication.

**Before (v1.0.0)**: All requests allowed
```typescript
// No authentication
fetch('http://127.0.0.1:8642/api/v1/sessions')
```

**After (v1.1.0)**: Token-based authentication
```typescript
// Automatic token attachment by ApiClient
fetch('http://127.0.0.1:8642/api/v1/sessions', {
  headers: { 
    'Authorization': 'Bearer <32-byte-random-token>' 
  }
})
```

**Environment Detection**:
- **Development** (`npm start`): Auth bypassed, `HERMES_ELECTRON_MODE=true`
- **Production** (`npm run package:mac`): Auth required, token auto-generated

**Impact**: 
- Development workflow unchanged
- Production API calls automatically secured
- `/health` endpoint exempt from authentication

### 4. Log Sanitization

**What Changed**: All process outputs automatically redact sensitive information.

**Patterns Redacted**:
- API Keys (OpenAI `sk-...`, Anthropic `sk-ant-...`, Google `AIza...`)
- Bearer Tokens (`Authorization: Bearer xxx`)
- Passwords (`password=xxx`, `pwd=xxx`)
- JWT Tokens (`eyJ...`)
- Email Addresses (`user@example.com`)

**Before (v1.0.0)**:
```
[Gateway] API Key: sk-abc123xyz
[Gateway] Bearer Token: eyJhbGc...
```

**After (v1.1.0)**:
```
[Gateway] API Key: [REDACTED]
[Gateway] Bearer Token: [REDACTED]
```

**Impact**: Automatic redaction in all logs (stdout, stderr, log files).

## Migration Steps

### For Users (Upgrading from v1.0.0)

#### Option A: Clean Install

1. **Download v1.1.0 release**:
   ```bash
   # macOS
   open Hermes\ Agent-1.1.0.dmg
   
   # Windows
   Hermes-Agent-Setup-1.1.0.exe
   ```

2. **Replace existing app**:
   - macOS: Drag to /Applications (overwrite v1.0.0)
   - Windows: Run installer (auto-upgrade)
   - Linux: Extract to /opt/hermes-agent

3. **Verify data migration**:
   - User data preserved at `~/Library/Application Support/hermes-agent-electron/`
   - Configuration, sessions, and .env automatically migrated
   - No manual steps needed

#### Option B: In-App Update (if available)

1. **Check for updates**: Settings → About → Check for Updates
2. **Download and install**: Follow prompts
3. **Restart application**

### For Developers (Building from Source)

#### 1. Update Dependencies

No dependency changes in v1.1.0. Existing `node_modules` compatible.

```bash
cd electron-app
npm install  # Optional, no new packages
```

#### 2. Rebuild Application

**Development Mode**:
```bash
npm run build:main  # Recompile TypeScript
npm start           # Launch with new optimizations
```

**Production Build**:
```bash
npm run package:mac    # macOS
npm run package:win    # Windows
npm run package:linux  # Linux
```

#### 3. Verify Performance

**Startup Time**:
```bash
npm start
# Check logs for:
# [Application] Service layers:
#   Layer 0: env
#   Layer 1: config
#   ...
# [Application] Total time: ~2250ms
```

**Health Check Mode**:
```bash
# Check Gateway logs for:
# [GatewayService] Switched to on-demand health check mode
```

**Authentication (Production Only)**:
```bash
# Production build should log:
# [GatewayService] Auth token configured for production mode

# Development build should log:
# [GatewayService] Development mode detected, auth bypassed
```

## Configuration Changes

### No Configuration Required

All v1.1.0 features activate automatically based on environment detection.

### Optional: Force Production Mode in Development

If you need to test production auth in development:

```bash
# electron-app/.env
NODE_ENV=production
```

**Warning**: This disables development conveniences (CORS bypass, auto-reload).

### Optional: Verify Log Sanitization

Check logs are properly sanitized:

```bash
# macOS
tail -f ~/Library/Application\ Support/hermes-agent-electron/logs/gateway.log

# Should see [REDACTED] instead of actual keys/tokens
```

## Performance Expectations

### Startup Time

| Environment | v1.0.0 | v1.1.0 | Improvement |
|-------------|--------|--------|-------------|
| Development | ~3s | ~2.25s | 25% faster |
| Production | ~3s | ~2.25s | 25% faster |

**Factors Affecting Startup**:
- CPU speed
- Disk I/O (SSD vs HDD)
- Python virtual environment size
- Number of installed packages

### CPU Usage

| Phase | v1.0.0 | v1.1.0 | Improvement |
|-------|--------|--------|-------------|
| Startup | 40-60% | 40-60% | No change |
| Idle | 3-5% | 2-4% | ~20% reduction |
| Active | 10-30% | 10-30% | No change |

**Measured on**: MacBook Pro M1, 16GB RAM, macOS Sonoma

### Memory Usage

No change. Expected footprint remains:
- Main Process: ~100MB
- Renderer Process: ~150MB
- Python Gateway: ~80MB
- Total: ~330MB

## Compatibility

### Supported Platforms

No changes from v1.0.0:
- macOS 10.15+ (Catalina, Big Sur, Monterey, Ventura, Sonoma)
- Windows 10/11
- Linux (Ubuntu 20.04+, Fedora 34+)

### Python Backend

Gateway API remains backward-compatible:
- All v1.0.0 endpoints work unchanged
- New auth middleware transparent to clients
- `/health` endpoint always accessible (no auth required)

### Frontend (React)

Web UI unchanged:
- All v1.0.0 pages and components work
- ApiClient handles auth automatically
- No code changes needed

## Troubleshooting

### Issue: Startup still slow (~3s or more)

**Diagnosis**:
```bash
npm start
# Check logs for layered startup:
# [Application] Service layers:
#   Layer 0: env
#   ...
# If you see serial startup instead, v1.1.0 isn't running
```

**Solution**:
```bash
npm run build:main  # Rebuild main process
npm start           # Restart application
```

### Issue: Gateway authentication failures (403)

**Diagnosis**:
```bash
# Check browser console:
# POST http://127.0.0.1:8642/api/v1/sessions 403 (Forbidden)
```

**Cause**: Production mode active, token mismatch.

**Solution**:
```bash
# Switch to development mode
echo "NODE_ENV=development" > electron-app/.env
npm start
```

### Issue: No performance improvement observed

**Check 1**: Verify v1.1.0 is running
```bash
# About dialog should show: v1.1.0
# Or check package.json:
cat electron-app/package.json | grep version
```

**Check 2**: Measure baseline
```bash
# Time startup:
time npm start
# Should be ~2.25s on modern hardware
```

**Check 3**: Check CPU baseline
```bash
# Activity Monitor (macOS) / Task Manager (Windows)
# Electron Helper should use 2-4% when idle
```

### Issue: Logs still contain sensitive data

**Diagnosis**:
```bash
tail -f ~/Library/Application\ Support/hermes-agent-electron/logs/gateway.log
# Search for patterns like "sk-", "Bearer", "password="
```

**Cause**: Log sanitization bypassed or disabled.

**Solution**:
```bash
# Check ProcessManager integration:
grep -r "sanitizeLog" electron-app/src/process/
# Should show imports and usage in process-manager.ts
```

## Known Issues

### None for v1.1.0

All known issues from v1.0.0 remain unchanged. See [MIGRATION.md](./MIGRATION.md#known-issues) for details.

## Rollback Instructions

If you encounter critical issues, rollback to v1.0.0:

### For Users

1. **Uninstall v1.1.0**:
   - macOS: Delete `/Applications/Hermes Agent.app`
   - Windows: Uninstall via Control Panel
   - Linux: Remove from `/opt/hermes-agent`

2. **Download v1.0.0 release** from GitHub

3. **Install v1.0.0**:
   - User data preserved automatically
   - Configuration remains compatible

### For Developers

```bash
cd electron-app

# Checkout v1.0.0 tag
git checkout v1.0.0

# Rebuild
npm run build:main
npm start
```

## Support

For migration help:
- **Documentation**: [README.md](./README.md), [DEV_GUIDE.md](./DEV_GUIDE.md)
- **Architecture**: [.claude/rules/architecture-electron.md](../.claude/rules/architecture-electron.md)
- **Release Notes**: [CHANGELOG.md](./CHANGELOG.md)
- **General Migration**: [MIGRATION.md](./MIGRATION.md)

Report issues at: https://github.com/your-org/hermes-agent/issues

---

**Last Updated**: 2026-04-21  
**Release**: v1.1.0  
**Maintainer**: Hermes Agent Team
