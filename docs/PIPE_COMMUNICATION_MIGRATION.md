# stdin/stdout 管道通信 - 完整改造方案

> **⚠️ 重大架构变更**：从 HTTP/TCP Socket 通信切换到 stdin/stdout 管道通信  
> **影响范围**：Gateway（Python）+ Electron（TypeScript）+ 前端（React）  
> **预计工作量**：11-12 小时开发 + 测试

---

## 📊 改造范围总览

### Python 端（Gateway）

| 模块 | 文件数 | 总行数 | 改造类型 | 优先级 |
|------|--------|--------|---------|--------|
| **核心服务层** | 1 | 491KB | 🔴 重写 | P0 |
| **API 端点模块** | 21 | 8,756 行 | 🟡 迁移 | P0 |
| **启动入口** | 1 | 10,719 行 | 🟢 轻度 | P0 |

### TypeScript 端（Electron）

| 模块 | 文件数 | 改造类型 | 优先级 |
|------|--------|---------|--------|
| **进程管理** | 2 | 🔴 重写 | P0 |
| **服务层** | 2 | 🟡 改造 | P0 |
| **IPC 层** | 新建 | 🟢 新增 | P0 |

### 前端（React）

| 模块 | 文件数 | 改造类型 | 优先级 |
|------|--------|---------|--------|
| **API 客户端** | 1 | 🔴 重写 | P0 |
| **组件** | 2 | 🟢 轻度 | P1 |

---

## 🎯 第一阶段：Python Gateway 端改造

### 1.1 核心服务层

#### 文件：`gateway/platforms/api_server.py` (2,930 行)

**当前架构**：
```python
# 基于 aiohttp 的 HTTP 服务器
class APIServer(BasePlatformAdapter):
    async def connect(self) -> bool:
        self._app = web.Application()
        self._runner = web.AppRunner(self._app)
        self._site = web.TCPSite(self._runner, self._host, self._port)
        await self._site.start()
```

**改造方案**：
- [x] ✅ 已创建 `gateway/pipe_server.py` 基础框架
- [ ] 实现 `PipeServer` 类（异步 stdin/stdout 读写）
- [ ] 实现请求路由系统（替代 aiohttp router）
- [ ] 实现响应序列化（JSON 单行输出）

---

### 1.2 API 端点迁移（21 个模块，8,756 行代码）

#### 必须迁移的模块列表

| 文件 | 端点数量 | 当前 Handler | 迁移目标 | 优先级 |
|------|----------|-------------|---------|--------|
| **api_server.py** | 12 | aiohttp handlers | PipeServer methods | P0 |
| **api_server_chat.py** | 2 | OpenAI Chat API | `handle_chat_completions` | P0 |
| **api_server_sessions.py** | 8 | 会话管理 | `handle_sessions_*` | P0 |
| **api_server_analytics.py** | 4 | 分析数据 | `handle_analytics_*` | P0 |
| **api_server_status.py** | 3 | 系统状态 | `handle_status_*` | P0 |
| **api_server_config.py** | 6 | 配置管理 | `handle_config_*` | P1 |
| **api_server_cron.py** | 7 | 定时任务 | `handle_cron_*` | P1 |
| **api_server_skills.py** | 5 | 技能管理 | `handle_skills_*` | P1 |
| **api_server_tools.py** | 4 | 工具管理 | `handle_tools_*` | P1 |
| **api_server_org.py** | 10 | 组织管理 | `handle_org_*` | P0 |
| **api_server_env.py** | 3 | 环境变量 | `handle_env_*` | P2 |
| **api_server_logs.py** | 2 | 日志查询 | `handle_logs_*` | P2 |
| **api_server_attachments.py** | 3 | 附件管理 | `handle_attachments_*` | P1 |
| **api_server_themes.py** | 2 | 主题管理 | `handle_themes_*` | P2 |
| **api_server_stt.py** | 1 | 语音转文字 | `handle_stt` | P2 |
| **api_server_plugins.py** | 3 | 插件管理 | `handle_plugins_*` | P2 |
| **api_server_oauth.py** | 2 | OAuth 认证 | `handle_oauth_*` | P2 |
| **api_server_validation.py** | 工具函数 | 验证逻辑 | 复用 | P0 |
| **api_server_skills_installer.py** | 1 | 技能安装 | `handle_skills_install` | P2 |
| **api_server_skills_registry.py** | 1 | 技能注册表 | `handle_skills_registry` | P2 |

