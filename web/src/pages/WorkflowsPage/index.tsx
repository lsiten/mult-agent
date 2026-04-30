import { Loader2 } from "lucide-react";
import { useWorkflowController } from "./useWorkflowController";
import { WorkflowToolbar } from "./components/WorkflowToolbar";
import { WorkflowCanvas } from "./components/WorkflowCanvas";
import { WorkflowEmptyState } from "./components/WorkflowEmptyState";
import { WorkflowEdgeDialog } from "./components/WorkflowEdgeDialog";
import type { WorkScope } from "@/hooks/useWorkSelector";

interface WorkflowsPageProps {
  scope: WorkScope;
}

export default function WorkflowsPage({ scope }: WorkflowsPageProps) {
  const companyId = scope.type === "company" ? scope.company.id : null;

  const {
    workflow,
    departments,
    mode,
    loading,
    generating,
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
  } = useWorkflowController(companyId);

  if (companyId === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="mb-6 p-6 bg-muted rounded-full">
          <Loader2 className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-2xl font-semibold mb-2">Please Select a Company</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
          Please select a company from the dropdown above to view or edit its workflow.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <WorkflowToolbar
        mode={mode}
        workflowName={workflow?.name}
        onToggleMode={handleToggleMode}
        onSave={handleSave}
        onGenerate={!workflow ? handleGenerate : undefined}
        onDelete={workflow ? handleDelete : undefined}
        saving={generating}
      />

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
              // Navigate to organization page to create departments
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
          onSave={handleEdgeSave}
        />
      )}

      {toast && <div className="fixed bottom-4 right-4 z-50">{toast}</div>}
    </div>
  );
}
