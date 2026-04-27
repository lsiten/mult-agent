# PDF Processing Guide

## Goal

把 PDF 中的招聘信息稳定提取成 JSON，并尽量避免“只看第一页就结束”的问题。

## Default Policy

- PDF 默认按多页文档处理
- 如果用户没有显式限制页码，默认目标是覆盖所有相关页面
- “前两页检查”是最低要求，不是默认结束条件
- 只有确认单页，或用户明确限定页码，才允许不是多页模式

## Extraction Order

处理 PDF 时使用以下优先顺序：

1. 先尝试文本层提取
2. 如果文本层不存在、乱码、丢字段或结构混乱，则切换到页面图片识别
3. 如果文本层与页面图片结果冲突，优先保留更完整、更接近页面原文的版本，并把不确定片段写入 `extraction_meta.raw_snippets`

## Minimum Page Coverage

- 单个 PDF 至少应确认是否为单页
- 未确认单页前，不要把 PDF 当成单页文档
- 如果用户没有限制页码，默认应覆盖所有相关页
- 如果 `page_count >= 2`，默认至少检查前 `2` 页
- 不能因为第一页已经有岗位标题，就直接停止
- 如果第 `2` 页继续补充“岗位职责”“任职要求”“技能要求”“福利”“公司信息”，应继续向后检查

## When To Continue Beyond Page 2

满足以下任一条件，应继续往后分析：

- 第 `2` 页仍然属于同一岗位正文
- 第 `2` 页出现“续”“更多职责”“任职要求”“加分项”“岗位说明”等延续性标题
- 第 `2` 页新增了第一页没有的关键字段
- 文档明显是多页 JD 模板，而不是单页海报

## When It Is Acceptable To Stop

满足以下条件之一，才可以停止：

- 已确认 PDF 只有 `1` 页
- 用户明确要求只提取指定页码或页码范围
- 已检查到文档末页
- 后续页面明显不是岗位正文，例如版权页、封底、空白页、无关附录
- 连续一页没有新增该岗位的结构化字段，且当前岗位信息已经基本闭合

## Coverage Recording

PDF 抽取时，必须同步填写：

- `source.page_count`
- `source.pages_analyzed`
- `source.extraction_mode`
- `source_info.page_range`
- `extraction_meta.coverage_status`
- `extraction_meta.coverage_note`

推荐值：

- `source.extraction_mode`: `text`、`ocr`、`mixed`
- `extraction_meta.coverage_status`: `complete`、`partial`、`unknown`

## Merge Rules

- 同一岗位跨页出现时，合并为一个 `record`
- 多个岗位同时出现在一个 PDF 中时，拆成多个 `record`
- 同一字段在多页重复出现时，保留更完整的版本
- 同一字段出现冲突时，优先保留更明确、更新或更完整的原文，并在 `raw_snippets` 中保留冲突片段

## Failure Handling

如果环境无法可靠读取 PDF：

- 仍可输出 JSON
- 但必须把结果标记为 `partial` 或 `unknown`
- 必须在 `coverage_note` 或 `ocr_warnings` 说明限制原因
- 不允许把部分页面结果当作完整文档结果
- 不允许因为系统只拿到第一页，就默认第一页等于全文

## Practical Rule

对招聘 PDF，默认把“多页提取”视为基本要求，把“前两页检查”视为最低起点，而不是优化项。
