## 背景

当前 Electron 架构（v1.0.0）虽然实现了基本功能，但存在严重的架构问题：

1. **全局状态泛滥**: `main.ts` 中 6 个模块级变量（pythonManager、viteDevServer 等）导致隐式依赖
2. **启动顺序隐患**: 服务启动顺序硬编码（`startPythonGateway()` → `startViteDevServer()` → `createWindow()`），修改时易出错
3. **职责不清晰**: `PythonManager` 536 行代码混杂进程管理、健康检查、断路器、环境变量，违反单一职责原则
4. **安全漏洞**: Gateway 无身份验证，任何本地进程可调用 API；日志可能泄露 API keys
5. **测试困难**: 全局状态和紧耦合使单元测试几乎不可能
6. **IPC 脆弱**: 类型不安全，运行时才发现错误；无限流保护

**利益相关者**:
- 开发团队：需要可维护、可测试的代码
- 用户：需要更快的启动速度、更稳定的体验
- 安全团队：需要防止本地权限提升攻击

**约束**:
- 必须保持向后兼容，直到迁移完成
- 不能增加启动时间（当前 ~3s）
- Python Gateway 代码变更最小化

## 目标 / 非目标

**目标**:
1. **清晰架构**: 建立分层架构（Application → Services → Utilities），消除全局状态
2. **类型安全**: 所有 IPC 调用在编译时类型检查，运行时验证
3. **安全加固**: 防止本地 API 劫持、日志泄露、输入注入
4. **可测试性**: 所有服务可独立测试，80% 代码覆盖率
5. **开发体验**: 实时日志、服务监控、调试配置

**非目标**:
- 不重写 Python Gateway 核心逻辑（仅添加认证中间件）
- 不改变前端 UI 结构（仅更新 API client 认证）
- 不优化 Gateway 性能（保持现有 P95 延迟）
- 不支持多窗口架构（v2.0.0 仍为单窗口）

## 决策

### 决策 1: 依赖注入 + 服务注册表

**选择**: 使用 Application 类管理服务生命周期，通过拓扑排序自动计算启动顺序

**理由**:
- ✅ 消除全局变量，依赖关系显式声明
- ✅ 自动检测循环依赖（编译时失败优于运行时崩溃）
- ✅ 启动失败时自动回滚已启动的服务

**替代方案**:
1. **手动编排（拒绝）**: 继续在 main.ts 中硬编码启动顺序
   - ❌ 修改顺序时易出错
   - ❌ 依赖关系不显式，难以理解
2. **事件驱动（拒绝）**: 服务通过事件总线协调
   - ❌ 调试困难（事件流难追踪）
   - ❌ 无法保证启动顺序

**实现细节**:
```typescript
// Application.register() 时收集依赖
app.register(new GatewayService(['env', 'process-manager']))
app.register(new ViteDevService(['gateway']))

// Application.start() 时拓扑排序
// env → process-manager → gateway → vite-dev
```

**权衡**:
- [启动性能] → 拓扑排序增加 ~5ms，可忽略
- [复杂度] → 引入新抽象，但消除隐式依赖使代码更易理解

---

### 决策 2: 拆解 PythonManager 为三个服务

**选择**: 
- `ProcessManager`: 通用进程启动/终止（SIGTERM → SIGKILL）
- `HealthMonitor`: 健康检查 + 指数退避 + 事件发射
- `GatewayService`: 编排上述两者 + 断路器状态

**理由**:
- ✅ 单一职责，每个类 <200 行
- ✅ ProcessManager 可复用（未来可能管理其他进程）
- ✅ HealthMonitor 可独立测试（mock HTTP 请求）

**替代方案**:
1. **保持 PythonManager 单体（拒绝）**: 添加更多方法
   - ❌ 违反单一职责，测试困难
2. **拆分为更多服务（拒绝）**: ProcessManager、HealthChecker、CircuitBreaker、GatewayService
   - ❌ 过度工程，服务间协调成本高

**实现细节**:
```typescript
class GatewayService implements Service {
  constructor(
    private process: ProcessManager,
    private health: HealthMonitor,
    private circuitBreaker: CircuitBreaker
  ) {}
  
  async start() {
    await this.process.start()
    await this.health.waitUntilHealthy()
    this.health.startMonitoring()
    this.health.on('unhealthy', () => this.circuitBreaker.recordFailure())
  }
}
```

**权衡**:
- [文件数量] → 3 个文件代替 1 个，但每个职责清晰
- [性能] → 无影响（仅重构，逻辑不变）

---

### 决策 3: IPC 类型安全使用 Zod + Registry 模式

**选择**: 
- 集中定义 `IpcSchema` 对象，每个处理器声明 Zod schema
- `IpcRegistry.register()` 在运行时验证输入/输出
- TypeScript 从 schema 推断类型（`z.infer<typeof schema>`）