**核心端点详细列表**（从 api_server.py 提取）：

```python
# P0 核心端点（必须最先迁移）
GET  /health                          # 健康检查
GET  /api/sessions                    # 会话列表
GET  /api/sessions/{session_id}       # 会话详情
POST /api/sessions/{session_id}/send  # 发送消息
GET  /api/sessions/{session_id}/stream # SSE 流式响应
POST /v1/chat/completions             # OpenAI 兼容 API
GET  /api/analytics/usage             # 使用统计
GET  /api/status                      # 系统状态
GET  /api/org/profiles                # Sub Agent 列表
POST /api/org/profiles                # 创建 Sub Agent
GET  /api/org/profiles/{id}           # Sub Agent 详情

# P1 常用端点
GET  /api/config                      # 获取配置
PUT  /api/config                      # 更新配置
GET  /api/cron/jobs                   # 定时任务列表
POST /api/cron/jobs                   # 创建定时任务
GET  /api/skills                      # 技能列表
POST /api/attachments/upload          # 文件上传

# P2 次要端点（可延后）
GET  /api/logs                        # 日志查询
GET  /api/themes                      # 主题列表
GET  /api/env                         # 环境变量
```

**迁移策略**：

1. **复用业务逻辑**：只替换 HTTP 层 → 管道协议层
   ```python
   # 原有 aiohttp handler
   async def handle_list_sessions(request: web.Request) -> web.Response:
       session_id = request.match_info['session_id']
       sessions = await SessionDB.list_sessions()
       return web.json_response({"sessions": sessions})
   
   # 迁移到 PipeServer
   async def handle_list_sessions(self, request: PipeRequest) -> Dict:
       # 业务逻辑完全相同
       sessions = await SessionDB.list_sessions()
       return {"sessions": sessions}  # 直接返回 dict
   ```

2. **路由注册系统**：
   ```python
   # gateway/pipe_server.py
   class PipeServer:
       def _register_handlers(self):
           self.handlers = {
               "GET /health": self.handle_health,
               "GET /api/sessions": self.handle_list_sessions,
               "POST /v1/chat/completions": self.handle_chat_completions,
               # ... 70+ 端点
           }
   ```

3. **SSE 流式响应处理**：
   ```python
   # 流式端点特殊处理（分批响应）
   async def handle_chat_completions(self, request: PipeRequest) -> Dict:
       if request.body.get("stream"):
           # 多行响应，每个 chunk 是一行 JSON
           async for chunk in stream_chat_completion():
               self._write_response(PipeResponse(
                   id=request.id,
                   status=200,
                   headers={"X-Stream-Chunk": "true"},
                   body=chunk
               ))
           # 最后发送结束标记
           self._write_response(PipeResponse(
               id=request.id,
               status=200,
               headers={"X-Stream-End": "true"},
               body={"done": True}
           ))
       else:
           # 非流式：单次响应
           result = await complete_chat()
           return result
   ```

---

### 1.3 启动入口改造

#### 文件：`gateway/run.py` (10,719 行)

- [x] ✅ 已添加 `--mode pipe` 参数支持
- [ ] 测试管道模式启动
- [ ] 验证审计令牌机制在管道模式下生效

**启动命令对比**：

```bash
# HTTP 模式（当前）
python gateway/run.py
# → 启动 aiohttp 监听 127.0.0.1:8642

# 管道模式（目标）
python gateway/run.py --mode pipe
# → 启动 stdin/stdout 管道服务器
```

---

## 🎯 第二阶段：Electron 端改造

### 2.1 管道客户端

#### 文件：`electron-app/src/process/pipe-client.ts` (新建)

- [x] ✅ 已创建基础 `PipeClient` 类
- [ ] 实现请求队列管理（并发请求）
- [ ] 实现超时和重试机制
- [ ] 实现日志脱敏（复用 `sanitize-log.ts`）
- [ ] 单元测试：请求/响应匹配、超时、并发

**核心 API**：
```typescript
const client = new PipeClient(gatewayProcess);

// 发送请求
const response = await client.request("GET /api/sessions", {}, null, 30000);

// 便捷方法
await client.get("/health");
await client.post("/v1/chat/completions", { messages: [...] });
```

