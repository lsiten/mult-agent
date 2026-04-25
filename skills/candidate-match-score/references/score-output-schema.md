# Score Output Schema

推荐输出结构：

```json
{
  "schema_version": "1.0",
  "task": "candidate_match_score",
  "generated_at": "2026-04-20T21:00:00+08:00",
  "candidate_id": "resume1",
  "candidate_name": "张三",
  "job_file": "/abs/path/job.json",
  "weights_file": "/abs/path/job.score.json",
  "resume_file": "/abs/path/resume1_张三_file.json",
  "total_score": 0.86,
  "applicable_weight": 5.21,
  "score_breakdown": [
    {
      "path": "records[0].requirements.skills",
      "weight": 0.98,
      "score": 0.9,
      "weighted_score": 0.882,
      "status": "matched",
      "evidence": ["Python", "SDK", "API"]
    }
  ],
  "strengths": [
    "核心技能覆盖度高",
    "岗位标题匹配"
  ],
  "gaps": [
    "学历证据不足"
  ],
  "warnings": []
}
```

## Field Rules

### `total_score`

- 范围 `0` 到 `1`
- 用“适用字段的加权平均”计算

### `applicable_weight`

- 只统计实际参与评分的字段权重
- 岗位要求为空时，该字段不进入分母

### `score_breakdown[*].status`

允许值：

- `matched`
- `partial`
- `weak`
- `missed`
- `skipped`

### `evidence`

- 只放来源明确的词、短句或结构化字段
- 不要放模型自己生成的推断描述
