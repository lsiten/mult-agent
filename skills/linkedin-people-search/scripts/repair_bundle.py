#!/usr/bin/env python3

import argparse
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path


SECTION_MARKERS = [
    "个人简介",
    "动态",
    "工作经历",
    "教育经历",
    "资格认证",
    "技能",
    "语言能力",
    "关注",
    "公司",
    "群组",
    "专栏",
    "学校",
    "更多职业档案推荐",
    "浏览高级档案",
    "猜您认识",
    "您可能喜欢",
    "公司主页推荐",
    "更多职业档案推荐",
]

ACTION_LINES = {
    "加为好友",
    "发消息",
    "更多",
    "联系方式",
    "显示全部动态",
    "显示全部",
    "显示证书",
    "关注",
}

GENERIC_SKILL_STOPWORDS = {
    "ai",
    "cloud",
    "solution",
    "solutions architect",
    "架构师",
    "解决方案",
    "current",
}

EXPLICIT_SKILL_PATTERN = re.compile(
    r"\b(?:Python|JavaScript|Java|Go|Golang|C\+\+|C#|MySQL|VBA|Openstack|AWS|API|REST|RESTful|WebSocket|OAuth|JSON|Webhook|PMP|VDI|Storage|NFC|Wi-?Fi|IaaS|SaaS|PaaS|DevOps)\b",
    re.I,
)

DATE_RANGE_RE = re.compile(r"(\d{4})年(?:\d{1,2}月)?\s*-\s*(?:至今|现在|\d{4}年(?:\d{1,2}月)?)")
YEAR_TOTAL_RE = re.compile(r"^\d+\s*年(?:\s*\d+\s*个月)?$")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def normalize_line(line: str):
    line = line.replace("\u200b", "").replace("\xa0", " ")
    line = re.sub(r"\s+", " ", line).strip()
    return line


def split_lines(text: str):
    lines = [normalize_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    deduped = []
    for line in lines:
        if deduped and deduped[-1] == line:
            continue
        deduped.append(line)
    return deduped


def is_section_marker(line: str):
    return line in SECTION_MARKERS


def slice_section(lines, marker):
    try:
        start = lines.index(marker)
    except ValueError:
        return []
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index] != marker and is_section_marker(lines[index]):
            end = index
            break
    section = [line for line in lines[start + 1:end] if line != marker]
    return section


def build_top_lines(lines, candidate_name):
    try:
        start = lines.index(candidate_name)
    except ValueError:
        start = 0
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if lines[index] in {"个人简介", "动态", "工作经历", "教育经历"}:
            end = index
            break
    return lines[start:end]


def is_degree_line(line):
    return "度人脉" in line or re.search(r"\b[123]rd\+?\b|\b[123]nd\b|\b1st\b", line, re.I) is not None


def is_location_line(line):
    return (
        "China" in line
        or "中国" in line
        or "Beijing" in line
        or "Shanghai" in line
        or "Hangzhou" in line
        or "District" in line
        or "省" in line
        or "市" in line
    )


def is_duration_line(line):
    return YEAR_TOTAL_RE.match(line) is not None or DATE_RANGE_RE.search(line) is not None


def clean_company(line):
    return re.sub(r"\s*·\s*.+$", "", line).strip()


def parse_card_lines(card_text):
    lines = [line for line in split_lines(card_text) if line not in ACTION_LINES]
    result = {
        "headline": None,
        "current_title": None,
        "current_company": None,
        "current_city": None,
        "connection_degree": None,
        "mutual_connections": None,
        "summary": None,
    }
    for line in lines:
        if "mutual connection" in line or "共同好友" in line:
            result["mutual_connections"] = line
        elif line.startswith("Summary:") or line.startswith("Skills:"):
            result["summary"] = line
        elif line.startswith("Current:"):
            body = line[len("Current:"):].strip()
            result["summary"] = result["summary"] or line
            if " at " in body:
                title, company = body.split(" at ", 1)
                result["current_title"] = title.strip()
                result["current_company"] = company.strip()
        elif is_location_line(line) and result["current_city"] is None:
            result["current_city"] = line
        elif "2nd" in line or "1st" in line or "3rd" in line:
            result["connection_degree"] = line.replace("•", "").strip()

    candidate_lines = []
    for line in lines[1:]:
        if (
            line in ACTION_LINES
            or is_location_line(line)
            or line.startswith("Current:")
            or line.startswith("Summary:")
            or line.startswith("Skills:")
            or "mutual connection" in line
            or "共同好友" in line
            or "2nd" in line
            or "1st" in line
            or "3rd" in line
        ):
            continue
        candidate_lines.append(line)
    if candidate_lines:
        result["headline"] = candidate_lines[0]
    return result


