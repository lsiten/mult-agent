#!/usr/bin/env python3

import argparse
import json
import re
from datetime import datetime
from pathlib import Path


TECH_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]*|[\u4e00-\u9fff]{2,}")
CANONICAL_PATTERNS = [
    ("solution_architect", re.compile(r"解决方案架构师|解决方案架构|\bsolutions?\s+architect\b", re.I)),
    ("system_integration", re.compile(r"系统集成|技术对接|平台接入|接入方式|集成方案|\bintegration\b", re.I)),
    ("sdk", re.compile(r"\bsdk\b", re.I)),
    ("api", re.compile(r"\bapi\b", re.I)),
    ("rest_api", re.compile(r"\brest(?:ful)?\s*api\b|\brestful\b", re.I)),
    ("websocket", re.compile(r"\bwebsocket\b", re.I)),
    ("oauth", re.compile(r"\boauth\b", re.I)),
    ("token_auth", re.compile(r"\btoken\b|鉴权|认证方式|\bauth\b", re.I)),
    ("json", re.compile(r"\bjson\b", re.I)),
    ("webhook", re.compile(r"\bwebhook\b|回调机制|回调", re.I)),
    ("python", re.compile(r"\bpython\b", re.I)),
    ("javascript", re.compile(r"\bjavascript\b|\bjs\b", re.I)),
    ("java", re.compile(r"\bjava\b", re.I)),
    ("go", re.compile(r"\bgolang\b|\bgo\b", re.I)),
    ("poc_demo", re.compile(r"\bpoc\b|\bdemo\b|能力验证|方案展示", re.I)),
    ("technical_communication", re.compile(r"技术沟通|需求沟通|技术交流|售前|solution demo|technical liaison", re.I)),
    ("developer_ecosystem", re.compile(r"开发者生态|生态伙伴|\bisv\b|合作伙伴|partner", re.I)),
    ("saas", re.compile(r"\bsaas\b", re.I)),
    ("paas", re.compile(r"\bpaas\b", re.I)),
    ("ai_platform", re.compile(r"ai\s*平台|大模型|多模态|语音|agent", re.I)),
]
DEGREE_ORDER = {
    "高中及以下": 1,
    "中专": 2,
    "中技": 2,
    "大专": 3,
    "专科": 3,
    "本科": 4,
    "学士": 4,
    "硕士": 5,
    "研究生": 5,
    "博士": 6,
    "博士后": 7,
}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def get_nested(data, path, default=None):
    current = data
    for key in path.split("."):
        if not isinstance(current, dict):
            return default
        current = current.get(key)
        if current is None:
            return default
    return current


def flatten_text(value):
    if value is None:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, list):
        items = []
        for item in value:
            items.extend(flatten_text(item))
        return items
    if isinstance(value, dict):
        items = []
        for item in value.values():
            items.extend(flatten_text(item))
        return items
    if isinstance(value, (int, float)):
        return [str(value)]
    return []


def tokenize(text):
    if not text:
        return []
    tokens = []
    for token in TECH_PATTERN.findall(text):
        token = token.strip().lower()
        if token:
            tokens.append(token)
    return tokens


def canonical_tokens(text):
    if not text:
        return []
    text = str(text)
    matched = []
    for canonical, pattern in CANONICAL_PATTERNS:
        if pattern.search(text):
            matched.append(canonical)
    return matched


def extract_requirement_tokens(text):
    canonical = unique_keep_order(canonical_tokens(text))
    if canonical:
        return canonical
    return unique_keep_order(tokenize(text))


def candidate_tokens_for_text(text):
    return unique_keep_order(tokenize(text) + canonical_tokens(text))


def unique_keep_order(values):
    seen = set()
    result = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def parse_year_bounds(text):
    if not text:
        return (None, None)
    numbers = [int(value) for value in re.findall(r"\d+", str(text))]
    if not numbers:
        return (None, None)
    if "以上" in str(text) or "起" in str(text):
        return (numbers[0], None)
    if "以下" in str(text):
        return (None, numbers[0])
    if len(numbers) >= 2:
        return (numbers[0], numbers[1])
    return (numbers[0], numbers[0])


