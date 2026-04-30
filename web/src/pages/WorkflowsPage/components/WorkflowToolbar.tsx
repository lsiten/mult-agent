import { Button } from "@/components/ui/button";
import { Loader2, Edit, Save, Trash2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowToolbarProps {
  mode: "view" | "edit";
  workflowName?: string;
  onToggleMode: () => void;
  onSave: () => void;
  onGenerate?: () => void;
  onDelete?: () => void;
  saving?: boolean;
}

export function WorkflowToolbar({
  mode,
  workflowName,
  onToggleMode,
  onSave,
  onGenerate,
  onDelete,
  saving,
}: WorkflowToolbarProps) {
  const isEditMode = mode === "edit";

  return (
    <div className="sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between gap-4">
      {workflowName && (
        <h2 className="text-lg font-semibold truncate">{workflowName}</h2>
      )}

      <div className="flex items-center gap-2">
        {!isEditMode ? (
          <Button variant="outline" onClick={onToggleMode}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onToggleMode}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
            {onGenerate && (
              <Button variant="secondary" onClick={onGenerate}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate
              </Button>
            )}
            {onDelete && (
              <Button variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
