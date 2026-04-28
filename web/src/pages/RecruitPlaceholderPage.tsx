import {
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { useRecruitSqlData } from "@/pages/recruit/useRecruitSqlData";
import type { RecruitNavItemConfig, RecruitPageProps } from "@/pages/recruitNavigation";

export default function RecruitPlaceholderPage({ currentPage, onNavigate }: RecruitPageProps) {
  const { t } = useI18n();
  const page = t.recruitPlaceholder;
  const content = currentPage === "settings" ? page.settings : page.dashboard;
  const { postings, candidates } = useRecruitSqlData();
  const scoredCount = postings.filter((posting) => posting.active_score).length;
  const dashboardValues = [postings.length, candidates.length, scoredCount];
  const cards = currentPage === "dashboard"
    ? content.cards.map((card, index) => ({
        ...card,
        value: String(dashboardValues[index] ?? 0),
      }))
    : content.cards;

  const navItems: RecruitNavItemConfig[] = [
    { id: "dashboard", icon: LayoutDashboard, label: page.nav.dashboard },
    { id: "workspace", icon: MessageSquare, label: page.nav.workspace },
    { id: "requirements", icon: ClipboardList, label: page.nav.requirements },
    { id: "talent", icon: Users, label: page.nav.talent },
    { id: "settings", icon: Settings, label: page.nav.settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#0e1510] font-sans text-[#dde4dd]">
      <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-[#2e2e2e] bg-neutral-950 px-4 py-6 text-sm tracking-tight md:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#3ecf8e]">
            <Sparkles className="h-5 w-5 text-[#005434]" />
          </div>
          <span className="text-xl font-bold tracking-tighter text-[#3ecf8e]">{page.brand}</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={`flex w-full items-center gap-3 rounded px-3 py-2 text-left transition-all active:scale-95 ${
                currentPage === id
                  ? "border-r-2 border-[#3ecf8e] bg-[#171717] text-[#3ecf8e]"
                  : "text-neutral-400 hover:bg-[#171717] hover:text-neutral-100"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-[#242424] bg-neutral-950/80 px-6 backdrop-blur-md">
          <h1 className="text-lg font-bold tracking-tight text-[#fafafa]">{content.title}</h1>
        </header>
        <section className="flex-1 overflow-y-auto p-6 lg:p-12">
          <div className="max-w-5xl space-y-6">
            <div>
              <h2 className="text-3xl font-semibold text-[#fafafa]">{content.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#bbcabe]">{content.subtitle}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {cards.map((card) => (
                <div key={card.label} className="rounded-lg border border-[#2e2e2e] bg-[#1a211c] p-6">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-[#898989]">{card.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[#60eca8]">{card.value}</p>
                  <p className="mt-2 text-sm leading-6 text-[#bbcabe]">{card.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

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
    </div>
  );
}
