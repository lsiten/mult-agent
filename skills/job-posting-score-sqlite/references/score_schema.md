# Score JSON Schema

## Goal

生成一份与岗位 JSON 结构一致的权重 JSON，用于打分、筛选、排序、推荐。

## Root Shape

权重 JSON 应尽量保持与源 JSON 相同的根结构：

```json
{
  "schema_version": 0.0,
  "task": 0.0,
  "source": {
    "type": 0.0,
    "format": 0.0,
    "platform": 0.0,
    "file_name": 0.0,
    "document_title": 0.0,
    "language": 0.0,
    "page_count": 0.0,
    "pages_analyzed": 0.0,
    "extraction_mode": 0.0
  },
  "record_count": 0.0,
  "records": [
    {
      "record_id": 0.0,
      "status": 1.0,
      "age_limit": 0.35
    }
  ]
}
```

## Structural Rules

- 根对象 `key` 不变
- 嵌套对象 `key` 不变
- 数组字段保留字段名，但值替换为单个数字
- `records` 数组保留数组结构，内部每个字段继续数字化

## Score Meaning

- `0`: 该字段忽略
- `1`: 该字段必须满足
- 中间值表示重要程度

## Recommended Output Style

- 数值统一用 `0.00` 到 `1.00`
- 默认保留两位小数
- 用户单改字段时，只改对应路径，不重置其他字段

## Published Status Rule

- 当 `records[*].status = 已发布` 时，应生成正式权重 JSON
- 当状态不是 `已发布` 时，如果用户仍要求生成，可生成预览版权重 JSON

## Suggested File And Database Naming

- `job.json` -> `job.score.json`
- `solution_architect.json` -> `solution_architect.score.json`
- 默认 SQLite 数据库：`job_postings.sqlite`
- 岗位表：`job_postings`
- 权重表：`job_posting_scores`
- SQLite 写入规则见 [../../job-posting-image-sqlite/references/sqlite_storage.md](../../job-posting-image-sqlite/references/sqlite_storage.md)