---

### 2.2 GatewayService 改造

#### 文件：`electron-app/src/services/gateway.service.ts` (379 行)

**当前代码**：
```typescript
// Line 60-67: 健康检查配置（HTTP）
this.healthMonitor = new HealthMonitor({
  url: 'http://127.0.0.1:8642/health',
  startupTimeout: 15000,
  interval: 30000,
  timeout: 5000,
  consecutiveFailuresThreshold: 3,
  mode: 'continuous',
});

// Line 52-57: 启动 Gateway 进程
this.processManager = new ProcessManager({
  command: config.pythonPath,
  args: [gatewayRunPath],  // ← 需要添加 --mode pipe
  env,
  cwd: config.pythonRuntimePath,
});
```

**改造清单**：

- [ ] 添加 `communicationMode: 'http' | 'pipe'` 配置
- [ ] 管道模式下启动参数改为 `[gatewayRunPath, '--mode', 'pipe']`
- [ ] 创建 `PipeClient` 实例替代 HTTP 请求
- [ ] 健康检查改为 `await this.pipeClient.get('/health')`
- [ ] 移除 `HealthMonitor` 的 HTTP URL 配置
- [ ] 更新 `getMetrics()` 方法（通过管道请求）

**关键代码变更**：

```typescript
// 新增字段
private pipeClient?: PipeClient;
private communicationMode: 'http' | 'pipe' = 'pipe';

// 构建启动参数
private buildStartupArgs(): string[] {
  const args = [this.gatewayRunPath];
  if (this.communicationMode === 'pipe') {
    args.push('--mode', 'pipe');
  }
  return args;
}

// 启动后创建 PipeClient
async start(): Promise<void> {
  this.processManager.start();
  
  if (this.communicationMode === 'pipe') {
    this.pipeClient = new PipeClient(this.processManager.getProcess());
    // 健康检查通过管道
    await this.waitForHealth();
  } else {
    await this.healthMonitor.waitUntilHealthy();
  }
}

// 管道模式健康检查
private async waitForHealth(): Promise<void> {
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await this.pipeClient!.get('/health');
      if (response.status === 200) {
        return;
      }
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error('Gateway health check timeout');
}
```

---

### 2.3 SubAgentGatewayService 改造

#### 文件：`electron-app/src/services/sub-agent-gateway.service.ts` (756 行)

**当前架构**：每个 Sub Agent 使用独立端口（9000-65535）

**改造清单**：

- [ ] 启动参数添加 `--mode pipe`
- [ ] 为每个 Sub Agent 创建独立的 `PipeClient` 实例
- [ ] **删除端口分配逻辑**（`allocatePort()`, `isPortAvailable()` 方法）
- [ ] **删除端口冲突检测**（Line 231-252）
- [ ] 更新 `getPort()` → `getPipeClient()` 方法

**关键代码删除**：

```typescript
// ❌ 删除这些方法（不再需要端口管理）
private nextPort = 9000;
private async allocatePort(): Promise<number> { ... }
private async isPortAvailable(port: number): Promise<boolean> { ... }

// ✅ 改为管道客户端
private pipeClient?: PipeClient;
getPipeClient(): PipeClient | null {
  return this.pipeClient || null;
}
```

---

### 2.4 IPC 层新增

#### 文件：`electron-app/src/ipc/gateway-ipc.ts` (新建)

**职责**：前端通过 IPC 调用 Gateway API，Main 进程通过 `PipeClient` 代理请求

**实现**：

```typescript
import { IpcRegistry } from '../core/ipc-registry';
import { z } from 'zod';
import { getGatewayService, getSubAgentManager } from '../services';

// 统一网关请求 IPC
IpcRegistry.register({
  channel: 'gateway:request',
  schema: z.object({
    method: z.string(),  // "GET /api/sessions"
    body: z.any().optional(),
    agentId: z.number().optional(),  // 指定 Sub Agent ID（可选）
  }),
  handler: async (event, input) => {
    try {
      // 选择目标 Gateway（主 Agent 或 Sub Agent）
      let client: PipeClient;
      if (input.agentId !== undefined) {
        const subAgentService = getSubAgentManager().getSubAgent(input.agentId);
        if (!subAgentService) {
          throw new Error(`Sub Agent ${input.agentId} not found`);
        }
        client = subAgentService.getPipeClient();
      } else {
        client = getGatewayService().getPipeClient();
      }

      // 发送请求
      const response = await client.request(input.method, {}, input.body);
      
      return {
        ok: true,
        data: response.body,
        status: response.status,
        headers: response.headers,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: error.message,
        code: 'GATEWAY_REQUEST_FAILED',
      };
    }
  },
});
```