def parse_salary_bounds(text):
    if not text:
        return (None, None)
    numbers = [float(value) for value in re.findall(r"\d+(?:\.\d+)?", str(text))]
    if not numbers:
        return (None, None)
    if len(numbers) >= 2:
        return (numbers[0], numbers[1])
    return (numbers[0], numbers[0])


def degree_value(text):
    if not text:
        return None
    text = str(text)
    lowered = text.lower()
    if "phd" in lowered or "doctor" in lowered:
        return DEGREE_ORDER["博士"]
    if "master" in lowered:
        return DEGREE_ORDER["硕士"]
    if "bachelor" in lowered:
        return DEGREE_ORDER["本科"]
    if "associate" in lowered or "college" in lowered:
        return DEGREE_ORDER["大专"]
    for degree, value in DEGREE_ORDER.items():
        if degree in text:
            return value
    return None


def gather_candidate_context(resume):
    candidate = resume.get("candidate") or {}
    work_history = candidate.get("work_history") or []
    project_history = candidate.get("project_history") or []
    match_sections = candidate.get("match_sections") or []
    raw_sections = candidate.get("raw_sections") or []

    context_strings = []
    context_strings.extend(flatten_text(candidate.get("skills")))
    context_strings.extend(flatten_text(candidate.get("summary")))
    context_strings.extend(flatten_text(candidate.get("headline")))
    context_strings.extend(flatten_text(candidate.get("current_title")))
    context_strings.extend(flatten_text(candidate.get("current_company")))
    context_strings.extend(flatten_text(candidate.get("industries")))
    context_strings.extend(flatten_text(work_history))
    context_strings.extend(flatten_text(project_history))
    if match_sections:
        context_strings.extend(flatten_text(match_sections))
    else:
        context_strings.extend(flatten_text(raw_sections))

    context_strings = unique_keep_order([item for item in context_strings if item])
    context_text = "\n".join(context_strings)
    context_tokens = set(candidate_tokens_for_text(context_text))

    cities = unique_keep_order(
        flatten_text(candidate.get("current_city")) + flatten_text(candidate.get("preferred_cities"))
    )

    return {
        "candidate": candidate,
        "context_strings": context_strings,
        "context_text": context_text,
        "context_tokens": context_tokens,
        "cities": cities,
    }


def token_score(requirement, candidate_tokens):
    tokens = extract_requirement_tokens(requirement)
    if not tokens:
        return (None, [])
    matched = [token for token in tokens if token in candidate_tokens]
    score = len(matched) / len(tokens)
    return (score, matched[:8])


def sentence_list_score(requirements, candidate_tokens):
    scores = []
    evidence = []
    for requirement in requirements:
        score, matched = token_score(requirement, candidate_tokens)
        if score is None:
            continue
        scores.append(score)
        if matched:
            evidence.extend(matched[:4])
    if not scores:
        return (None, [])
    return (sum(scores) / len(scores), unique_keep_order(evidence)[:10])


def classify(score):
    if score is None:
        return "skipped"
    if score >= 0.8:
        return "matched"
    if score >= 0.5:
        return "partial"
    if score >= 0.2:
        return "weak"
    return "missed"


def compare_title(job_value, ctx):
    candidate = ctx["candidate"]
    name = candidate.get("name")
    titles = flatten_text(candidate.get("current_title")) + flatten_text(candidate.get("headline"))
    titles = [
        title for title in titles
        if title and title != name and title != "*" and len(title.strip()) >= 2
    ]
    if not job_value:
        return (None, [], None)
    if not titles:
        return (0.0, [], "候选人缺少当前职位或标题信息")
    best_score = 0.0
    best_evidence = []
    for title in titles:
        if job_value in title or title in job_value:
            return (1.0, [title], None)
        score, matched = token_score(job_value, set(candidate_tokens_for_text(title)))
        if score is not None and score > best_score:
            best_score = score
            best_evidence = matched or [title]
    return (best_score, best_evidence[:6], None)


