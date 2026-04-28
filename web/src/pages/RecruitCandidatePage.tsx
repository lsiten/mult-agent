import {
  Bell,
  Bot,
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import { useI18n } from "@/i18n";
import {
  formatSqlTime,
  getCandidateInitials,
  useRecruitSqlData,
} from "@/pages/recruit/useRecruitSqlData";
import type { RecruitNavItemConfig, RecruitPageProps } from "@/pages/recruitNavigation";

function CandidateAvatar({ label, size = "large" }: { label: string; size?: "small" | "large" }) {
  const className =
    size === "large"
      ? "h-24 w-24 rounded-xl text-3xl"
      : "h-8 w-8 rounded-full text-xs";

  return (
    <div
      aria-label={label}
      className={`${className} flex shrink-0 items-center justify-center border border-[#363636] bg-[radial-gradient(circle_at_30%_20%,rgba(62,207,142,0.4),transparent_34%),linear-gradient(135deg,#1a211c,#0e1510)] font-semibold text-[#dde4dd]`}
    >
      {label}
    </div>
  );
}

function RecruitNavItem({
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
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all active:scale-95 ${
        active
          ? "border-r-2 border-[#3ecf8e] bg-[#171717] text-[#3ecf8e]"
          : "text-neutral-400 hover:bg-[#171717] hover:text-neutral-100"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-[#2e2e2e] bg-[#1a211c] p-6">
      <p className="mb-1 font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">{label}</p>
      <p className={`text-2xl font-medium ${highlight ? "text-[#60eca8]" : "text-[#fafafa]"}`}>{value}</p>
    </div>
  );
}

function DataRow({ icon: Icon, label, value }: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="h-4 w-4" />
      <span className="text-[#898989]">{label}</span>
      <span>{value}</span>
    </span>
  );
}

export default function RecruitCandidatePage({ currentPage, onNavigate }: RecruitPageProps) {
  const { t } = useI18n();
  const page = t.recruitCandidate;
  const { candidates, postings, databasePath } = useRecruitSqlData();
  const candidate = candidates[0];
  const noValue = page.sql.noValue;

  const navItems: RecruitNavItemConfig[] = [
    { id: "dashboard", icon: LayoutDashboard, label: page.nav.dashboard },
    { id: "workspace", icon: MessageSquare, label: page.nav.workspace },
    { id: "requirements", icon: ClipboardList, label: page.nav.requirements },
    { id: "talent", icon: Users, label: page.nav.talent },
    { id: "settings", icon: Settings, label: page.nav.settings },
  ];

  const skills = candidate?.skills.filter((item): item is string => typeof item === "string") ?? [];
  const initials = candidate ? getCandidateInitials(candidate, page.recruiterInitials) : page.recruiterInitials;
  const stats = candidate
    ? [
        {
          label: page.stats.experienceLabel,
          value: candidate.experience_years != null ? String(candidate.experience_years) : noValue,
          highlight: true,
        },
        { label: page.stats.currentRoleLabel, value: candidate.current_role || noValue },
        { label: page.stats.currentCompanyLabel, value: candidate.current_company || noValue },
        { label: page.sql.candidateStatus, value: candidate.status || noValue, highlight: true },
      ]
    : [
        { label: page.sql.candidateRecords, value: String(candidates.length), highlight: true },
        { label: page.sql.jobRecords, value: String(postings.length) },
        { label: page.sql.databasePath, value: databasePath || noValue },
      ];

  return (
    <div className="flex min-h-screen bg-[#0e1510] font-sans text-[#dde4dd]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-[#2e2e2e] bg-neutral-950 px-4 py-6 text-sm tracking-tight md:flex">
        <div className="mb-10 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#3ecf8e]">
            <Bot className="h-5 w-5 text-neutral-950" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tighter text-[#3ecf8e]">{page.brand}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
              {page.systemLabel}
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <RecruitNavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentPage === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-[#242424] bg-neutral-950/80 px-4 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <h1 className="truncate font-mono text-xs font-black uppercase tracking-[0.18em] text-[#3ecf8e]">
              {page.nav.talent}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Bell className="h-5 w-5 cursor-pointer text-neutral-500 transition-colors hover:text-[#3ecf8e]" />
            <HelpCircle className="h-5 w-5 cursor-pointer text-neutral-500 transition-colors hover:text-[#3ecf8e]" />
            <CandidateAvatar label={page.recruiterInitials} size="small" />
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-12">
          <section className="flex flex-col justify-between gap-6 border-b border-[#2e2e2e] pb-6 md:flex-row md:items-end">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <CandidateAvatar label={initials} />
              <div className="min-w-0">
                <h2 className="text-4xl font-medium leading-tight text-[#fafafa]">
                  {candidate?.name || page.sql.emptyTitle}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#bbcabe]">
                  {candidate ? (candidate.summary || page.sql.summaryEmpty) : page.sql.emptyDescription}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#bbcabe]">
                  <DataRow icon={Mail} label={page.sql.email} value={candidate?.email || noValue} />
                  <DataRow icon={Phone} label={page.sql.phone} value={candidate?.phone || noValue} />
                  <DataRow icon={MapPin} label={page.sql.location} value={candidate?.location || noValue} />
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              <div className="rounded-lg border border-[#2e2e2e] bg-[#1a211c] p-6">
                <h3 className="mb-6 flex items-center gap-2 text-2xl font-medium text-[#fafafa]">
                  <FileText className="h-6 w-6 text-[#60eca8]" />
                  {page.resume.title}
                </h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">
                      <BriefcaseBusiness className="h-4 w-4" />
                      {page.resume.skillsLabel}
                    </h4>
                    {skills.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {skills.map((skill) => (
                          <span key={skill} className="rounded-md border border-[#2e2e2e] bg-[#2f3631] px-3 py-1 font-mono text-xs">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#898989]">{page.sql.skillsEmpty}</p>
                    )}
                  </div>

                  <div>
                    <h4 className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">
                      {page.resume.summaryLabel}
                    </h4>
                    <p className="leading-relaxed text-[#bbcabe]">
                      {candidate?.summary || page.sql.summaryEmpty}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="h-full rounded-lg border border-[#2e2e2e] bg-[#161d19] p-6">
                <h3 className="mb-6 flex items-center gap-2 text-2xl font-medium text-[#fafafa]">
                  <TrendingUp className="h-6 w-6 text-[#60eca8]" />
                  {page.timeline.title}
                </h3>
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#242424] bg-[#0e1510] p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">{page.sql.createdAt}</p>
                    <p className="mt-1 text-sm text-[#bbcabe]">{formatSqlTime(candidate?.created_at, noValue)}</p>
                  </div>
                  <div className="rounded-lg border border-[#242424] bg-[#0e1510] p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">{page.sql.updatedAt}</p>
                    <p className="mt-1 text-sm text-[#bbcabe]">{formatSqlTime(candidate?.updated_at, noValue)}</p>
                  </div>
                  <div className="rounded-lg border border-[#242424] bg-[#0e1510] p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#898989]">{page.sql.databasePath}</p>
                    <p className="mt-1 break-all text-sm text-[#bbcabe]">{databasePath || noValue}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-[#242424] bg-neutral-950 px-4 md:hidden">
        {[
          { id: "dashboard" as const, icon: LayoutDashboard, label: page.mobileNav.home },
          { id: "workspace" as const, icon: MessageSquare, label: page.mobileNav.workspace },
          { id: "talent" as const, icon: Users, label: page.mobileNav.talent },
          { id: "settings" as const, icon: Settings, label: page.mobileNav.settings },
        ].map(({ id, icon: Icon, label }) => (
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
    </div>
  );
}
