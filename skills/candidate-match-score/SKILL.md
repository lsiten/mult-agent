---
name: candidate-match-score
description: Use when the user wants to score a structured candidate resume JSON against a job JSON plus weight JSON, generate deterministic breakdowns with evidence, and save one per-candidate score JSON such as resume1_name_score.json.
---

# Candidate Match Score

## Overview

这个 skill 负责把候选人简历 JSON 和岗位 JD + 权重 JSON 做结构化匹配。

输出目标不是“感觉像匹配”，而是稳定的评分文件：

- 一个总分
- 一组字段级 breakdown
- 一组优势项和缺口项
- 一组明确的证据与警告

## Input Contract

输入通常有 3 个文件：

1. 岗位 JSON，例如 `data/解决方案架构师(2).json`
2. 权重 JSON，例如 `data/解决方案架构师(2).score.json`
3. 候选人简历 JSON，例如 `data/liepin/解决方案架构师-2/resume1_张三_file.json`

如果候选人简历来自 `liepin-resume-search`，推荐直接沿用它的结构：

- 参考 `../liepin-resume-search/references/resume-capture-schema.md`

## Workflow

### 1. Load and Normalize

先加载岗位、权重和候选人简历。

把候选人信息规范化为这些比较维度：

- 当前职位与标题
- 城市
- 工作年限
- 学历和学校标签
- 技能
- 行业
- 摘要和项目文本
- 工作经历文本

### 2. Run Deterministic Scoring

执行：

通过 `skill_view` 加载本 skill，使用返回的 `skill_dir` 运行：

```bash
python3 "<candidate_match_score_skill_dir>/scripts/score_resume.py" \
  --job-file /absolute/path/to/job.json \
  --weights-file /absolute/path/to/job.score.json \
  --resume-file /absolute/path/to/resume1_name_file.json
```

默认会在简历文件同目录生成：

```text
resume1_name_score.json
```

### 3. Review Output

评分结果必须检查这些内容：

- `total_score` 是否合理
- `applicable_weight` 是否过低
- `score_breakdown` 里是否有高权重但低匹配的字段
- `strengths` 和 `gaps` 是否能解释这个分数
- `warnings` 是否提示了候选人数据缺失

### 4. Save Without Overwriting the Resume

- 不要覆盖原始 `*_file.json`
- 评分结果单独写入 `*_score.json`

## Scoring Principles

- 只对“岗位有值”的要求打分；岗位没有该要求时应跳过
- 高权重字段优先体现在 breakdown 和摘要里
- 候选人没有数据时，可以低分或告警，但不要编造补全
- 简历文本只支持证据驱动匹配，不做凭空语义脑补
- `must_have` 比 `preferred` 更严格
- 在 LinkedIn / 猎聘这类公开资料场景里，优先做中英文岗位词、技能词、平台接入词的归一化后再评分
- 岗位抽取权重文件不等于“平台可见度权重”；对公共 profile 稀缺字段要保留低分解释，不要把缺失证据误写成明确不符合

## Supported Comparisons

详细映射见 [references/resume-job-mapping.md](references/resume-job-mapping.md)。

当前脚本重点支持：

- `position.title`
- `position.category`
- `location.city`
- `requirements.experience`
- `requirements.education`
- `requirements.skills`
- `requirements.must_have`
- `requirements.preferred`
- `responsibilities`
- `summary.recruitment_focus`
- `summary.keywords`
- `age_limit`
- `salary.*`

## Output Contract

输出结构见 [references/score-output-schema.md](references/score-output-schema.md)。

最低要求：

- `candidate_id`
- `candidate_name`
- `total_score`
- `applicable_weight`
- `score_breakdown`
- `strengths`
- `gaps`
- `warnings`

## Quality Rules

- 不要把岗位缺失字段当成候选人扣分项
- 不要把一个词命中就当成完全满足 `must_have`
- 不要只看技能词而忽略年限和学历
- 不要输出没有证据的“匹配理由”
