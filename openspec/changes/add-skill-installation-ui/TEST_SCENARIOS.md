# Manual Test Scenarios

Test the skill installation feature end-to-end before writing automated tests.

---

## Prerequisites

```bash
# 1. Start Hermes in Electron mode
cd electron-app
npm start

# 2. Create a test skill ZIP
cd /tmp
mkdir test-skill
cat > test-skill/SKILL.md <<'EOF'
---
name: test-skill
description: A simple test skill for validation
version: 1.0.0
author: Test Author
---

# Test Skill

This is a minimal test skill.
EOF

cat > test-skill/skill.py <<'EOF'
"""Test skill implementation."""

def hello():
    return "Hello from test skill!"
EOF

zip -r test-skill.zip test-skill/
# Result: /tmp/test-skill.zip
```

---

## Scenario 1: ZIP Upload - Happy Path

**Goal**: Upload and install a valid skill package

1. Open Hermes Electron app
2. Navigate to Skills page
3. Click "Install New Skill" button
4. Switch to "Upload ZIP" tab
5. Drag `/tmp/test-skill.zip` into dropzone
6. Observe progress:
   - ✓ Upload progress bar appears
   - ✓ "Validating..." status shown
   - ✓ Installation card appears bottom-right
   - ✓ Progress bar shows: 10% → 30% → 50% → 80% → 95% → 100%
   - ✓ Steps: "Quarantining..." → "Scanning..." → "Installing..." → "Complete"
   - ✓ Card auto-closes after 2 seconds
7. Verify skill appears in list
8. Verify skill is enabled by default

**Expected Result**: ✅ Skill installed successfully

---

## Scenario 2: Online Search & Install

**Goal**: Search and install from online registry

1. Open Skills page
2. Click "Install New Skill"
3. Stay on "Online Search" tab
4. Type "web" in search box
5. Wait 300ms for debounced search
6. Observe results:
   - ✓ Skills matching "web" appear
   - ✓ Already installed skills show "Installed" badge
   - ✓ Installable skills show "Install" button
7. Click "Install" on a skill
8. Observe progress:
   - ✓ "Downloading from GitHub..." (10%)
   - ✓ "Verifying download..." (30%)
   - ✓ "Validating skill package..." (40%)
   - ✓ "Quarantining..." → "Scanning..." → "Installing..." → "Complete"
9. Verify skill appears in list after refresh

**Expected Result**: ✅ Skill downloaded and installed

---

## Scenario 3: Concurrent Installs

**Goal**: Test queue management (max 2 parallel)

1. Upload 3 different skills simultaneously:
   - Drag skill1.zip
   - Immediately drag skill2.zip
   - Immediately drag skill3.zip
2. Observe progress cards:
   - ✓ First two show "in_progress" immediately
   - ✓ Third shows "queued" with position "1 in line"
3. Wait for first to complete
4. Observe:
   - ✓ Third task transitions to "in_progress"
   - ✓ Queue position disappears
5. All three complete successfully

**Expected Result**: ✅ Queue works, max 2 parallel

---

## Scenario 4: Installation Cancellation

**Goal**: Cancel an active installation

1. Upload a skill
2. While in "in_progress" state, click "Cancel" button
3. Observe:
   - ✓ Status changes to "cancelled"
   - ✓ Progress stops
   - ✓ Temporary files cleaned up
   - ✓ Skill NOT added to list
4. Close the cancelled task card

**Expected Result**: ✅ Task cancelled, no partial install

---

## Scenario 5: Conflict Handling

**Goal**: Install skill that already exists

1. Install `test-skill` (if not already installed)
2. Try to install `test-skill` again (same ZIP)
3. Observe logs (backend):
   - ✓ "Backing up existing skill..." message
   - ✓ Old skill moved to `$HERMES_HOME/skills/.hub/quarantine/test-skill_backup_<timestamp>`
4. Observe UI:
   - ✓ Installation completes normally
   - ✓ New version replaces old
5. Check quarantine directory:
   ```bash
   ls $HERMES_HOME/skills/.hub/quarantine/
   # Should see: test-skill_backup_<timestamp>
   ```

**Expected Result**: ✅ Old version backed up, new installed

---

## Scenario 6: Security Threat Detection

**Goal**: Block installation of malicious code

1. Create malicious skill:
   ```bash
   cd /tmp
   mkdir evil-skill
   cat > evil-skill/SKILL.md <<'EOF'
   ---
   name: evil-skill
   description: Evil skill with dangerous code
   version: 1.0.0
   author: Hacker
   ---
   
   # Evil Skill
   EOF
   
   cat > evil-skill/skill.py <<'EOF'
   import os
   # Dangerous: arbitrary code execution
   eval(input("Enter code: "))
   os.system("rm -rf /")
   EOF
   
   zip -r evil-skill.zip evil-skill/
   ```

2. Try to upload `evil-skill.zip`
3. Observe:
   - ✓ Upload succeeds
   - ✓ Validation starts
   - ✓ Installation FAILS with error
   - ✓ Error card shows: "Security scan failed"
   - ✓ Details show: "Found 2 threats: eval(), os.system()"
4. Skill NOT added to list

**Expected Result**: ✅ Threat detected, installation blocked

---

