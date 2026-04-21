# IPC Registry 使用指南

## 概览

IPC Registry 是一个类型安全的 IPC 处理器注册系统，提供：
- **Zod 验证** - 自动验证输入参数
- **限流保护** - 防止滥用（如频繁重启）
- **统一响应格式** - `{ ok: true, data }` 或 `{ ok: false, error, code }`
- **错误处理** - 自动捕获异常并返回错误响应

## 快速开始

### 1. 定义 Schema

在 `src/ipc/ipc-schemas.ts` 中定义输入验证 schema：

```typescript
import { z } from 'zod';

export const MyHandlerSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty'),
  age: z.number().int().min(0).max(120),
});

export type MyHandlerInput = z.infer<typeof MyHandlerSchema>;
```

### 2. 创建处理器

在 `src/ipc/ipc-handlers.ts` 的 `createIpcHandlers` 函数中添加：

```typescript
{
  channel: 'my:handler',
  schema: schemas.MyHandlerSchema,
  handler: async (_event, input) => {
    // input 已通过验证，类型安全
    console.log(`Name: ${input.name}, Age: ${input.age}`);
    return { success: true };
  },
}
```

### 3. 添加限流（可选）

对于敏感操作（如重启服务），添加限流配置：

```typescript
{
  channel: 'my:sensitive',
  schema: schemas.MySensitiveSchema,
  rateLimit: { maxAttempts: 3, windowMs: 60000 }, // 3 次 / 60 秒
  handler: async () => {
    // 处理敏感操作
  },
}
```

### 4. 前端调用

前端通过 `electronAPI` 调用：

```typescript
const result = await window.electronAPI.invoke('my:handler', {
  name: 'Alice',
  age: 25,
});

if (result.ok) {
  console.log('Success:', result.data);
} else {
  console.error('Error:', result.error, result.code);
}
```

## 响应格式

所有 IPC 处理器返回统一格式：

### 成功响应

```typescript
{
  ok: true,
  data: any  // 处理器返回的数据
}
```

### 失败响应

```typescript
{
  ok: false,
  error: string,   // 错误消息
  code?: string    // 错误代码
}
```

### 错误代码

| 代码 | 含义 |
|------|------|
| `VALIDATION_ERROR` | 输入验证失败 |
| `RATE_LIMITED` | 超过限流限制 |
| `HANDLER_ERROR` | 处理器执行错误 |

## 示例

### 示例 1: 简单查询

```typescript
// Schema
export const GetStatusSchema = z.object({
  includeDetails: z.boolean().optional(),
});

// Handler
{
  channel: 'app:getStatus',
  schema: schemas.GetStatusSchema,
  handler: (_event, input) => {
    if (input.includeDetails) {
      return { status: 'running', uptime: 12345, memory: '50MB' };
    }
    return { status: 'running' };
  },
}

// Frontend
const result = await window.electronAPI.invoke('app:getStatus', {
  includeDetails: true,
});
```

### 示例 2: 带限流的重启

```typescript
// Schema
export const RestartSchema = z.object({
  reason: z.string().optional(),
});

// Handler
{
  channel: 'service:restart',
  schema: schemas.RestartSchema,
  rateLimit: { maxAttempts: 3, windowMs: 60000 },
  handler: async (_event, input) => {
    console.log(`Restarting: ${input.reason || 'no reason'}`);
    await someService.restart();
    return { success: true };
  },
}

// Frontend
const result = await window.electronAPI.invoke('service:restart', {
  reason: 'User requested',
});

if (!result.ok && result.code === 'RATE_LIMITED') {
  alert('Too many restart attempts. Please wait.');
}
```

### 示例 3: URL 验证

```typescript
// Schema with custom validation
export const OpenUrlSchema = z.object({
  url: z.string().url().refine(
    (url) => {
      const allowedProtocols = ['http:', 'https:', 'mailto:'];
      const parsed = new URL(url);
      return allowedProtocols.includes(parsed.protocol);
    },
    { message: 'Only http, https, and mailto protocols are allowed' }
  ),
});

// Handler
{
  channel: 'shell:openExternal',
  schema: schemas.OpenUrlSchema,
  handler: async (_event, input) => {
    await shell.openExternal(input.url);
    return { success: true };
  },
}
```

## 已迁移的 IPC 处理器

