import { useMemo } from "react";
import { Bot, ChevronDown, UserCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { type OrgAgent } from "@/lib/api";

interface AgentIdentitySwitcherProps {
  activeAgent: OrgAgent | null;
  availableAgents: OrgAgent[];
  agentsLoaded: boolean;
  onLoadAgents: () => void;
  onSwitchAgent: (agentId: number | null) => void;
  className?: string;
}

const MASTER_ACCENT = "#6366f1";

/**
 * Header-level identity switcher rendered in the top-right corner of the
 * global app chrome (to the left of the language toggle).  The trigger is a
 * compact pill that surfaces the currently active identity; the popover
 * exposes the master agent plus every provisioned sub-agent and is the sole
 * UI used to change identities, so removing the legacy card from
 * ``ChatHeader`` keeps a single source of truth.
 */
export function AgentIdentitySwitcher({
  activeAgent,
  availableAgents,
  agentsLoaded,
  onLoadAgents,
  onSwitchAgent,
  className,
}: AgentIdentitySwitcherProps) {
  const { t } = useI18n();

  const accent = activeAgent?.accent_color || MASTER_ACCENT;
  const displayName = activeAgent
    ? activeAgent.display_name || activeAgent.name
    : t.chat.masterAgent;
  const subtitle = activeAgent
    ? activeAgent.role_summary || t.chat.subAgentBadge
    : t.chat.masterAgentSubtitle;
  const isMaster = activeAgent == null;

  const groupedAgents = useMemo(() => availableAgents, [availableAgents]);
  const profileStatus = activeAgent?.profile_agent?.profile_status ?? "n/a";

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !agentsLoaded) {
          onLoadAgents();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t.chat.switchAgent}
          className={cn(
            "group relative inline-flex h-8 max-w-[220px] items-center gap-2 rounded-md border border-border/70 bg-background/70 pl-1.5 pr-2 text-left transition-colors",
            "hover:border-border hover:bg-muted/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <AvatarBubble agent={activeAgent} accent={accent} size={22} />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[11px] font-semibold tracking-tight">
              {displayName}
            </span>
            <span className="hidden truncate text-[9px] uppercase tracking-[0.14em] text-muted-foreground sm:inline">
              {isMaster ? t.chat.masterAgent : t.chat.subAgentBadge}
            </span>
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 overflow-hidden p-0">
        <div className="border-b bg-muted/30 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t.chat.chattingAs}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <AvatarBubble agent={activeAgent} accent={accent} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{displayName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
            </div>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          <AgentRow
            isActive={isMaster}
            label={t.chat.masterAgent}
            hint={t.chat.masterAgentHint}
            accent={MASTER_ACCENT}
            icon={<UserCircle2 className="h-3.5 w-3.5" />}
            onClick={() => onSwitchAgent(null)}
          />
          {groupedAgents.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {agentsLoaded ? t.chat.noSubAgents : t.chat.loadingAgents}
            </div>
          ) : (
            groupedAgents.map((agent) => {
              const ready = agent.profile_agent?.profile_status === "ready";
              return (
                <AgentRow
                  key={agent.id}
                  isActive={activeAgent?.id === agent.id}
                  label={agent.display_name || agent.name}
                  hint={agent.role_summary || undefined}
                  accent={agent.accent_color || "#94a3b8"}
                  icon={<Bot className="h-3.5 w-3.5" />}
                  disabled={!ready}
                  statusBadge={
                    ready
                      ? undefined
                      : agent.profile_agent?.profile_status ?? t.chat.profileNotReady
                  }
                  onClick={() => {
                    if (!ready) return;
                    onSwitchAgent(agent.id);
                  }}
                />
              );
            })
          )}
        </div>
        <div className="border-t bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
          {t.chat.profileStatus}: {profileStatus}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AvatarBubble({
  agent,
  accent,
  size,
}: {
  agent: OrgAgent | null;
  accent: string;
  size: number;
}) {
  const dim = `${size}px`;
  if (agent?.avatar_url) {
    return (
      <img
        src={agent.avatar_url}
        alt=""
        className="shrink-0 rounded-full object-cover ring-1 ring-border/60"
        style={{ width: dim, height: dim, backgroundColor: accent }}
      />
    );
  }
  const initial = (agent?.display_name || agent?.name || "H").slice(0, 1).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-white shadow-sm ring-1 ring-border/60"
      style={{
        width: dim,
        height: dim,
        backgroundColor: accent,
        fontSize: Math.round(size * 0.46),
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}

function AgentRow({
  isActive,
  label,
  hint,
  accent,
  icon,
  disabled,
  statusBadge,
  onClick,
}: {
  isActive: boolean;
  label: string;
  hint?: string;
  accent: string;
  icon: React.ReactNode;
  disabled?: boolean;
  statusBadge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs transition-colors",
        "hover:bg-muted/70",
        isActive && "bg-muted/60",
        disabled && "cursor-not-allowed opacity-55 hover:bg-transparent",
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
          {statusBadge ? (
            <Badge
              variant="outline"
              className="h-4 px-1 text-[9px] uppercase tracking-[0.12em]"
            >
              {statusBadge}
            </Badge>
          ) : null}
          {isActive ? (
            <span
              className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
            />
          ) : null}
        </div>
        {hint ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </button>
  );
}
