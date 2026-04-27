---
name: job-posting-score-sqlite
description: Use when the user already has a job-posting JSON or a SQLite job_postings record and wants a companion score or weight JSON with the same keys but numeric values from 0 to 1. This skill is for ranking, filtering, and matching jobs, especially when a record status becomes 已发布 and the user wants default mainstream field weights, a review summary, confirmation or editing of specific weights, and writing the generated weights into the same SQLite database.
---

# Job Posting Score JSON

## Overview

这个 skill 不负责抽取岗位内容，而是基于已有的岗位 JSON 或 SQLite 岗位记录生成一份对应的权重 JSON，并可写入同一个 SQLite 数据库。

适用场景：

- 用户已经有岗位提取 JSON
- 用户希望保留相同字段结构，生成一份 `0` 到 `1` 的权重 JSON
- 用户希望做岗位筛选、打分、排序、推荐或匹配
- 用户希望在 `status` 变成 `已发布` 后，自动生成对应的权重 JSON
- 用户希望先看默认权重，再确认或只修改某几个字段
- 用户希望基于 `job_postings` 表中的岗位记录生成权重，并写入 `job_posting_scores` 表

## Input Requirement

- 输入优先使用 [job-posting-image-sqlite](../job-posting-image-sqlite/SKILL.md) 生成的岗位 JSON
- 如果不是该 skill 生成的 JSON，也必须尽量兼容其字段结构
- 如果输入缺少关键字段，仍可生成权重 JSON，但必须说明哪些字段是兼容推断
- 如果用户要求基于数据库记录生成权重，优先从当前工作区 `job_postings.sqlite` 的 `job_postings` 表读取岗位记录
- 如果用户提供 `job_postings.id`、`record_uid`、公司名或岗位名，用它定位对应岗位；无法唯一定位时先列出候选项让用户确认

## Output Contract

1. 输出一份 `score JSON` 或 `weight JSON`
2. `key`、层级、嵌套结构与源 JSON 保持一致
3. `value` 不再是原始内容，而是 `0` 到 `1` 的数字
4. `0` 表示忽略
5. `1` 表示必须满足
6. 数值越接近 `1`，字段权重越高
7. 浮点数默认保留两位小数
8. 每次生成成功或修改成功后，必须先给用户输出一段摘要

## Mapping Rules

- 普通标量字段：直接替换为权重数字
- 数组字段：保留字段名，但值替换为单个权重数字
- `records` 这种对象数组：保留数组结构；每个 `record` 内部字段继续按相同规则替换为数字
- 不要改字段名，不要删字段，不要新增与源 JSON 无关的业务字段

## Trigger Rule

- 当岗位 `status` 为 `已发布` 时，默认应生成或更新对应的权重 JSON
- 当岗位 `status` 为 `未发布`、`未完善`、`已终止` 时，只有在用户明确要求时才生成预览版或草稿版权重 JSON
- 如果用户明确说“现在就生成权重 JSON”，即使 `status` 不是 `已发布` 也可以执行，但要提醒当前只是预览或草稿权重

## Workflow

1. 读取源岗位 JSON
2. 如果输入来自 SQLite，先从 `job_postings.raw_json` 还原岗位 JSON，并记录 `job_posting_id`
3. 检查 `records[*].status`
4. 套用默认权重，生成同结构的权重 JSON
5. 先向用户展示一份“关键字段默认权重摘要”
6. 等用户确认，或根据用户要求只修改指定字段
7. 每次生成成功或修改成功后，先输出“本次操作摘要”
8. 用户确认后，再输出、保存为文件，或写入同一个 SQLite 数据库

## Confirmation Rule

- 默认先展示，再确认
- 默认摘要应优先展示核心字段权重，而不是整份大 JSON
- 用户可以只修改某一个字段，例如：
  - `requirements.skills 改成 1`
  - `salary.min 改成 0.7`
  - `benefits 改成 0.2`
- 如果用户回复“默认即可”“按这个生成”，则直接输出最终版权重 JSON

## Success Summary Rule

- 每次“生成成功”后，必须给用户一段摘要
- 每次“改单字段成功”后，也必须给用户一段摘要
- 每次“保存成功”后，也必须给用户一段摘要
- 摘要优先于整份 JSON 输出
- 摘要必须简短、可核对、能让用户快速决定是否继续改
- 摘要展示给用户时，默认使用中文
- 摘要展示给用户时，默认不用数字权重，改用 `5` 星制显示重要程度
- 数据文件内部仍然保持英文 key 和 `0` 到 `1` 数字；只有摘要视图转换成中文和星级

## Summary Content

摘要至少应包含以下内容：

1. 操作类型：
   - `默认权重生成成功`
   - `权重修改成功`
   - `权重文件保存成功`
