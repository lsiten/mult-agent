# Electron Onboarding 自动化测试指南

通过 Playwright + Chrome DevTools Protocol 自动化测试 Electron 应用。

## 快速开始

### 1. 安装依赖

```bash
cd electron-app
npm install
```

Playwright 会自动下载，无需额外配置。

### 2. 运行快速检查

最简单的方式 - 验证 onboarding modal 是否显示：

```bash
node tests/quick-check.js
```

输出示例：
```
🧪 Quick Onboarding Check

1. Launching Electron app...
   ✓ App launched

2. Checking for onboarding modal...
   ✓ Onboarding modal is VISIBLE
   ✓ Found step indicator: "Step 1/4"
   ✓ Language selection visible

✅ Quick check PASSED - Onboarding modal works!

3. Checking marker file...
   ✓ Marker file does NOT exist (correct for first launch)

4. Closing app...
   ✓ Cleanup complete
```

### 3. 运行完整测试套件

```bash
npm test
```

测试内容：
- ✅ 首次启动显示 modal
- ✅ 步骤 1: 语言选择
- ✅ 步骤 2: 提供商配置
- ✅ 步骤 3: 可选功能
- ✅ 步骤 4: 完成
- ✅ 二次启动不显示 modal
- ✅ 配置警告横幅
- ✅ ESC 键关闭
- ✅ 跳过向导
- ✅ WebSocket URL 验证

## 测试模式

### 普通模式（默认）

```bash
npm test
```

运行所有测试，输出到终端。

### UI 模式（推荐调试）

```bash
npm run test:ui
```

优点：
- 可视化测试执行
- 查看每个步骤的截图
- 时间线视图
- 重试失败的测试

### 调试模式

```bash
npm run test:debug
```

逐步执行测试，暂停在每个操作。

### 单个测试

```bash
npx playwright test tests/onboarding.test.js --grep "should show onboarding modal"
```

### 指定浏览器（无效，Electron 不使用）

Electron 测试不使用 Chromium/Firefox/WebKit，忽略 `--project` 选项。

## 查看测试报告

测试完成后生成 HTML 报告：

```bash
npx playwright show-report test-results/html
```

包含：
- 每个测试的执行时间
- 失败测试的截图
- 失败测试的视频
- 完整的测试日志

## 测试架构

### 测试隔离

每次测试使用独立的用户数据目录：

```
/tmp/hermes-electron-test/
├── config/
│   ├── .initialized
│   └── .onboarding-complete  # 测试创建的标记
├── .env                      # 测试配置
└── state.db                  # 测试数据库
```

测试结束后自动清理，不影响开发环境。

### 测试结构

```javascript
test.describe('功能组', () => {
  let electronApp;
  let page;

  test.beforeAll(async () => {
    // 启动 Electron
    electronApp = await electron.launch({...});
    page = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    // 关闭 Electron
    await electronApp.close();
  });

  test('测试用例', async () => {
    // 测试步骤
    await page.click('button');
    await expect(page.locator('text')).toBeVisible();
  });
});
```

## 选择器策略

### 推荐方式

1. **文本匹配**（最稳定）
   ```javascript
   page.locator('text=/Choose your language/i')
   ```

2. **Role 选择器**
   ```javascript
   page.locator('button:has-text("Next")')
   ```

3. **测试 ID**（最佳实践）
   ```javascript
   // 组件中添加：
   <button data-testid="next-button">Next</button>

   // 测试中使用：
   page.getByTestId('next-button')
   ```

### 避免使用

- ❌ CSS 类名（易变）
- ❌ XPath（脆弱）
- ❌ 深层嵌套选择器

## 调试技巧

### 1. 暂停测试

在测试中添加：
```javascript
await page.pause();
```

打开 Playwright Inspector，逐步执行。

### 2. 截图

```javascript
await page.screenshot({ path: 'debug.png', fullPage: true });
```

### 3. 打印页面内容

```javascript
console.log(await page.content());
```

### 4. 查看控制台日志

```javascript
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
```

### 5. 慢速执行

```javascript
await page.waitForTimeout(1000); // 增加到 1 秒
```

