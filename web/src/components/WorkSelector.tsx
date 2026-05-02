import { ChevronDown, UserCircle2, Building2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { OrgCompany, OrgAgent } from "@/lib/api";

export type WorkScope =
  | { type: "master" }
  | { type: "company"; company: OrgCompany }
  | { type: "director-office"; companyId: number };

interface WorkSelectorProps {
  scope: WorkScope;
  companies: OrgCompany[];
  loaded: boolean;
  onSelectScope: (scope: WorkScope) => void;
  /** Pre-fetched agents per company */
  agentsForScope: Record<number, OrgAgent[]>;
  className?: string;
}

const MASTER_ACCENT = "#6366f1";

export function WorkSelector({
  scope,
  companies,
  loaded,
  onSelectScope,
  agentsForScope,
  className,
}: WorkSelectorProps) {
  const { t } = useI18n();

  const displayName = scope.type === "master"
    ? t.workSelector.masterAgent
    : scope.type === "company"
      ? scope.company.name
      : "Director Office";
  const accent = scope.type === "master"
    ? MASTER_ACCENT
    : scope.type === "company"
      ? (scope.company.accent_color || MASTER_ACCENT)
      : MASTER_ACCENT;
  const icon = scope.type === "master"
    ? <UserCircle2 className="h-5 w-5" />
    : <Building2 className="h-5 w-5" />;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative inline-flex items-center gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-1.5 hover:border-border hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
            style={{ backgroundColor: accent }}
          >
            {icon}
          </span>
          <span className="font-collapse text-sm sm:text-base font-bold tracking-wider uppercase blend-lighter truncate max-w-[160px]">
            {displayName}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-80 overflow-hidden p-0">
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t.workSelector.selectWork}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {/* Master Agent - always shown */}
          <WorkRow
            isActive={scope.type === "master"}
            label={t.workSelector.masterAgent}
            hint={t.workSelector.masterAgentHint}
            accent={MASTER_ACCENT}
            icon={<UserCircle2 className="h-3.5 w-3.5" />}
            agentCount={(agentsForScope as Record<string | number, OrgAgent[]>).__master?.length ?? 0}
            onClick={() => onSelectScope({ type: "master" })}
          />

          {/* Companies */}
          {companies.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {loaded ? t.workSelector.noCompanies : t.workSelector.loadingCompanies}
            </div>
          ) : (
            companies.map((company) => {
              const agentCount = agentsForScope[company.id]?.length ?? 0;
              return (
                <WorkRow
                  key={company.id}
                  isActive={scope.type === "company" && scope.company.id === company.id}
                  label={company.name}
                  hint={company.goal || undefined}
                  accent={company.accent_color || "#94a3b8"}
                  icon={<Building2 className="h-3.5 w-3.5" />}
                  agentCount={agentCount}
                  onClick={() => onSelectScope({ type: "company", company })}
                />
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function WorkRow({
  isActive,
  label,
  hint,
  accent,
  icon,
  agentCount,
  onClick,
}: {
  isActive: boolean;
  label: string;
  hint?: string;
  accent: string;
  icon: React.ReactNode;
  agentCount: number;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/70",
        isActive && "bg-muted/60",
      )}
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {agentCount} {t.workSelector.agents}
          </span>
          {isActive && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
          )}
        </div>
        {hint && (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
    </button>
  );
}
