#!/usr/bin/env python3

import argparse
import json
from datetime import datetime
from pathlib import Path


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: Path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def main():
    parser = argparse.ArgumentParser(description="Update Liepin search-master.json with one candidate bundle.")
    parser.add_argument("--master-file", required=True, help="search-master.json path")
    parser.add_argument("--resume-file", required=True, help="candidate resume JSON path")
    parser.add_argument("--score-file", required=True, help="candidate score JSON path")
    args = parser.parse_args()

    master_file = Path(args.master_file).expanduser().resolve()
    resume_file = Path(args.resume_file).expanduser().resolve()
    score_file = Path(args.score_file).expanduser().resolve()

    master = load_json(master_file)
    resume = load_json(resume_file)
    score = load_json(score_file)

    candidate = resume.get("candidate") or {}
    source = resume.get("source") or {}

    entry = {
        "candidate_id": resume.get("candidate_id") or score.get("candidate_id"),
        "name": resume.get("candidate_name") or candidate.get("name"),
        "score": score.get("total_score"),
        "resume_file": resume_file.name,
        "score_file": score_file.name,
        "current_title": candidate.get("current_title"),
        "current_company": candidate.get("current_company"),
        "current_city": candidate.get("current_city"),
        "resume_url": source.get("resume_url"),
        "updated_at": now_iso(),
    }

    candidates = master.get("candidates") or []
    candidate_id = entry["candidate_id"]
    replaced = False
    for index, existing in enumerate(candidates):
        if existing.get("candidate_id") == candidate_id:
            candidates[index] = entry
            replaced = True
            break
    if not replaced:
        candidates.append(entry)

    candidates.sort(key=lambda item: (item.get("score") is None, -(item.get("score") or 0), item.get("name") or ""))
    master["candidates"] = candidates
    master["candidate_count"] = len(candidates)
    master["status"] = "collecting" if candidates else "initialized"
    master["updated_at"] = now_iso()

    dump_json(master_file, master)
    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
