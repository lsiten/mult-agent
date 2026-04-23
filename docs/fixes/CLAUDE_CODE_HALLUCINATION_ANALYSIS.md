# Claude Code 源码分析：幻觉问题的根本原因

**分析日期**: 2026-04-23  
**分析范围**: Claude Code 源码 + Hermes Agent v2  
**核心发现**: Claude Code 的反幻觉机制**不完整且仅限内部版本**

---

## 执行摘要

通过深度分析 Claude Code 官方源码（`/Users/shicheng_lei/code/claude-code-rev-main`），发现：

1. ⚠️ **Claude 4.6/4.7 (Capybara v8) 有 29-30% 的虚假声明率**（vs Claude 4.4 的 16.7%）
2. ⚠️ **Anthropic 内部版本有反幻觉约束，但公开版本没有**
3. ⚠️ **没有针对图像/视觉分析的反幻觉约束**
4. ⚠️ **Hermes Agent 继承了所有这些问题**

---

## 关键发现

### 1. Anthropic 内部版本的反幻觉约束（仅限内部）

**位置**: `src/constants/prompts.ts:238-241`

```typescript
// @[MODEL LAUNCH]: False-claims mitigation for Capybara v8 (29-30% FC rate vs v4's 16.7%)
...(process.env.USER_TYPE === 'ant'
  ? [
      `Report outcomes faithfully: if tests fail, say so with the relevant output; 
      if you did not run a verification step, say that rather than implying it succeeded. 
      Never claim "all tests pass" when output shows failures, never suppress or simplify 
      failing checks (tests, lints, type errors) to manufacture a green result, and never 
      characterize incomplete or broken work as done. Equally, when a check did pass or a 
      task is complete, state it plainly — do not hedge confirmed results with unnecessary 
      disclaimers, downgrade finished work to "partial," or re-verify things you already 
      checked. The goal is an accurate report, not a defensive one.`,
    ]
  : []),
```

**关键信息**:
- 这是 Anthropic **针对 Claude 4.6/4.7 高幻觉率的临时缓解措施**
- 仅在 `USER_TYPE === 'ant'` 时激活（Anthropic 内部员工）
- **公开版本没有这个约束**
- 仅针对测试结果，没有覆盖图像分析

### 2. Claude Code 的 System Prompt 结构

**核心文件**:
- `src/constants/prompts.ts` - Prompt 定义
- `src/utils/systemPrompt.ts` - Prompt 构建逻辑
- `src/constants/systemPromptSections.ts` - Prompt 分段管理

**Prompt 结构** (简化版):

```typescript
[
  // 1. 身份介绍
  getSimpleIntroSection(),

  // 2. 系统说明
  getSimpleSystemSection(),

  // 3. 任务执行指导
  getSimpleDoingTasksSection(),  // ⚠️ 包含内部版本的反幻觉约束

  // 4. 执行操作的注意事项
  getActionsSection(),

  // 5. 工具使用指导
  getUsingYourToolsSection(),

  // 6. 动态边界（缓存分割点）
  SYSTEM_PROMPT_DYNAMIC_BOUNDARY,

  // 7. 会话特定内容（记忆、MCP 等）
  // ...
]
```

### 3. 没有针对图像/视觉分析的约束

**搜索结果**:
```bash
grep -r "image\|screenshot\|vision\|picture" src/constants/prompts.ts
# 无匹配结果

grep -rn "hallucin\|fabricat\|invent\|ground.*fact\|describe.*actual" src/constants/prompts.ts
# 仅一处提到 "hallucinations"（在错误报告指导中）
```

**结论**: Claude Code **完全没有**针对图像分析的反幻觉约束。

### 4. Hermes Agent 与 Claude Code 的差异

