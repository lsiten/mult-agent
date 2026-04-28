# Job Posting SQLite Storage

## Scope

Use this reference when the user asks to save extracted job postings or generated score weights into SQLite.

Default database path priority:

```text
user-provided path
HERMES_RECRUIT_DB_PATH
$HERMES_HOME/job_postings.sqlite
<current working directory>/job_postings.sqlite
```

Both job records and score records must live in the same SQLite database. In the RecruitAI workspace, this must be the same database read by `/api/recruit/workspace`.

## Tables

Use two tables:

- `job_postings`: one row per extracted job record
- `job_posting_scores`: one row per generated score or weight version

## SQLite DDL

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS job_postings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_uid TEXT UNIQUE,
  record_id TEXT,
  schema_version TEXT,
  source_type TEXT,
  source_format TEXT,
  source_platform TEXT,
  source_file_name TEXT,
  source_document_title TEXT,
  status TEXT NOT NULL CHECK (status IN ('待编辑', '待评分', '待发布', '已完成', '已暂停')),
  company_name TEXT,
  position_title TEXT,
  position_category TEXT,
  city TEXT,
  district TEXT,
  salary_min REAL,
  salary_max REAL,
  salary_unit TEXT,
  salary_months REAL,
  skills_json TEXT,
  must_have_json TEXT,
  responsibilities_json TEXT,
  benefits_json TEXT,
  source_json TEXT,
  extraction_meta_json TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status
  ON job_postings(status);

CREATE INDEX IF NOT EXISTS idx_job_postings_company_position
  ON job_postings(company_name, position_title);

CREATE TABLE IF NOT EXISTS job_posting_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_posting_id INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('正式权重', '预览权重')),
  status_at_scoring TEXT,
  score_json TEXT NOT NULL,
  summary_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_posting_scores_job_active
  ON job_posting_scores(job_posting_id, is_active);
```

## Job Record Mapping

For each `records[*]`, insert or update one `job_postings` row.

The assistant response must still include the complete extracted posting JSON, preferably in a fenced `json` block. The RecruitAI workspace uses that JSON as a fallback write path when the skill runtime cannot directly access SQLite.

Recommended column mapping:

- `record_id` <- `record.record_id`
- `schema_version` <- root `schema_version`
- `source_type` <- root `source.type`
- `source_format` <- root `source.format`
- `source_platform` <- root `source.platform`
- `source_file_name` <- root `source.file_name`
- `source_document_title` <- root `source.document_title`
- `status` <- `record.status`，允许值：`待编辑`、`待评分`、`待发布`、`已完成`、`已暂停`
- `company_name` <- `record.company.name`
- `position_title` <- `record.position.title`
- `position_category` <- `record.position.category`
- `city` <- `record.location.city`
- `district` <- `record.location.district`
- `salary_min` <- `record.salary.min`
- `salary_max` <- `record.salary.max`
- `salary_unit` <- `record.salary.unit`
- `salary_months` <- `record.salary.months`
- `skills_json` <- JSON string of `record.requirements.skills`
- `must_have_json` <- JSON string of `record.requirements.must_have`
- `responsibilities_json` <- JSON string of `record.responsibilities`
- `benefits_json` <- JSON string of `record.benefits`
- `source_json` <- JSON string of root `source`
- `extraction_meta_json` <- JSON string of `record.extraction_meta`
- `raw_json` <- JSON string of the complete individual record plus source context

Generate `record_uid` only when useful for later updates. Prefer a stable explicit identifier from the user or source system. If none exists, it is acceptable to leave `record_uid` null and rely on `id`.

## Score Record Mapping

When `job-posting-score-sqlite` writes a score, insert one `job_posting_scores` row linked to `job_postings.id`.

Recommended mapping:

- `job_posting_id` <- target `job_postings.id`
- `mode` <- `正式权重` when the linked posting status is `待发布` or `已完成`; otherwise `预览权重`
- `status_at_scoring` <- linked `job_postings.status`
- `score_json` <- JSON string of the complete same-key weight JSON
- `summary_json` <- optional JSON string for Chinese labels, stars, and changed fields
- `revision` <- previous max revision for the same `job_posting_id` plus 1
- `is_active` <- latest row for the same `job_posting_id` and `mode` is `1`; older rows are set to `0`

## Write Rules

- Use SQLite parameterized statements with `?` placeholders.
- Store nested objects and arrays as JSON strings with UTF-8 text.
- Use ISO-8601 timestamps for `created_at` and `updated_at`.
- Do not delete earlier score rows when generating a new revision.
- Do not write a score row without a valid `job_posting_id`.
- If the source JSON contains multiple `records`, insert all job records and report all generated ids.

## Success Summary

For job posting writes, summarize:

```text
本次操作：岗位已写入 SQLite
数据库：/path/to/job_postings.sqlite
表名：job_postings
写入记录数：2
岗位记录 ID：12, 13
```

For score writes, summarize:

```text
本次操作：权重已写入 SQLite
数据库：/path/to/job_postings.sqlite
表名：job_posting_scores
岗位记录 ID：12
权重记录 ID：5
模式：正式权重
```
