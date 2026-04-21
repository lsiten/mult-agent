## Context

v1.0.0 架构采用 Service-Oriented Architecture (SOA)，使用 Application 类管理服务生命周期。当前实现按拓扑排序顺序串行启动服务，健康检查持续轮询，日志输出未清理敏感信息。性能分析显示启动时间约 3 秒，其中服务启动占 2 秒，健康检查 CPU 占用约 5%。

现有服务依赖关系：
```
env (无依赖)
  ↓
config (依赖 env)
  ↓
gateway (依赖 env, config)
  ↓
vite-dev (依赖 gateway), dev-watcher (依赖 gateway)
  ↓
window (依赖 gateway, vite-dev)
```

## Goals / Non-Goals

**Goals:**
- 将启动时间从 ~3s 优化到 ~2s（目标减少 33%）
- 减少运行时 CPU 占用 20%（停止不必要的健康检查轮询）
- 消除日志中的敏感信息泄露风险（API keys, tokens, passwords）
- 增强 Gateway 安全性（生产环境 token 认证）
- 保持现有 API 兼容性（不破坏已有代码）

**Non-Goals:**
- 不改变服务依赖关系（保持现有 dependencies 声明）
- 不重构 Service 接口（避免大规模代码变更）
- 不优化 Gateway Python 代码（仅限 Electron 层面）
- 不实现服务热重载（留待 v1.2.0）
- 不添加服务间事件总线（留待 v2.0.0）

## Decisions

### Decision 1: 分层并发启动策略

**选择**: 使用依赖层级分组 + Promise.all() 并发启动同层服务

**算法**:
1. 构建反向邻接表（从依赖到被依赖）
2. 计算每个服务的入度（被依赖数）
3. 使用广度优先搜索（BFS）分层：
   - Layer 0: 入度为 0 的服务
   - Layer N: 移除 Layer N-1 后入度为 0 的服务
4. 对每一层使用 Promise.all() 并发启动

**替代方案考虑**:
- **方案 A**: 继续串行启动 → 简单但慢
- **方案 B**: 全部并发 Promise.all() → 忽略依赖，会导致竞态条件
- **方案 C**: Worker threads 启动 → 过度工程，服务不是 CPU 密集型

**选择理由**: 分层并发在保证依赖顺序的前提下最大化并发度，实现复杂度适中

**代码位置**: `electron-app/src/core/application.ts`

**伪代码**:
```typescript
async start() {
  const layers = this.computeLayers();
  for (const layer of layers) {
    const layerStart = Date.now();
    await Promise.all(layer.map(id => this.startService(id)));
    console.log(`Layer ${i} took ${Date.now() - layerStart}ms`);
  }
}

private computeLayers(): string[][] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  // ... 构建图
  
  const layers: string[][] = [];
  let currentLayer = Array.from(inDegree.entries())
    .filter(([_, deg]) => deg === 0)
    .map(([id]) => id);
  
  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    // ... 移除当前层，更新入度
  }
  
  return layers;
}
```

### Decision 2: 按需健康检查模式

**选择**: 启动阶段用指数退避轮询，运行阶段用按需检查

**状态机**:
```
STARTUP (continuous mode, exponential backoff)
  → First success →
RUNNING (on-demand mode, check only on IPC call)
  → Service stop →
STOPPED (no checks)
```

**HealthMonitor 接口变更**:
```typescript
class HealthMonitor {
  constructor(config: { mode: 'continuous' | 'on-demand', ... });
  setMode(mode: 'continuous' | 'on-demand'): void;
  stop(): void; // 新增：停止所有轮询
  checkHealth(): Promise<boolean>; // 手动检查
}
```

**GatewayService 集成**:
```typescript
async start() {
  this.healthMonitor.setMode('continuous'); // 启动阶段
  await this.processManager.start();
  await this.healthMonitor.waitForHealthy(); // 等待首次成功
  this.healthMonitor.setMode('on-demand'); // 切换到按需
}

async stop() {
  this.healthMonitor.stop(); // 停止轮询
  await this.processManager.stop();
}
```

**IPC 调用触发检查**:
```typescript
// ipc-handlers.ts
{
  channel: 'python:getStatus',
  handler: async () => {
    const gateway = application.get<GatewayService>('gateway');
    await gateway.healthMonitor.checkHealth(); // 按需检查
    return gateway.getStatus();
  }
}
```

