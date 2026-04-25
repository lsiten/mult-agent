# Resume to Job Mapping

评分脚本不是做开放式主观判断，而是把岗位字段映射到候选人简历 JSON 的可比字段。

## Core Mapping

| 岗位字段 | 候选人字段 | 默认比较方式 |
|---|---|---|
| `position.title` | `candidate.current_title`, `candidate.headline` | 标题直匹配 + token overlap |
| `position.category` | `candidate.current_title`, `candidate.summary` | 类别词 overlap |
| `location.city` | `candidate.current_city`, `candidate.preferred_cities` | 城市精确或包含匹配 |
| `requirements.experience` | `candidate.years_of_experience` | 年限解析与阈值比较 |
| `requirements.education` | `candidate.education.highest` | 学历等级比较 |
| `requirements.skills` | `candidate.skills`, `summary`, `work_history`, `project_history` | 技能词匹配 |
| `requirements.must_have` | 简历全文语料 | 每条要求短句逐条匹配取平均 |
| `requirements.preferred` | 简历全文语料 | 加分项短句逐条匹配取平均 |
| `responsibilities` | `summary`, `work_history`, `project_history` | 职责和经历文本 overlap |
| `summary.recruitment_focus` | `candidate.summary` + 全文语料 | 招聘重点和候选人画像 overlap |
| `summary.keywords` | `candidate.skills` + 全文语料 | 关键词 overlap |
| `age_limit` | `candidate.age` | 年龄阈值比较 |
| `salary.*` | `candidate.salary_expectation` | 薪资区间比较 |

## Skip Rules

以下场景应标记为 `skipped` 或 `warning`，而不是盲目打低分：

- 岗位字段本身为 `null`
- 候选人简历里没有对应字段，且页面确实没展示
- 当前版本脚本尚不支持该比较方式

## Evidence Sources

脚本默认从这些位置提取证据：

- `candidate.skills`
- `candidate.summary`
- `candidate.work_history[*].highlights`
- `candidate.project_history[*].highlights`
- `candidate.raw_sections`

如果结构化字段提取不全，至少保证 `raw_sections` 中保留原始片段。
