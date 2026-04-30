import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import {
  getWorkflow,
  generateWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "@/lib/api";
import type { Workflow, WorkflowEdge, WorkflowDepartment } from "./types";

export function useWorkflowController(companyId: number | null) {
  const { t } = useI18n();
  const { toast, showToast } = useToast();

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [departments, setDepartments] = useState<WorkflowDepartment[]>([]);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [edgeDialog, setEdgeDialog] = useState<{
    open: boolean;
    editingEdge?: WorkflowEdge;
  } | null>(null);
  const [pendingEdges, setPendingEdges] = useState<
    Array<{
      source_department_id: number;
      target_department_id: number;
      action_description: string;
      trigger_condition?: string;
    }>
  >([]);

  const loadWorkflow = useCallback(
    async (id: number) => {
      try {
        setLoading(true);
        const [workflowData, companyData] = await Promise.all([
          getWorkflow(id),
          api.getOrgCompanyTree(id),
        ]);
        setWorkflow(workflowData);
        setDepartments(
          (companyData.company.departments ?? []).map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            goal: d.goal,
            accent_color: d.accent_color ?? undefined,
            sort_order: d.sort_order,
          }))
        );
        if (workflowData) {
          setPendingEdges(
            (workflowData.edges ?? []).map((e) => ({
              source_department_id: e.source_department_id,
              target_department_id: e.target_department_id,
              action_description: e.action_description,
              trigger_condition: e.trigger_condition,
            })),
          );
        } else {
          setPendingEdges([]);
        }
      } catch {
        showToast("Failed to load workflow", "error");
      } finally {
        setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (companyId !== null) {
      void loadWorkflow(companyId);
    } else {
      setWorkflow(null);
      setDepartments([]);
      setPendingEdges([]);
      setMode("view");
    }
  }, [companyId, loadWorkflow]);

  const handleGenerate = useCallback(async () => {
    if (!companyId) return;
    try {
      setGenerating(true);
      const newWorkflow = await generateWorkflow(companyId);
      setWorkflow(newWorkflow);
      setPendingEdges(
        (newWorkflow.edges ?? []).map((e) => ({
          source_department_id: e.source_department_id,
          target_department_id: e.target_department_id,
          action_description: e.action_description,
          trigger_condition: e.trigger_condition,
        })),
      );
      setMode("edit");
      showToast("Workflow generated", "success");
    } catch {
      showToast("Failed to generate workflow", "error");
    } finally {
      setGenerating(false);
    }
  }, [companyId, showToast]);

  const handleSave = useCallback(async () => {
    if (!workflow) return;
    try {
      setSaving(true);
      const updated = await updateWorkflow(workflow.id, {
        edges: pendingEdges,
      });
      setWorkflow(updated);
      showToast("Workflow saved", "success");
    } catch {
      showToast("Failed to save workflow", "error");
    } finally {
      setSaving(false);
    }
  }, [workflow, pendingEdges, showToast]);

  const handleDelete = useCallback(async () => {
    if (!workflow) return;
    const confirmed = window.confirm("Delete this workflow?");
    if (!confirmed) return;
    try {
      setSaving(true);
      await deleteWorkflow(workflow.id);
      setWorkflow(null);
      setPendingEdges([]);
      setMode("view");
      showToast("Workflow deleted", "success");
    } catch {
      showToast("Failed to delete workflow", "error");
    } finally {
      setSaving(false);
    }
  }, [workflow, showToast]);

  const handleToggleMode = useCallback(() => {
    setMode((prev) => (prev === "view" ? "edit" : "view"));
  }, []);

  const handleConnect = useCallback(
    (sourceId: number, targetId: number) => {
      setEdgeDialog({
        open: true,
        editingEdge: undefined,
      });
    },
    [],
  );

  const handleEdgeSave = useCallback(
    (edge: {
      source_department_id: number;
      target_department_id: number;
      action_description: string;
      trigger_condition?: string;
    }) => {
      setPendingEdges((prev) => [...prev, edge]);
      setEdgeDialog(null);
    },
    [],
  );

  const handleEdgeDelete = useCallback(
    (sourceId: number, targetId: number) => {
      setPendingEdges((prev) =>
        prev.filter(
          (e) =>
            !(
              e.source_department_id === sourceId &&
              e.target_department_id === targetId
            ),
        ),
      );
    },
    [],
  );

  const handleEdgeDoubleClick = useCallback(
    (edge: WorkflowEdge) => {
      setEdgeDialog({
        open: true,
        editingEdge: edge,
      });
    },
    [],
  );

  const handleEdgeDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setEdgeDialog(null);
  }, []);

  return {
    workflow,
    departments,
    mode,
    loading,
    saving,
    generating,
    edgeDialog,
    pendingEdges,
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
  };
}
