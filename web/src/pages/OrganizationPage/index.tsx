import { Toast } from "@/components/Toast";
import { OrgNodeDialog } from "./components/OrgNodeDialog";
import { OrganizationHeader } from "./components/OrganizationHeader";
import { OrganizationWorkspace } from "./components/OrganizationWorkspace";
import { useOrganizationPageController } from "./useOrganizationPageController";

export default function OrganizationPage() {
  const page = useOrganizationPageController();

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-4">
      <OrganizationHeader
        t={page.t}
        onCreateCompany={page.openCreateCompany}
        onRefresh={page.refreshSelectedCompany}
      />

      <OrganizationWorkspace
        company={page.selectedCompany}
        loading={page.loading}
        multipleCompanies={page.multipleCompanies}
        t={page.t}
        onCreate={page.openCreate}
        onDelete={page.deleteNode}
        onEdit={page.openEdit}
        onMoveCompany={page.moveCompany}
        onRefresh={page.refreshSelectedCompany}
      />

      {page.dialog ? (
        <OrgNodeDialog
          open={Boolean(page.dialog)}
          type={page.dialog.type}
          item={page.dialog.item}
          parent={page.dialog.parent}
          tree={{ companies: page.companies }}
          saving={page.saving}
          t={page.t}
          onOpenChange={page.handleDialogOpenChange}
          onSubmit={page.saveDialog}
        />
      ) : null}

      <Toast toast={page.toast} />
    </div>
  );
}
