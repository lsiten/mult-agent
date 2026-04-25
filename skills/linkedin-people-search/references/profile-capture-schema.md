# Profile Capture Schema

每位候选人都应保存为一个 JSON，推荐结构如下：

```json
{
  "schema_version": "1.0",
  "task": "linkedin_profile_capture",
  "candidate_id": "profile1",
  "candidate_name": "张三",
  "source": {
    "site": "linkedin",
    "search_url": "https://www.linkedin.com/search/results/people/?keywords=架构师",
    "profile_url": "https://www.linkedin.com/in/example",
    "captured_at": "2026-04-20T22:00:00+08:00",
    "search_keywords": "解决方案架构师 Python SDK",
    "record_id": "job-001"
  },
  "candidate": {
    "name": "张三",
    "headline": "Senior Software Engineer | Architect | AI Engineer",
    "current_title": "Architect",
    "current_company": "Baidu Inc.",
    "current_city": "Beijing, China",
    "preferred_cities": [],
    "connection_degree": "2nd",
    "mutual_connections": "7 other mutual connections",
    "years_of_experience": null,
    "education": {
      "highest": null,
      "school": null,
      "school_tags": []
    },
    "industries": [],
    "skills": [],
    "summary": "搜索结果卡片摘要或 profile about 摘要",
    "work_history": [],
    "project_history": [],
    "match_sections": [],
    "raw_sections": []
  },
  "capture_meta": {
    "completeness": "partial",
    "warnings": [],
    "raw_snippets": []
  }
}
```

## Required Fields

- `candidate_id`
- `candidate_name`
- `source.site`
- `source.search_url`
- `source.profile_url`
- `candidate.name`
- `candidate.headline`
- `candidate.match_sections`

## Capture Rules

- 仅有搜索结果卡片时，`completeness` 必须是 `partial`
- 进入 profile 详情并抓到更多 section 时，才能升级为 `complete`
- 结构化字段不足时，把页面文字保留到 `raw_sections`
- 正式评分前，应优先从 `raw_sections` 生成干净的 `match_sections`，不要直接把整页原文全部送进打分
- 抓不到的字段写 `null` 或空数组，不要编造