**替代方案考虑**:
- **方案 A**: 继续持续轮询 → 浪费 CPU
- **方案 B**: 完全取消健康检查 → 无法检测 Gateway 崩溃
- **方案 C**: WebSocket 心跳 → 需要 Gateway 支持，改动过大

**选择理由**: 按需检查在保证故障检测的前提下最小化开销

### Decision 3: 正则匹配日志清理

**选择**: 使用预编译正则表达式匹配和替换敏感信息

**清理规则**:
```typescript
const patterns = [
  // API Keys (OpenAI, Anthropic, Google, etc.)
  { regex: /\b(sk-[a-zA-Z0-9]{40,})\b/g, replacement: '[REDACTED]' },
  { regex: /\b(sk-ant-api\d+-[a-zA-Z0-9_-]{95,})\b/g, replacement: '[REDACTED]' },
  { regex: /\b(AIza[a-zA-Z0-9_-]{35})\b/g, replacement: '[REDACTED]' },
  
  // Bearer Tokens
  { regex: /Bearer\s+([a-zA-Z0-9_\-\.]+)/gi, replacement: 'Bearer [REDACTED]' },
  
  // Passwords
  { regex: /(password|passwd|pwd)\s*[:=]\s*["']?([^"'\s]+)["']?/gi, replacement: '$1=[REDACTED]' },
  
  // JWT Tokens
  { regex: /\beyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, replacement: '[REDACTED]' },
  
  // Email Addresses
  { regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
];

export function sanitizeLog(log: string): string {
  let sanitized = log;
  for (const { regex, replacement } of patterns) {
    sanitized = sanitized.replace(regex, replacement);
  }
  return sanitized;
}
```

**集成点**:
- `ProcessManager.setStdoutCallback()` 内部应用 sanitizeLog
- `ProcessManager.setStderrCallback()` 内部应用 sanitizeLog
- `GatewayService` 不需要额外代码（自动继承）

**替代方案考虑**:
- **方案 A**: 白名单（仅输出允许的模式）→ 过于严格，丢失有用信息
- **方案 B**: AI 模型检测 → 过度复杂，增加延迟
- **方案 C**: 结构化日志 + 字段标记 → 需要 Gateway 重构

**选择理由**: 正则匹配简单高效，覆盖常见敏感信息格式

### Decision 4: 环境变量传递 auth token

**选择**: 通过 GATEWAY_AUTH_TOKEN 环境变量传递 token，Gateway 通过中间件验证

**Main Process**:
```typescript
// main.ts
const gatewayAuthToken = crypto.randomBytes(32).toString('hex'); // 64 字符 hex

// GatewayService
const env = {
  ...process.env,
  GATEWAY_AUTH_TOKEN: gatewayAuthToken,
};
```

**Python Gateway 中间件** (需要在 Gateway 代码中实现):
```python
# gateway/middleware/auth.py
def auth_middleware(request, handler):
    if request.path == '/health':
        return await handler(request)  # 跳过健康检查
    
    expected_token = os.getenv('GATEWAY_AUTH_TOKEN')
    if not expected_token:
        return await handler(request)  # 开发模式，允许所有请求
    
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return web.Response(status=401, text='Missing authorization')
    
    token = auth_header[7:]  # 去掉 'Bearer '
    if token != expected_token:
        return web.Response(status=403, text='Invalid authorization token')
    
    return await handler(request)
```

**IPC Handler**:
```typescript
{
  channel: 'gateway:getAuthToken',
  handler: () => {
    return { token: gatewayAuthToken || null };
  }
}
```

**ApiClient 集成**:
```typescript
class ApiClient {
  private token: string | null = null;
  
  async request(url: string, options: RequestInit) {
    if (!this.token) {
      const result = await window.electronAPI.invoke('gateway:getAuthToken', {});
      this.token = result.data.token;
    }
    
    const headers = { ...options.headers };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    
    return fetch(url, { ...options, headers });
  }
}
```

**替代方案考虑**:
- **方案 A**: IPC 通道验证 → 绕过 HTTP，但无法防止直接访问 8642 端口
- **方案 B**: mTLS 证书 → 过度复杂，开发体验差
- **方案 C**: 随机端口 + token → 端口扫描仍可发现

**选择理由**: Bearer token 是标准 HTTP 认证方式，实现简单且有效

