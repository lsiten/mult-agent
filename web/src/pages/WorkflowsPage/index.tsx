import { Loader2 } from "lucide-react";
import { useWorkflowController } from "./useWorkflowController";
import { WorkflowToolbar } from "./components/WorkflowToolbar";
import { WorkflowCanvas } from "./components/WorkflowCanvas";
import { WorkflowEmptyState } from "./components/WorkflowEmptyState";
import { WorkflowEdgeDialog } from "./components/WorkflowEdgeDialog";
import type { WorkScope } from "@/hooks/useWorkSelector";
import { useI18n } from "@/i18n";

interface WorkflowsPageProps {
  scope: WorkScope;
}

export default function WorkflowsPage({ scope }: WorkflowsPageProps) {
  const { t } = useI18n();
  const companyId = scope.type === "company" ? scope.company.id : null;

  const {
    workflow,
    departments,
    mode,
    loading,
    generating,
    pendingEdges,
    edgeDialog,
    toast,
    handleGenerate,
    handleSave,
    handleDelete,
    handleToggleMode,
    handleConnect,
    handleEdgeSave,
    handleEdgeDelete,
    handleEdgeDoubleClick,
    handleEdgeDialogOpenChange,
    handleNodePositionsChange,
  } = useWorkflowController(companyId);

  if (companyId === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="mb-6 p-6 bg-muted rounded-full">
          <Loader2 className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-2xl font-semibold mb-2">{t.workflows.selectCompanyTitle}</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          {t.workflows.selectCompanyDescription}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {workflow && (
        <WorkflowToolbar
          mode={mode}
          workflowName={workflow.name}
          onToggleMode={handleToggleMode}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={generating}
        />
      )}

      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!loading && !workflow && (
          <WorkflowEmptyState
            companyHasDepartments={departments.length > 0}
            onGenerate={handleGenerate}
            onCreate={() => {
              window.location.href = "/organization";
            }}
            loading={generating}
          />
        )}

        {!loading && workflow && (
          <WorkflowCanvas
            workflow={workflow}
            departments={departments}
            mode={mode}
            pendingEdges={pendingEdges}
            onConnect={handleConnect}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onEdgeDelete={handleEdgeDelete}
          />
        )}
      </div>

      {edgeDialog && (
        <WorkflowEdgeDialog
          open={edgeDialog.open}
          onOpenChange={handleEdgeDialogOpenChange}
          departments={departments}
          edge={edgeDialog.editingEdge}
          newConnection={edgeDialog.newConnection}
          onSave={handleEdgeSave}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            className={`px-4 py-2 rounded-md text-sm font-medium shadow-lg ${
              toast.type === "error"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
