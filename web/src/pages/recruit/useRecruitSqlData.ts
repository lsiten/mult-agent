import { useEffect, useMemo, useState } from "react";
import { api, type RecruitCandidateRecord, type RecruitJobPosting, type RecruitWorkspaceResponse } from "@/lib/api";

export function useRecruitSqlData() {
  const [workspace, setWorkspace] = useState<RecruitWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getRecruitWorkspace()
      .then((data) => {
        if (!cancelled) {
          setWorkspace(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWorkspace(null);
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({
    workspace,
    postings: workspace?.postings ?? [],
    candidates: workspace?.candidates ?? [],
    databasePath: workspace?.database_path ?? "",
    loading,
    error,
  }), [error, loading, workspace]);
}

export function formatPostingSalary(posting: RecruitJobPosting, fallback: string) {
  const { min, max, unit } = posting.salary;
  if (min != null && max != null) return `${min}-${max}${unit ?? ""}`;
  if (min != null) return `${min}${unit ?? ""}`;
  if (max != null) return `${max}${unit ?? ""}`;
  return fallback;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getNestedText(record: Record<string, unknown>, path: string[]) {
  let value: unknown = record;
  for (const key of path) {
    if (!isRecord(value)) return "";
    value = value[key];
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

export function getPostingRawRecord(posting: RecruitJobPosting) {
  const rawRecord = posting.raw_json.record;
  return isRecord(rawRecord) ? rawRecord : {};
}

export function getPostingHeadcount(posting: RecruitJobPosting, fallback: string) {
  const record = getPostingRawRecord(posting);
  return (
    getNestedText(record, ["position", "headcount"]) ||
    getNestedText(record, ["headcount"]) ||
    getNestedText(record, ["hiring_count"]) ||
    getNestedText(record, ["recruitment_count"]) ||
    getNestedText(record, ["recruitment", "headcount"]) ||
    fallback
  );
}

export function getPostingDescription(posting: RecruitJobPosting, fallback: string) {
  const record = getPostingRawRecord(posting);
  const description =
    getNestedText(record, ["position", "description"]) ||
    getNestedText(record, ["summary", "recruitment_focus"]);
  if (description) return description;

  const responsibilities = posting.responsibilities.filter((item): item is string => typeof item === "string");
  if (responsibilities.length > 0) return responsibilities.join(" ");

  const mustHave = posting.must_have.filter((item): item is string => typeof item === "string");
  if (mustHave.length > 0) return mustHave.join(" ");

  return fallback;
}

export function getPostingRequirementLines(posting: RecruitJobPosting) {
  const mustHave = posting.must_have.filter((item): item is string => typeof item === "string");
  const skills = posting.skills
    .filter((item): item is string => typeof item === "string")
    .map((skill) => skill.trim())
    .filter(Boolean);
  return [...mustHave, ...skills];
}

export function getPostingSourceLabels(posting: RecruitJobPosting) {
  return [
    posting.source.platform,
    posting.source.type,
    posting.source.format,
    posting.source.file_name,
    posting.source.document_title,
  ].filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function getPostingCompleteness(posting: RecruitJobPosting) {
  const checks = [
    Boolean(posting.company_name),
    Boolean(posting.position_title),
    Boolean(posting.city || posting.district),
    posting.salary.min != null || posting.salary.max != null || Boolean(posting.salary.unit),
    posting.skills.length > 0,
    posting.must_have.length > 0,
    posting.responsibilities.length > 0,
    Boolean(getPostingDescription(posting, "")),
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function formatSqlTime(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function getCandidateInitials(candidate: RecruitCandidateRecord, fallback: string) {
  const name = candidate.name?.trim();
  if (!name) return fallback;
  return name.slice(0, 2).toUpperCase();
}