def compare_city(job_value, ctx):
    if not job_value:
        return (None, [], None)
    candidate_cities = ctx["cities"]
    if not candidate_cities:
        return (0.0, [], "候选人缺少城市信息")
    matched = [city for city in candidate_cities if job_value in city or city in job_value]
    if matched:
        return (1.0, matched[:4], None)
    return (0.0, candidate_cities[:4], None)


def compare_experience(job_value, ctx):
    if not job_value:
        return (None, [], None)
    candidate_value = ctx["candidate"].get("years_of_experience")
    if not candidate_value:
        return (0.0, [], "候选人缺少工作年限信息")
    job_min, job_max = parse_year_bounds(job_value)
    cand_min, cand_max = parse_year_bounds(candidate_value)
    cand_years = cand_max or cand_min
    if cand_years is None:
        return (0.0, [str(candidate_value)], "无法解析候选人工作年限")
    if job_min is not None and cand_years < job_min:
        ratio = cand_years / job_min if job_min else 0.0
        return (max(0.0, min(1.0, ratio)), [str(candidate_value)], None)
    if job_max is not None and cand_years > job_max:
        return (0.7, [str(candidate_value)], None)
    return (1.0, [str(candidate_value)], None)


def compare_education(job_value, ctx):
    if not job_value:
        return (None, [], None)
    candidate_value = get_nested(ctx["candidate"], "education.highest")
    if not candidate_value:
        return (0.0, [], "候选人缺少学历信息")
    job_degree = degree_value(job_value)
    cand_degree = degree_value(candidate_value)
    if job_degree is None or cand_degree is None:
        score, matched = token_score(job_value, set(tokenize(candidate_value)))
        return (score or 0.0, matched or [str(candidate_value)], None)
    if cand_degree >= job_degree:
        return (1.0, [str(candidate_value)], None)
    return (cand_degree / job_degree, [str(candidate_value)], None)


def compare_age(job_value, ctx):
    if not job_value:
        return (None, [], None)
    candidate_age = ctx["candidate"].get("age")
    if candidate_age in (None, ""):
        return (0.0, [], "候选人缺少年龄信息")
    try:
        candidate_age = int(candidate_age)
    except (TypeError, ValueError):
        return (0.0, [str(candidate_age)], "无法解析候选人年龄")

    numbers = [int(value) for value in re.findall(r"\d+", str(job_value))]
    if not numbers:
        return (None, [str(candidate_age)], None)
    if "以下" in str(job_value) and candidate_age <= numbers[0]:
        return (1.0, [str(candidate_age)], None)
    if "以上" in str(job_value) and candidate_age >= numbers[0]:
        return (1.0, [str(candidate_age)], None)
    if len(numbers) >= 2 and numbers[0] <= candidate_age <= numbers[1]:
        return (1.0, [str(candidate_age)], None)
    return (0.0, [str(candidate_age)], None)


def compare_salary(job_record, ctx):
    candidate_value = ctx["candidate"].get("salary_expectation")
    if not candidate_value:
        return (0.0, [], "候选人缺少薪资期望信息")
    job_min = get_nested(job_record, "salary.min")
    job_max = get_nested(job_record, "salary.max")
    if job_min is None and job_max is None:
        return (None, [], None)
    cand_min, cand_max = parse_salary_bounds(candidate_value)
    if cand_min is None and cand_max is None:
        return (0.0, [str(candidate_value)], "无法解析候选人薪资期望")
    if job_min is not None and cand_max is not None and cand_max < job_min:
        return (0.1, [str(candidate_value)], None)
    if job_max is not None and cand_min is not None and cand_min > job_max:
        return (0.3, [str(candidate_value)], None)
    return (1.0, [str(candidate_value)], None)


def compare_school_tags(ctx):
    tags = get_nested(ctx["candidate"], "education.school_tags", []) or []
    return set(token.lower() for token in flatten_text(tags))


