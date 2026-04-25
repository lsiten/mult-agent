---
name: linkedin-people-search
description: Use when the user wants to search LinkedIn People from a job JSON plus weight JSON, operate the LinkedIn people search page through web-access, capture structured candidate profile JSON, score each candidate with candidate-match-score, and save outputs under data/linkedin.
---

# LinkedIn People Search

## Overview

这个 skill 用于把岗位 JD 和权重 JSON 转成一套可执行的 LinkedIn People 搜人流程。

核心职责：

1. 读取 `data/*.json` 和 `*.score.json`
2. 通过 `web-access` 操控 LinkedIn People 搜索结果页
3. 把每位候选人保存成结构化 profile JSON
4. 调用 `candidate-match-score` 生成每位候选人的评分 JSON
5. 维护 `search-master.json`
6. 在评分前先用修复脚本把 LinkedIn profile 文本规范化

## Preconditions

开始前必须确认：

- 用户本机 Chrome 已登录 LinkedIn
- `web-access` 已连上用户 Chrome
- 已有岗位主 JSON，例如 `data/解决方案架构师(2).json`
- 已有对应权重 JSON，例如 `data/解决方案架构师(2).score.json`

如果出现登录态失效、搜索限流、资料不可见或连接受限，必须明确记录阻塞点，不要编造候选人信息。

## Workflow

### 1. Prepare Search Context

先运行：

通过 `skill_view` 加载本 skill，使用返回的 `skill_dir` 运行：

```bash
python3 "<linkedin_skill_dir>/scripts/prepare_search_run.py" --job-file /absolute/path/to/job.json
```

默认行为：

- 自动推断同目录下的 `*.score.json`
- 默认输出到 `data/linkedin/<job_slug>/`
- 初始化：
  - `search-context.json`
  - `search-master.json`

`search-context.json` 会给出：

- 推荐关键词
- 建议填写的 LinkedIn 搜索过滤项
- 重点权重字段
- 输出目录和命名规则

### 2. Operate LinkedIn Through web-access

此 skill 不自己实现浏览器自动化，必须复用 `web-access`。

默认入口是：

```text
https://www.linkedin.com/search/results/people/
```

如果用户已经打开具体搜索结果页，优先复用现有 tab，而不是重复新开。

进入页面后应按这个顺序做：

1. 先确认是 `People` 结果页，而不是首页或招聘页
2. 读取页面当前搜索词、Locations、Current companies、All filters 的真实 DOM
3. 按 [references/search-field-mapping.md](references/search-field-mapping.md) 把岗位字段映射到 LinkedIn 搜索项
4. 优先填写高权重条件：职位关键词、Locations、Current title、Industry、核心技能
5. 如果控件找不到、账号级别受限或某些筛选项不可用，记录到 `capture_meta.warnings`
6. 读取候选人列表卡片
7. 如果可以访问 profile 详情，则在单独 tab 中打开候选人详情页补充信息

不要假设截图里的布局与当前 DOM 完全一致。先用真实页面结构决定交互方式。

### 3. Capture Profile JSON

每位候选人都必须保存为单独的 `*_file.json`。

结构定义见 [references/profile-capture-schema.md](references/profile-capture-schema.md)。

命名规则：

- `candidate_id` 固定为 `profile1`、`profile2`、`profile3` ...
- profile 文件名：`profile1_<safe_name>_file.json`
- score 文件名：`profile1_<safe_name>_score.json`

`safe_name` 规则：

- 优先用候选人姓名
- 去掉非法文件名字符
- 空名时退化为 `unknown`

候选人 profile JSON 至少要包含：

- 基本身份：姓名、headline、当前职位、当前公司、城市
- 搜索信号：连接层级、mutual connections、搜索结果摘要
- 匹配信息：技能、工作年限、学历、行业、项目或经历摘要
- 来源信息：搜索结果 URL、profile URL、抓取时间、过滤条件摘要

### 4. Score Each Candidate

在 LinkedIn 场景里，不要直接用原始 `raw_sections` 立刻评分。

先运行：

```bash
python3 "<linkedin_skill_dir>/scripts/repair_bundle.py" \
  --bundle-dir /absolute/path/to/data/linkedin/<job_slug> \
  --job-file /absolute/path/to/job.json \
  --weights-file /absolute/path/to/job.score.json
```

这个脚本会：

- 修复 `current_title`、`current_company`、`education` 等字段
- 从 profile 主体区抽取更干净的 `skills`、`summary`、`work_history`
- 生成 `match_sections`，避免把推荐页、关注页、动态流文本直接带进评分
- 重跑 `candidate-match-score`
- 重建 `search-master.json`

解释结果时，还要结合 [references/weight-policy.md](references/weight-policy.md) 判断哪些低分是“公开资料证据不足”，哪些才是真的能力缺口。

之后再把 `*_score.json` 作为正式评分结果使用。

### 5. Score Each Candidate

每抓到一份候选人 profile JSON 后，立刻运行：

先通过 `skill_view` 加载 `candidate-match-score`，使用返回的 `skill_dir`：

```bash
python3 "<candidate_match_score_skill_dir>/scripts/score_resume.py" \
  --job-file /absolute/path/to/job.json \
  --weights-file /absolute/path/to/job.score.json \
  --resume-file /absolute/path/to/profile1_name_file.json
```

这里继续复用 `candidate-match-score`，不重复定义第二套评分标准。

### 6. Update Master Table

每完成一位候选人的抽取和评分后，运行：

```bash
python3 "<linkedin_skill_dir>/scripts/update_search_master.py" \
  --master-file /absolute/path/to/search-master.json \
  --resume-file /absolute/path/to/profile1_name_file.json \
  --score-file /absolute/path/to/profile1_name_score.json
```

主表至少包含：

- `candidate_id`
- `name`
- `score`
- `resume_file`
- `score_file`

推荐额外包含：

- `headline`
- `current_company`
- `current_city`
- `profile_url`
- `connection_degree`
- `updated_at`

## Stop Rules

- 达到用户指定人数后停止
- 页面开始重复显示结果时停止
- 遇到登录墙、速率限制或权限不足且无法继续时停止
- 候选人详情无法打开时，记录失败原因后继续下一个

## Quality Rules

- 不要把搜索结果卡片过度脑补成完整 profile
- 没有进入详情页时，应把 `capture_meta.completeness` 标成 `partial`
- 不要把 `raw_sections` 中的推荐候选人、关注列表、动态流文本直接当作评分证据
- 在 LinkedIn profile 抓取后，默认先运行 `scripts/repair_bundle.py` 再看最终分数
- 不要在评分文件里省略 breakdown 和证据
- 不要覆盖用户原始岗位 JSON 和权重 JSON
- 所有输出都放在 `data/linkedin/<job_slug>/` 下

## References

- 存储结构和文件命名：见 [references/storage-layout.md](references/storage-layout.md)
- LinkedIn 搜索字段映射：见 [references/search-field-mapping.md](references/search-field-mapping.md)
- 候选人 profile JSON 结构：见 [references/profile-capture-schema.md](references/profile-capture-schema.md)
- LinkedIn 场景权重解释：见 [references/weight-policy.md](references/weight-policy.md)
