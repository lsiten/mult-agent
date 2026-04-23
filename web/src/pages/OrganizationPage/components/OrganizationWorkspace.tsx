import type { Translations } from "@/i18n/types";
import type { OrgCompany } from "@/lib/api";
import type { OrgCreateHandler, OrgEditHandler, OrgProvisionHandler } from "../types";
import { CompanySwitcher } from "./CompanySwitcher";
import { OrganizationEmptyState } from "./OrganizationEmptyState";
import { OrganizationLoadingState } from "./OrganizationLoadingState";
import { CompanyChart } from "./tree/CompanyChart";

interface OrganizationWorkspaceProps {
  company: OrgCompany | null;
  loading: boolean;
  multipleCompanies: boolean;
  provisioningId: number | null;
  t: Translations;
  onCreate: OrgCreateHandler;
  onEdit: OrgEditHandler;
  onMoveCompany: (direction: -1 | 1) => void;
  onProvision: OrgProvisionHandler;
}

export function OrganizationWorkspace({
  company,
  loading,
  multipleCompanies,
  provisioningId,
  t,
  onCreate,
  onEdit,
  onMoveCompany,
  onProvision,
}: OrganizationWorkspaceProps) {
  return (
    <main className="min-h-[620px] overflow-hidden border border-border bg-card/35">
      {loading ? (
        <OrganizationLoadingState />
      ) : company ? (
        <section className="flex min-h-[620px] flex-col">
          <CompanySwitcher
            company={company}
            multipleCompanies={multipleCompanies}
            t={t}
            onMoveCompany={onMoveCompany}
          />
          <div className="flex-1 overflow-auto px-5 py-8">
            <CompanyChart
              company={company}
              provisioningId={provisioningId}
              t={t}
              onCreate={onCreate}
              onEdit={onEdit}
              onProvision={onProvision}
            />
          </div>
        </section>
      ) : (
        <OrganizationEmptyState t={t} />
      )}
    </main>
  );
}