def build_breakdowns(job_record, weight_record, ctx):
    comparisons = [
        ("records[0].position.title", get_nested(job_record, "position.title"), lambda value: compare_title(value, ctx)),
        ("records[0].position.category", get_nested(job_record, "position.category"), lambda value: compare_title(value, ctx)),
        ("records[0].location.city", get_nested(job_record, "location.city"), lambda value: compare_city(value, ctx)),
        ("records[0].requirements.experience", get_nested(job_record, "requirements.experience"), lambda value: compare_experience(value, ctx)),
        ("records[0].requirements.education", get_nested(job_record, "requirements.education"), lambda value: compare_education(value, ctx)),
        ("records[0].requirements.skills", get_nested(job_record, "requirements.skills"), None),
        ("records[0].requirements.must_have", get_nested(job_record, "requirements.must_have"), None),
        ("records[0].requirements.preferred", get_nested(job_record, "requirements.preferred"), None),
        ("records[0].responsibilities", get_nested(job_record, "responsibilities"), None),
        ("records[0].summary.recruitment_focus", get_nested(job_record, "summary.recruitment_focus"), None),
        ("records[0].summary.keywords", get_nested(job_record, "summary.keywords"), None),
        ("records[0].age_limit", job_record.get("age_limit"), lambda value: compare_age(value, ctx)),
    ]

    breakdowns = []
    warnings = []
    applicable_weight = 0.0
    weighted_sum = 0.0
    candidate_tokens = ctx["context_tokens"]
    school_tag_tokens = compare_school_tags(ctx)

    for path, requirement, comparator in comparisons:
        weight_path = path.replace("records[0].", "")
        weight = get_nested(weight_record, weight_path)
        if not isinstance(weight, (int, float)) or weight <= 0:
            continue

        if requirement in (None, "", [], {}):
            breakdowns.append(
                {
                    "path": path,
                    "weight": round(float(weight), 4),
                    "score": None,
                    "weighted_score": None,
                    "status": "skipped",
                    "evidence": [],
                    "note": "岗位字段为空，跳过评分",
                }
            )
            continue

        score = None
        evidence = []
        note = None

        if path == "records[0].requirements.skills":
            score, evidence = sentence_list_score(requirement, candidate_tokens)
        elif path == "records[0].requirements.must_have":
            score, evidence = sentence_list_score(requirement, candidate_tokens)
        elif path == "records[0].requirements.preferred":
            score, evidence = sentence_list_score(requirement, candidate_tokens)
        elif path == "records[0].responsibilities":
            score, evidence = sentence_list_score(requirement, candidate_tokens)
        elif path == "records[0].summary.recruitment_focus":
            score, evidence = token_score(requirement, candidate_tokens)
        elif path == "records[0].summary.keywords":
            score, evidence = sentence_list_score(requirement, candidate_tokens)
        elif comparator is not None:
            score, evidence, note = comparator(requirement)
        else:
            score, evidence = token_score(str(requirement), candidate_tokens)

        if path == "records[0].requirements.education":
            required_text = " ".join(flatten_text(requirement))
            if any(tag in required_text for tag in ("211", "985", "双一流", "海外留学")):
                tag_score, matched_tags = token_score(required_text, school_tag_tokens)
                if tag_score is not None and score is not None:
                    score = min(1.0, (score * 0.7) + (tag_score * 0.3))
                    evidence = unique_keep_order(evidence + matched_tags)

        if path == "records[0].age_limit" and note:
            warnings.append(note)

        applicable_weight += float(weight)
        score = 0.0 if score is None else max(0.0, min(1.0, float(score)))
        weighted = float(weight) * score
        weighted_sum += weighted

        if note and note not in warnings:
            warnings.append(note)

        breakdowns.append(
            {
                "path": path,
                "weight": round(float(weight), 4),
                "score": round(score, 4),
                "weighted_score": round(weighted, 4),
                "status": classify(score),
                "evidence": unique_keep_order(evidence)[:10],
                "note": note,
            }
        )

    salary_weights = []
    for salary_path in ("min", "max", "original_text"):
        weight = get_nested(weight_record, f"salary.{salary_path}")
        if isinstance(weight, (int, float)) and weight > 0:
            salary_weights.append(float(weight))
    if salary_weights and any(get_nested(job_record, f"salary.{field}") is not None for field in ("min", "max", "original_text")):
        score, evidence, note = compare_salary(job_record, ctx)
        salary_weight = max(salary_weights)
        applicable_weight += salary_weight
        score = 0.0 if score is None else max(0.0, min(1.0, float(score)))
        weighted = salary_weight * score
        weighted_sum += weighted
        if note and note not in warnings:
            warnings.append(note)
        breakdowns.append(
            {
                "path": "records[0].salary",
                "weight": round(salary_weight, 4),
                "score": round(score, 4),
                "weighted_score": round(weighted, 4),
                "status": classify(score),
                "evidence": unique_keep_order(evidence)[:10],
                "note": note,
            }
        )

    total_score = weighted_sum / applicable_weight if applicable_weight else 0.0
    return breakdowns, warnings, total_score, applicable_weight


