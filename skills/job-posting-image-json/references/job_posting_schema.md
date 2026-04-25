# Job Posting Schema

## Why This Version Is Better

旧版是平铺字段，适合展示，但不够适合长期存储。

新版改为分组结构，优点是：

- 更适合后端落库和后续接口扩展
- 公司、岗位、薪资、要求、招聘者、提取质量彼此分离
- 支持图片、PDF、DOCX、TXT 等多种来源
- 后续做筛选、检索、统计更方便

## Root Object

```json
{
  "schema_version": "1.2",
  "task": "job_posting_extraction",
  "source": {
    "type": "pdf",
    "format": "pdf",
    "platform": "企业岗位文档",
    "file_name": null,
    "document_title": null,
    "language": "zh-CN",
    "page_count": null,
    "pages_analyzed": [],
    "extraction_mode": null
  },
  "record_count": 1,
  "records": []
}
```

## Root Field Notes

- `schema_version`: 当前 schema 版本
- `task`: 固定写 `job_posting_extraction`
- `source.type`: 来源类型，如 `image`、`pdf`、`docx`、`txt`
- `source.format`: 文件格式，如 `jpg`、`png`、`pdf`、`docx`
- `source.platform`: 来源平台，如“Boss直聘”“智联招聘”“猎聘”“企业招聘海报”
- `source.file_name`: 文件名，未知则为 `null`
- `source.document_title`: 文档标题，能识别时尽量填写
- `source.language`: 推荐写 `zh-CN`
- `source.page_count`: 文档总页数，未知则为 `null`
- `source.pages_analyzed`: 已实际分析的页码数组，如 `[1, 2]`；对于 PDF，默认应尽量覆盖所有相关页
- `source.extraction_mode`: 提取方式，推荐 `text`、`ocr`、`mixed`
- `record_count`: 当前识别出的岗位数量
- `records`: 岗位数组

## Record Schema

```json
{
  "record_id": "job-001",
  "status": "未完善",
  "age_limit": null,
  "company": {
    "name": null,
    "industry": null,
    "stage": null,
    "size": null
  },
  "position": {
    "title": null,
    "category": null,
    "employment_type": null,
    "headcount": null,
    "description": null
  },
  "location": {
    "city": null,
    "district": null,
    "address": null,
    "work_mode": null
  },
  "salary": {
    "min": null,
    "max": null,
    "unit": null,
    "months": null,
    "currency": "CNY",
    "original_text": null
  },
  "requirements": {
    "experience": null,
    "education": null,
    "skills": [],
    "must_have": [],
    "preferred": []
  },
  "responsibilities": [],
  "benefits": [],
  "recruiter": {
    "name": null,
    "title": null
  },
  "source_info": {
    "publish_time_text": null,
    "page_hint": null,
    "page_range": []
  },
  "summary": {
    "recruitment_focus": null,
    "keywords": []
  },
  "extraction_meta": {
    "confidence": 0.0,
    "coverage_status": "unknown",
    "coverage_note": null,
    "missing_fields": [],
    "ocr_warnings": [],
    "raw_snippets": []
  }
}
```

## Field Notes

### company

- `company.name`: 公司名称，优先保留原文
- `company.industry`: 行业，如“物联网”“互联网”“智能制造”
- `company.stage`: 融资阶段，如“未融资”“A轮”“上市”
- `company.size`: 公司规模，如“20-99人”“1000人以上”

### status

- `status`: 岗位状态，只允许以下 4 个中文值：
- `未完善`: 提取未完成、字段缺失较多、覆盖范围不明确，或暂时无法确认状态
- `未发布`: 内部 JD、草稿、待发布岗位
- `已发布`: 已公开发布、已上线招聘中的岗位
- `已终止`: 原文明确显示岗位已关闭、已下线、终止招聘

### age_limit

- `age_limit`: 年龄要求原文，如 `35岁以下`、`20-30岁`、`年龄不限`
- 如果原文未提到年龄要求，写 `null`

### position

- `position.title`: 岗位名称
- `position.category`: 岗位类别，如“前端开发”“嵌入式开发”“测试工程师”
- `position.employment_type`: 用工类型，如“全职”“实习”“兼职”
- `position.headcount`: 招聘人数，如“2人”“若干”
- `position.description`: 原始岗位说明或无法完整拆分的正文

### location

- `location.city`: 城市
- `location.district`: 区县
- `location.address`: 更完整的工作地点
- `location.work_mode`: 如“现场办公”“可远程”“混合办公”

### salary

- `salary.min` / `salary.max`: 薪资数值部分
- `salary.unit`: 推荐写 `K/月`、`元/月`、`元/天`
- `salary.months`: 例如 `13`、`14`
- `salary.currency`: 默认 `CNY`
- `salary.original_text`: 原始薪资文案，如 `15-25K·13薪`

