---
name: liepin-resume-search
description: Use when the user wants to search recruiter-side Liepin resumes from a job JSON plus weight JSON, operate the Liepin search page through web-access, capture structured candidate resume JSON, score each candidate, and save all outputs under data/liepin.
---

# Liepin Resume Search

## Overview

这个 skill 用于把你的岗位 JD 和权重 JSON 转成一套可执行的猎聘找人流程。

核心职责只有 4 件事：

1. 读取 `data/*.json` 和 `*.score.json`
2. 通过 `web-access` 操控 `https://h.liepin.com/search/getConditionItem`
3. 把每位候选人抽取为结构化简历 JSON
4. 生成主表 `search-master.json`，并为每位候选人保存独立的简历文件和评分文件

## Preconditions

开始前必须先确认以下条件都成立：

- 用户本机 Chrome 已登录可访问猎聘招聘方/猎头搜索页面
- `web-access` 可用，并且 CDP 模式已经连上用户 Chrome
- 已有岗位主 JSON，例如 `data/解决方案架构师(2).json`
- 已有对应权重 JSON，例如 `data/解决方案架构师(2).score.json`

如果登录态缺失、页面打不开、验证码阻塞或权限不足，必须明确告诉用户当前阻塞点，不要编造候选人数据。

## Workflow

### 1. Prepare Search Context

先运行：

通过 `skill_view` 加载本 skill，使用返回的 `skill_dir` 运行：

```bash
python3 "<liepin_skill_dir>/scripts/prepare_search_run.py" --job-file /absolute/path/to/job.json
```

默认行为：

- 自动推断同目录下的 `*.score.json`
- 默认输出到 `data/liepin/<job_slug>/`
- 自动初始化：
  - `search-context.json`
  - `search-master.json`

`search-context.json` 会给出：

- 推荐关键词
- 建议填写的猎聘筛选字段
- 重点权重字段
- 输出目录和命名规则

如果用户指定了别的输出目录、别的岗位记录、或单独的权重文件，再覆盖默认参数。

### 2. Operate Liepin Through web-access

此 skill 不自己实现浏览器自动化，必须复用 `web-access`。

进入猎聘页后应按这个顺序做：

1. 打开 `https://h.liepin.com/search/getConditionItem`
2. 先检查页面是否真实可操作，而不是假设截图结构与 DOM 完全一致
3. 按 [references/search-field-mapping.md](references/search-field-mapping.md) 把岗位字段映射到猎聘筛选项
4. 优先填写高权重条件：岗位名称、关键词、城市、经验、学历、核心技能
5. 某个筛选控件找不到或当前账号无权限时，记录到 `capture_meta.warnings`
6. 执行搜索后，逐页读取候选人列表
7. 每个候选人详情应在单独 tab 中打开，避免破坏主搜索结果页状态

不要硬编码页面选择器。先观察真实 DOM、按钮文本、表单标签和弹窗，再决定点击方式。

### 3. Capture Resume JSON

每个候选人都必须保存为单独的 `*_file.json`。

结构定义见 [references/resume-capture-schema.md](references/resume-capture-schema.md)。

命名规则：

- `candidate_id` 固定为 `resume1`、`resume2`、`resume3` ...
- 简历文件名：`resume1_<safe_name>_file.json`
- 评分文件名：`resume1_<safe_name>_score.json`

`safe_name` 规则：

- 优先用候选人姓名
- 去掉文件系统非法字符
- 空名时退化为 `unknown`

候选人简历 JSON 至少要包含：

- 基本身份：姓名、当前职位、当前公司、城市
- 匹配信息：技能、工作年限、学历、学校标签、行业
- 证据内容：摘要、工作经历、项目经历、原始片段
- 来源信息：搜索页 URL、候选人详情 URL、抓取时间、筛选条件摘要

### 4. Score Each Candidate

每抓到一份候选人简历后，立刻运行：

先通过 `skill_view` 加载 `candidate-match-score`，使用返回的 `skill_dir`：

```bash
python3 "<candidate_match_score_skill_dir>/scripts/score_resume.py" \
  --job-file /absolute/path/to/job.json \
  --weights-file /absolute/path/to/job.score.json \
  --resume-file /absolute/path/to/resume1_name_file.json
```

评分脚本会输出 `resume1_name_score.json`。

不要只给一个总分。评分文件必须包含：

- `total_score`
- `applicable_weight`
- `score_breakdown`
- `strengths`
- `gaps`
- `warnings`

如果某个岗位要求本身为空，例如 `age_limit = null`，评分时应跳过该项，而不是把候选人扣分。

### 5. Update Master Table

每完成一位候选人的简历抽取和评分后，运行：

```bash
python3 "<liepin_skill_dir>/scripts/update_search_master.py" \
  --master-file /absolute/path/to/search-master.json \
  --resume-file /absolute/path/to/resume1_name_file.json \
  --score-file /absolute/path/to/resume1_name_score.json
```

主表至少包含：

- `candidate_id`
- `name`
- `score`
- `resume_file`
- `score_file`

推荐额外包含：

- `current_title`
- `current_company`
- `current_city`
- `resume_url`
- `updated_at`

## Stop Rules

- 达到用户指定人数后停止
- 遇到登录墙、验证码、权限限制且无法继续时停止
- 搜索结果明显开始重复时停止
- 候选人详情无法打开时，记录失败原因后继续下一个

## Quality Rules

- 不要把公开职位页当成人才库简历
- 不要把列表摘要直接当作完整简历
- 不要在没有打开候选人详情时编造工作经历或技能
- 不要在评分文件里省略证据和字段分解
- 不要覆盖用户现有的岗位 JSON 和权重 JSON
- 所有输出都放在 `data/liepin/<job_slug>/` 下

## References

- 存储结构和文件命名：见 [references/storage-layout.md](references/storage-layout.md)
- 猎聘筛选字段映射：见 [references/search-field-mapping.md](references/search-field-mapping.md)
- 候选人简历 JSON 结构：见 [references/resume-capture-schema.md](references/resume-capture-schema.md)
