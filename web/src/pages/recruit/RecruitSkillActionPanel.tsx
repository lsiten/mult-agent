import { FileSearch, SlidersHorizontal } from "lucide-react";

interface SkillAction {
  skillName: string;
  title: string;
  description: string;
  prompt: string;
  cta: string;
  tone: "extract" | "score";
}

interface RecruitSkillActionPanelProps {
  title: string;
  subtitle: string;
  actions: SkillAction[];
  disabled: boolean;
  onRun: (prompt: string, skills: string[]) => void;
}

export function RecruitSkillActionPanel({
  title,
  subtitle,
  actions,
  disabled,
  onRun,
}: RecruitSkillActionPanelProps) {
  return (
    <div className="rounded-lg border border-[#2e2e2e] bg-[#111a14] p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#fafafa]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[#898989]">{subtitle}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((action) => {
          const Icon = action.tone === "extract" ? FileSearch : SlidersHorizontal;
          return (
            <button
              key={action.skillName}
              type="button"
              disabled={disabled}
              onClick={() => onRun(action.prompt, [action.skillName])}
              className="group rounded-lg border border-[#2e2e2e] bg-[#171717] p-4 text-left transition-colors hover:border-[rgba(62,207,142,0.45)] hover:bg-[#1a211c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(62,207,142,0.3)] bg-[#0e1510] text-[#60eca8]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="truncate font-mono text-[10px] text-[#898989]">{action.skillName}</span>
              </div>
              <h4 className="text-sm font-semibold text-[#fafafa]">{action.title}</h4>
              <p className="mt-2 min-h-10 text-xs leading-5 text-[#bbcabe]">{action.description}</p>
              <span className="mt-4 inline-flex text-xs font-semibold text-[#60eca8] group-hover:text-[#71fcb6]">
                {action.cta}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
