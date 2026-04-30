import { Sparkles, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkflowEmptyStateProps {
  companyHasDepartments: boolean;
  onGenerate: () => void;
  onCreate: () => void;
  loading?: boolean;
}

export function WorkflowEmptyState({
  companyHasDepartments,
  onGenerate,
  onCreate,
  loading,
}: WorkflowEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      {companyHasDepartments ? (
        <>
          <div className="mb-6 p-6 bg-muted rounded-full">
            <Sparkles className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">No Workflow Yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            Generate a workflow automatically using AI based on your company's
            departments.
          </p>
          <div className="flex gap-4">
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              AI Generate Workflow
            </Button>
            <Button variant="outline" onClick={onCreate}>
              Create Manually
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-6 p-6 bg-muted rounded-full">
            <Building2 className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-2xl font-semibold mb-2">No Departments Found</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            You need to create departments first. Please go to the Organization
            page to add departments.
          </p>
          <Button variant="outline" onClick={onCreate}>
            <Building2 className="h-4 w-4 mr-2" />
            Go to Organization
          </Button>
        </>
      )}
    </div>
  );
}