def normalize_connection_degree(value):
    text = (value or "").strip()
    if "1" in text:
        return "1st"
    if "2" in text:
        return "2nd"
    if "3" in text:
        return "3rd"
    return value


def parse_work_section(section_lines):
    if not section_lines:
        return [], None, None, None

    earliest_year = None
    for line in section_lines:
        for match in DATE_RANGE_RE.finditer(line):
            year = int(match.group(1))
            earliest_year = year if earliest_year is None else min(earliest_year, year)

    current_title = None
    current_company = None
    duration = None
    location = None
    highlights = []

    if len(section_lines) >= 3 and YEAR_TOTAL_RE.match(section_lines[1]):
        current_company = clean_company(section_lines[0])
        current_title = section_lines[2]
        search_start = 3
    else:
        current_title = section_lines[0]
        current_company = clean_company(section_lines[1]) if len(section_lines) > 1 and not is_duration_line(section_lines[1]) else None
        search_start = 2

    for index in range(search_start, min(search_start + 8, len(section_lines))):
        line = section_lines[index]
        if duration is None and DATE_RANGE_RE.search(line):
            duration = line
            continue
        if duration is not None and location is None and is_location_line(line):
            location = line
            continue
        if duration is not None and line not in ACTION_LINES and not is_section_marker(line):
            if not is_duration_line(line):
                highlights.append(line)

    work_history = []
    if current_title or current_company:
        work_history.append(
            {
                "company": current_company,
                "title": current_title,
                "duration": duration,
                "location": location,
                "highlights": highlights[:6],
            }
        )

    years_of_experience = None
    if earliest_year is not None:
        total_years = max(0, datetime.now().year - earliest_year)
        years_of_experience = f"{total_years}年"

    return work_history, current_title, current_company, years_of_experience


def normalize_degree(text):
    lowered = text.lower()
    if "博士" in text or "phd" in lowered or "doctor" in lowered:
        return "博士"
    if "硕士" in text or "master" in lowered:
        return "硕士"
    if "学士" in text or "本科" in text or "bachelor" in lowered:
        return "本科"
    if "大专" in text or "associate" in lowered or "college" in lowered:
        return "大专"
    return None


def parse_education_section(section_lines):
    highest = None
    school = None
    entries = []
    index = 0
    while index < len(section_lines):
        line = section_lines[index]
        if line.startswith("显示全部") or is_duration_line(line):
            index += 1
            continue
        if any(token in line for token in ["大学", "University", "学院", "College", "School"]):
            degree_line = None
            if index + 1 < len(section_lines) and not is_duration_line(section_lines[index + 1]):
                degree_line = section_lines[index + 1]
            entries.append((line, degree_line))
            index += 2
            continue
        index += 1

    degree_order = {"大专": 1, "本科": 2, "硕士": 3, "博士": 4}
    best_rank = -1
    for entry_school, degree_line in entries:
        degree = normalize_degree(degree_line or "")
        if degree is None:
            continue
        rank = degree_order[degree]
        if rank > best_rank:
            best_rank = rank
            highest = degree
            school = entry_school
    return highest, school


def parse_summary(section_lines, card_summary):
    if section_lines:
        cleaned = [line for line in section_lines if line not in ACTION_LINES and not is_section_marker(line)]
        if cleaned:
            return " ".join(cleaned[:4])[:500]
    return card_summary


