# 开发记录

- 开发任务描述：修复聊天消息列表在 `react-virtuoso` 中触发 `Maximum update depth exceeded` 的无限更新问题。
- 开发时间：2026-04-25
- 开发进度：已完成 `MessageList` 顶部加载与自动跟随输出回调的稳定化处理，并完成诊断检查。
- 开发结果：将 `Virtuoso` 的顶部加载逻辑改为带 ref 防重入的异步触发，避免在列表回调中同步反复 `setState`；同时稳定 `followOutput` 回调引用。`MessageList.tsx` 当前无新增诊断错误。
