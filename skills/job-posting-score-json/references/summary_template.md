# Summary Template

## Goal

在权重 JSON 生成成功、修改成功、保存成功之后，先给用户一个可快速确认的摘要。

## Display Rule

- 摘要面向用户时，统一使用中文
- 摘要默认使用星级，而不是数字
- JSON 文件内部仍然保留英文 key 和 `0` 到 `1` 数字
- 如果需要，可在中文后附带字段路径，但字段路径不是摘要主视图

## Star Conversion

- `0.00` -> `☆☆☆☆☆`
- `0.01 - 0.20` -> `★☆☆☆☆`
- `0.21 - 0.40` -> `★★☆☆☆`
- `0.41 - 0.60` -> `★★★☆☆`
- `0.61 - 0.80` -> `★★★★☆`
- `0.81 - 1.00` -> `★★★★★`

## Common Chinese Labels

- `status` -> `岗位状态`
- `position.title` -> `岗位名称`
- `requirements.must_have` -> `硬性要求`
- `requirements.skills` -> `技能要求`
- `salary.min` -> `最低薪资`
- `salary.max` -> `最高薪资`
- `location.city` -> `工作城市`
- `requirements.experience` -> `经验要求`
- `requirements.education` -> `学历要求`
- `age_limit` -> `年龄要求`
- `benefits` -> `岗位福利`

## Default Summary Template

```text
本次操作：默认权重生成成功
模式：正式权重
岗位状态：已发布
记录数：1

核心权重：
- 岗位状态：★★★★★
- 岗位名称：★★★★★
- 硬性要求：★★★★★
- 技能要求：★★★★★
- 最低薪资：★★★★★
- 最高薪资：★★★★★
- 工作城市：★★★★★
- 年龄要求：★★☆☆☆

下一步：请确认默认权重，或直接告诉我要修改的字段路径和权重值。
```

## Single-Field Update Template

```text
本次操作：权重修改成功
模式：正式权重
岗位状态：已发布
记录数：1

修改项：
- 技能要求（requirements.skills）：★★★★★ -> ★★★★★

当前核心权重摘要：
- 岗位名称：★★★★★
- 硬性要求：★★★★★
- 技能要求：★★★★★
- 最低薪资：★★★★★
- 工作城市：★★★★★
```

## Save Success Template

```text
本次操作：权重文件保存成功
模式：正式权重
岗位状态：已发布
记录数：1
保存路径：/path/to/job.score.json

关键权重：
- 岗位名称：★★★★★
- 技能要求：★★★★★
- 最低薪资：★★★★★
```

## Required Fields In Summary

- 操作类型
- 模式
- 岗位状态
- 记录数
- 至少 3 到 8 个关键字段的“中文解释 + 星级”

## Conditional Fields

- 如果是修改操作：必须显示修改路径，以及前后星级
- 如果是保存操作：必须显示保存路径
- 如果是预览模式：必须明确写 `预览权重`