def parse_skill_lines(section_lines, summary_text, extra_texts):
    skills = []
    for line in section_lines:
        if (
            line.startswith("显示全部")
            or "技能认可" in line
            or "同事认可" in line
            or "认可了该技能" in line
            or re.search(r"\d+\s*次技能认可", line)
        ):
            continue
        if len(line) <= 40 and not is_duration_line(line):
            skills.append(line)

    for text in [summary_text, *extra_texts]:
        for match in EXPLICIT_SKILL_PATTERN.findall(text or ""):
            skills.append(match)

    cleaned = []
    seen = set()
    for skill in skills:
        normalized = skill.strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in GENERIC_SKILL_STOPWORDS:
            continue
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(normalized)
    return cleaned[:20]


def build_match_sections(candidate):
    sections = []
    for key in ("headline", "current_title", "current_company", "summary"):
        value = candidate.get(key)
        if value:
            sections.append(value)
    for skill in candidate.get("skills") or []:
        sections.append(skill)
    for item in candidate.get("work_history") or []:
        title = item.get("title")
        company = item.get("company")
        duration = item.get("duration")
        if title:
            sections.append(title)
        if company:
            sections.append(company)
        if duration:
            sections.append(duration)
        for highlight in item.get("highlights") or []:
            sections.append(highlight)
    deduped = []
    seen = set()
    for item in sections:
        if not item or item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped


def normalize_profile(profile_path: Path):
    data = load_json(profile_path)
    candidate = data.get("candidate") or {}
    raw_sections = candidate.get("raw_sections") or []
    card_text = raw_sections[0] if raw_sections else ""
    detail_text = raw_sections[1] if len(raw_sections) > 1 else ""

    card = parse_card_lines(card_text)
    detail_lines = split_lines(detail_text)
    top_lines = build_top_lines(detail_lines, data.get("candidate_name") or candidate.get("name") or "")
    work_section = slice_section(detail_lines, "工作经历")
    about_section = slice_section(detail_lines, "个人简介")
    education_section = slice_section(detail_lines, "教育经历")
    skills_section = slice_section(detail_lines, "技能")

    work_history, work_title, work_company, years_of_experience = parse_work_section(work_section)
    highest_degree, school = parse_education_section(education_section)

    headline = candidate.get("headline")
    if not headline or headline == "*" or headline == candidate.get("name") or len(headline.strip()) < 2 or headline.strip().lower() in {"sa"}:
        headline = card.get("headline")
    if (not headline or headline == "*" or len(headline.strip()) < 2 or headline.strip().lower() in {"sa"}) and work_title:
        if work_company:
            headline = f"{work_company} - {work_title}"
        else:
            headline = work_title

    current_title = work_title or card.get("current_title") or candidate.get("current_title")
    current_company = work_company or card.get("current_company") or candidate.get("current_company")
    current_city = card.get("current_city") or candidate.get("current_city")
    summary = parse_summary(about_section, card.get("summary") or candidate.get("summary"))
    extra_skill_texts = list(about_section)
    for item in work_history:
        extra_skill_texts.extend(item.get("highlights") or [])
    skills = parse_skill_lines(skills_section, summary or "", extra_skill_texts)

    if not current_company:
        for index, line in enumerate(top_lines):
            if line == headline and index + 1 < len(top_lines):
                next_line = top_lines[index + 1]
                if next_line not in ACTION_LINES and not is_location_line(next_line) and not is_degree_line(next_line):
                    current_company = next_line
                    break

    candidate["headline"] = headline
    candidate["current_title"] = current_title
    candidate["current_company"] = current_company
    candidate["current_city"] = current_city
    candidate["connection_degree"] = normalize_connection_degree(
        (card.get("connection_degree") or candidate.get("connection_degree") or "").replace("•", "").replace("度人脉", "").strip()
    ) or candidate.get("connection_degree")
    candidate["mutual_connections"] = card.get("mutual_connections") or candidate.get("mutual_connections")
    candidate["years_of_experience"] = years_of_experience or candidate.get("years_of_experience")
    candidate["education"]["highest"] = highest_degree or candidate.get("education", {}).get("highest")
    candidate["education"]["school"] = school or candidate.get("education", {}).get("school")
    candidate["skills"] = skills
    candidate["summary"] = summary
    candidate["work_history"] = work_history
    candidate["match_sections"] = build_match_sections(candidate)

    warnings = data.get("capture_meta", {}).get("warnings") or []
    if candidate["education"]["school"] == "教育经历":
        candidate["education"]["school"] = None
    if candidate["current_title"] == candidate.get("name"):
        candidate["current_title"] = None
        warnings.append("Current title could not be reliably resolved from the captured profile.")
    if detail_text and any(marker in detail_text for marker in ["更多职业档案推荐", "猜您认识", "您可能喜欢"]):
        warnings.append("Raw detail text includes recommendation sections; scoring uses normalized match_sections instead.")

    data["capture_meta"]["warnings"] = sorted(set(warnings))
    data["candidate"] = candidate
    dump_json(profile_path, data)
    return data