---

## 🎯 第三阶段：前端（React）改造

### 3.1 API 客户端重写

#### 文件：`web/src/lib/api.ts` (1,200+ 行)

**当前架构**：前端直接发 HTTP 请求
```typescript
// Line 89-109: 获取 Gateway URL
async function getRequestBase(): Promise<string> {
  if (_activeAgentId !== null && isElectronRuntime()) {
    const port = await getSubAgentPort(_activeAgentId);
    return `http://127.0.0.1:${port}`;
  }
  return 'http://127.0.0.1:8642';  // 主 Gateway
}

// Line 355+: 发送请求
const requestBase = await getRequestBase();
const url = `${requestBase}/api/sessions/${sessionId}`;
const response = await fetch(url, { method: 'GET', headers: {...} });
```

**改造方案**：所有请求改为 IPC 调用

```typescript
// 新增：统一请求函数（通过 IPC）
async function gatewayRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: any,
  agentId?: number
): Promise<any> {
  const response = await window.ipc.invoke('gateway:request', {
    method: `${method} ${path}`,
    body,
    agentId,
  });
  
  if (!response.ok) {
    throw new Error(response.error || 'Request failed');
  }
  
  return response.data;
}

// 改造所有 API 方法
export async function getSessions(agentId?: number): Promise<Session[]> {
  return gatewayRequest('GET', '/api/sessions', undefined, agentId);
}

export async function sendMessage(
  sessionId: string,
  content: string,
  agentId?: number
): Promise<void> {
  return gatewayRequest('POST', `/api/sessions/${sessionId}/send`, {
    content
  }, agentId);
}
```

**改造清单**：

- [ ] 删除 `getRequestBase()` 函数（不再需要 URL）
- [ ] 删除 `getSubAgentPort()` 函数（不再需要端口）
- [ ] 实现 `gatewayRequest()` 统一请求函数（IPC 代理）
- [ ] 改造所有 API 方法（~50 个函数）
- [ ] 更新 SSE 流式响应逻辑（处理多行 chunk）

**SSE 流式响应处理**：

```typescript
// 流式聊天（改为 IPC + EventEmitter）
export async function streamChatCompletion(
  sessionId: string,
  onChunk: (chunk: string) => void,
  onDone: () => void
): Promise<void> {
  // Electron 环境：通过 IPC 订阅流
  const streamId = await window.ipc.invoke('gateway:startStream', {
    method: 'POST /v1/chat/completions',
    body: { stream: true, messages: [...] },
  });
  
  window.ipc.on(`stream:${streamId}:chunk`, (chunk) => {
    onChunk(chunk);
  });
  
  window.ipc.on(`stream:${streamId}:done`, () => {
    onDone();
  });
}
```

---

### 3.2 组件更新

#### 文件：`web/src/components/onboarding/OptionalFeaturesStep.tsx`

**当前代码**：直接使用 `localhost:8642` 测试连接

**改造**：
- [ ] 删除硬编码的 `http://127.0.0.1:8642/health`
- [ ] 改为调用 `gatewayRequest('GET', '/health')`

#### 文件：`web/src/hooks/useAttachments.ts`

**当前代码**：文件上传使用 `FormData` + `fetch`

**改造**：
- [ ] 改为 IPC 调用 `window.ipc.invoke('gateway:uploadFile', formData)`
- [ ] Main 进程通过 `PipeClient` 转发请求

---

## 🎯 第四阶段：清理和测试

### 4.1 代码清理

#### Python 端删除

- [ ] 删除 `aiohttp` 依赖（`requirements.txt`）
- [ ] 删除 `gateway/platforms/api_server.py` 中的 HTTP 服务器代码（保留业务逻辑）
- [ ] 删除 `web.TCPSite` 相关代码

