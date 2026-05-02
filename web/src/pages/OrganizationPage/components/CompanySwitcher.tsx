import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Translations } from "@/i18n/types";
import type { OrgCompany } from "@/lib/api";
import { nodeColor } from "../utils";
import { NodeMark } from "./NodeMark";
import { InitCompanyButton } from "./InitCompanyButton";

interface CompanySwitcherProps {
  company: OrgCompany;
  multipleCompanies: boolean;
  t: Translations;
  onMoveCompany: (direction: -1 | 1) => void;
  onInitialized?: (result: {
    department_id: number;
    office_id: number;
    agents: any[];
    roles: string[];
    introductions: { agent_id: number; role: string; introduction: string }[];
  }) => void;
}

export function CompanySwitcher({ company, multipleCompanies, t, onMoveCompany, onInitialized }: CompanySwitcherProps) {
  const color = nodeColor(company.accent_color);
  const shouldShowInitButton = onInitialized && !company.has_director_office;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border bg-background/60 px-4 py-3">
      <div className="flex items-center">
        {multipleCompanies ? (
          <div className="flex items-center gap-1" aria-label={t.organization.switchCompany}>
            <Button variant="outline" size="icon" onClick={() => onMoveCompany(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => onMoveCompany(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <NodeMark icon={company.icon} color={color} type="company" name={company.name} />
        <div className="min-w-0 text-right">
          <h1 className="truncate font-display text-xl font-semibold tracking-normal sm:text-2xl">
            {company.name}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{company.goal}</p>
        </div>
        {shouldShowInitButton ? (
          <InitCompanyButton
            companyId={company.id}
            onInitialized={onInitialized}
          />
        ) : null}
      </div>
    </div>
  );
}