**理由**:
- ✅ 编译时类型检查 + 运行时验证双重保护
- ✅ Schema 作为 Main 和 Renderer 间的契约
- ✅ 自动生成错误响应格式（统一为 `{error, message, details?}`）

**替代方案**:
1. **仅 TypeScript 类型（拒绝）**: 定义接口但不运行时验证
   - ❌ Renderer 可发送错误数据导致 Main 崩溃
2. **手动验证（拒绝）**: 每个处理器内部检查类型
   - ❌ 重复代码，验证逻辑不一致
3. **tRPC（拒绝）**: 使用成熟的类型安全 RPC 框架
   - ❌ 引入大型依赖，仅需其 10% 功能
   - ❌ 与 Electron IPC 集成复杂

**实现细节**:
```typescript
// 定义 schema
const IpcSchema = {
  'shell:openExternal': {
    input: z.object({ url: z.string().url() }),
    output: z.object({ success: z.boolean() }),
    validate: async (input) => {
      if (!TRUSTED_DOMAINS.includes(new URL(input.url).hostname)) {
        throw new Error('Untrusted domain')
      }
    }
  }
}

// 注册处理器（类型自动推断）
IpcRegistry.register('shell:openExternal', async (input) => {
  // input 类型为 { url: string }
  await shell.openExternal(input.url)
  return { success: true }
})
```

**权衡**:
- [运行时开销] → 每次调用验证增加 ~0.5ms，可接受
- [迁移成本] → 需要为 50+ IPC 处理器添加 schema（逐步迁移）

---

### 决策 4: Gateway 认证使用随机 Bearer Token

**选择**: 
- Main 进程启动时生成 32 字节随机 hex token
- 通过 `GATEWAY_AUTH_TOKEN` 环境变量传递给 Python Gateway
- Gateway 中间件验证 `Authorization: Bearer <token>`
- Renderer 通过 IPC 获取 token（`window.electronAPI.getGatewayAuthToken()`）

**理由**:
- ✅ 防止本地进程劫持（未知 token 无法调用 API）
- ✅ 简单实现（无需 TLS/证书）
- ✅ 每次启动 token 不同，防止重放攻击

**替代方案**:
1. **无认证（当前状态，拒绝）**: 任何本地进程可调用
   - ❌ 安全漏洞，本地恶意软件可提权
2. **TLS 客户端证书（拒绝）**: 使用 mTLS
   - ❌ 过度工程，证书管理复杂
   - ❌ Python aiohttp 配置繁琐
3. **基于文件的 token（拒绝）**: 写入 .token 文件
   - ❌ 文件权限问题（其他用户可能读取）
   - ❌ 需要清理逻辑

**实现细节**:
```typescript
// Main 进程
const token = crypto.randomBytes(32).toString('hex')
process.env.GATEWAY_AUTH_TOKEN = token

// Python Gateway (gateway/middleware/auth.py)
@web.middleware
async def auth_middleware(request, handler):
    if request.path == '/health':
        return await handler(request)
    
    auth_header = request.headers.get('Authorization', '')
    if auth_header != f'Bearer {os.environ["GATEWAY_AUTH_TOKEN"]}':
        raise web.HTTPForbidden()
    
    return await handler(request)
```

**权衡**:
- [兼容性] → 开发模式需要禁用认证（通过 `NODE_ENV=development` 跳过）
- [性能] → 每次请求验证增加 ~0.1ms，可忽略

---

### 决策 5: 日志脱敏使用正则表达式 + 白名单

**选择**: 
- 创建 `sanitizeLog()` 函数，应用于所有日志输出
- 使用正则匹配 API keys、Bearer tokens、密码、邮箱、JWTs
- 只保留前 N + 后 M 字符（如 `sk-ant-...cdef`）

**理由**:
- ✅ 防止密钥泄露到日志文件
- ✅ 正则模式可扩展（添加新密钥格式）
- ✅ 仍保留部分信息用于调试（不是完全 `***`）

**替代方案**:
1. **无脱敏（当前状态，拒绝）**: 密钥可能出现在日志
   - ❌ 安全漏洞，日志文件泄露等同密钥泄露
2. **完全移除（拒绝）**: 匹配到密钥直接替换为 `[REDACTED]`
   - ❌ 调试困难（无法区分不同密钥）
3. **结构化日志（拒绝）**: 使用 JSON 日志 + 字段级脱敏
   - ❌ 改动大，需要重写所有日志调用
   - ❌ Python Gateway 也需同步改动