#### Electron 端删除

- [ ] 删除 `HealthMonitor` 的 HTTP 请求逻辑（`src/health/health-monitor.ts`）
- [ ] 删除端口分配代码（`SubAgentManagerService.allocatePort()`）
- [ ] 删除端口冲突检测（`isPortAvailable()`）

#### 前端删除

- [ ] 删除 `GATEWAY_BASE = 'http://127.0.0.1:8642'` 常量
- [ ] 删除 `getRequestBase()` 函数
- [ ] 删除 `getSubAgentPort()` 函数
- [ ] 删除所有 `fetch()` 调用

---

### 4.2 测试计划

#### 单元测试

- [ ] `PipeClient` 请求/响应匹配测试
- [ ] `PipeClient` 超时处理测试
- [ ] `PipeClient` 并发请求测试（多个 ID 同时 pending）
- [ ] `PipeServer` 路由注册测试
- [ ] `PipeServer` JSON 解析测试

#### 集成测试

- [ ] 启动 Gateway（管道模式）→ 发送 `/health` 请求
- [ ] 测试会话列表 API（`GET /api/sessions`）
- [ ] 测试发送消息 API（`POST /api/sessions/{id}/send`）
- [ ] 测试聊天 API（`POST /v1/chat/completions`）
- [ ] 测试流式响应（SSE chunks）
- [ ] 测试 Sub Agent 独立管道通信
- [ ] 测试主 Agent 和 Sub Agent 并发请求

#### 性能测试

| 指标 | HTTP | Pipe | 目标改进 |
|------|------|------|---------|
| 请求延迟（P50） | 测量 | 测量 | -20% |
| 请求延迟（P95） | 测量 | 测量 | -30% |
| 启动时间 | ~2.25s | 测量 | -10% |
| 内存占用 | 测量 | 测量 | -5% |

#### 端到端测试

- [ ] 完整聊天流程（前端 → Electron IPC → PipeClient → Gateway → Agent → 响应）
- [ ] 切换 Sub Agent 后的数据隔离
- [ ] 文件上传功能
- [ ] 定时任务管理
- [ ] 技能管理

---

### 4.3 文档更新

- [ ] 更新 `.claude/rules/architecture-electron.md`
  - 移除端口管理说明
  - 添加管道通信架构图
  
- [ ] 更新 `.claude/rules/architecture-hermes-core.md`
  - 移除 HTTP 服务器说明
  - 添加 stdin/stdout 协议规范

- [ ] 更新 `README.md`
  - 移除端口配置说明
  - 添加管道模式启动命令

- [ ] 新增 `docs/PIPE_COMMUNICATION.md`
  - 协议格式详细说明
  - 请求/响应示例
  - 流式响应处理
  - 错误处理规范

---

## ⚠️ 关键风险和缓解

### 风险 1：SSE 流式响应复杂度

**问题**：`/v1/chat/completions` 支持 SSE 流式输出（多行 `data:` 事件）

**当前实现**：
```python
# HTTP/SSE 格式
data: {"choices": [{"delta": {"content": "Hello"}}]}
data: {"choices": [{"delta": {"content": " world"}}]}
data: [DONE]
```

**管道模式方案**：每个 chunk 是一行完整 JSON
```json
{"id":"req-123","status":200,"headers":{"X-Stream-Chunk":"true"},"body":{"delta":"Hello"}}
{"id":"req-123","status":200,"headers":{"X-Stream-Chunk":"true"},"body":{"delta":" world"}}
{"id":"req-123","status":200,"headers":{"X-Stream-End":"true"},"body":{"done":true}}
```

**缓解措施**：
- 客户端检测 `X-Stream-Chunk` header 累积 chunks
- 检测 `X-Stream-End` header 结束流

---

### 风险 2：调试工具缺失

**问题**：无法用 curl/Postman 测试 Gateway

**缓解措施**：

1. **CLI 测试工具**：
   ```python
   # tools/pipe-cli.py
   import sys
   import json
   
   request = {
       "id": "test-001",
       "method": "GET /health",
       "headers": {},
   }
   print(json.dumps(request))
   sys.stdout.flush()
   
   response = sys.stdin.readline()
   print(response)
   ```

