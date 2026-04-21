#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/../app"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Setting up development environment..."

# 1. Create Python directory structure with individual package symlinks
echo "Creating Python development structure..."

# Backup old python directory if it exists and is not a symlink
if [ -d "$APP_DIR/python" ] && [ ! -L "$APP_DIR/python" ]; then
  echo "Warning: $APP_DIR/python is a directory, backing it up..."
  mv "$APP_DIR/python" "$APP_DIR/python.backup.$(date +%s)"
fi

# Remove old symlink
if [ -L "$APP_DIR/python" ]; then
  rm "$APP_DIR/python"
fi

# Create python directory
mkdir -p "$APP_DIR/python"

# Symlink individual packages and files
echo "Linking Python packages..."
ln -sf "$PROJECT_ROOT/gateway" "$APP_DIR/python/gateway"
ln -sf "$PROJECT_ROOT/hermes_cli" "$APP_DIR/python/hermes_cli"
ln -sf "$PROJECT_ROOT/agent" "$APP_DIR/python/agent"
ln -sf "$PROJECT_ROOT/tools" "$APP_DIR/python/tools"
ln -sf "$PROJECT_ROOT/cron" "$APP_DIR/python/cron"
ln -sf "$PROJECT_ROOT/environments" "$APP_DIR/python/environments"

# Symlink root Python files
for file in cli.py run_agent.py mcp_serve.py hermes_constants.py hermes_logging.py hermes_state.py hermes_time.py utils.py; do
  if [ -f "$PROJECT_ROOT/$file" ]; then
    ln -sf "$PROJECT_ROOT/$file" "$APP_DIR/python/$file"
  fi
done

echo "✓ Python source linked"

# 2. Build frontend
echo "Building frontend..."
cd "$PROJECT_ROOT/web"
ELECTRON=true npm run build:electron

echo "✓ Frontend built"

echo ""
echo "✅ Development setup complete!"
echo ""
echo "Development workflow:"
echo "  • Python changes are live via symlinks (no rebuild needed)"
echo "  • Frontend changes: Run 'npm run build:web' to rebuild"
echo "  • Restart Electron to see changes"
echo ""
echo "Commands:"
echo "  npm run dev        # Full setup + build + start"
echo "  npm run dev:quick  # Skip setup, just build + start"
echo "  npm start          # Start without rebuild"
echo ""
