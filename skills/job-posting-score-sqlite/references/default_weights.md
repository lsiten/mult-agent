# Default Weights

以下默认权重参考常见招聘筛选与岗位匹配逻辑，适合作为第一版默认值。

## Core Fields

| Field | Default |
|---|---:|
| `status` | `1.00` |
| `position.title` | `1.00` |
| `requirements.must_have` | `1.00` |
| `requirements.skills` | `0.98` |
| `salary.min` | `0.90` |
| `salary.max` | `0.90` |
| `requirements.experience` | `0.88` |
| `salary.original_text` | `0.86` |
| `location.city` | `0.83` |
| `company.name` | `0.82` |
| `summary.recruitment_focus` | `0.74` |
| `position.category` | `0.72` |
| `location.work_mode` | `0.68` |
| `requirements.education` | `0.62` |
| `responsibilities` | `0.58` |
| `position.employment_type` | `0.55` |
| `company.industry` | `0.52` |
| `requirements.preferred` | `0.48` |
| `location.district` | `0.45` |
| `position.description` | `0.42` |
| `age_limit` | `0.35` |
| `benefits` | `0.34` |

## Full Default Template

```json
{
  "schema_version": 0.00,
  "task": 0.00,
  "source": {
    "type": 0.10,
    "format": 0.05,
    "platform": 0.10,
    "file_name": 0.00,
    "document_title": 0.10,
    "language": 0.05,
    "page_count": 0.05,
    "pages_analyzed": 0.05,
    "extraction_mode": 0.10
  },
  "record_count": 0.00,
  "records": [
    {
      "record_id": 0.00,
      "status": 1.00,
      "age_limit": 0.35,
      "company": {
        "name": 0.82,
        "industry": 0.52,
        "stage": 0.28,
        "size": 0.33
      },
      "position": {
        "title": 1.00,
        "category": 0.72,
        "employment_type": 0.55,
        "headcount": 0.12,
        "description": 0.42
      },
      "location": {
        "city": 0.83,
        "district": 0.45,
        "address": 0.18,
        "work_mode": 0.68
      },
      "salary": {
        "min": 0.90,
        "max": 0.90,
        "unit": 0.35,
        "months": 0.36,
        "currency": 0.10,
        "original_text": 0.86
      },
      "requirements": {
        "experience": 0.88,
        "education": 0.62,
        "skills": 0.98,
        "must_have": 1.00,
        "preferred": 0.48
      },
      "responsibilities": 0.58,
      "benefits": 0.34,
      "recruiter": {
        "name": 0.06,
        "title": 0.08
      },
      "source_info": {
        "publish_time_text": 0.12,
        "page_hint": 0.05,
        "page_range": 0.05
      },
      "summary": {
        "recruitment_focus": 0.74,
        "keywords": 0.31
      },
      "extraction_meta": {
        "confidence": 0.22,
        "coverage_status": 0.18,
        "coverage_note": 0.05,
        "missing_fields": 0.16,
        "ocr_warnings": 0.12,
        "raw_snippets": 0.08
      }
    }
  ]
}
```

## Review First

生成默认权重后，应先展示以下建议让用户确认或修改：

- `status`
- `position.title`
- `requirements.must_have`
- `requirements.skills`
- `salary.min`
- `salary.max`
- `location.city`
- `requirements.experience`
- `requirements.education`
- `age_limit`
- `benefits`

## Success Summary Reminder

默认权重生成完成后，不要直接只给 JSON。

应先给用户一个简短摘要，至少包含：

- 操作类型
- 当前模式
- 记录数
- 关键字段默认权重的中文星级摘要
- 用户下一步可执行的修改方式

## Single-Field Edit Examples

- `requirements.skills -> 1.00`
- `salary.min -> 0.70`
- `age_limit -> 0.10`
- `benefits -> 0.20`
