import { Toast } from "@/components/Toast";
import { OrgNodeDialog } from "./components/OrgNodeDialog";
import { OrganizationHeader } from "./components/OrganizationHeader";
import { OrganizationWorkspace } from "./components/OrganizationWorkspace";
import { useOrganizationPageController } from "./useOrganizationPageController";
import { api } from "@/lib/api";

export default function OrganizationPage() {
  const page = useOrganizationPageController();

  const handleInitialized = async (result: { department_id: number; office_id: number; agents: any[]; roles: string[] }) => {
    // Create a new session for the director office discussion
    const session = await api.createSession({
      source: "director-office",
      user_id: "user",
      title: `${page.selectedCompany?.name || "公司"} - 董事办公室`,
      agent_id: result.agents[0]?.id,
    });

    // Navigate to the chat session using the CEO agent by default
    // Users can switch to other director agents via the agent switcher in the header
    window.location.href = `/chat?id=${session.session.id}&agentId=${result.agents[0]?.id}`;
  };

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
        onInitialized={page.selectedCompany ? handleInitialized : undefined}
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