def build_summary(breakdowns):
    scored = [item for item in breakdowns if isinstance(item.get("score"), (int, float))]
    scored.sort(key=lambda item: item["weight"], reverse=True)

    strengths = []
    gaps = []

    for item in scored:
        label = item["path"]
        score = item["score"]
        if score >= 0.8 and len(strengths) < 5:
            strengths.append(f"{label} 匹配度高")
        if score <= 0.3 and item["weight"] >= 0.4 and len(gaps) < 5:
            gaps.append(f"{label} 匹配不足")

    return strengths, gaps


def infer_output_file(resume_file: Path):
    if resume_file.name.endswith("_file.json"):
        return resume_file.with_name(resume_file.name.replace("_file.json", "_score.json"))
    return resume_file.with_name(f"{resume_file.stem}_score.json")


def main():
    parser = argparse.ArgumentParser(description="Score one candidate resume JSON against a job JSON and weight JSON.")
    parser.add_argument("--job-file", required=True, help="Job JSON file path")
    parser.add_argument("--weights-file", required=True, help="Weight JSON file path")
    parser.add_argument("--resume-file", required=True, help="Candidate resume JSON file path")
    parser.add_argument("--output-file", help="Output score JSON path")
    args = parser.parse_args()

    job_file = Path(args.job_file).expanduser().resolve()
    weights_file = Path(args.weights_file).expanduser().resolve()
    resume_file = Path(args.resume_file).expanduser().resolve()
    output_file = Path(args.output_file).expanduser().resolve() if args.output_file else infer_output_file(resume_file)

    job_data = load_json(job_file)
    weight_data = load_json(weights_file)
    resume_data = load_json(resume_file)

    job_record = (job_data.get("records") or [None])[0]
    weight_record = (weight_data.get("records") or [None])[0]
    if not job_record or not weight_record:
        raise SystemExit("Job JSON or weight JSON is missing records[0].")

    ctx = gather_candidate_context(resume_data)
    breakdowns, warnings, total_score, applicable_weight = build_breakdowns(job_record, weight_record, ctx)
    strengths, gaps = build_summary(breakdowns)

    payload = {
        "schema_version": "1.0",
        "task": "candidate_match_score",
        "generated_at": now_iso(),
        "candidate_id": resume_data.get("candidate_id"),
        "candidate_name": resume_data.get("candidate_name") or get_nested(resume_data, "candidate.name"),
        "job_file": str(job_file),
        "weights_file": str(weights_file),
        "resume_file": str(resume_file),
        "total_score": round(total_score, 4),
        "applicable_weight": round(applicable_weight, 4),
        "score_breakdown": breakdowns,
        "strengths": strengths,
        "gaps": gaps,
        "warnings": unique_keep_order([warning for warning in warnings if warning]),
    }

    dump_json(output_file, payload)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
