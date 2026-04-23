# Agent 幻觉问题修复文档

**日期**: 2026-04-23  
**版本**: v2.1.1  
**问题**: Agent 会"胡说"，说出并非真实存在的内容  
**状态**: ✅ 已修复

---

## 问题诊断

### 真实案例

用户报告：使用 Computer Use 工具截图后，Agent 声称看到了：
> "当前打开的应用程序包括：Google Chrome 浏览器（多个标签页）、Notion 应用、Claude 应用、Hermes Agent 客户端应用、Visual Studio Code（代码编辑器）"

但实际截图内容是：**红杉森林的桌面壁纸**，完全没有任何应用窗口。

这是典型的**视觉幻觉** - Agent 基于用户的描述（"Mission Control 截图"）编造了窗口列表，而非真实描述图像内容。

### 根本原因

Hermes Agent 的 system prompt 缺少明确的**真实性约束**，导致模型在以下场景下可能产生幻觉：

1. **过度自信** - 在不确定时不承认"不知道"，而是编造答案
2. **工具结果误读** - 将工具返回的结果解读为自己期望的内容
3. **未经验证的断言** - 声称文件存在、函数有某个功能，但没有实际检查
4. **强制工具使用的副作用** - `TOOL_USE_ENFORCEMENT_GUIDANCE` 要求"立即执行"，但没有明确禁止编造执行结果
5. **视觉幻觉（重点）** - 分析图像时填充用户预期的内容，而非描述实际所见

### 关键发现

检查 `agent/prompt_builder.py` 和 `run_agent.py` 后发现：

1. **现有防护仅针对特定模型**:
   ```python
   TOOL_USE_ENFORCEMENT_MODELS = ("gpt", "codex", "gemini", "gemma", "grok")
   ```
   Claude 模型（项目主要使用的模型）不在列表中！

2. **缺少通用真实性约束**:
   - `OPENAI_MODEL_EXECUTION_GUIDANCE` 包含反幻觉指令，但只对 GPT/Codex 生效
   - 没有适用于所有模型的基础真实性约束

3. **工具强制指令可能误导**:
   ```
   "You MUST use your tools to take action..."
   "Never end your turn with a promise of future action — execute it now."
   ```
   这可能让模型认为"必须立即产出结果"，从而编造工具输出。

---

## 修复方案

### 1. 新增 `TRUTHFULNESS_GUIDANCE`

在 `agent/prompt_builder.py` 中添加了明确的真实性约束：

```python
TRUTHFULNESS_GUIDANCE = (
    "# Truthfulness and grounding\n"
    "- NEVER invent, fabricate, or hallucinate information. If you don't know something, "
    "explicitly say so — uncertainty is better than falsehood.\n"
    "- ALWAYS ground factual claims in tool outputs or provided context. If you make a "
    "statement about file contents, code behavior, or system state, it MUST be based on "
    "a tool call result you just received or context explicitly provided by the user.\n"
    "- DO NOT assume files exist, functions work a certain way, or dependencies are "
    "installed unless you have verified this through tools (read_file, terminal, etc.).\n"
    "- When a tool returns unexpected results, DO NOT reinterpret or rationalize them to "
    "fit your expectations — report what the tool actually returned.\n"
    "- If asked about something you cannot verify with available tools, offer to search "
    "or check rather than guessing from training data.\n"
    "Accuracy is your highest priority. A response that admits \"I need to check this\" "
    "is infinitely better than a confident fabrication."
)
```

**关键原则**:
- ✅ 禁止编造信息
- ✅ 要求基于工具输出的事实陈述
- ✅ 禁止假设文件/函数存在
- ✅ 禁止合理化工具意外结果
- ✅ 明确"不确定时承认不知道"

### 2. 修改 `TOOL_USE_ENFORCEMENT_GUIDANCE`

在现有的工具强制指令中添加了澄清：

```python
"IMPORTANT: Tool enforcement does NOT mean fabricating results. Always wait for "
"actual tool outputs before making claims about what a tool did or found."
```

### 3. 增强图像分析指令

在 `TRUTHFULNESS_GUIDANCE` 中特别针对图像/截图分析添加了约束：