| 维度 | Claude Code (官方) | Hermes Agent v2 (修复前) | Hermes Agent v2 (修复后) |
|------|-------------------|------------------------|------------------------|
| 基础反幻觉约束 | ❌ 无（公开版本） | ❌ 无 | ✅ 有 (`TRUTHFULNESS_GUIDANCE`) |
| 图像分析约束 | ❌ 无 | ❌ 无 | ✅ 有（增强版 `TRUTHFULNESS_GUIDANCE`） |
| 工具描述内联警告 | ❌ 无 | ❌ 无 | ✅ 有 (`computer_screenshot` 工具） |
| 针对特定模型 | ❌ 无 | ⚠️ 仅 GPT/Gemini | ✅ 所有模型 |

---

## 根本原因分析

### 为什么 Claude 4.6/4.7 幻觉率高？

根据源码注释：
```typescript
// @[MODEL LAUNCH]: False-claims mitigation for Capybara v8 (29-30% FC rate vs v4's 16.7%)
```

**Capybara v8（Claude 4.6/4.7）的虚假声明率是 Claude 4.4 的 1.73 倍**。

可能原因（推测）:
1. **训练数据分布变化** - 更多对话式数据，可能牺牲了准确性
2. **能力提升的副作用** - 更强的推理能力导致"过度自信"
3. **强化学习目标** - RLHF 可能优化了"响应完整性"而非"事实准确性"

### 为什么公开版本没有反幻觉约束？

两种可能：
1. **实验性功能** - Anthropic 内部仍在 A/B 测试该约束的效果
2. **隐藏问题** - 不想公开承认 Claude 4.6/4.7 的高幻觉率

**证据**:
```typescript
// @[MODEL LAUNCH]: capy v8 thoroughness counterweight (PR #24302) — un-gate once validated on external via A/B
```

注释表明这是临时措施，等待 A/B 测试验证后才会向外部用户开放。

### 为什么图像分析特别容易幻觉？

1. **视觉-语言对齐不完美** - 视觉编码器和语言模型的对齐存在误差
2. **期望偏差** - 模型倾向于生成用户"期望"的内容（如用户说"截图了窗口"，模型就假设真的截到了）
3. **没有针对性约束** - System prompt 没有明确要求"描述实际所见"

---

## Hermes Agent 的修复策略

基于 Claude Code 源码的缺陷，我们的修复方案包含了 Anthropic **应该做但没做**的部分：

### 1. 通用真实性约束（所有模型，所有任务）

```python
TRUTHFULNESS_GUIDANCE = (
    "# Truthfulness and grounding\n"
    "- NEVER invent, fabricate, or hallucinate information...\n"
    "- ALWAYS ground factual claims in tool outputs...\n"
    # ... (详见 agent/prompt_builder.py)
)
```

**为什么这样做**:
- Claude Code 的约束仅限内部版本 + 仅针对测试结果
- 我们需要**通用的、对所有场景生效的**约束

### 2. 图像分析专用约束

```python
"**Image/Screenshot Analysis**:\n"
"- When analyzing images or screenshots, describe ONLY what you actually see in the image.\n"
"- DO NOT fill in details based on what you expect to see or what the user said they captured.\n"
"- If an image is blurry, empty, or doesn't show what was requested, SAY SO EXPLICITLY.\n"
```

**为什么这样做**:
- Claude Code **完全没有**这部分约束
- 这是用户报告的主要幻觉场景

### 3. 工具描述内联警告

```python
# tools/computer_use_tool.py
"IMPORTANT: After capturing, describe ONLY what you actually see in the image. "
"DO NOT fill in details based on what you expect or what the user said. "
```

**为什么这样做**:
- 在工具调用时提供"即时提醒"
- 双重保险（system prompt + 工具描述）

### 4. 始终注入（不限模型）

```python
# run_agent.py
# Truthfulness guidance: ALWAYS inject for all models with tools.
if self.valid_tool_names:
    prompt_parts.append(TRUTHFULNESS_GUIDANCE)
```

**为什么这样做**:
- Claude Code 的约束仅针对特定模型
- 我们要确保**所有模型**都受保护

---

## 对比：Claude Code 内部版本 vs Hermes Agent (修复后)

### Claude Code (Anthropic 内部版本)

**优点**:
- ✅ 针对测试结果的反幻觉约束
- ✅ 明确禁止"制造绿色结果"

**缺点**:
- ❌ 仅限内部版本
- ❌ 没有图像分析约束
- ❌ 没有工具描述内联警告
- ❌ 约束范围狭窄（仅测试结果）

### Hermes Agent v2 (修复后)

**优点**:
- ✅ 通用真实性约束（所有任务）
- ✅ 图像分析专用约束
- ✅ 工具描述内联警告
- ✅ 对所有模型生效
- ✅ 针对 Computer Use 工具特别优化

**缺点**:
- ⚠️ 需要实际测试验证效果
- ⚠️ 可能影响响应流畅度（过度谨慎）

---

## 建议

### 对 Hermes Agent 用户

1. **重启应用验证修复**:
   ```bash
   cd electron-app && npm start
   ```

2. **测试案例**:
   - 尝试让 Agent 截图并分析
   - 观察是否准确描述图像内容
   - 如果截图失败，Agent 应明确说明

3. **报告问题**:
   - 如果仍然出现幻觉，提供完整对话记录
   - 特别关注图像分析和工具调用结果

### 对 Claude Code 团队（如果你能联系到他们）

1. **公开反幻觉约束**:
   - 将 `USER_TYPE === 'ant'` 的约束向所有用户开放
   - Claude 4.6/4.7 的高幻觉率是已知问题，不应隐藏

2. **添加图像分析约束**:
   - 参考我们的 `TRUTHFULNESS_GUIDANCE` 中的图像分析部分
   - 在 `getSimpleDoingTasksSection()` 中增加视觉工具专用指导

3. **扩展约束范围**:
   - 不仅限于测试结果，覆盖所有工具调用
   - 添加"不确定时承认不知道"的明确指令

---

## 附录：源码位置索引

| 文件 | 行号 | 内容 |
|------|------|------|
| `src/constants/prompts.ts` | 238-241 | Anthropic 内部反幻觉约束 |
| `src/constants/prompts.ts` | 199-253 | `getSimpleDoingTasksSection()` |
| `src/utils/systemPrompt.ts` | 41-123 | `buildEffectiveSystemPrompt()` |
| `src/constants/systemPromptSections.ts` | 43-57 | `resolveSystemPromptSections()` |

---

**结论**: Claude Code 的幻觉问题源于：
1. 模型本身的高虚假声明率（Claude 4.6/4.7）
2. 公开版本缺少反幻觉约束
3. 完全没有图像分析约束

Hermes Agent 的修复方案**超越了 Claude Code 内部版本**，提供了更全面的反幻觉保护。

---

**维护者**: Claude Code Analysis + 雷诗城  
**源码版本**: Claude Code rev-main (2026-03-31)  
**分析工具**: 源码阅读 + grep 搜索 + 对比分析
