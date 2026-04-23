import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Translations } from "@/i18n/types";

interface OrganizationHeaderProps {
  t: Translations;
  onCreateCompany: () => void;
  onRefresh: () => void;
}

export function OrganizationHeader({ t, onCreateCompany, onRefresh }: OrganizationHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
      <Button onClick={onCreateCompany}>
        <Plus className="h-3.5 w-3.5" />
        {t.organization.createCompany}
      </Button>
      <Button variant="ghost" size="icon" onClick={onRefresh} aria-label={t.organization.refresh}>
        <RefreshCw className="h-4 w-4" />
      </Button>
    </header>
  );
}