| 频道 | 功能 | 限流 | Schema |
|------|------|------|--------|
| `shell:openExternal` | 打开外部 URL | ❌ | ✅ 协议白名单 |
| `python:getStatus` | 获取 Gateway 状态 | ❌ | ✅ |
| `python:restart` | 重启 Gateway | ✅ 3/60s | ✅ |
| `gateway:getAuthToken` | 获取认证 token | ❌ | ✅ |
| `vite:getStatus` | 获取 Vite 状态 | ❌ | ✅ |
| `window:minimize` | 最小化窗口 | ❌ | ✅ |
| `window:close` | 关闭窗口 | ❌ | ✅ |
| `onboarding:getStatus` | 获取引导状态 | ❌ | ✅ |
| `onboarding:markComplete` | 标记引导完成 | ❌ | ✅ |
| `onboarding:reset` | 重置引导状态 | ❌ | ✅ |
| `app:getPath` | 获取应用路径 | ❌ | ✅ |
| `diagnostic:getDependencies` | 获取依赖检查 | ❌ | ✅ |
| `diagnostic:getLogs` | 获取日志 | ❌ | ✅ |
| `diagnostic:getLogsPath` | 获取日志路径 | ❌ | ✅ |
| `diagnostic:retry` | 重试启动 | ✅ 3/5s | ✅ |

**总计**: 15 个处理器已迁移

## 待迁移的处理器

| 频道 | 原因 |
|------|------|
| `config:get` | 需要 ConfigManager 支持 get() 方法 |
| `config:set` | 需要 ConfigManager 支持 set() 方法 |
| `env:getAll` | 需要实现环境变量列表功能 |

## 测试

### 单元测试

```bash
npm run test:unit -- tests/unit/ipc/ipc-registry.test.ts
```

测试覆盖：
- ✅ 处理器注册
- ✅ 输入验证（有效 / 无效）
- ✅ 限流（允许 / 拒绝 / 重置）
- ✅ 错误处理
- ✅ 批量注册
- ✅ 清理

### 集成测试

```bash
npm run test:unit -- tests/integration/ipc-handlers.test.ts
```

测试覆盖：
- ✅ 限流实际生效（python:restart）
- ✅ URL 协议验证（shell:openExternal）
- ✅ 服务查询（python:getStatus, vite:getStatus）

## 最佳实践

### 1. 始终定义 Schema

即使处理器不需要输入，也定义一个空对象 schema：

```typescript
export const NoInputSchema = z.object({});
```

### 2. 限流敏感操作

对于重启、删除、修改配置等操作，始终添加限流：

```typescript
rateLimit: { maxAttempts: 3, windowMs: 60000 }  // 3 次 / 1 分钟
```

### 3. 白名单验证

对于用户输入（URL、文件路径），使用白名单验证：

```typescript
z.string().refine((val) => allowedValues.includes(val))
```

### 4. 错误处理

让 IPC Registry 自动捕获错误，不要手动 try/catch：

```typescript
// ❌ 不推荐
handler: async () => {
  try {
    await doSomething();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// ✅ 推荐
handler: async () => {
  await doSomething();  // 错误会自动被捕获
  return { success: true };
}
```

### 5. 类型安全

使用 TypeScript 类型确保前端调用正确：

```typescript
// 导出类型
export type MyHandlerInput = z.infer<typeof MyHandlerSchema>;
export type MyHandlerOutput = { success: boolean };

// 前端使用
const input: MyHandlerInput = { name: 'Alice', age: 25 };
const result = await window.electronAPI.invoke('my:handler', input);
```

## 调试

### 查看注册的处理器

```typescript
console.log(ipcRegistry.getHandlers());
// ['shell:openExternal', 'python:restart', ...]
```

### 重置限流

```typescript
ipcRegistry.resetRateLimit('python:restart');
```

### 查看错误日志

所有错误都会输出到控制台：

```
[IpcRegistry] Error in python:restart: Connection refused
```

## 迁移指南

### 从旧 IPC 迁移到 Registry

**旧代码**:
```typescript
ipcMain.handle('my:handler', async (_event, arg1, arg2) => {
  if (!arg1 || typeof arg2 !== 'number') {
    return { ok: false, error: 'Invalid input' };
  }
  try {
    const result = await doSomething(arg1, arg2);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});
```

**新代码**:
```typescript
// 1. 定义 schema
export const MyHandlerSchema = z.object({
  arg1: z.string().min(1),
  arg2: z.number(),
});

// 2. 添加到 createIpcHandlers
{
  channel: 'my:handler',
  schema: schemas.MyHandlerSchema,
  handler: async (_event, input) => {
    const result = await doSomething(input.arg1, input.arg2);
    return result;  // 自动包装为 { ok: true, data: result }
  },
}
```

## 性能

| 指标 | 值 |
|------|-----|
| 验证耗时 | <1ms (Zod) |
| 限流检查 | <0.1ms |
| 额外开销 | ~1-2ms / 请求 |

对于 99% 的 IPC 调用，性能影响可以忽略不计。

---

**相关文档**:
- [IPC Registry 源码](../src/ipc/ipc-registry.ts)
- [IPC Schemas](../src/ipc/ipc-schemas.ts)
- [IPC Handlers](../src/ipc/ipc-handlers.ts)
- [IPC Registry 测试](../tests/unit/ipc/ipc-registry.test.ts)