## Risks / Trade-offs

### Risk 1: 并发启动的竞态条件

**风险**: 同层服务并发启动可能触发未声明的隐式依赖

**示例**: vite-dev 和 dev-watcher 都依赖 gateway，但如果 dev-watcher 内部假设 vite-dev 已启动（未声明依赖），会出错

**缓解措施**:
- 添加单元测试验证每种服务组合的并发启动
- 在 Application 启动日志中输出层级分组，便于排查问题
- 代码审查检查隐式依赖

**回退方案**: 如果发现问题，可以在 Application 中添加 `concurrencyLevel` 配置，限制每层最多并发数（如 concurrencyLevel=1 回退到串行）

### Risk 2: 健康检查延迟影响用户体验

**风险**: 按需模式下，IPC 调用触发健康检查增加 100-200ms 延迟

**影响**: python:getStatus 从即时返回变为 ~200ms

**缓解措施**:
- 缓存健康检查结果（TTL=5s），避免频繁检查
- 仅在 CircuitBreaker 进入 OPEN 状态后才触发健康检查
- 异步健康检查：先返回缓存状态，后台更新

**监控指标**: 记录 IPC 调用延迟 P50/P95/P99，如果 P95 > 500ms 则考虑优化

### Risk 3: 正则匹配误伤合法日志

**风险**: 过于宽泛的正则可能清理非敏感内容

**示例**: `password=test` 在错误信息中可能是字段名而非实际密码

**缓解措施**:
- 使用精确的正则模式（如 API key 长度匹配）
- 提供 `sanitizeLog.disable()` 开关用于调试
- 单元测试覆盖边界情况

**回退方案**: 如果误伤严重，可以添加白名单机制（如 `password=<example>` 不清理）

### Risk 4: Token 泄露风险

**风险**: 如果 token 被记录到日志或通过其他方式泄露，攻击者可以直接访问 Gateway

**缓解措施**:
- Token 生成后不写入日志（仅记录 "Generated token"）
- sanitizeLog 清理所有 Bearer tokens
- Token 仅在进程内存中传递，不写入文件
- 应用退出时 token 失效（Gateway 进程停止）

**限制**: Token 在单次应用生命周期内有效，重启后重新生成

## Migration Plan

### Phase 1: 准备工作（不破坏现有功能）

1. 实现 `log-sanitizer.ts` 工具类 + 单元测试
2. 实现 HealthMonitor 的 `setMode()` 和 `stop()` 方法
3. 添加 Application 的 `computeLayers()` 私有方法（不使用）

### Phase 2: 增量启用（可回退）

4. ProcessManager 集成 sanitizeLog（透明应用）
5. GatewayService 启用按需健康检查模式
6. Application 启用分层并发启动

### Phase 3: 安全增强（仅生产环境）

7. main.ts 生成 auth token（NODE_ENV=production）
8. Gateway 添加 auth_middleware（检查 GATEWAY_AUTH_TOKEN）
9. IPC 添加 gateway:getAuthToken 处理器
10. ApiClient 自动附加 Authorization 头

### Phase 4: 验证和清理

11. 运行集成测试验证 token 认证
12. 运行性能测试验证启动时间和 CPU 占用
13. 手动审查日志文件确认无敏感信息
14. 更新文档和 CHANGELOG

### Rollback Strategy

**如果出现问题**:
- 分层启动问题 → 添加环境变量 `DISABLE_PARALLEL_STARTUP=true` 回退串行
- 健康检查问题 → 添加环境变量 `HEALTH_CHECK_MODE=continuous` 回退轮询
- Token 认证问题 → Python Gateway 检查环境变量，未设置则跳过验证

**回滚步骤**:
1. 设置回退环境变量
2. 重启应用
3. 验证功能正常
4. 修复 bug 后移除回退变量

## Open Questions

1. **是否需要在 DevTools 显示启动层级可视化？**
   - 答：留待 v1.2.0，当前版本仅日志输出

2. **Token 认证是否需要支持 token 轮换（rotation）？**
   - 答：不需要，每次应用启动生成新 token 已足够

3. **日志清理是否需要支持自定义规则？**
   - 答：暂不支持，硬编码规则覆盖 95% 场景

4. **并发启动失败时是否需要自动降级到串行？**
   - 答：不自动降级，通过测试保证并发正确性
