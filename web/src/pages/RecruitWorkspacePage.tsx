import {
  ArrowUp,
  Bell,
  Bot,
  Building2,
  ClipboardList,
  CreditCard,
  HelpCircle,
  History,
  LayoutDashboard,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useI18n } from "@/i18n";
import { useStreamingResponse } from "@/hooks/useStreamingResponse";
import { api, type RecruitJobPosting, type RecruitWorkspaceResponse, type SessionInfo, type SessionMessage } from "@/lib/api";
import { RecruitRequirementDraftCard } from "@/pages/recruit/RecruitRequirementDraftCard";
import { RecruitSkillActionPanel } from "@/pages/recruit/RecruitSkillActionPanel";
import { StoredPostingPreviewDialog } from "@/pages/recruit/StoredPostingPreviewDialog";
import { formatSqlTime } from "@/pages/recruit/useRecruitSqlData";
import type { RecruitNavItemConfig, RecruitPageProps } from "@/pages/recruitNavigation";

const RECRUIT_DEFAULT_SKILLS = ["job-posting-image-sqlite"];

function WorkspaceNavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-all active:scale-95 ${
        active
          ? "border-r-2 border-[#3ecf8e] bg-[#171717] text-[#3ecf8e]"
          : "text-neutral-400 hover:bg-[#171717] hover:text-neutral-100"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function RequirementItem({
  title,
  status,
  statusTone,
  salary,
  people,
  muted = false,
  active = false,
}: {
  title: string;
  status: string;
  statusTone: "success" | "pending" | "closed";
  salary: string;
  people: string;
  muted?: boolean;
  active?: boolean;
}) {
  const statusClass =
    statusTone === "success"
      ? "bg-[#00c472]/20 text-[#3fe18b]"
      : statusTone === "closed"
        ? "bg-[#93000a]/20 text-[#ffb4ab]"
        : "bg-[#2f3631] text-[#898989]";

  return (
    <div
      className={`group cursor-pointer rounded-lg border bg-[#1a211c] p-4 transition-all hover:border-[rgba(62,207,142,0.3)] ${
        active ? "border-l-2 border-l-[#3ecf8e] border-[#2e2e2e]" : "border-[#2e2e2e]"
      } ${muted ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-[#fafafa]">{title}</h4>
        <span className={`rounded px-2 py-0.5 text-[9px] font-bold uppercase ${statusClass}`}>{status}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-[#898989]">
        <span className="flex items-center gap-1">
          <CreditCard className="h-3 w-3" />
          {salary}
        </span>
        <span className="flex items-center gap-1">
          {statusTone === "closed" ? <History className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {people}
        </span>
      </div>
    </div>
  );
}

function CompanyGroup({
  company,
  items,
}: {
  company: string;
  items: Array<{
    title: string;
    status: string;
    statusTone: "success" | "pending" | "closed";
    salary: string;
    people: string;
    muted?: boolean;
    active?: boolean;
  }>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#898989]">
        <Building2 className="h-4 w-4" />
        {company}
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <RequirementItem key={`${company}-${item.title}`} {...item} />
        ))}
      </div>
    </section>
  );
}

function formatSalary(posting: RecruitJobPosting, fallback: string) {
  const { min, max, unit } = posting.salary;
  if (min != null && max != null) {
    return `${min}-${max}${unit ?? ""}`;
  }
  if (min != null) {
    return `${min}${unit ?? ""}`;
  }
  if (max != null) {
    return `${max}${unit ?? ""}`;
  }
  return fallback;
}

function statusTone(status: RecruitJobPosting["status"]) {
  if (status === "待发布" || status === "已完成") return "success";
  if (status === "已暂停") return "closed";
  return "pending";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikePostingRecord(value: Record<string, unknown>) {
  const company = value.company;
  const position = value.position;
  const requirements = value.requirements;
  const titleLooksLikeRole =
    typeof value.position_title === "string" ||
    typeof value.job_title === "string" ||
    (
      typeof value.title === "string" &&
      (
        typeof value.company_name === "string" ||
        typeof company === "string" ||
        isPlainRecord(company) ||
        Array.isArray(value.skills) ||
        Array.isArray(value.must_have) ||
        Array.isArray(value.responsibilities)
      )
    );
  return (
    isPlainRecord(company) ||
    isPlainRecord(position) ||
    isPlainRecord(requirements) ||
    typeof value.company_name === "string" ||
    titleLooksLikeRole ||
    Array.isArray(value.skills) ||
    Array.isArray(value.must_have) ||
    Array.isArray(value.responsibilities)
  );
}

function normalizeRecruitExtractionPayload(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const records = value.filter(isPlainRecord);
    return records.length > 0
      ? {
          schema_version: "1.2",
          task: "job_posting_extraction",
          record_count: records.length,
          records,
        }
      : null;
  }

  if (!isPlainRecord(value)) return null;

  for (const key of ["job_json", "payload", "data", "result", "output"]) {
    const nested = value[key];
    const normalized = normalizeRecruitExtractionPayload(nested);
    if (normalized) return normalized;
  }

  if (Array.isArray(value.records)) return value;

  if (isPlainRecord(value.record)) {
    return {
      ...value,
      record_count: 1,
      records: [value.record],
    };
  }

  return looksLikePostingRecord(value)
    ? {
        schema_version: typeof value.schema_version === "string" ? value.schema_version : "1.2",
        task: "job_posting_extraction",
        record_count: 1,
        records: [value],
      }
    : null;
}

function extractBalancedJsonValues(content: string) {
  const candidates: string[] = [];

  for (let start = 0; start < content.length; start += 1) {
    const first = content[start];
    if (first !== "{" && first !== "[") continue;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let index = start; index < content.length; index += 1) {
      const char = content[index];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if ((char === "}" || char === "]") && stack[stack.length - 1] === char) {
        stack.pop();
        if (stack.length === 0) {
          candidates.push(content.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }

  return candidates;
}

function parseRecruitExtractionPayload(content: string) {
  const candidates = new Set<string>();
  const trimmed = content.trim();
  if (trimmed) candidates.add(trimmed);

  for (const match of content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) {
      candidates.add(match[1].trim());
    }
  }

  for (const candidate of extractBalancedJsonValues(content)) {
    candidates.add(candidate);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeRecruitExtractionPayload(parsed);
      if (normalized) return normalized;
    } catch {
      // Keep trying other candidates; assistant output may include prose.
    }
  }

  return null;
}

function getNestedString(record: Record<string, unknown>, path: string[]) {
  let value: unknown = record;
  for (const key of path) {
    if (!isPlainRecord(value)) return undefined;
    value = value[key];
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function getRawPostingRecord(posting: RecruitJobPosting) {
  const rawRecord = posting.raw_json.record;
  return isPlainRecord(rawRecord) ? rawRecord : {};
}

function formatHeadcount(posting: RecruitJobPosting, fallback: string) {
  const record = getRawPostingRecord(posting);
  const value =
    getNestedString(record, ["headcount"]) ||
    getNestedString(record, ["hiring_count"]) ||
    getNestedString(record, ["recruitment_count"]) ||
    getNestedString(record, ["recruitment", "headcount"]);
  return value || fallback;
}

function formatPostingDescription(posting: RecruitJobPosting, fallback: string) {
  const record = getRawPostingRecord(posting);
  const value =
    getNestedString(record, ["position", "description"]) ||
    getNestedString(record, ["summary", "recruitment_focus"]);
  if (value) return value;
  const responsibilities = posting.responsibilities.filter((item): item is string => typeof item === "string");
  if (responsibilities.length > 0) return responsibilities.join(" ");
  return fallback;
}

function formatSessionTime(session: SessionInfo) {
  const timestamp = session.last_active || session.started_at;
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export default function RecruitWorkspacePage({ currentPage, onNavigate }: RecruitPageProps) {
  const { t } = useI18n();
  const page = t.recruitWorkspace;
  const [workspace, setWorkspace] = useState<RecruitWorkspaceResponse | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sqlPreviewRows, setSqlPreviewRows] = useState<RecruitJobPosting[]>([]);
  const { streamingContent, isStreaming, startStreaming } = useStreamingResponse(currentSessionId);

  useEffect(() => {
    let cancelled = false;
    api.getRecruitWorkspace()
      .then((data) => {
        if (!cancelled) {
          setWorkspace(data);
          setCurrentSessionId(data.workspace_session.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspace(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentSessionId) return;
    let cancelled = false;
    api.getMasterSessionMessages(currentSessionId)
      .then((response) => {
        if (!cancelled) {
          setMessages(response.messages || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const navItems: RecruitNavItemConfig[] = [
    { id: "dashboard", icon: LayoutDashboard, label: page.nav.dashboard },
    { id: "workspace", icon: MessageSquare, label: page.nav.workspace },
    { id: "requirements", icon: ClipboardList, label: page.nav.requirements },
    { id: "talent", icon: Users, label: page.nav.talent },
    { id: "settings", icon: Settings, label: page.nav.settings },
  ];

  const requirementGroups = useMemo(() => {
    const postings = workspace?.postings ?? [];
    if (postings.length === 0) {
      return [];
    }

    const grouped = new Map<string, Array<{
      title: string;
      status: string;
      statusTone: "success" | "pending" | "closed";
      salary: string;
      people: string;
      muted?: boolean;
      active?: boolean;
    }>>();

    postings.forEach((posting, index) => {
      const company = posting.company_name || page.requirements.fallbackCompany;
      const items = grouped.get(company) ?? [];
      items.push({
        title: posting.position_title || page.requirements.fallbackTitle,
        status: posting.status,
        statusTone: statusTone(posting.status),
        salary: formatSalary(posting, page.requirements.fallbackSalary),
        people: posting.city || posting.status,
        muted: posting.status === "已暂停",
        active: index === 0,
      });
      grouped.set(company, items);
    });

    return Array.from(grouped, ([company, items]) => ({ company, items }));
  }, [page.requirements, workspace]);

  const postingCount = workspace?.postings.length ?? 0;
  const scoredCount = (workspace?.postings ?? []).filter((posting) => posting.active_score).length;
  const scoreCoverage = postingCount > 0 ? `${Math.round((scoredCount / postingCount) * 100)}%` : "0%";
  const latestPosting = (workspace?.postings ?? [])[0];
  const latestPostingTime = formatSqlTime(latestPosting?.updated_at, "-");

  const postingDraftCards = useMemo(() => {
    const labels = page.draft.fields;
    const fallbackHeadcount = labels[3]?.value || "";
    return (workspace?.postings ?? []).slice(0, 3).map((posting) => ({
      id: posting.id,
      label: page.draft.label,
      status: posting.status,
      title: posting.position_title || page.requirements.fallbackTitle,
      fields: [
        {
          label: labels[0]?.label || "",
          value: posting.company_name || page.requirements.fallbackCompany,
        },
        {
          label: labels[1]?.label || "",
          value: posting.position_title || page.requirements.fallbackTitle,
        },
        {
          label: labels[2]?.label || "",
          value: formatSalary(posting, page.requirements.fallbackSalary),
          highlight: true,
        },
        {
          label: labels[3]?.label || "",
          value: formatHeadcount(posting, fallbackHeadcount),
        },
        {
          label: labels[4]?.label || "",
          tags: posting.skills.filter((item): item is string => typeof item === "string"),
          full: true,
        },
      ],
      descriptionLabel: page.draft.descriptionLabel,
      description: formatPostingDescription(posting, page.draft.description),
      modifyLabel: page.draft.modify,
      confirmLabel: page.draft.confirm,
    }));
  }, [page.draft, page.requirements, workspace]);

  const handleSendMessage = async (content: string, skillOverride?: string[]) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !currentSessionId || isStreaming) return;
    const previousPostings = workspace?.postings ?? [];
    const previousById = new Map(previousPostings.map((posting) => [posting.id, posting.updated_at]));

    const userMessage: SessionMessage = {
      role: "user",
      content: trimmedContent,
      timestamp: Date.now() / 1000,
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const finalContent = await startStreaming(
        currentSessionId,
        trimmedContent,
        undefined,
        skillOverride ?? RECRUIT_DEFAULT_SKILLS,
        null,
        true,
      );
      let contentForStorage = finalContent || "";
      try {
        const response = await api.getMasterSessionMessages(currentSessionId);
        const latestMessages = response.messages || [];
        setMessages(latestMessages);
        let lastUserMessageIndex = -1;
        for (let index = latestMessages.length - 1; index >= 0; index -= 1) {
          const message = latestMessages[index];
          if (message.role === "user" && message.content === trimmedContent) {
            lastUserMessageIndex = index;
            break;
          }
        }
        const messagesForCurrentTurn = lastUserMessageIndex >= 0
          ? latestMessages.slice(lastUserMessageIndex + 1)
          : latestMessages.filter((message) => (message.timestamp ?? 0) >= (userMessage.timestamp ?? 0));
        const recentAssistantContent = messagesForCurrentTurn
          .filter((message) => (
            message.role === "assistant" &&
            typeof message.content === "string"
          ))
          .map((message) => message.content)
          .join("\n\n");
        contentForStorage = [finalContent, recentAssistantContent].filter(Boolean).join("\n\n");
      } catch {
        if (finalContent) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: finalContent,
              timestamp: Date.now() / 1000,
            },
          ]);
        }
      }
      const extractedPayload = contentForStorage ? parseRecruitExtractionPayload(contentForStorage) : null;
      if (extractedPayload) {
        try {
          await api.upsertRecruitPostings(extractedPayload);
        } catch {
          // The streamed assistant response should remain visible even if persistence fails.
        }
      }
      const latestWorkspace = await api.getRecruitWorkspace();
      setWorkspace(latestWorkspace);
      const changedRows = latestWorkspace.postings.filter(
        (posting) => previousById.get(posting.id) !== posting.updated_at,
      );
      if (changedRows.length > 0) {
        setSqlPreviewRows(changedRows);
      }
    } catch {
      setMessages((prev) => prev.filter((message) => message !== userMessage));
    }
  };

  const handleSubmitInput = () => {
    const content = inputValue.trim();
    if (!content || !currentSessionId || isStreaming) return;
    setInputValue("");
    void handleSendMessage(content);
  };

  const visibleMessages = messages.filter((message) => message.role === "user" || message.role === "assistant");
  const workspaceSessions = workspace?.workspace_sessions?.length
    ? workspace.workspace_sessions
    : workspace?.workspace_session
      ? [workspace.workspace_session]
      : [];
  const currentSession = workspaceSessions.find((session) => session.id === currentSessionId);

  const handleNewChat = async () => {
    if (isStreaming) return;
    const response = await api.createRecruitWorkspaceSession();
    setCurrentSessionId(response.session.id);
    setMessages([]);
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        workspace_session: response.session,
        workspace_sessions: [
          response.session,
          ...(prev.workspace_sessions ?? []).filter((session) => session.id !== response.session.id),
        ],
      };
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0e1510] font-sans text-[#dde4dd]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[#2e2e2e] bg-neutral-950 px-4 py-6 text-sm tracking-tight md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#3ecf8e]">
            <Bot className="h-5 w-5 text-[#005434]" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-[#3ecf8e]">{page.brand}</span>
        </div>
        <div className="border-b border-[#242424] pb-5">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <WorkspaceNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={currentPage === item.id}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </nav>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pt-5">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#898989]">{page.history.title}</span>
            <button
              type="button"
              onClick={() => void handleNewChat()}
              disabled={isStreaming}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2e2e2e] text-[#60eca8] transition-colors hover:bg-[#1a211c] disabled:opacity-50"
              aria-label={page.actions.newChat}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {workspaceSessions.length > 0 ? (
              workspaceSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setCurrentSessionId(session.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                    currentSessionId === session.id
                      ? "border-[rgba(62,207,142,0.3)] bg-[#1a211c] text-[#fafafa]"
                      : "border-transparent text-[#b4b4b4] hover:border-[#2e2e2e] hover:bg-[#171717]"
                  }`}
                >
                  <div className="truncate text-xs font-medium">{session.title || session.preview || page.history.fallbackTitle}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[#898989]">
                    <History className="h-3 w-3" />
                    <span>{formatSessionTime(session)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-lg border border-[#242424] bg-[#171717] px-3 py-4 text-xs text-[#898989]">
                {page.history.empty}
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-[#242424] bg-neutral-950/80 px-6 font-mono text-xs uppercase tracking-[0.18em] backdrop-blur-md">
          <div className="flex flex-1 items-center gap-4">
            <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-[#2e2e2e] bg-[#171717] px-4 py-2">
              <Search className="h-5 w-5 text-[#898989]" />
              <input
                className="w-full border-none bg-transparent text-xs text-[#fafafa] outline-none placeholder:text-[#898989] focus:ring-0"
                placeholder={page.header.searchPlaceholder}
                type="text"
              />
            </div>
          </div>
          <div className="ml-4 flex items-center gap-6">
            <div className="flex items-center gap-4">
              <Bell className="h-5 w-5 cursor-pointer text-neutral-500 transition-colors hover:text-[#3ecf8e]" />
              <HelpCircle className="h-5 w-5 cursor-pointer text-neutral-500 transition-colors hover:text-[#3ecf8e]" />
            </div>
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#2e2e2e] bg-[#2f3631] text-xs font-semibold">
              {page.header.avatarInitials}
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <section className="relative flex w-full flex-col border-r border-[#2e2e2e] bg-[#0e1510] lg:w-3/5">
            <div className="flex items-center justify-between border-b border-[#242424] bg-[#161d19]/50 px-6 py-4 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(62,207,142,0.3)] bg-[#171717]">
                  <SlidersHorizontal className="h-5 w-5 text-[#60eca8]" />
                </div>
                <div>
                  <h2 className="font-bold tracking-tight text-[#fafafa]">
                    {currentSession?.title || page.chat.title}
                  </h2>
                  <p className="flex items-center gap-1 font-mono text-xs uppercase tracking-[0.12em] text-[#3fe18b]">
                    <span className="block h-1.5 w-1.5 rounded-full bg-[#3fe18b]" />
                    {isStreaming ? page.chat.processingStatus : page.chat.idleStatus}
                  </p>
                </div>
              </div>
              <button className="rounded-full p-2 text-[#898989] transition-colors hover:bg-[#2f3631]">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {visibleMessages.length > 0 ? (
                <>
                  {visibleMessages.map((message, index) => (
                    message.role === "user" ? (
                      <div key={`${message.timestamp ?? index}-user`} className="flex justify-end">
                        <div className="max-w-[80%] rounded-2xl rounded-tr-none border border-[#2e2e2e] bg-[#2f3631] px-4 py-3 text-[#dde4dd]">
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div key={`${message.timestamp ?? index}-assistant`} className="flex items-start justify-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2e2e2e] bg-[#171717]">
                          <Bot className="h-4 w-4 text-[#60eca8]" />
                        </div>
                        <div className="max-w-[85%] rounded-2xl rounded-tl-none border border-[#2e2e2e] bg-[#1a211c] px-4 py-3 text-[#dde4dd]">
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                        </div>
                      </div>
                    )
                  ))}
                  {isStreaming && streamingContent ? (
                    <div className="flex items-start justify-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2e2e2e] bg-[#171717]">
                        <Bot className="h-4 w-4 text-[#60eca8]" />
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-tl-none border border-[#2e2e2e] bg-[#1a211c] px-4 py-3 text-[#dde4dd]">
                        <p className="whitespace-pre-wrap text-sm">{streamingContent}</p>
                      </div>
                    </div>
                  ) : null}
                  {postingDraftCards.length > 0 ? (
                    <div className="ml-11 max-w-[85%] space-y-4">
                      {postingDraftCards.map((card) => (
                        <RecruitRequirementDraftCard
                          key={card.id}
                          label={card.label}
                          status={card.status}
                          title={card.title}
                          fields={card.fields}
                          descriptionLabel={card.descriptionLabel}
                          description={card.description}
                          modifyLabel={card.modifyLabel}
                          confirmLabel={card.confirmLabel}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-none border border-[#2e2e2e] bg-[#2f3631] px-4 py-3 text-[#dde4dd]">
                      <p className="text-sm">{page.chat.userMessage}</p>
                    </div>
                  </div>

                  <div className="flex items-start justify-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#2e2e2e] bg-[#171717]">
                      <Bot className="h-4 w-4 text-[#60eca8]" />
                    </div>
                    <div className="max-w-[85%] space-y-4">
                      <div className="rounded-2xl rounded-tl-none border border-[#2e2e2e] bg-[#1a211c] px-4 py-3 text-[#dde4dd]">
                        <p className="text-sm">{page.chat.assistantMessage}</p>
                      </div>

                      {postingDraftCards.map((card) => (
                        <RecruitRequirementDraftCard
                          key={card.id}
                          label={card.label}
                          status={card.status}
                          title={card.title}
                          fields={card.fields}
                          descriptionLabel={card.descriptionLabel}
                          description={card.description}
                          modifyLabel={card.modifyLabel}
                          confirmLabel={card.confirmLabel}
                        />
                      ))}

                      <RecruitSkillActionPanel
                        title={page.skills.title}
                        subtitle={page.skills.subtitle}
                        actions={page.skills.actions}
                        disabled={isStreaming || !currentSessionId}
                        onRun={(prompt, skills) => void handleSendMessage(prompt, skills)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-[#2e2e2e] bg-[#0f0f0f] p-6">
              <div className="group relative">
                <textarea
                  className="w-full resize-none rounded-2xl border border-[#2e2e2e] bg-[#171717] p-4 pr-12 text-sm text-[#dde4dd] outline-none transition-colors placeholder:text-[#898989] focus:border-[#3ecf8e] focus:ring-0"
                  placeholder={page.chat.inputPlaceholder}
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSubmitInput();
                    }
                  }}
                  rows={3}
                />
                <button
                  className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#3ecf8e] text-[#005434] transition-transform active:scale-90 disabled:opacity-50"
                  disabled={!inputValue.trim() || !currentSessionId || isStreaming}
                  onClick={handleSubmitInput}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <aside className="hidden w-2/5 flex-col overflow-hidden bg-[#161d19] lg:flex">
            <div className="space-y-4 border-b border-[#2e2e2e] p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold tracking-tight text-[#fafafa]">{page.requirements.title}</h3>
                <span className="rounded bg-[#242c27] px-2 py-1 font-mono text-[10px] text-[#898989]">
                  {postingCount} {page.requirements.activeCountLabel}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#898989]" />
                <input
                  className="w-full rounded-full border border-[#2e2e2e] bg-[#171717] py-2 pl-10 pr-4 text-xs text-[#fafafa] outline-none placeholder:text-[#898989] focus:border-[#363636] focus:ring-0"
                  placeholder={page.requirements.searchPlaceholder}
                  type="text"
                />
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
              {requirementGroups.length > 0 ? (
                requirementGroups.map((group) => (
                  <CompanyGroup key={group.company} company={group.company} items={group.items} />
                ))
              ) : (
                <div className="rounded-lg border border-[#242424] bg-[#171717] px-4 py-6 text-sm leading-6 text-[#898989]">
                  {page.requirements.empty}
                </div>
              )}
            </div>

            <div className="border-t border-[#2e2e2e] bg-[#171717] p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-[#242424] bg-[#0e1510] p-3">
                  <p className="font-mono text-[10px] uppercase text-[#898989]">{page.footer.successRateLabel}</p>
                  <p className="text-lg font-bold text-[#60eca8]">{scoreCoverage}</p>
                </div>
                <div className="rounded-lg border border-[#242424] bg-[#0e1510] p-3">
                  <p className="font-mono text-[10px] uppercase text-[#898989]">{page.footer.cycleLabel}</p>
                  <p className="text-lg font-bold text-[#fafafa]">{latestPostingTime}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-[#242424] bg-neutral-950 px-4 md:hidden">
          {navItems.slice(0, 4).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex flex-col items-center ${currentPage === id ? "text-[#3ecf8e]" : "text-neutral-500"}`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-1 text-[10px]">{label}</span>
            </button>
          ))}
        </nav>
      </main>
      <StoredPostingPreviewDialog
        open={sqlPreviewRows.length > 0}
        title={page.sqlPreview.title}
        description={page.sqlPreview.description}
        tableNameLabel={page.sqlPreview.tableName}
        closeLabel={page.sqlPreview.close}
        rows={sqlPreviewRows}
        onOpenChange={(open) => {
          if (!open) setSqlPreviewRows([]);
        }}
      />
    </div>
  );
}