**实现细节**:
```typescript
function sanitizeLog(message: string): string {
  return message
    .replace(/sk-ant-[\w-]{40,}/g, (match) => 
      `${match.slice(0, 7)}...${match.slice(-4)}`
    )
    .replace(/Bearer\s+[\w-]+/gi, 'Bearer ***')
    .replace(/password["']\s*[:=]\s*["']([^"']+)["']/gi, 'password="***"')
    .replace(/\b[\w._%+-]+@[\w.-]+\.[a-z]{2,}\b/gi, (email) => 
      `${email.slice(0, 2)}***@${email.split('@')[1]}`
    )
}
```

**权衡**:
- [性能] → 每条日志正则匹配增加 ~0.2ms，可接受
- [误判] → 可能误匹配非密钥字符串（通过白名单缓解）

---

### 决策 6: 测试策略 - Vitest + Playwright

**选择**: 
- Vitest 用于单元测试和集成测试（80% 覆盖率目标）
- Playwright 用于 E2E 测试（关键流程：启动、IPC 通信、Gateway 调用）
- CI 中先运行单元测试（快速失败），再运行 E2E 测试

**理由**:
- ✅ Vitest 与 Vite 集成好，速度快（<10s 运行全部单元测试）
- ✅ Playwright 支持 Electron，截图 + 视频回放方便调试
- ✅ 分层测试：单元测试覆盖逻辑、E2E 测试覆盖集成

**替代方案**:
1. **Jest + Spectron（拒绝）**: 传统 Electron 测试组合
   - ❌ Spectron 已弃用
   - ❌ Jest 与 Vite 集成差
2. **仅 E2E 测试（拒绝）**: 只用 Playwright
   - ❌ 运行慢（>1 分钟），反馈周期长
   - ❌ 失败时难以定位问题（覆盖层级太高）
3. **仅单元测试（拒绝）**: 只用 Vitest
   - ❌ 无法发现集成问题（如 IPC 协议不匹配）

**实现细节**:
```typescript
// tests/unit/services/gateway.service.test.ts
describe('GatewayService', () => {
  it('should start process and wait for health', async () => {
    const mockProcess = vi.fn().mockResolvedValue(undefined)
    const mockHealth = { waitUntilHealthy: vi.fn() }
    
    const service = new GatewayService(mockProcess, mockHealth)
    await service.start()
    
    expect(mockProcess).toHaveBeenCalled()
    expect(mockHealth.waitUntilHealthy).toHaveBeenCalled()
  })
})

// tests/e2e/startup.spec.ts
test('应用启动并显示窗口', async ({ electronApp }) => {
  const window = await electronApp.firstWindow()
  await expect(window).toHaveTitle(/Hermes/)
})
```

**权衡**:
- [CI 时间] → 总测试时间 ~2 分钟（单元 10s + E2E 1.5 分钟）
- [维护成本] → E2E 测试脆弱（UI 变化需要更新）

## 风险 / 权衡

### [风险] 迁移过程中服务重复注册导致冲突
**场景**: Phase 1 时新旧代码共存，可能同时启动 PythonManager 和 GatewayService

**缓解措施**:
- 使用功能开关 `USE_NEW_LIFECYCLE` 环境变量控制
- 旧代码路径检查开关，如果启用则跳过
- 单元测试覆盖两种模式

---

### [风险] Gateway 认证破坏现有开发工具
**场景**: 外部工具（如 Postman、curl）直接调用 Gateway 无法获取 token

**缓解措施**:
- 开发模式（`NODE_ENV=development`）禁用认证
- 生产模式启动时在控制台打印 token（仅当 `--debug` 标志）
- 提供 `/auth/token` 端点（需要 IPC 调用获取临时令牌）

---

### [风险] IPC Schema 迁移工作量大
**场景**: 50+ IPC 处理器需要手动添加 Zod schema

**缓解措施**:
- 分阶段迁移（Phase 0: 安全相关，Phase 1: 其他）
- 未迁移的处理器继续使用 `ipcMain.handle()`（共存）
- 提供代码生成工具（`npm run codegen:ipc`）从 TypeScript 类型生成 schema

---

### [风险] 测试覆盖率目标难以达成
**场景**: 遗留代码复杂，难以 mock 依赖

**缓解措施**:
- 80% 为目标，非硬性要求（CI 不阻塞）
- 重点覆盖新代码（services/、ipc/、security/）
- 遗留代码仅覆盖关键路径

---

### [权衡] 服务抽象增加文件数量
**影响**: 从 1 个 main.ts 变为 services/ 下 10+ 文件

**判断**: 可接受
- 每个文件职责清晰，易于定位问题
- IDE 导航工具（Cmd+P）使多文件开销可忽略
- 新开发者通过文件名理解架构（service-interface.ts、gateway.service.ts）

---

