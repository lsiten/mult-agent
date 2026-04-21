#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_DIR="$SCRIPT_DIR/../app"

echo "Bundling Python code into Electron app..."

# 清理旧文件（安全检查）
if [ -z "$APP_DIR" ] || [ "$APP_DIR" = "/" ]; then
  echo "Error: Invalid APP_DIR: $APP_DIR"
  exit 1
fi
rm -rf "$APP_DIR/python"
mkdir -p "$APP_DIR/python"
mkdir -p "$APP_DIR/scripts"
mkdir -p "$APP_DIR/config"

# 复制 Python 源码（排除测试和缓存）
echo "Copying Python source code..."

# 验证源目录存在性
for dir in hermes_cli agent gateway tools cron environments; do
  if [[ ! -d "$PROJECT_ROOT/$dir" ]]; then
    echo "Error: $dir directory not found"
    exit 1
  fi
done

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/hermes_cli/" "$APP_DIR/python/hermes_cli/"

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/agent/" "$APP_DIR/python/agent/"

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/gateway/" "$APP_DIR/python/gateway/"

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/tools/" "$APP_DIR/python/tools/"

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/cron/" "$APP_DIR/python/cron/"

rsync -av \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.pytest_cache' \
  --exclude='tests/' \
  "$PROJECT_ROOT/environments/" "$APP_DIR/python/environments/"

# 复制核心 Python 文件（验证存在性）
echo "Copying core Python files..."
for file in cli.py run_agent.py mcp_serve.py hermes_constants.py hermes_logging.py hermes_state.py hermes_time.py utils.py; do
  if [ -f "$PROJECT_ROOT/$file" ]; then
    cp "$PROJECT_ROOT/$file" "$APP_DIR/python/"
  else
    echo "Warning: $file not found, skipping"
  fi
done

# 复制脚本（检查存在性并给出警告）
echo "Copying scripts..."
if ls "$PROJECT_ROOT/scripts/"*.sh 1> /dev/null 2>&1; then
  cp "$PROJECT_ROOT/scripts/"*.sh "$APP_DIR/scripts/"
else
  echo "Warning: No shell scripts found in scripts/"
fi

if ls "$PROJECT_ROOT/scripts/"*.py 1> /dev/null 2>&1; then
  cp "$PROJECT_ROOT/scripts/"*.py "$APP_DIR/scripts/"
else
  echo "Warning: No Python scripts found in scripts/"
fi

# 复制配置示例（错误处理）
echo "Copying config examples..."
[ -f "$PROJECT_ROOT/.env.example" ] && cp "$PROJECT_ROOT/.env.example" "$APP_DIR/config/" || echo "Warning: .env.example not found"
[ -f "$PROJECT_ROOT/cli-config.yaml.example" ] && cp "$PROJECT_ROOT/cli-config.yaml.example" "$APP_DIR/config/" || echo "Warning: cli-config.yaml.example not found"

# 复制 skills 目录
echo "Copying skills..."
if [ -d "$PROJECT_ROOT/skills" ]; then
  mkdir -p "$APP_DIR/skills"
  rsync -av \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.pytest_cache' \
    "$PROJECT_ROOT/skills/" "$APP_DIR/skills/"
else
  echo "Warning: skills/ directory not found"
fi

echo "Python bundling complete!"
