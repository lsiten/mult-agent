#!/bin/bash
# 测试 Python 热重载功能

echo "🔥 Testing Python Hot Reload..."
echo ""

# 检查 Electron 是否在运行
if ! pgrep -f "electron.*hermes-agent-electron" > /dev/null; then
    echo "❌ Electron is not running"
    echo "💡 Please start Electron first: npm start"
    exit 1
fi

echo "✅ Electron is running"
echo ""

# 获取当前重启次数（如果有监控数据）
echo "📊 Current state:"
echo "   Watching for auto-restart after Python file change..."
echo ""

# 修改一个 Python 文件
TEST_FILE="../gateway/run.py"
BACKUP_FILE="../gateway/run.py.backup.$$"

echo "📝 Modifying $TEST_FILE"
cp "$TEST_FILE" "$BACKUP_FILE"

echo "# Hot reload test at $(date)" >> "$TEST_FILE"

echo "✅ File modified"
echo ""
echo "⏱️  Waiting for DevWatcher to detect change..."
echo "   Expected: Auto-restart within 1-3 seconds"
echo ""

# 等待并观察日志
sleep 5

echo "📋 Checking for DevWatcher activity in recent logs:"
echo ""

if [ -f "/tmp/electron-startup.log" ]; then
    echo "--- Last 20 lines from Electron log ---"
    tail -20 /tmp/electron-startup.log | grep -E "DevWatcher|Restarting Gateway|Gateway restarted" || echo "   (No DevWatcher activity found)"
fi

# 检查 Gateway 日志
GATEWAY_LOG="$HOME/Library/Application Support/hermes-agent-electron/logs/gateway.log"
if [ -f "$GATEWAY_LOG" ]; then
    echo ""
    echo "--- Last 10 lines from Gateway log ---"
    tail -10 "$GATEWAY_LOG"
fi

echo ""
echo "🔄 Restoring original file..."
mv "$BACKUP_FILE" "$TEST_FILE"

echo "✅ Original file restored"
echo ""
echo "💡 Test completed. Check the logs above for DevWatcher activity."
echo "   Expected to see:"
echo "   - [DevWatcher] Python file changed: run.py"
echo "   - [DevWatcher] Python files changed, restarting Gateway..."
echo "   - [PythonManager] Restarting Gateway..."