### [权衡] 运行时验证增加延迟
**影响**: IPC 调用增加 ~0.5ms（Zod 验证）

**判断**: 可接受
- 大部分 IPC 调用非性能关键路径（用户交互触发）
- 换来类型安全和更好的错误信息
- 可通过缓存验证结果优化（如果成为瓶颈）

## 迁移计划

### Phase 0: 安全修复 + 测试搭建（第 1 周）
**目标**: 修复高危漏洞，建立测试基础

1. 添加 Gateway 认证（Main 进程生成 token，Python 添加中间件）
2. 实现日志脱敏（`sanitizeLog()` 函数）
3. 搭建 Vitest 和 Playwright 配置
4. 编写第一批单元测试（EnvManager、ConfigManager）

**验证**: 
- `npm run test:unit` 通过
- Gateway 调用需要 token，否则 403
- 日志文件不包含 API keys

**回滚**: 移除认证中间件，恢复原始日志

---

### Phase 1: 新抽象（第 2 周）
**目标**: 引入新架构，与旧代码共存

1. 实现 `Service` 接口
2. 实现 `Application` 类（服务注册、拓扑排序）
3. 实现 `ProcessManager`、`HealthMonitor`
4. 实现 `IpcRegistry`（仅迁移 3 个 IPC 处理器作为示例）

**验证**: 
- `USE_NEW_LIFECYCLE=true` 时应用正常启动
- `USE_NEW_LIFECYCLE=false` 时回退到旧代码
- 单元测试覆盖率 >40%

**回滚**: 设置 `USE_NEW_LIFECYCLE=false`

---

### Phase 2: 渐进迁移（第 3-4 周）
**目标**: 逐步迁移现有服务

1. 创建 `GatewayService`（包装 ProcessManager + HealthMonitor）
2. 创建 `ViteDevService`（迁移 ViteDevServer 逻辑）
3. 创建 `WindowService`（管理 BrowserWindow 生命周期）
4. 迁移剩余 IPC 处理器到 IpcRegistry（每天 5-10 个）
5. 旧代码标记 `@deprecated`

**验证**: 
- 所有服务通过 Application 管理
- main.ts 减少到 ~100 行
- 单元测试覆盖率 >60%

**回滚**: 
- 保留旧代码路径，通过功能开关切换
- Git revert 到 Phase 1 末

---

### Phase 3: 完全切换（第 5-6 周）
**目标**: 移除旧代码，清理技术债

1. 删除 `python-manager.ts`、旧的 `main.ts` 启动逻辑
2. 移除 `USE_NEW_LIFECYCLE` 功能开关
3. 所有 IPC 处理器迁移完成
4. 添加开发工具页面（日志查看器、服务面板）
5. 完善文档和 VSCode 调试配置

**验证**: 
- `npm run test:coverage` 达到 80%
- `npm run test:e2e` 通过所有测试
- 金丝雀测试 3 天无问题

**回滚**: 
- Git revert 到 Phase 2 末
- 需要手动恢复部分删除的代码

---

### 金丝雀测试
**策略**: 在开发机器上运行 3 天，监控关键指标

**监控指标**:
- 启动时间（目标: <3.5s，当前 ~3s）
- Gateway 健康检查延迟（目标: P95 <100ms）
- 错误率（目标: 0 崩溃）
- CPU 占用（目标: 闲置 <5%）

**失败条件**: 
- 启动时间 >5s
- 出现 2 次以上崩溃
- CPU 占用 >20%

**回滚流程**: 
1. 设置 `USE_NEW_LIFECYCLE=false`（如果在 Phase 1-2）
2. Git revert 到上一个稳定版本
3. 重启应用验证

## 开放问题

1. **IPC Schema 自动生成**: 是否值得投入时间开发 `npm run codegen:ipc` 工具？
   - 可能节省迁移时间（50+ 处理器 × 5 分钟 = 4 小时）
   - 但工具本身开发需要 1-2 天
   - **决策点**: Phase 1 末评估手动迁移进度

2. **服务热重载**: 开发模式是否需要支持修改服务代码后无需重启应用？
   - 可以提升开发体验
   - 但实现复杂（需要解决状态迁移问题）
   - **决策点**: v2.1.0 考虑，v2.0.0 不实现

3. **多窗口支持**: 未来如果需要多窗口，Application 类如何管理？
   - 选项 1: 每个窗口独立 Application 实例（服务隔离）
   - 选项 2: 全局单例 Application，窗口共享服务
   - **决策点**: 需求明确后再设计（当前不阻塞 v2.0.0）

4. **性能监控**: 是否需要集成 APM 工具（如 Sentry Performance）？
   - 可以监控生产环境性能
   - 但增加依赖和配置复杂度
   - **决策点**: Phase 3 评估，可能作为可选功能
