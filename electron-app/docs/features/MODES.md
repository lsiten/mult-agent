# Electron运行模式详解

## 🎯 三种运行模式对比

### 1️⃣ 符号链接开发模式 (npm run dev)

**Python代码位置**:
```
app/python/gateway → 符号链接 → ../../gateway/
```

**应用路径显示**:
```
/Users/shicheng_lei/code/hermes-agent-v2/electron-app/app/python
```

**特点**:
- ✅ Python修改立即生效（符号链接指向源码）
- ✅ 无需重新打包
- ⚠️ 依赖源码目录
- ❌ 不能打包分发

**使用场景**: 日常Python开发

---

### 2️⃣ 打包开发模式 (npm run dev:bundled)

**Python代码位置**:
```
app/python/gateway → 真实目录（源码完整副本）
```

**应用路径显示**:
```
/Users/shicheng_lei/code/hermes-agent-v2/electron-app/app/python
```

**特点**:
- ✅ Python代码独立副本
- ✅ 模拟生产环境
- ⚠️ 仍在开发目录运行（通过node_modules/electron）
- ⚠️ 修改Python需重新打包

**使用场景**: 测试打包逻辑，验证生产构建

---

### 3️⃣ 独立应用模式 (打包后的.app)

**Python代码位置**:
```
Hermes Agent.app/Contents/Resources/app/python/gateway/
```

**应用路径显示**:
```
/Users/.../release/mac-arm64/Hermes Agent.app/Contents/Resources/app/python
```

**特点**:
- ✅ 完全独立，无需源码
- ✅ 可分发给最终用户
- ✅ 所有依赖已打包
- ❌ 无法热更新

**使用场景**: 最终分发给用户

---

## 🔍 如何识别当前模式

### 方法1: 查看进程路径

```bash
ps aux | grep gateway/run.py
```

**输出示例**:

**符号链接/打包开发模式**:
```
.../electron-app/app/python/gateway/run.py
```

**独立应用模式**:
```
.../Hermes Agent.app/Contents/Resources/app/python/gateway/run.py
```

### 方法2: 检查Python目录类型

```bash
cd electron-app
ls -la app/python/gateway
```

**符号链接模式**:
```
lrwxr-xr-x  gateway -> /Users/.../gateway/
```

**打包模式**:
```
drwxr-xr-x  gateway/
```

### 方法3: 在应用中查询

发送消息："当前应用目录"，查看返回路径：

- 包含 `electron-app/app/python` → 开发模式
- 包含 `Hermes Agent.app/Contents/Resources` → 独立应用

---

## 📊 路径对比表

| 模式 | Electron进程 | Python代码 | 可分发 | 热更新 |
|------|-------------|-----------|--------|--------|
| 符号链接开发 | `node_modules/electron` | 源码符号链接 | ❌ | ✅ |
| 打包开发 | `node_modules/electron` | app/python副本 | ❌ | ⚠️  |
| 独立应用 | `Hermes Agent.app` | .app内打包 | ✅ | ❌ |

---

## 🚀 命令速查

### 启动不同模式

```bash
# 符号链接开发模式（Python热更新）
npm run dev

# 打包开发模式（测试生产构建）
npm run dev:bundled

# 构建独立应用
npm run package:mac

# 启动独立应用
open "release/mac-arm64/Hermes Agent.app"
```

### 切换模式

```bash
# 从符号链接 → 打包
npm run bundle:python  # 复制Python代码到app/
npm start

# 从打包 → 符号链接
npm run dev:setup      # 创建符号链接
npm start

# 检查当前模式
ls -la app/python/gateway  # 查看是否为符号链接
```

---

## ⚙️ 配置文件对比

### python-manager.ts 决定Python路径

```typescript
// 开发模式（相对路径）
const appPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app')  // 打包后
  : path.join(__dirname, '../app');          // 开发时
  
const pythonDir = path.join(appPath, 'python');
```

**结果**:
- 开发: `electron-app/app/python`
- 打包: `Hermes Agent.app/Contents/Resources/app/python`

---

## 💡 常见问题

### Q: 为什么开发模式显示源码路径？
A: 这是**故意设计**的。符号链接让你能快速迭代Python代码，修改源文件立即生效。

### Q: 如何验证打包后的独立性？
A: 
1. 构建: `npm run package:mac`
2. 移动.app到其他位置: `mv release/.../*.app ~/Desktop/`
3. 删除源码: `cd ~ && rm -rf hermes-agent-v2` (⚠️ 谨慎操作)
4. 启动.app: 应该正常运行

### Q: 打包后修改Python代码怎么办？
A:
1. 修改源码
2. 重新打包: `npm run bundle:python && npm run package:mac`
3. 重新分发.app

### Q: 开发时如何测试独立应用？
A: 使用 `npm run dev:bundled` 或直接打开 `release/.../*.app`

---

## 🎯 推荐工作流

### 日常开发（推荐）
```bash
npm run dev  # 符号链接模式
# 修改Python → 保存 → Cmd+R刷新
```

### 测试打包
```bash
npm run dev:bundled  # 打包开发模式
# 验证打包逻辑正确
```

### 最终分发
```bash
npm run package:mac  # 生成.app
open "release/mac-arm64/Hermes Agent.app"  # 测试
# 分发.app给用户
```

---

## 📝 技术细节

### app.isPackaged 判断

Electron通过 `app.isPackaged` 判断运行模式：

```typescript
console.log('Is packaged:', app.isPackaged);
```

**结果**:
- `npm start` → `false` (开发)
- `open *.app` → `true` (生产)

### 资源路径解析

```typescript
// 开发模式
process.resourcesPath  // undefined
__dirname              // .../electron-app/dist

// 打包模式  
process.resourcesPath  // .../Hermes Agent.app/Contents/Resources
```

### 符号链接检测

```bash
# 检查是否为符号链接
test -L app/python/gateway && echo "符号链接" || echo "真实目录"

# 查看链接目标
readlink app/python/gateway
```

---

**总结**: 你在开发模式下看到源码路径是**正常且预期的行为**。要测试独立应用，请使用 `npm run package:mac` 打包后运行 `.app` 文件。
