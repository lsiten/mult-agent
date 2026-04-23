import { Building2 } from "lucide-react";
import type { Translations } from "@/i18n/types";

export function OrganizationEmptyState({ t }: { t: Translations }) {
  return (
    <div className="flex h-[620px] items-center justify-center px-6 text-center">
      <div className="grid max-w-sm gap-3">
        <Building2 className="mx-auto h-11 w-11 text-muted-foreground" />
        <h1 className="font-display text-xl font-semibold tracking-normal">{t.organization.emptyTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.organization.emptyDescription}</p>
      </div>
    </div>
  );
}
