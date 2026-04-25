# Search Field Mapping

`prepare_search_run.py` 会把岗位 JSON 和权重 JSON 整理成搜索上下文；进入猎聘页后，优先使用这些映射关系填写可见筛选项。

## High-Priority Mapping

| 岗位 JSON 字段 | 猎聘搜索页字段 | 说明 |
|---|---|---|
| `records[*].position.title` | 顶部关键词、职位名称 | 最高优先级，优先填职位名称 |
| `records[*].requirements.skills` | 顶部关键词 | 取前 `3-6` 个核心技能，避免堆满 |
| `records[*].summary.keywords` | 顶部关键词 | 用于补充行业/平台词，例如 `AI平台`、`SDK` |
| `records[*].location.city` | 当前城市、期望城市 | 有明确城市时优先填 |
| `records[*].requirements.experience` | 工作年限 | 例如 `3年及以上` -> `3-5年` 或 `5-10年`，按页面可选项贴近映射 |
| `records[*].requirements.education` | 教育经历 | 例如 `本科及以上` -> `本科` |
| `records[*].company.industry` | 当前行业 | 岗位行业明确时再填 |
| `records[*].position.category` | 当前职位 | 标题过宽时用类别补充 |
| `records[*].age_limit` | 年龄 | 只有岗位真有明确年龄限制时才填 |

## Conditional Mapping

这些条件只有在岗位要求中有明确证据时才建议填写：

- `统招要求`
  - 从 `requirements.must_have` 中识别 `统招`、`非统招`
- `院校要求`
  - 从 `requirements.must_have` 或 `preferred` 中识别 `211`、`985`、`双一流`、`海外留学`
- `公司名称`
  - 仅在用户明确指定目标公司来源时填写，不要默认限制死
- `性别`
  - 只在岗位有明确合法业务要求且用户确认时才使用
- `跳槽频率`、`活跃度`
  - 默认不作为硬过滤

## Search Strategy

### First Pass

- 只填高权重、低争议条件
- 目标是先拿到足够候选人池

### Second Pass

- 结果过多时，再逐步增加学校、行业、年龄等限制
- 每次只增加 `1-2` 个条件，方便判断哪个条件过度收缩

### Safety Rule

如果页面实际字段和截图不一致，以真实 DOM 和真实控件为准；不要因为参考映射存在就假定控件一定可用。
