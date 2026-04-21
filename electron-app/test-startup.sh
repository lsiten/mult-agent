#!/bin/bash
# 测试 Electron 启动和健康检查

echo "🚀 Starting Electron for testing..."
echo "⏰ Recording startup time..."

START_TIME=$(date +%s%3N)

# 启动 Electron (后台)
npm start > /tmp/electron-startup.log 2>&1 &
ELECTRON_PID=$!

echo "📝 Electron PID: $ELECTRON_PID"
echo "📋 Watching logs at: /tmp/electron-startup.log"
echo ""
echo "Waiting for Gateway to start..."

# 等待最多 30 秒
MAX_WAIT=30
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    # 检查日志中是否有启动成功的消息
    if grep -q "Gateway started successfully" /tmp/electron-startup.log 2>/dev/null; then
        END_TIME=$(date +%s%3N)
        STARTUP_TIME=$((END_TIME - START_TIME))

        echo ""
        echo "✅ Gateway started successfully!"
        echo "⏱️  Total startup time: ${STARTUP_TIME}ms"
        echo ""

        # 提取详细启动信息
        grep "Gateway started successfully" /tmp/electron-startup.log | tail -1

        echo ""
        echo "📊 Checking metrics..."
        sleep 2

        # 显示最近的日志
        echo ""
        echo "📋 Recent logs:"
        tail -20 /tmp/electron-startup.log | grep -E "\[(Main|PythonManager|DevWatcher|CircuitBreaker)\]"

        echo ""
        echo "🎯 Test Result:"
        if [ $STARTUP_TIME -lt 5000 ]; then
            echo "  ✅ PASS: Startup time < 5s (${STARTUP_TIME}ms)"
        else
            echo "  ⚠️  SLOW: Startup time > 5s (${STARTUP_TIME}ms)"
        fi

        echo ""
        echo "💡 Electron is running. To stop: kill $ELECTRON_PID"
        echo "💡 View full logs: tail -f /tmp/electron-startup.log"

        exit 0
    fi

    # 检查进程是否还在运行
    if ! kill -0 $ELECTRON_PID 2>/dev/null; then
        echo ""
        echo "❌ Electron process died during startup"
        echo "📋 Last 30 lines of log:"
        tail -30 /tmp/electron-startup.log
        exit 1
    fi

    sleep 1
    ELAPSED=$((ELAPSED + 1))
    printf "."
done

echo ""
echo "⏰ Timeout after ${MAX_WAIT}s"
echo "📋 Last 30 lines of log:"
tail -30 /tmp/electron-startup.log

echo ""
echo "Killing Electron process..."
kill $ELECTRON_PID 2>/dev/null

exit 1