def rebuild_master(bundle_dir: Path):
    search_master = load_json(bundle_dir / "search-master.json")
    candidates = []
    for score_file in sorted(bundle_dir.glob("profile*_score.json")):
        profile_file = bundle_dir / score_file.name.replace("_score.json", "_file.json")
        if not profile_file.exists():
            continue
        profile = load_json(profile_file)
        score = load_json(score_file)
        candidate = profile.get("candidate") or {}
        source = profile.get("source") or {}
        candidates.append(
            {
                "candidate_id": profile.get("candidate_id"),
                "name": profile.get("candidate_name") or candidate.get("name"),
                "score": score.get("total_score"),
                "resume_file": profile_file.name,
                "score_file": score_file.name,
                "headline": candidate.get("headline"),
                "current_company": candidate.get("current_company"),
                "current_city": candidate.get("current_city"),
                "profile_url": source.get("profile_url"),
                "connection_degree": candidate.get("connection_degree"),
                "updated_at": now_iso(),
            }
        )
    candidates.sort(key=lambda item: (item.get("score") is None, -(item.get("score") or 0), item.get("name") or ""))
    search_master["candidates"] = candidates
    search_master["candidate_count"] = len(candidates)
    search_master["status"] = "collecting" if candidates else "initialized"
    search_master["updated_at"] = now_iso()
    dump_json(bundle_dir / "search-master.json", search_master)


def main():
    parser = argparse.ArgumentParser(description="Repair a LinkedIn search bundle, normalize captured profiles, and recompute scores.")
    parser.add_argument("--bundle-dir", required=True, help="Bundle directory under data/linkedin/<job_slug>")
    parser.add_argument("--job-file", required=True, help="Job JSON path")
    parser.add_argument("--weights-file", required=True, help="Weight JSON path")
    args = parser.parse_args()

    bundle_dir = Path(args.bundle_dir).expanduser().resolve()
    job_file = Path(args.job_file).expanduser().resolve()
    weights_file = Path(args.weights_file).expanduser().resolve()
    skills_dir = Path(__file__).resolve().parents[2]
    score_script = skills_dir / "candidate-match-score" / "scripts" / "score_resume.py"
    if not score_script.exists():
        raise FileNotFoundError(f"candidate-match-score script not found: {score_script}")

    repaired = []
    for profile_file in sorted(bundle_dir.glob("profile*_file.json")):
        profile = normalize_profile(profile_file)
        subprocess.run(
            [
                "python3",
                str(score_script),
                "--job-file",
                str(job_file),
                "--weights-file",
                str(weights_file),
                "--resume-file",
                str(profile_file),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        score_file = profile_file.with_name(profile_file.name.replace("_file.json", "_score.json"))
        score = load_json(score_file)
        repaired.append(
            {
                "candidate_id": profile.get("candidate_id"),
                "name": profile.get("candidate_name"),
                "score": score.get("total_score"),
                "headline": profile["candidate"].get("headline"),
                "current_title": profile["candidate"].get("current_title"),
                "current_company": profile["candidate"].get("current_company"),
                "years_of_experience": profile["candidate"].get("years_of_experience"),
                "education": profile["candidate"].get("education"),
                "skills": profile["candidate"].get("skills"),
            }
        )

    rebuild_master(bundle_dir)
    print(json.dumps(repaired, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
