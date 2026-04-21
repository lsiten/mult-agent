## Why

v1.0.0 架构基础扎实，但性能分析显示三个优化机会：(1) 服务串行启动浪费约 30% 时间，(2) Gateway 健康检查持续轮询浪费 CPU，(3) 缺少日志清理和 token 认证存在安全风险。这些优化可将启动时间从 ~3s 降至 ~2s，减少 CPU 占用 20%，同时增强安全性。

## What Changes

- 实现分层并行服务启动（按依赖层级并发）
- 改进健康检查策略（启动时指数退避，运行时按需检查）
- 实现日志敏感信息清理（sanitizeLog 正则匹配 API keys/tokens/passwords）
- 添加 Gateway 认证 token 机制（生产环境 32-byte random token）
- 优化 HealthMonitor 生命周期管理（stop 时停止轮询）

## Capabilities

### New Capabilities
- `parallel-service-startup`: 分层并发启动服务，减少启动时间
- `adaptive-health-check`: 按需健康检查策略，减少 CPU 占用
- `log-sanitization`: 日志敏感信息清理，防止泄露
- `gateway-auth-token`: Gateway 认证 token，增强安全性

### Modified Capabilities
<!-- 无现有 capability 需求变更，这是全新功能 -->

## Impact

**代码影响**:
- `electron-app/src/core/application.ts`: 修改 start() 为分层并发
- `electron-app/src/health/health-monitor.ts`: 添加 stop() 方法和按需检查模式
- `electron-app/src/services/gateway.service.ts`: 集成 sanitizeLog 和 token 传递
- `electron-app/src/utils/log-sanitizer.ts`: 新增日志清理工具
- `electron-app/src/main.ts`: 生成和传递 auth token

**性能影响**:
- 启动时间: ~3s → ~2s (-33%)
- CPU 占用: 减少 20% (停止持续轮询)
- 内存: 无明显变化

**安全影响**:
- 日志不再包含 API keys, Bearer tokens, passwords, JWTs
- Gateway 仅接受带有正确 token 的请求（生产环境）
- 开发环境保持 allow-all 以便调试

**测试影响**:
- 新增 parallel-startup.spec.ts（验证并发正确性）
- 新增 log-sanitizer.spec.ts（验证敏感信息清理）
- 新增 gateway-auth.integration.spec.ts（验证 token 认证）
- 更新 application.spec.ts（适配分层启动）