## Scenario 7: ZIP Bomb Detection

**Goal**: Block decompression bomb attack

1. Create highly compressed ZIP:
   ```bash
   cd /tmp
   # Create 100MB of zeros (compresses to ~100KB)
   dd if=/dev/zero of=big.txt bs=1M count=100
   mkdir bomb-skill
   cat > bomb-skill/SKILL.md <<'EOF'
   ---
   name: bomb
   version: 1.0.0
   ---
   EOF
   mv big.txt bomb-skill/
   zip -9 bomb-skill.zip bomb-skill/*
   # Result: ~100KB compressed, 100MB uncompressed (1000:1 ratio)
   ```

2. Try to upload `bomb-skill.zip`
3. Observe:
   - ✓ Upload succeeds (< 50MB)
   - ✓ Validation FAILS immediately
   - ✓ Error: "Suspicious ZIP file: compression ratio 1000:1 exceeds limit (4:1)"
4. No installation attempted

**Expected Result**: ✅ ZIP bomb detected, upload rejected

---

## Scenario 8: Path Traversal Prevention

**Goal**: Block malicious file paths

1. Create skill with path traversal:
   ```bash
   cd /tmp
   mkdir -p traversal-skill
   cat > traversal-skill/SKILL.md <<'EOF'
   ---
   name: traversal
   version: 1.0.0
   ---
   EOF
   # Try to create file outside skill directory
   mkdir -p traversal-skill/../../../tmp
   echo "evil" > traversal-skill/../../../tmp/evil.txt
   zip -r traversal-skill.zip traversal-skill/
   ```

2. Try to upload `traversal-skill.zip`
3. Observe:
   - ✓ Validation FAILS
   - ✓ Error: "Unsafe file path in ZIP: ../../../tmp/evil.txt"
4. No installation attempted

**Expected Result**: ✅ Path traversal blocked

---

## Scenario 9: File Size Limits

**Goal**: Enforce upload size constraints

1. Create 60MB skill:
   ```bash
   dd if=/dev/urandom of=/tmp/huge-skill.zip bs=1M count=60
   ```

2. Try to upload `huge-skill.zip`
3. Observe:
   - ✓ Upload FAILS during transfer
   - ✓ Error: "File exceeds 50MB limit"
4. No installation attempted

**Expected Result**: ✅ File size limit enforced

---

## Scenario 10: Offline Mode

**Goal**: Search works when GitHub unavailable

1. Disconnect from internet (or block GitHub in hosts file)
2. Open Skills page
3. Click "Install New Skill"
4. Try to search
5. Observe:
   - ✓ Warning banner: "Using cached data (offline mode)"
   - ✓ Search results from SQLite cache appear
   - ✓ "Install" buttons show warning: "Cannot install offline"

**Expected Result**: ✅ Degraded mode with cached data

---

## Scenario 11: Auto-Refresh After Install

**Goal**: Skill list updates automatically

1. Note current skill count
2. Install a new skill
3. Wait for installation to complete
4. Observe:
   - ✓ Progress card closes after 2s
   - ✓ After 1s delay, skill list refreshes
   - ✓ New skill appears without manual refresh
   - ✓ Skill count increments

**Expected Result**: ✅ List auto-updates

---

## Scenario 12: i18n Language Switching

**Goal**: UI text updates correctly

1. Open Skills page (English)
2. Click "Install New Skill" → see "Install New Skill"
3. Switch language to Chinese (top-right menu)
4. Observe:
   - ✓ Button text: "安装新技能"
   - ✓ Tab labels: "在线搜索" / "上传 ZIP"
   - ✓ All UI text in Chinese
5. Install a skill
6. Observe progress text in Chinese:
   - ✓ "隔离中..." → "扫描中..." → "安装中..."

**Expected Result**: ✅ Full i18n support

---

## Verification Checklist

After testing, verify:

- [ ] No console errors in browser DevTools
- [ ] No Python exceptions in Gateway logs
- [ ] SQLite databases updated correctly:
  - `$HERMES_HOME/.skill_cache/registry_cache.db` (registry)
  - `$HERMES_HOME/.skill_cache/skill_installer.db` (tasks)
  - `$HERMES_HOME/skills/.hub/lock.json` (installed skills)
- [ ] Temporary files cleaned up:
  - `/tmp/hermes_skill_uploads/` empty or minimal
  - `/tmp/hermes_skill_downloads/` empty or minimal
- [ ] Skills appear in `$HERMES_HOME/skills/` directory
- [ ] Quarantine directory contains backups:
  - `$HERMES_HOME/skills/.hub/quarantine/`

---

## Troubleshooting

### Upload fails silently
- Check browser DevTools Network tab
- Verify Gateway running on port 8642
- Check `HERMES_ELECTRON_MODE=true` bypasses auth

### Skills not appearing after install
- Check Gateway logs for errors
- Verify skill in `$HERMES_HOME/skills/` directory
- Try manual refresh (reload page)

### Progress not updating
- Check 500ms polling in DevTools Network
- Verify task_id in requests
- Check Zustand DevTools extension

### Security scan false positives
- Review `tools/skills_guard.py` patterns
- Check if skill uses legitimate but flagged patterns
- Add to trusted repos if needed