### requirements

- `requirements.experience`: 经验要求，如“1-3年”“3-5年”“经验不限”
- `requirements.education`: 学历要求，如“大专”“本科”“硕士”
- `requirements.skills`: 技术关键词，如 `ESP32`、`MQTT`、`Python`
- `requirements.must_have`: 硬性要求
- `requirements.preferred`: 加分项、优先项

### recruiter

- `recruiter.name`: 招聘者姓名
- `recruiter.title`: 招聘者身份，如“HR”“招聘主管”“技术负责人”

### source_info

- `source_info.publish_time_text`: 发布时间原文，如“今天”“2天前”
- `source_info.page_hint`: 页面补充线索，如“职位详情页”“企业主页截图”
- `source_info.page_range`: 当前岗位信息来源页码范围，如 `[1, 2]`

### summary

- `summary.recruitment_focus`: 一句话概括公司主要想招什么样的人
- `summary.keywords`: 对该岗位的关键词摘要

### extraction_meta

- `extraction_meta.confidence`: 提取可信度，范围 `0` 到 `1`
- `extraction_meta.coverage_status`: 覆盖状态，推荐 `complete`、`partial`、`unknown`；只有覆盖全部相关页或确认单页时才应写 `complete`
- `extraction_meta.coverage_note`: 对覆盖范围的补充说明
- `extraction_meta.missing_fields`: 未识别出的关键字段名
- `extraction_meta.ocr_warnings`: OCR 模糊、遮挡、裁切等问题
- `extraction_meta.raw_snippets`: 不确定但保留的原文片段

## Salary Parsing

- `15-25K` -> `min: 15`, `max: 25`, `unit: "K/月"`
- `15-25K·13薪` -> 增加 `months: 13`
- `面议` -> `min: null`, `max: null`, `original_text: "面议"`
- `300-500元/天` -> `unit: "元/天"`

## Example Output

下面是这个 AI 按当前 schema 生成的 PDF 典型 JSON 格式：

```json
{
  "schema_version": "1.2",
  "task": "job_posting_extraction",
  "source": {
    "type": "pdf",
    "format": "pdf",
    "platform": "企业岗位文档",
    "file_name": "solution_architect.pdf",
    "document_title": "解决方案架构师",
    "language": "zh-CN",
    "page_count": 3,
    "pages_analyzed": [
      1,
      2,
      3
    ],
    "extraction_mode": "mixed"
  },
  "record_count": 1,
  "records": [
    {
      "record_id": "job-001",
      "status": "已发布",
      "age_limit": null,
      "company": {
        "name": "某智能科技有限公司",
        "industry": "物联网",
        "stage": "A轮",
        "size": "100-499人"
      },
      "position": {
        "title": "嵌入式开发工程师",
        "category": "嵌入式开发",
        "employment_type": "全职",
        "headcount": null,
        "description": "负责物联网终端固件开发、设备接入与通信协议适配。"
      },
      "location": {
        "city": "深圳",
        "district": "南山区",
        "address": null,
        "work_mode": "现场办公"
      },
      "salary": {
        "min": 15,
        "max": 25,
        "unit": "K/月",
        "months": 13,
        "currency": "CNY",
        "original_text": "15-25K·13薪"
      },
      "requirements": {
        "experience": "3-5年",
        "education": "本科",
        "skills": [
          "ESP32",
          "MQTT",
          "C/C++"
        ],
        "must_have": [
          "熟悉 ESP32 平台开发",
          "熟悉 MQTT 协议",
          "具备嵌入式项目开发经验"
        ],
        "preferred": [
          "有物联网项目经验优先"
        ]
      },
      "responsibilities": [
        "负责物联网终端固件开发",
        "实现设备数据采集与上传",
        "配合平台侧完成通信联调"
      ],
      "benefits": [
        "五险一金",
        "年终奖",
        "带薪年假"
      ],
      "recruiter": {
        "name": "张女士",
        "title": "HRBP"
      },
      "source_info": {
        "publish_time_text": null,
        "page_hint": "PDF 岗位说明",
        "page_range": [
          1,
          2,
          3
        ]
      },
      "summary": {
        "recruitment_focus": "公司主要招聘具备 ESP32 和 MQTT 实战经验的嵌入式开发工程师。",
        "keywords": [
          "物联网",
          "ESP32",
          "MQTT",
          "嵌入式"
        ]
      },
      "extraction_meta": {
        "confidence": 0.93,
        "coverage_status": "complete",
        "coverage_note": "已覆盖该岗位所在的全部相关页。",
        "missing_fields": [
          "position.headcount",
          "location.address"
        ],
        "ocr_warnings": [],
        "raw_snippets": []
      }
    }
  ]
}
```

## Minimal Output Rule

如果文件信息很少，也必须保持同样的结构；只是在对应字段填 `null` 或空数组。
