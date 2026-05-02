import { useCallback, useEffect, useRef, useState } from "react";
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

interface PendingEdge {
  id: number | string;
  source_department_id: number;
  target_department_id: number;
  action_description: string;
  trigger_condition?: string;
}

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
    newConnection?: { source: number; target: number };
  } | null>(null);
  const [pendingEdges, setPendingEdges] = useState<PendingEdge[]>([]);
  const savedPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

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
              id: e.id,
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
        showToast(t.workflows.loadFailed, "error");
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
          id: e.id,
          source_department_id: e.source_department_id,
          target_department_id: e.target_department_id,
          action_description: e.action_description,
          trigger_condition: e.trigger_condition,
        })),
      );
      setMode("edit");
      showToast(t.workflows.workflowGenerated, "success");
    } catch {
      showToast(t.workflows.generateFailed, "error");
    } finally {
      setGenerating(false);
    }
  }, [companyId, showToast]);

  const handleSave = useCallback(async () => {
    if (!workflow) return;
    try {
      setSaving(true);
      const updated = await updateWorkflow(workflow.id, {
        edges: pendingEdges.map((edge, idx) => ({
          source_department_id: edge.source_department_id,
          target_department_id: edge.target_department_id,
          action_description: edge.action_description || "",
          trigger_condition: edge.trigger_condition || undefined,
          sort_order: idx,
        })),
      });
      setWorkflow(updated);
      setPendingEdges(
        (updated.edges ?? []).map((e) => ({
          id: e.id,
          source_department_id: e.source_department_id,
          target_department_id: e.target_department_id,
          action_description: e.action_description,
          trigger_condition: e.trigger_condition,
        })),
      );
      setMode("view");
      showToast(t.workflows.workflowSaved, "success");
    } catch {
      showToast(t.workflows.saveFailed, "error");
    } finally {
      setSaving(false);
    }
  }, [workflow, pendingEdges, showToast]);

  const handleDelete = useCallback(async () => {
    if (!workflow) return;
    const confirmed = window.confirm(t.workflows.deleteConfirm);
    if (!confirmed) return;
    try {
      setSaving(true);
      await deleteWorkflow(workflow.id);
      setWorkflow(null);
      setPendingEdges([]);
      setMode("view");
      showToast(t.workflows.workflowDeleted, "success");
    } catch {
      showToast(t.workflows.deleteFailed, "error");
    } finally {
      setSaving(false);
    }
  }, [workflow, showToast]);

  const handleToggleMode = useCallback(() => {
    setMode((prev) => (prev === "view" ? "edit" : "view"));
  }, []);

  const handleConnect = useCallback(
    (connection: { source: string; target: string }) => {
      setEdgeDialog({
        open: true,
        newConnection: {
          id: `new-${Date.now()}`,
          source: parseInt(connection.source),
          target: parseInt(connection.target),
        },
      });
    },
    [],
  );

  const handleEdgeSave = useCallback(
    (edge: {
      id?: number | string;
      source_department_id: number;
      target_department_id: number;
      action_description: string;
      trigger_condition?: string;
    }) => {
      setPendingEdges((prev) => {
        const edgeId = edge.id;
        if (edgeId !== undefined) {
          const idx = prev.findIndex((e) => String(e.id) === String(edgeId));
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { id: edgeId, ...edge };
            return next;
          }
        }
        return [...prev, { id: edgeId ?? `new-${Date.now()}`, ...edge }];
      });
      setEdgeDialog(null);
    },
    [],
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      setPendingEdges((prev) =>
        prev.filter((e) => `edge-${e.id}` !== edgeId),
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

  const handleNodePositionsChange = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      savedPositionsRef.current = { ...savedPositionsRef.current, ...positions };
    },
    [],
  );

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
    handleNodePositionsChange,
  };
}
