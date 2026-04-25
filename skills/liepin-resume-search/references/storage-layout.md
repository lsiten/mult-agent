# Storage Layout

所有猎聘搜人结果默认保存到：

```text
data/liepin/<job_slug>/
```

例如：

```text
data/liepin/解决方案架构师-2/
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
  "task": "liepin_resume_search",
  "status": "collecting",
  "job_file": "/abs/path/data/解决方案架构师(2).json",
  "weights_file": "/abs/path/data/解决方案架构师(2).score.json",
  "search_url": "https://h.liepin.com/search/getConditionItem",
  "output_dir": "/abs/path/data/liepin/解决方案架构师-2",
  "candidate_count": 2,
  "candidates": [
    {
      "candidate_id": "resume1",
      "name": "张三",
      "score": 0.86,
      "resume_file": "resume1_张三_file.json",
      "score_file": "resume1_张三_score.json"
    }
  ]
}
```

### `resumeX_<safe_name>_file.json`

单份候选人完整简历 JSON。

### `resumeX_<safe_name>_score.json`

单份候选人与岗位的匹配评分 JSON。

## Filename Rules

- `candidate_id` 固定格式：`resume1`、`resume2`、`resume3`
- `safe_name` 来自候选人姓名
- 文件名要移除这些字符：`\ / : * ? " < > |`
- 空白和括号统一替换成 `-`
- 如果没有姓名，使用 `unknown`

## Update Rules

- 先写 `*_file.json`
- 再写 `*_score.json`
- 最后更新 `search-master.json`

这样即使中途失败，也能知道哪些候选人已经抓到简历但还没完成评分。
