# Storage Layout

所有 LinkedIn 搜人结果默认保存到：

```text
data/linkedin/<job_slug>/
```

例如：

```text
data/linkedin/解决方案架构师-2/
```

## Required Files

### `search-context.json`

搜索前准备文件，由 `scripts/prepare_search_run.py` 生成。

作用：

- 记录岗位文件和权重文件来源
- 给出推荐关键词和筛选字段
- 明确输出目录

### `search-master.json`

主表文件，用于聚合候选人简略信息。

示例：

```json
{
  "schema_version": "1.0",
  "task": "linkedin_people_search",
  "status": "collecting",
  "job_file": "/abs/path/data/解决方案架构师(2).json",
  "weights_file": "/abs/path/data/解决方案架构师(2).score.json",
  "search_url": "https://www.linkedin.com/search/results/people/",
  "output_dir": "/abs/path/data/linkedin/解决方案架构师-2",
  "candidate_count": 2,
  "candidates": [
    {
      "candidate_id": "profile1",
      "name": "张三",
      "score": 0.84,
      "resume_file": "profile1_张三_file.json",
      "score_file": "profile1_张三_score.json"
    }
  ]
}
```

### `profileX_<safe_name>_file.json`

单份候选人 profile JSON。

### `profileX_<safe_name>_score.json`

单份候选人与岗位的匹配评分 JSON。

## Update Rules

- 先写 `*_file.json`
- 再写 `*_score.json`
- 最后更新 `search-master.json`
