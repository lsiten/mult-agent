# Electron Automated Tests

使用 Playwright 自动化测试 Electron 应用的 onboarding wizard 功能。

## 安装依赖

```bash
cd electron-app
npm install
```

这会自动安装 Playwright 和相关依赖。

## 运行测试

### 完整测试套件

```bash
npm test
```

### UI 模式（可视化测试）

```bash
npm run test:ui
```

在 UI 模式下可以：
- 查看每个测试步骤的截图
- 逐步调试测试
- 查看测试执行时间线

### 调试模式

```bash
npm run test:debug
```

逐步调试测试，适合排查问题。

## 测试内容

### 主要测试场景

1. **首次启动检测**
   - ✓ 验证 onboarding modal 自动显示
   - ✓ 检查步骤进度指示器

2. **步骤 1: 语言选择**
   - ✓ 验证语言选择器显示
   - ✓ 选择语言并导航到下一步

3. **步骤 2: 提供商配置**
   - ✓ 验证提供商下拉菜单
   - ✓ 填写 API 密钥
   - ✓ 测试连接按钮（可选）
   - ✓ 导航到下一步

4. **步骤 3: 可选功能**
   - ✓ 验证 Vision、Browser、Search 配置
   - ✓ 跳过或配置功能
   - ✓ 导航到完成页

5. **步骤 4: 完成**
   - ✓ 显示配置摘要
   - ✓ 点击"开始使用"完成向导

6. **持久化验证**
   - ✓ 重启应用后不再显示 modal
   - ✓ 验证 .onboarding-complete 文件创建

7. **配置警告横幅**
   - ✓ 未配置提供商时显示警告
   - ✓ "Complete Setup" 按钮重新打开 modal

### 边缘情况测试

1. **ESC 键关闭**
   - ✓ 按 ESC 关闭 modal
   - ✓ 创建标记文件

2. **跳过向导**
   - ✓ "Skip Guide" 按钮功能
   - ✓ 创建标记文件

3. **表单验证**
   - ✓ WebSocket URL 格式验证
   - ✓ 必填字段验证

## 测试隔离

测试使用独立的用户数据目录：
- 测试目录：`/tmp/hermes-electron-test`
- 与生产数据完全隔离
- 每次测试前自动清理

## 测试报告

测试完成后会生成：
- 终端输出：实时测试结果
- HTML 报告：`test-results/html/index.html`
- 截图和视频：失败测试的调试信息

打开 HTML 报告：
```bash
npx playwright show-report test-results/html
```

## CI/CD 集成

测试脚本适合集成到 CI/CD 流程：

```yaml
# GitHub Actions 示例
- name: Install dependencies
  run: npm ci

- name: Run tests
  run: npm test

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results/
```

## 调试技巧

### 查看应用 UI

测试运行时可以看到 Electron 窗口（非 headless）。

### 添加断点

在测试代码中添加：
```javascript
await page.pause(); // 暂停测试，打开调试器
```

### 查看页面状态

```javascript
await page.screenshot({ path: 'debug.png' });
console.log(await page.content());
```

### 增加等待时间

如果测试不稳定，增加超时：
```javascript
await page.waitForTimeout(2000); // 等待 2 秒
```

## 常见问题

### Q: 测试失败提示找不到元素

A: 可能的原因：
1. React 渲染延迟 - 增加 `waitForTimeout`
2. 选择器错误 - 使用 Playwright Inspector 检查
3. 应用启动慢 - 增加 `beforeAll` 中的等待时间

### Q: Electron 无法启动

A: 检查：
1. 是否已编译 TypeScript：`npm run build`
2. Python 环境是否正常
3. 端口冲突（8642）

### Q: 测试在 CI 中失败

A: CI 环境需要：
1. 显示服务器（Xvfb）
2. 合适的权限
3. 增加超时时间

## 扩展测试

添加新测试场景：
1. 在 `tests/` 目录创建 `*.test.js` 文件
2. 使用 Playwright Test API
3. 运行 `npm test` 执行所有测试

示例：
```javascript
test('should validate email format', async () => {
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill('invalid-email');
  await expect(page.locator('text=/Invalid email/i')).toBeVisible();
});
```

## 参考资料

- [Playwright 文档](https://playwright.dev)
- [Electron + Playwright](https://playwright.dev/docs/api/class-electron)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
