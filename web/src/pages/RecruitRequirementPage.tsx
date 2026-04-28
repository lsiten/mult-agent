import {
  Bell,
  CheckCircle2,
  ClipboardList,
  Edit3,
  LayoutDashboard,
  Monitor,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  Square,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useI18n } from "@/i18n";
import {
  formatPostingSalary,
  formatSqlTime,
  getPostingCompleteness,
  getPostingDescription,
  getPostingRequirementLines,
  getPostingSourceLabels,
  useRecruitSqlData,
} from "@/pages/recruit/useRecruitSqlData";
import type { RecruitNavItemConfig, RecruitPageProps } from "@/pages/recruitNavigation";

function SideNavItem({
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
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-200 ${
        active
          ? "border-r-2 border-[#60eca8] bg-[#60eca8]/10 text-[#60eca8]"
          : "text-[#b4b4b4] hover:bg-[#1a211c] hover:text-[#fafafa]"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <span className="rounded border border-[#242424] bg-[#0e1510] px-2 py-1 text-xs text-[#dde4dd]">
      {label}
    </span>
  );
}

function HistoryItem({
  time,
  status,
  result,
}: {
  time: string;
  status: string;
  result: string;
}) {
  return (
    <div className="rounded-lg border border-[#2e2e2e] bg-[#0e1510] p-3 transition-colors hover:bg-[#2f3631]">
      <div className="mb-1 flex items-start justify-between">
        <span className="font-mono text-xs text-[#fafafa]">{time}</span>
        <span className="rounded border border-[rgba(62,207,142,0.3)] bg-[#00c472]/20 px-1.5 py-0.5 text-[10px] text-[#3fe18b]">
          {status}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-[#898989]" />
        <span className="text-sm text-[#b4b4b4]">{result}</span>
      </div>
    </div>
  );
}

export default function RecruitRequirementPage({ currentPage, onNavigate }: RecruitPageProps) {
  const { t } = useI18n();
  const page = t.recruitRequirement;
  const { postings, databasePath } = useRecruitSqlData();
  const posting = postings[0];
  const activeScoreCount = postings.filter((item) => item.active_score).length;
  const title = posting?.position_title || page.sql.emptyTitle;
  const status = posting?.status || page.sql.noValue;
  const description = posting ? getPostingDescription(posting, page.sql.emptyDescription) : page.sql.emptyDescription;
  const requirements = posting ? getPostingRequirementLines(posting) : [];
  const sourceItems = posting ? getPostingSourceLabels(posting) : [];
  const completeness = posting ? getPostingCompleteness(posting) : 0;
  const location = [posting?.city, posting?.district].filter(Boolean).join(" / ") || page.sql.noValue;
  const salary = posting ? formatPostingSalary(posting, page.sql.noValue) : page.sql.noValue;
  const configRows = [
    { label: page.sql.company, value: posting?.company_name || page.sql.noValue },
    { label: page.sql.location, value: location },
    { label: page.sql.salary, value: salary },
    {
      label: page.sql.activeScore,
      value: posting?.active_score
        ? `${posting.active_score.mode} #${posting.active_score.revision}`
        : page.sql.noValue,
      highlight: Boolean(posting?.active_score),
    },
  ];
  const historyItems = postings.slice(0, 3).map((item) => ({
    time: formatSqlTime(item.updated_at, page.sql.noValue),
    status: item.status,
    result: [item.company_name, item.position_title].filter(Boolean).join(" / ") || page.sql.emptyTitle,
  }));

  const navItems: RecruitNavItemConfig[] = [
    { id: "dashboard", icon: LayoutDashboard, label: page.nav.dashboard },
    { id: "workspace", icon: Monitor, label: page.nav.workspace },
    { id: "requirements", icon: ClipboardList, label: page.nav.requirements },
    { id: "talent", icon: Users, label: page.nav.talent },
    { id: "settings", icon: Settings, label: page.nav.settings },
  ];

  return (
    <div className="flex min-h-screen overflow-hidden bg-[#0e1510] font-sans text-[#fafafa]">
      <aside className="z-40 hidden h-screen w-64 shrink-0 flex-col gap-2 border-r border-[#2e2e2e] bg-[#171717] py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#60eca8]">
            <Sparkles className="h-5 w-5 text-[#003822]" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#fafafa]">{page.brand}</h1>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => (
            <SideNavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>

        <div className="mt-auto px-4">
          <button className="flex w-full items-center justify-center gap-2 rounded-full border border-[#2e2e2e] bg-[#0f0f0f] px-4 py-2.5 text-sm font-medium text-[#fafafa] transition-all hover:border-[#363636]">
            <Plus className="h-4 w-4" />
            {page.actions.publishRequirement}
          </button>
        </div>
      </aside>

      <main className="flex h-screen flex-1 flex-col overflow-hidden bg-[#0e1510]">
        <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-[#2e2e2e] bg-[#171717] px-6">
          <div className="flex min-w-0 items-center gap-6">
            <h2 className="truncate text-lg font-bold tracking-tight text-[#fafafa]">{page.header.title}</h2>
            <div className="hidden h-4 w-px bg-[#2e2e2e] sm:block" />
            <div className="hidden gap-4 sm:flex">
              {page.header.tabs.map((tab, index) => (
                <a
                  key={tab}
                  href="#"
                  className={
                    index === 0
                      ? "border-b-2 border-[#60eca8] pb-4 text-sm font-medium text-[#60eca8]"
                      : "text-sm font-medium text-[#b4b4b4] hover:text-[#fafafa]"
                  }
                >
                  {tab}
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="rounded-full p-2 text-[#b4b4b4] transition-colors hover:bg-[#2e2e2e]" aria-label={page.header.notifications}>
              <Bell className="h-5 w-5" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#363636] bg-[#2e2e2e] text-xs font-semibold text-[#dde4dd]">
              {page.header.avatarInitials}
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <section className="flex-1 space-y-4 overflow-y-auto p-6">
            <div className="mb-2 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <span className="rounded-full border border-[rgba(62,207,142,0.3)] bg-[#00c472]/10 px-3 py-1 font-mono text-xs uppercase tracking-[0.08em] text-[#3fe18b]">
                  {status}
                </span>
                <h1 className="truncate text-2xl font-bold text-[#fafafa]">{title}</h1>
              </div>
              <button className="rounded-full border border-[#2e2e2e] bg-[#0f0f0f] px-6 py-2 text-sm font-medium text-[#fafafa] transition-all hover:border-[#363636]">
                {page.actions.shareJob}
              </button>
            </div>

            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 rounded-lg border border-[#2e2e2e] bg-[#171717] p-6 lg:col-span-8">
                <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-[#b4b4b4]">
                  {page.description.title}
                </h3>
                <div className="space-y-4 text-[#b4b4b4]">
                  <p>{description}</p>
                  {requirements.length > 0 ? (
                    <ul className="list-inside list-disc space-y-2">
                      {requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{page.sql.noRequirements}</p>
                  )}
                </div>
              </div>

              <div className="col-span-12 space-y-6 lg:col-span-4">
                <div className="rounded-lg border border-[#2e2e2e] bg-[#171717] p-6">
                  <h3 className="mb-4 font-mono text-xs uppercase tracking-[0.18em] text-[#b4b4b4]">
                    {page.stats.title}
                  </h3>
                  <div className="space-y-6">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-[#898989]">{page.sql.postingCount}</p>
                        <p className="text-3xl font-bold">{postings.length}</p>
                      </div>
                      <span className="flex items-center text-sm text-[#3fe18b]">
                        {activeScoreCount} {page.sql.scoreCount}
                        <TrendingUp className="ml-1 h-4 w-4" />
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-[#2e2e2e]">
                      <div className="h-full bg-[#60eca8]" style={{ width: `${completeness}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-[#898989]">
                      <span>{page.task.progressLabel}</span>
                      <span>{completeness}%</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#2e2e2e] bg-[#171717] p-6">
                  <h3 className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-[#b4b4b4]">
                    {page.sources.title}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {sourceItems.length > 0 ? (
                      sourceItems.map((source) => (
                        <SourceBadge key={source} label={source} />
                      ))
                    ) : (
                      <span className="text-sm text-[#898989]">{page.sql.noSources}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="hidden w-96 shrink-0 flex-col border-l border-[#2e2e2e] bg-[#171717] xl:flex">
            <div className="border-b border-[#242424] px-6 pt-6">
              <div className="mb-[-1px] flex items-center gap-6">
                <button className="cursor-pointer pb-3 text-sm font-medium text-[#b4b4b4] transition-colors hover:text-[#fafafa]">
                  {page.panel.tabs.details}
                </button>
                <button className="cursor-pointer border-b-2 border-[#60eca8] pb-3 text-sm font-bold text-[#60eca8]">
                  {page.panel.tabs.automation}
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section className="rounded-lg border border-[#242424] bg-[#0e1510]/30 p-4">
                <h4 className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#898989]">
                  {page.config.title}
                </h4>
                <div className="space-y-3">
                  {configRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4">
                      <span className="text-xs text-[#b4b4b4]">{row.label}</span>
                      <span className={`text-right text-xs ${row.highlight ? "rounded bg-[#60eca8]/10 px-1.5 text-[#60eca8]" : "text-[#fafafa]"}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#b4b4b4]">{page.task.title}</span>
                  <span className="flex items-center gap-2 text-sm font-medium text-[#60eca8]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#60eca8] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#60eca8]" />
                    </span>
                    {status}
                  </span>
                </div>
                <div className="rounded-lg border border-[#2e2e2e] bg-[#0e1510] p-4">
                  <div className="mb-2 flex justify-between text-xs">
                    <span className="text-[#898989]">{page.task.progressLabel}</span>
                    <span className="text-[#fafafa]">{completeness}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#242424]">
                    <div className="h-full bg-[#60eca8] transition-all duration-1000" style={{ width: `${completeness}%` }} />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3ecf8e] py-3 font-bold text-[#005434] transition-transform active:scale-95">
                    <Play className="h-4 w-4 fill-current" />
                    {page.task.runNow}
                  </button>
                  <div className="grid grid-cols-2 gap-3">
                    <button className="flex items-center justify-center gap-2 rounded-full border border-[#2e2e2e] bg-[#0f0f0f] py-2.5 text-[#fafafa] transition-colors hover:bg-[#0e1510] active:scale-95">
                      <Edit3 className="h-4 w-4" />
                      {page.task.edit}
                    </button>
                    <button className="flex items-center justify-center gap-2 rounded-full border border-[#ffb4ab]/30 bg-[#0f0f0f] py-2.5 text-[#ffb4ab] transition-colors hover:bg-[#ffb4ab]/10 active:scale-95">
                      <Square className="h-4 w-4" />
                      {page.task.stop}
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#b4b4b4]">{page.history.title}</span>
                  <a className="text-xs text-[#60eca8] hover:underline" href="#">
                    {page.history.viewAll}
                  </a>
                </div>
                <div className="space-y-2">
                  {historyItems.length > 0 ? (
                    historyItems.map((item) => (
                      <HistoryItem key={`${item.time}-${item.result}`} {...item} />
                    ))
                  ) : (
                    <div className="rounded-lg border border-[#2e2e2e] bg-[#0e1510] p-3 text-sm text-[#898989]">
                      {page.sql.noHistory}
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="border-t border-[#2e2e2e] bg-[#161d19] p-6">
              <p className="text-[10px] leading-relaxed text-[#898989]">
                {page.sql.databasePath}: <span className="text-[#3fe18b]">{databasePath || page.sql.noValue}</span>
              </p>
            </div>
          </aside>
        </div>

        <div className="border-t border-[#2e2e2e] bg-[#171717] p-4 xl:hidden">
          <div className="flex items-center justify-between rounded-lg border border-[#2e2e2e] bg-[#0e1510] px-4 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#60eca8]" />
              <span className="text-sm text-[#fafafa]">{page.task.status}</span>
            </div>
              <span className="text-sm text-[#60eca8]">{completeness}%</span>
          </div>
        </div>
      </main>
    </div>
  );
}