### 6. 查看元素

```javascript
const element = page.locator('button');
console.log(await element.count()); // 找到多少个
console.log(await element.isVisible()); // 是否可见
console.log(await element.textContent()); // 文本内容
```

## 常见问题

### Q1: 测试找不到元素

**症状**: `Error: locator.click: Target closed`

**原因**: 
- React 还在渲染
- Electron 启动慢

**解决**:
```javascript
await page.waitForTimeout(2000); // 增加等待时间
await expect(element).toBeVisible({ timeout: 5000 }); // 增加超时
```

### Q2: Electron 无法启动

**症状**: `Error: Electron executable not found`

**解决**:
```bash
npm install electron --save-dev
npm run build  # 编译 TypeScript
```

### Q3: 端口冲突

**症状**: Gateway 启动失败

**解决**:
```bash
lsof -ti:8642 | xargs kill -9  # 杀死占用端口的进程
```

### Q4: Python 环境问题

**症状**: Gateway 启动失败

**解决**:
```bash
# 检查 Python 环境
ls app/python-runtime/bin/python3

# 重新打包 Python（如果需要）
npm run bundle:python
```

### Q5: 测试超时

**症状**: `Test timeout of 60000ms exceeded`

**解决**:
```javascript
// 在 playwright.config.js 中增加超时
timeout: 120000, // 2 分钟
```

### Q6: 在 CI 中运行失败

**GitHub Actions 示例**:
```yaml
- name: Setup dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y xvfb

- name: Run tests
  run: xvfb-run npm test
```

## 性能优化

### 减少启动时间

1. 使用编译好的代码（`npm run build`）
2. 跳过不必要的初始化
3. 使用快照数据

### 并行执行

Electron 测试**不能**并行运行（单进程限制），但可以分组：

```bash
# 测试组 1
npx playwright test tests/onboarding.test.js

# 测试组 2（独立会话）
npx playwright test tests/settings.test.js
```

### 减少等待时间

用 `waitForSelector` 替代固定延迟：

```javascript
// ❌ 不推荐
await page.waitForTimeout(5000);

// ✅ 推荐
await page.waitForSelector('text=/Complete/i', { timeout: 5000 });
```

## 扩展测试

### 添加新测试文件

```bash
# 创建新测试
touch tests/settings.test.js
```

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Settings Page', () => {
  // ... 测试代码
});
```

### 共享测试工具

创建 `tests/helpers.js`:
```javascript
async function login(page, username, password) {
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

module.exports = { login };
```

使用：
```javascript
const { login } = require('./helpers');

test('should access dashboard after login', async () => {
  await login(page, 'user', 'pass');
  // ...
});
```

## 持续集成

### GitHub Actions

创建 `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: |
          cd electron-app
          npm ci

      - name: Run tests
        run: |
          cd electron-app
          xvfb-run npm test

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: electron-app/test-results/
```

## 最佳实践

### 1. 测试独立性

每个测试应该独立运行，不依赖其他测试。

### 2. 清理数据

`afterAll` 中清理测试数据。

### 3. 有意义的断言

```javascript
// ❌ 弱断言
expect(await page.locator('button').count()).toBeGreaterThan(0);

// ✅ 强断言
await expect(page.locator('button:has-text("Submit")')).toBeVisible();
```

### 4. 测试用户行为

模拟真实用户操作，不直接调用内部 API。

### 5. 避免硬编码延迟

使用 `waitForSelector` 而不是 `waitForTimeout`。

### 6. 测试边界条件

- 空输入
- 无效格式
- 最大值/最小值
- 并发操作

## 参考资料

- [Playwright 官方文档](https://playwright.dev/docs/intro)
- [Electron Testing Guide](https://playwright.dev/docs/api/class-electron)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging Tests](https://playwright.dev/docs/debug)

## 获取帮助

遇到问题时：

1. 查看测试输出和截图
2. 运行 `npm run test:debug`
3. 查看 `test-results/` 目录
4. 阅读 Playwright 文档
5. 搜索 GitHub Issues

---

**测试愉快！** 🎉
