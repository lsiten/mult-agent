---
name: job-posting-image-sqlite
description: Use when the user provides one or more job-posting files and wants structured JSON output, JSON export, or SQLite storage. This skill supports screenshots, photos, PDFs, DOCX, TXT, and recruitment posters from Boss直聘、智联招聘、猎聘、拉勾、前程无忧或企业招聘文档, especially for extracting company, job title, salary, city, experience, education, skills, benefits, responsibilities, explicit hiring requirements, and writing extracted job records into a SQLite job_postings table for later scoring.
---

# Job Posting File JSON

## Overview

这个 skill 用于把招聘截图、招聘海报、岗位照片、PDF、DOCX、TXT 等招聘文件中的信息提取为稳定的 JSON，并在需要时写入 SQLite。

适用场景：

- 用户给出 Boss 直聘、智联招聘、猎聘、拉勾、前程无忧等招聘平台截图
- 用户给出企业招聘海报、微信群招聘图、校园招聘图片
- 用户给出岗位 JD PDF、招聘说明 PDF、岗位说明书导出的 PDF
- 用户给出 DOCX、TXT、Markdown 等文本型招聘文档
- 用户希望按统一字段存储“什么公司、招什么岗位、具体要求是什么”
- 用户后续还要做筛选、统计、写入 SQLite 或批量整理

## Workflow Decision Tree

1. 先识别输入类型：`image`、`pdf`、`docx`、`txt`。
2. `image` 或扫描件 PDF：走 OCR / 视觉识别路径。
3. 文本型 `pdf`、`docx`、`txt`：优先走文本提取路径。
4. 无论哪种路径，都按 [references/job_posting_schema.md](references/job_posting_schema.md) 输出。
5. 字段缺失时使用 `null`、空数组 `[]` 或空字符串，不要编造。
6. 默认返回 JSON；如果用户明确要求“保存为文件”，则把结果写入当前工作区的 `.json` 文件。
7. 如果用户要求“落库”“写入数据库”“SQLite”“保存到表”，则按 [references/sqlite_storage.md](references/sqlite_storage.md) 写入当前工作区的 SQLite 数据库。

## PDF Workflow

处理 PDF 时必须执行以下规则：

1. 默认把 PDF 视为多页招聘文档，而不是单页图片。
2. 只有在以下两种情况之一成立时，才允许不走默认多页模式：
   - 已明确确认 `page_count = 1`
   - 用户明确要求只提取指定页码或页码范围
3. 先判断 PDF 是否可直接提取文本。
4. 如果文本层可用，优先使用文本层；如果文本层不可用或质量很差，则转页面图片再识别。
5. 如果用户没有限制页码，默认目标是覆盖该 PDF 中所有与岗位相关的页面。
6. `page_count >= 2` 时，前 `2` 页只是最低检查范围，不是默认上限。
7. 如果第 `2` 页或后续页仍然在补充同一个岗位的信息，继续往后检查，直到：
   - 没有新增结构化字段，且
   - 连续一页没有补充该岗位核心信息，或
   - 文档明显进入无关附录、版权页、模板页。
8. 如果 PDF 明显包含多个岗位，按岗位拆成多个 `record`，不要把多个岗位强行合并。
9. 如果只分析了部分页面，也允许先输出 JSON，但必须把覆盖范围写进 `source.pages_analyzed`、`source.page_count`、`extraction_meta.coverage_status` 和 `extraction_meta.coverage_note`。
10. 如果页数未知，不能假设是单页 PDF；应在 `coverage_status` 中标记为 `unknown` 或 `partial`。

## PDF Completion Rules

- 只有确认 PDF 实际只有 `1` 页时，才允许只基于第 `1` 页直接完成提取。
- 如果用户没有显式限制页码，就应默认尝试覆盖所有相关页，而不是止步于前 `2` 页。
- 只分析前 `2` 页但未确认全文覆盖时，`coverage_status` 必须不是 `complete`。
- 即使第 `2` 页已经出现大量字段，也不能把“看过两页”直接等同于“完整覆盖”。
- 如果环境限制导致无法继续翻页，必须明确记录这一点，不能把结果伪装成完整提取。
- 对同一岗位跨页出现的“岗位职责”“任职要求”“加分项”等内容，应合并到同一个 `record`。

## Multi-Format Rules

- `image`: 只提取图中清晰可见的信息。
- `pdf`: 优先文本层，失败时走页面图片；默认提取所有相关页，前 `2` 页只是最低检查范围。
- `docx` / `txt`: 优先整篇文本提取，再按字段映射。
- 来源不明或格式混合时，优先保留原文片段到 `extraction_meta.raw_snippets`。

