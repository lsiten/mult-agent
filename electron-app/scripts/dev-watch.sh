#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_DIR="$SCRIPT_DIR/../app"

echo "🔧 Starting dev watch mode..."
echo "   Python: Syncing from source"
echo "   Web: Watch mode with HMR"
echo "   Electron: Manual restart (Cmd+R)"
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "🛑 Stopping watch processes..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Function to sync Python files
sync_python() {
  echo "🔄 Syncing Python files..."
  rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    --exclude='tests/' \
    "$PROJECT_ROOT/hermes_cli/" "$APP_DIR/python/hermes_cli/"

  rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    "$PROJECT_ROOT/gateway/" "$APP_DIR/python/gateway/"

  rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    "$PROJECT_ROOT/agent/" "$APP_DIR/python/agent/"

  rsync -a --delete \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    "$PROJECT_ROOT/tools/" "$APP_DIR/python/tools/"

  # Copy root Python files
  for file in hermes_constants.py hermes_logging.py hermes_state.py hermes_time.py utils.py; do
    if [ -f "$PROJECT_ROOT/$file" ]; then
      cp "$PROJECT_ROOT/$file" "$APP_DIR/python/"
    fi
  done

  echo "✅ Python files synced"
}

# Initial sync
sync_python

# Watch Python files for changes
echo "👀 Watching Python files for changes..."
echo "   (Modify any .py file in hermes_cli/, gateway/, agent/, tools/)"
echo ""

fswatch -o \
  "$PROJECT_ROOT/hermes_cli" \
  "$PROJECT_ROOT/gateway" \
  "$PROJECT_ROOT/agent" \
  "$PROJECT_ROOT/tools" \
  "$PROJECT_ROOT/hermes_constants.py" \
  "$PROJECT_ROOT/hermes_logging.py" \
  "$PROJECT_ROOT/hermes_state.py" \
  "$PROJECT_ROOT/hermes_time.py" \
  "$PROJECT_ROOT/utils.py" \
  --exclude='__pycache__' \
  --exclude='\.pyc$' \
  | while read -r num; do
  echo ""
  echo "📝 Python files changed, syncing..."
  sync_python
  echo "   💡 Restart Electron app (Cmd+R) to reload Python"
done &

# Start web dev server with HMR
echo "🌐 Starting web dev server with HMR..."
cd "$PROJECT_ROOT/web"
ELECTRON=true npm run dev &

# Keep script running
wait
