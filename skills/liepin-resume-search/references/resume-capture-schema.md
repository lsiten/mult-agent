# Resume Capture Schema

每位候选人都应保存为一个完整 JSON，推荐结构如下：

```json
{
  "schema_version": "1.0",
  "task": "liepin_resume_capture",
  "candidate_id": "resume1",
  "candidate_name": "张三",
  "source": {
    "site": "liepin",
    "search_url": "https://h.liepin.com/search/getConditionItem",
    "resume_url": "https://...",
    "captured_at": "2026-04-20T21:00:00+08:00",
    "search_keywords": "解决方案架构师 Python Java SDK",
    "record_id": "job-001"
  },
  "candidate": {
    "name": "张三",
    "headline": "高级解决方案架构师",
    "current_title": "解决方案架构师",
    "current_company": "某科技公司",
    "current_city": "上海",
    "preferred_cities": ["上海", "杭州"],
    "age": 32,
    "gender": "男",
    "years_of_experience": "8年",
    "education": {
      "highest": "本科",
      "school": "某大学",
      "school_tags": ["211", "双一流"]
    },
    "industries": ["云计算", "AI"],
    "skills": ["Python", "Java", "SDK", "API", "WebSocket"],
    "summary": "候选人长期从事平台集成、客户方案设计与技术支持。",
    "work_history": [
      {
        "company": "A公司",
        "title": "解决方案架构师",
        "duration": "2021-至今",
        "highlights": [
          "负责 SDK/API 接入方案设计",
          "主导客户 PoC 落地"
        ]
      }
    ],
    "project_history": [
      {
        "name": "企业 AI 平台接入项目",
        "role": "方案负责人",
        "highlights": [
          "完成鉴权、回调、消息流设计"
        ]
      }
    ],
    "certifications": [],
    "languages": [],
    "salary_expectation": null,
    "raw_sections": [
      "原始简历片段 1",
      "原始简历片段 2"
    ]
  },
  "capture_meta": {
    "completeness": "complete",
    "warnings": [],
    "raw_snippets": []
  }
}
```

## Required Fields

- `candidate_id`
- `candidate_name`
- `source.site`
- `source.resume_url`
- `candidate.name`
- `candidate.current_title`
- `candidate.current_company`
- `candidate.skills`
- `candidate.summary`

## Strongly Recommended Fields

- `candidate.years_of_experience`
- `candidate.education.highest`
- `candidate.education.school_tags`
- `candidate.work_history`
- `candidate.project_history`
- `candidate.raw_sections`

## Capture Rules

- 页面能直接读到的字段优先结构化存储
- 一时无法结构化的长文本，放进 `raw_sections`
- 抓不到的字段写 `null`、空数组或空字符串，不要编造
- 把页面缺失、权限受限、字段遮挡等问题写进 `capture_meta.warnings`