```python
"**Image/Screenshot Analysis**:\n"
"- When analyzing images or screenshots, describe ONLY what you actually see in the image.\n"
"- DO NOT fill in details based on what you expect to see or what the user said they captured.\n"
"- If an image is blurry, empty, or doesn't show what was requested, SAY SO EXPLICITLY.\n"
"- Example: If a screenshot appears to be a forest photo instead of app windows, report: "
"\"This screenshot shows a forest scene, not application windows. The screenshot may not "
"have captured correctly. Would you like to try again?\"\n"
```

### 4. 在 Computer Use 工具中添加警告

在 `tools/computer_use_tool.py` 的 `computer_screenshot` 工具描述中添加了内联警告：

```python
"IMPORTANT: After capturing, describe ONLY what you actually see in the image. "
"DO NOT fill in details based on what you expect or what the user said. "
"If the screenshot shows unexpected content (e.g., a wallpaper instead of windows), "
"report exactly that and offer to retry the capture."
```

### 5. 修改注入逻辑（关键！）

在 `run_agent.py:3700-3710` 中，将 `TRUTHFULNESS_GUIDANCE` 设置为**始终注入**，不受 `tool_use_enforcement` 配置限制：

```python
# Truthfulness guidance: ALWAYS inject for all models with tools.
# This is the foundation for preventing hallucinations.
if self.valid_tool_names:
    prompt_parts.append(TRUTHFULNESS_GUIDANCE)
```

**为什么这样做**:
- 原本的 `TOOL_USE_ENFORCEMENT_GUIDANCE` 只对特定模型注入
- Claude 模型不在列表中，导致缺少防护
- 真实性约束是**基础性的**，应该对所有模型生效

---

## 测试验证

创建了 `tests/run_agent/test_truthfulness_guidance.py` 来验证：

1. ✅ `TRUTHFULNESS_GUIDANCE` 包含反幻觉指令
2. ✅ 可以正确导入
3. ✅ 在 system prompt 构建时被注入

运行测试：
```bash
pytest tests/run_agent/test_truthfulness_guidance.py -v
```

---

## 预期效果

修复后，Agent 应该：

1. **更诚实** - 不确定时明确说"我需要检查这个"
2. **更谨慎** - 不假设文件/函数存在，先用工具验证
3. **更准确** - 基于实际工具输出回答，而非猜测
4. **更透明** - 工具返回意外结果时如实报告，不合理化

---

## 使用建议

### 对于用户

如果发现 Agent 仍然"胡说"，请提供具体案例：

1. **完整对话记录** - 包括你的提示词和 Agent 的回复
2. **指出幻觉内容** - 哪句话是编造的？实际情况是什么？
3. **复现步骤** - 什么样的提示词会触发问题？

可以通过以下方式报告：
```bash
# 查看 Agent 生成的 system prompt（调试用）
export HERMES_DEBUG_PROMPT=1
hermes
```

### 对于开发者

如果需要调整真实性约束的强度：

1. 编辑 `agent/prompt_builder.py` 中的 `TRUTHFULNESS_GUIDANCE`
2. 如需针对特定模型微调，可以在 `run_agent.py:3725-3740` 添加条件逻辑
3. 使用 `pytest tests/run_agent/test_truthfulness_guidance.py` 验证修改

---

## 相关文件

- `agent/prompt_builder.py` - 新增 `TRUTHFULNESS_GUIDANCE`（包含图像分析约束）
- `run_agent.py` - 注入逻辑修改（第 3700-3710 行）
- `tools/computer_use_tool.py` - `computer_screenshot` 工具描述增强（第 641-659 行）
- `tests/run_agent/test_truthfulness_guidance.py` - 验证测试
- `docs/fixes/HALLUCINATION_FIX_2026-04-23.md` - 本文档

---

## 版本历史

| 日期 | 版本 | 改动 |
|------|------|------|
| 2026-04-23 | v2.1.1 | 初版修复 - 添加 `TRUTHFULNESS_GUIDANCE` |

---

**维护者**: Claude Code + 雷诗城  
**审核状态**: 待测试验证
