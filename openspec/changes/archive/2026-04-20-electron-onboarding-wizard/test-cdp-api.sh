#!/bin/bash
# CDP Auto-Detection API 测试脚本

set -e

echo "🧪 CDP Auto-Detection API 测试"
echo "================================"
echo ""

# 检查 gateway 是否运行
echo "1️⃣  检查 Gateway 服务..."
if curl -s http://localhost:8642/health > /dev/null 2>&1; then
    echo "   ✅ Gateway 正在运行"
else
    echo "   ❌ Gateway 未运行，请先启动："
    echo "      hermes gateway"
    exit 1
fi
echo ""

# 测试 Chrome 检测 API
echo "2️⃣  测试 Chrome 检测 API..."
echo "   GET /api/browser/detect-chrome"
RESPONSE=$(curl -s http://localhost:8642/api/browser/detect-chrome)
echo "   响应: $RESPONSE"
COUNT=$(echo "$RESPONSE" | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "   检测到 $COUNT 个 Chrome 实例"
echo ""

# 如果检测到实例，显示详情
if [ "$COUNT" -gt 0 ]; then
    echo "   ✅ 检测成功！实例信息："
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
    echo ""
else
    echo "   ℹ️  未检测到运行中的 Chrome 实例"
    echo ""

    # 测试 Chrome 启动 API
    echo "3️⃣  测试 Chrome 启动 API..."
    echo "   POST /api/browser/launch-chrome"
    LAUNCH_RESPONSE=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"port": 9222}' \
        http://localhost:8642/api/browser/launch-chrome)

    echo "   响应: $LAUNCH_RESPONSE"
    SUCCESS=$(echo "$LAUNCH_RESPONSE" | grep -o '"ok":[^,]*' | cut -d: -f2)

    if [ "$SUCCESS" = "true" ]; then
        echo "   ✅ Chrome 启动成功！"
        echo "$LAUNCH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LAUNCH_RESPONSE"

        # 等待并重新检测
        echo ""
        echo "   等待 2 秒后重新检测..."
        sleep 2

        echo "4️⃣  重新检测 Chrome 实例..."
        RESPONSE2=$(curl -s http://localhost:8642/api/browser/detect-chrome)
        COUNT2=$(echo "$RESPONSE2" | grep -o '"count":[0-9]*' | cut -d: -f2)
        echo "   现在检测到 $COUNT2 个实例"
        echo "$RESPONSE2" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE2"
    else
        echo "   ⚠️  Chrome 启动失败"
        echo "$LAUNCH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LAUNCH_RESPONSE"
    fi
fi

echo ""
echo "================================"
echo "✅ API 测试完成！"
echo ""
echo "💡 手动测试步骤："
echo "   1. 打开 Electron 应用"
echo "   2. 进入 Onboarding 向导"
echo "   3. 步骤 3 选择 'CDP 连接本地 Chrome'"
echo "   4. 观察自动检测和连接过程"