## Extraction Rules

- 每个 `record` 必须包含 `status` 字段，允许值只有：`未完善`、`未发布`、`已发布`、`已终止`。
- `company.name`、`position.title`、`salary.original_text` 优先保留原文。
- `age_limit` 用于记录岗位年龄要求，如 `35岁以下`、`25-35岁`；如果原文没有明确年龄限制，写 `null`。
- `requirements.must_have` 仅放“任职要求/岗位要求/任职资格”等硬性要求。
- `responsibilities` 仅放“岗位职责/工作内容”等内容。
- 如果平台没有明确区分职责与要求，则把长文本放入 `position.description`，并尽量拆分出 `requirements.must_have`。
- `summary.recruitment_focus` 必须用一句中文概括“这家公司主要在招什么、看重什么”。
- 出现 `15-25K·13薪` 这类薪资时，拆解到 `salary.min`、`salary.max`、`salary.unit`、`salary.months`。
- 识别到技术关键词时放入 `requirements.skills`，如 `ESP32`、`MQTT`、`Python`、`Flask`、`React`。
- 识别不清、遮挡、裁切、模糊时，把问题写进 `extraction_meta.ocr_warnings`。
- 多页 PDF 中同一岗位跨页延续时，应合并到同一个 `record`。
- 文档里如果有多个岗位，统一放进 `records` 数组，`record_count` 写实际数量。

## Status Rules

- `status` 是岗位状态字段，不是文件状态字段。
- 如果提取结果不完整、仍缺少较多关键字段、或覆盖范围不确定，默认写 `未完善`。
- 如果来源明确是内部 JD、草稿、待发布内容，写 `未发布`。
- 如果来源明确是公开招聘页面、已上线岗位、且提取覆盖完整，可写 `已发布`。
- 如果原文明确表示“停止招聘”“岗位关闭”“已下线”“终止招聘”等，写 `已终止`。
- 如果无法可靠判断，不要猜，优先写 `未完善`。

## SQLite Storage Rules

- 只有在用户明确要求保存到 SQLite、数据库、表，或要求后续基于数据库生成权重时，才执行 SQLite 写入。
- 默认数据库路径为当前工作区的 `job_postings.sqlite`；如果用户指定路径，使用用户指定的 SQLite 文件。
- 每个 `records[*]` 对应 `job_postings` 表中的一行，不要把多个岗位合并进同一行。
- 必须把完整岗位记录序列化到 `raw_json`，同时把常用检索字段拆到独立列。
- 写入前必须 `CREATE TABLE IF NOT EXISTS`；执行写入时使用 SQLite 参数化语句。
- 写入成功后，用中文摘要说明数据库路径、表名、写入记录数和生成的 `job_postings.id`。
- 详细表结构、字段映射和同库权重表约定见 [references/sqlite_storage.md](references/sqlite_storage.md)。

## Output Contract

默认输出以下根结构：

```json
{
  "schema_version": "1.2",
  "task": "job_posting_extraction",
  "source": {
    "type": "pdf",
    "format": "pdf",
    "page_count": null,
    "pages_analyzed": [],
    "extraction_mode": null
  },
  "record_count": 1,
  "records": []
}
```

单个岗位也必须放在 `records` 数组里。

## Quality Rules

- 不要补全图片里没有明确出现的融资阶段、公司规模、学历、经验等字段。
- 不要在没有明确原文依据时猜测 `age_limit`。
- 不要因为 PDF 只看了前几页，就默认后续页没有信息。
- 不要把“默认检查前两页”误解成“默认只提取两页”。
- 不要在没有证据时把 `status` 写成 `已发布` 或 `已终止`。
- 如果字段有不确定性，保留原文到 `extraction_meta.raw_snippets`，同时降低 `extraction_meta.confidence`。
- `extraction_meta.confidence` 取值范围为 `0` 到 `1`。
- `extraction_meta.coverage_status` 只能在真正覆盖完整岗位信息时写 `complete`。
- 如果用户没有要求解释，输出以 JSON 为主，不额外写长篇说明。

## Reference

字段定义、示例 JSON、薪资拆解规则见 [references/job_posting_schema.md](references/job_posting_schema.md)。

PDF 处理细则、分页策略、文本层与 OCR 路由见 [references/pdf_processing.md](references/pdf_processing.md)。

SQLite 建表、岗位写入、权重表关联规则见 [references/sqlite_storage.md](references/sqlite_storage.md)。
