# LinkedIn Weight Policy

## Why This Exists

岗位原始 `*.score.json` 往往来自岗位文档抽取权重，它适合衡量“岗位信息里哪些字段更重要”，但不一定等于“LinkedIn 公开 profile 上哪些字段最容易被稳定验证”。

LinkedIn 公开资料通常有这些特点：

- 标题、公司、城市、学历、年限相对稳定
- 技能词可见，但经常不全
- `must_have` / `responsibilities` 往往只能拿到部分证据
- `summary.recruitment_focus` 更适合作为辅助判断，不应盖过标题和核心技能

## Recommended Interpretation

在 LinkedIn People 搜索场景里，优先这样解释分数：

1. 先看 `position.title`
2. 再看 `requirements.experience`
3. 再看 `requirements.education`
4. 再看 `requirements.skills`
5. 最后看 `must_have`、`preferred`、`responsibilities`

如果候选人 `title / company / years / education` 都匹配，但 `skills` 和 `must_have` 偏低，优先判断为“公开资料证据不足”，不要直接判成不匹配。

## Recommended Candidate-Facing Weights

这不是强制替换，而是 LinkedIn 排名时更稳的参考：

```json
{
  "position.title": 1.00,
  "requirements.experience": 0.95,
  "requirements.skills": 0.95,
  "requirements.must_have": 0.90,
  "requirements.education": 0.55,
  "summary.keywords": 0.45,
  "requirements.preferred": 0.35,
  "responsibilities": 0.35,
  "summary.recruitment_focus": 0.30,
  "position.category": 0.25
}
```

## Practical Rule

- 如果要做“候选人排序”，优先用这套解释
- 如果要做“岗位文档抽取质量评估”，继续看原始 `*.score.json`
- 不要把两者混为一谈
