#!/usr/bin/env python3

import argparse
import json
import re
from datetime import datetime
from pathlib import Path


SEARCH_URL = "https://h.liepin.com/search/getConditionItem"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def safe_name(value: str):
    value = (value or "").strip()
    value = re.sub(r'[\\/:*?"<>|]+', "-", value)
    value = re.sub(r"[\s()（）]+", "-", value)
    value = re.sub(r"-{2,}", "-", value).strip("-")
    return value or "unknown"


def infer_weights_file(job_file: Path):
    return job_file.with_name(f"{job_file.stem}.score.json")


def get_nested(data, path, default=None):
    current = data
    for key in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def unique_keep_order(values):
    seen = set()
    result = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def detect_school_tags(record):
    phrases = []
    for key in ("must_have", "preferred"):
        phrases.extend(get_nested(record, f"requirements.{key}", []) or [])
    text = " ".join(phrases)
    tags = []
    for tag in ("统招", "非统招", "211", "985", "双一流", "海外留学"):
        if tag in text:
            tags.append(tag)
    return tags


def build_weighted_focus(record, weight_record):
    focus_fields = [
        ("position.title", "岗位名称"),
        ("position.category", "岗位类别"),
        ("location.city", "城市"),
        ("requirements.experience", "工作年限"),
        ("requirements.education", "学历"),
        ("requirements.skills", "技能"),
        ("requirements.must_have", "硬性要求"),
        ("requirements.preferred", "加分项"),
        ("summary.recruitment_focus", "招聘重点"),
        ("summary.keywords", "关键词"),
        ("age_limit", "年龄要求"),
    ]
    weighted_focus = []
    for path, label in focus_fields:
        weight = get_nested(weight_record, path)
        value = get_nested(record, path)
        if weight is None or not isinstance(weight, (int, float)):
            continue
        if value in (None, "", [], {}):
            continue
        weighted_focus.append(
            {
                "path": f"records[0].{path}",
                "label": label,
                "weight": round(float(weight), 4),
                "value": value,
            }
        )
    weighted_focus.sort(key=lambda item: item["weight"], reverse=True)
    return weighted_focus


def build_record_context(job_record, weight_record):
    title = get_nested(job_record, "position.title")
    category = get_nested(job_record, "position.category")
    city = get_nested(job_record, "location.city")
    company = get_nested(job_record, "company.name")
    experience = get_nested(job_record, "requirements.experience")
    education = get_nested(job_record, "requirements.education")
    industry = get_nested(job_record, "company.industry")
    age_limit = job_record.get("age_limit")
    skills = list(get_nested(job_record, "requirements.skills", []) or [])
    keywords = list(get_nested(job_record, "summary.keywords", []) or [])
    must_have = list(get_nested(job_record, "requirements.must_have", []) or [])
    school_tags = detect_school_tags(job_record)
    keyword_query = " ".join(unique_keep_order([title, *skills[:4], *keywords[:3]]))

    return {
        "record_id": job_record.get("record_id", "job-001"),
        "keyword_query": keyword_query,
        "manual_filters": {
            "职位名称": title,
            "公司名称": company,
            "当前城市": city,
            "期望城市": city,
            "工作年限": experience,
            "教育经历": education,
            "当前行业": industry,
            "当前职位": category or title,
            "年龄": age_limit,
            "院校要求": school_tags,
        },
        "top_skills": skills[:6],
        "summary_keywords": keywords[:6],
        "must_have_phrases": must_have[:8],
        "weighted_focus": build_weighted_focus(job_record, weight_record),
    }


def build_master_payload(job_file: Path, weights_file: Path, output_dir: Path, search_context):
    return {
        "schema_version": "1.0",
        "task": "liepin_resume_search",
        "status": "initialized",
        "generated_at": now_iso(),
        "job_file": str(job_file),
        "weights_file": str(weights_file),
        "search_url": SEARCH_URL,
        "output_dir": str(output_dir),
        "candidate_count": 0,
        "search_context_file": "search-context.json",
        "records": [
            {
                "record_id": record["record_id"],
                "keyword_query": record["keyword_query"],
            }
            for record in search_context["records"]
        ],
        "candidates": [],
    }


def main():
    parser = argparse.ArgumentParser(description="Prepare Liepin recruiter search context from job and weight JSON.")
    parser.add_argument("--job-file", required=True, help="Job JSON file path.")
    parser.add_argument("--weights-file", help="Weight JSON file path. Defaults to <job>.score.json.")
    parser.add_argument("--output-root", help="Output root directory. Defaults to <job_dir>/liepin.")
    parser.add_argument("--slug", help="Override the output folder name.")
    args = parser.parse_args()

    job_file = Path(args.job_file).expanduser().resolve()
    if not job_file.exists():
        raise SystemExit(f"Job file not found: {job_file}")

    weights_file = Path(args.weights_file).expanduser().resolve() if args.weights_file else infer_weights_file(job_file)
    if not weights_file.exists():
        raise SystemExit(f"Weights file not found: {weights_file}")

    job_data = load_json(job_file)
    weight_data = load_json(weights_file)

    records = job_data.get("records") or []
    weight_records = weight_data.get("records") or []
    if not records:
        raise SystemExit("Job JSON has no records.")
    if not weight_records:
        raise SystemExit("Weight JSON has no records.")

    output_root = Path(args.output_root).expanduser().resolve() if args.output_root else (job_file.parent / "liepin").resolve()
    default_slug = job_file.stem
    slug = safe_name(args.slug or default_slug)
    output_dir = output_root / slug

    context_records = []
    for index, record in enumerate(records):
        weight_record = weight_records[index] if index < len(weight_records) else weight_records[0]
        context_records.append(build_record_context(record, weight_record))

    search_context = {
        "schema_version": "1.0",
        "task": "liepin_resume_search_context",
        "generated_at": now_iso(),
        "job_file": str(job_file),
        "weights_file": str(weights_file),
        "search_url": SEARCH_URL,
        "output_dir": str(output_dir),
        "records": context_records,
    }

    master_payload = build_master_payload(job_file, weights_file, output_dir, search_context)

    search_context_path = output_dir / "search-context.json"
    master_path = output_dir / "search-master.json"
    dump_json(search_context_path, search_context)
    dump_json(master_path, master_payload)

    print(
        json.dumps(
            {
                "output_dir": str(output_dir),
                "search_context": str(search_context_path),
                "search_master": str(master_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