2. **保留 HTTP 模式**（开发环境可选）：
   ```bash
   # 调试时可切回 HTTP
   python gateway/run.py --mode http
   ```

---

### 风险 3：文件上传处理

**问题**：文件上传（如 `POST /api/attachments/upload`）需要传输二进制数据

**当前 HTTP 实现**：`multipart/form-data`

**管道模式方案**：Base64 编码
```json
{
  "id": "req-456",
  "method": "POST /api/attachments/upload",
  "headers": {"Content-Type": "application/json"},
  "body": {
    "filename": "image.png",
    "content_base64": "iVBORw0KGgoAAAANSUhEUgAA...",
    "mime_type": "image/png"
  }
}
```

**缓解措施**：
- Gateway 自动解码 Base64
- Electron 端自动编码文件内容

---

### 风险 4：跨平台兼容性

**问题**：Windows 管道实现可能不同

**验证点**：
- Node.js `spawn()` 的 stdin/stdout 在 Windows 上是否正常工作
- Python `sys.stdin/stdout` 在 Windows 上是否支持非阻塞读写

**缓解措施**：
- 在 Windows 虚拟机上额外测试
- 如果 Windows 有问题，保留 HTTP 模式作为 fallback

---

## 📋 实施计划（分阶段）

### 阶段 1：Python Gateway 核心（3-4 小时）

- [ ] 1.1 完善 `gateway/pipe_server.py` 核心逻辑
- [ ] 1.2 迁移 P0 端点（12 个核心 API）
- [ ] 1.3 测试管道模式启动
- [ ] 1.4 验证审计令牌机制

**验收标准**：
```bash
python gateway/run.py --mode pipe
# 可以接收 stdin 请求并返回 stdout 响应
```

---

### 阶段 2：Electron 客户端（2-3 小时）

- [ ] 2.1 完善 `PipeClient` 类（超时、重试、日志）
- [ ] 2.2 改造 `GatewayService`（管道模式启动）
- [ ] 2.3 改造 `SubAgentGatewayService`（移除端口管理）
- [ ] 2.4 实现 IPC 层（`gateway:request` handler）

**验收标准**：
```typescript
const client = new PipeClient(gatewayProcess);
const response = await client.get('/health');
console.log(response.body); // {"status": "ok"}
```

---

### 阶段 3：前端 API 改造（2-3 小时）

- [ ] 3.1 重写 `web/src/lib/api.ts`（所有请求改为 IPC）
- [ ] 3.2 更新组件（删除硬编码 URL）
- [ ] 3.3 实现流式响应处理（IPC + EventEmitter）

**验收标准**：
```typescript
// 前端调用
const sessions = await getSessions();
// IPC → PipeClient → Gateway → 返回数据
```

---

### 阶段 4：测试和清理（2-3 小时）

- [ ] 4.1 单元测试（PipeClient, PipeServer）
- [ ] 4.2 集成测试（端到端流程）
- [ ] 4.3 性能测试（对比 HTTP vs Pipe）
- [ ] 4.4 代码清理（删除 HTTP 相关代码）
- [ ] 4.5 文档更新

**验收标准**：
- 所有测试通过
- 性能指标达标（延迟 -20%，启动时间 -10%）
- 文档完整

---

## 📊 工作量估算

| 阶段 | 预计时间 | 优先级 | 依赖 |
|------|---------|--------|------|
| 阶段 1（Python Gateway） | 3-4 小时 | P0 | 无 |
| 阶段 2（Electron 客户端） | 2-3 小时 | P0 | 阶段 1 |
| 阶段 3（前端 API） | 2-3 小时 | P0 | 阶段 2 |
| 阶段 4（测试清理） | 2-3 小时 | P0 | 阶段 3 |
| **总计** | **9-13 小时** | - | - |

---

## ✅ 确认事项

请确认以下内容后开始实施：

1. ✅ 是否同意全面切换到管道通信（放弃 HTTP）？
2. ✅ 是否接受上述改造范围（21 个 API 模块 + 前端完全重写）？
3. ✅ 是否同意保留 `--mode http` 作为调试后门？
4. ✅ 优先级是否合理（P0 核心端点先迁移，P2 次要端点延后）？
5. ✅ 是否需要调整实施计划（如分更多阶段、减少首批迁移端点）？

**请回复确认后开始实施阶段 1。**
