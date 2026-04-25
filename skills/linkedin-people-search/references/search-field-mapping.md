# Search Field Mapping

LinkedIn People 搜索页的主入口是关键词搜索，Locations、Current companies 和 All filters 是第二层细化条件。

## High-Priority Mapping

| 岗位 JSON 字段 | LinkedIn People 搜索项 | 说明 |
|---|---|---|
| `records[*].position.title` | 搜索关键词 | 最高优先级，默认必须进入关键词 |
| `records[*].position.category` | 搜索关键词 / Current titles | 标题太宽时用类别补充 |
| `records[*].requirements.skills` | 搜索关键词 | 选前 `3-5` 个最强技能，避免关键词过长 |
| `records[*].summary.keywords` | 搜索关键词 | 用于补充 `AI平台`、`SDK/API接入` 这类方向词 |
| `records[*].location.city` | Locations | 岗位城市明确时优先填 |
| `records[*].company.name` | Current companies | 用户明确要目标公司来源时再填 |
| `records[*].requirements.experience` | All filters -> Years of experience | 如当前账号支持该过滤项则填写 |
| `records[*].requirements.education` | All filters -> Schools / education signal | LinkedIn 不一定有直接学历筛选，优先作为评分项，不强行做过滤 |

## Search Strategy

### First Pass

- 先用职位名称 + `2-3` 个核心技能搜
- 如果岗位城市明确，再加 Locations

### Second Pass

- 结果太多时，再补 Current titles、Industry、Current companies
- 不要一开始把所有条件都填满，否则结果集会太窄

### Candidate Capture Priority

优先抓这些字段：

- 姓名
- headline
- 当前公司/职位
- 所在城市
- mutual connections
- 结果摘要
- profile URL

如果能进入 profile 详情，再补：

- About
- Experience
- Education
- Skills
- Featured / activity 摘要