2. 当前模式：
   - `正式权重`
   - `预览权重`
3. 关联岗位状态：
   - 如 `已发布`、`未发布`
4. 本次涉及的记录数
5. 本次重点权重摘要：
   - 必须使用“中文解释 + 星级”
   - 如 `岗位名称：★★★★★`
   - `技能要求：★★★★★`
   - `最低薪资：★★★★☆`
6. 如果是改单字段，必须展示：
   - 修改字段路径
   - 修改前星级
   - 修改后星级
7. 如果已保存，必须展示保存路径

## Summary Style

- 默认用简洁中文输出
- 不要整段重复整份 JSON
- 优先列出用户最关心的核心字段
- 单字段修改时，摘要重点放在改动项，而不是全文
- 全量默认生成时，摘要重点放在前 `8` 到 `12` 个核心字段
- 摘要中的字段名称，优先用中文业务含义，不要直接把英文路径原样丢给用户
- 允许在中文说明后补充英文路径，但英文路径应放次要位置

## Star Display Rule

- 用户摘要统一使用 `5` 星制
- 星级只用于展示可读性，不替代 JSON 内部的真实数字
- 推荐换算规则如下：
  - `0.00` -> `☆☆☆☆☆`
  - `0.01 - 0.20` -> `★☆☆☆☆`
  - `0.21 - 0.40` -> `★★☆☆☆`
  - `0.41 - 0.60` -> `★★★☆☆`
  - `0.61 - 0.80` -> `★★★★☆`
  - `0.81 - 1.00` -> `★★★★★`
- 如果用户特别要求看具体数值，再额外展示数字版本

## Modification Rule

- 如果用户只修改一个字段，只更新对应字段及必要的关联摘要，不要重置整个权重模板
- 修改成功后，应立即给出“修改前星级 -> 修改后星级”的摘要
- 如果用户连续修改多个字段，可合并成一段摘要，但必须逐项列出改动路径

## Weight Scale

- `0.00`: 忽略
- `0.01 - 0.29`: 很低权重
- `0.30 - 0.59`: 辅助参考
- `0.60 - 0.89`: 重要字段
- `0.90 - 1.00`: 必须或接近必须

## Default Weight Policy

- 默认权重参考主流招聘筛选逻辑：岗位名称、技能、硬性要求、薪资、城市、经验优先级最高
- `status` 默认视为强约束字段
- `requirements.must_have`、`requirements.skills`、`position.title` 默认接近 `must`
- 元数据、OCR 信息、文件来源信息默认低权重
- 年龄要求 `age_limit` 默认中低权重，除非用户明确要强化

详细字段默认权重见：

- [references/score_schema.md](references/score_schema.md)
- [references/default_weights.md](references/default_weights.md)
- [references/summary_template.md](references/summary_template.md)

## Save Rule

- 如果用户要求保存为文件，默认保存为与源文件同目录的 `*.score.json`
- 如果用户要求写入 SQLite、数据库、表，默认写入当前工作区 `job_postings.sqlite` 的 `job_posting_scores` 表
- 写入 SQLite 时必须关联 `job_postings.id`，不要生成无法追溯到岗位记录的孤立权重
- 同一个岗位多次生成或修改权重时，默认保留历史版本，并把最新版本标记为 active
- 不要覆盖原始岗位 JSON，除非用户明确要求覆盖
- 保存成功后，必须给用户一个保存摘要

## SQLite Storage Rule

- 基于 SQLite 岗位记录生成权重时，必须使用和岗位记录相同的 SQLite 数据库。
- `records[*].status = 已发布` 时写入 `正式权重`；其他状态只有用户明确要求时写入 `预览权重`。
- 写入前确保 `job_posting_scores` 表存在，并开启 SQLite 外键约束。
- `score_json` 保存完整同结构权重 JSON；摘要视图可以是中文星级，但不要替代数据库中的数字权重。
- 保存摘要必须包含数据库路径、表名、`job_posting_id`、`score_id`、模式和关联岗位状态。
- 详细建表、字段映射和版本规则见 [../job-posting-image-sqlite/references/sqlite_storage.md](../job-posting-image-sqlite/references/sqlite_storage.md)。

## Quality Rules

- 不要因为默认模板存在，就忽略用户后续修改
- 不要把缺失字段直接打成 `1`
- 不要把 `status` 为 `未完善` 或 `未发布` 的岗位直接当成正式上线岗位处理
- 如果某字段在源 JSON 中不存在，应尽量保持兼容结构，而不是随意发明新字段
- 不要在生成成功后直接沉默返回文件结果而没有摘要
- 不要在摘要里默认只给英文路径和数字权重
