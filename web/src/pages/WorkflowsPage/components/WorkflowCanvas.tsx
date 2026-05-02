import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type OnEdgesChange,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowEdge as WorkflowEdgeType, WorkflowDepartment } from "../types";
import type { WorkflowNodeData, WorkflowEdgeData, WorkflowMode } from "../types";
import { WorkflowNode } from "./WorkflowNode";
import { WorkflowEdge } from "./WorkflowEdge";

const nodeTypes = { workflowNode: WorkflowNode };
const edgeTypes = { workflowEdge: WorkflowEdge };

interface WorkflowCanvasProps {
  workflow: Workflow | null;
  departments: WorkflowDepartment[];
  mode: WorkflowMode;
  pendingEdges?: Array<{
    id: number | string;
    source_department_id: number;
    target_department_id: number;
    action_description: string;
    trigger_condition?: string;
  }>;
  onEdgesChange?: (changes: any[]) => void;
  onConnect?: (connection: any) => void;
  onEdgeDoubleClick?: (edge: any) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onLoad?: (rf: any) => void;
  onNodePositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
}

/** Layout nodes horizontally by sort_order. */
function layoutNodes(
  departments: WorkflowDepartment[],
  _edges: WorkflowEdgeType[],
  existingPositions?: Record<string, { x: number; y: number }>
): Node<WorkflowNodeData>[] {
  const HORIZONTAL_GAP = 320;
  const START_X = 100;
  const START_Y = 200;

  const sorted = [...departments].sort((a, b) => a.sort_order - b.sort_order);

  return sorted.map((department, index) => {
    const pos = existingPositions?.[String(department.id)];
    return {
      id: String(department.id),
      type: "workflowNode",
      position: pos
        ? { x: pos.x, y: pos.y }
        : { x: START_X + index * HORIZONTAL_GAP, y: START_Y },
      data: {
        department,
        taskCount: department.agent_count || 0,
        isActive: false,
      },
    };
  });
}

/** Convert workflow edges to ReactFlow edges. */
function buildEdges(
  workflow: Workflow | null,
  onDelete?: (edgeId: string) => void
): Edge<WorkflowEdgeData>[] {
  if (!workflow?.edges) return [];
  return workflow.edges.map((e) => ({
    id: `edge-${e.id}`,
    source: String(e.source_department_id),
    target: String(e.target_department_id),
    type: "workflowEdge",
    data: {
      action_description: e.action_description,
      trigger_condition: e.trigger_condition,
      onDelete: onDelete
        ? () => onDelete(`edge-${e.id}`)
        : undefined,
    } as WorkflowEdgeData & { onDelete?: () => void },
  }));
}

export function WorkflowCanvas({
  workflow,
  departments,
  mode,
  pendingEdges,
  onEdgesChange,
  onConnect,
  onEdgeDoubleClick,
  onEdgeDelete,
  onLoad,
  onNodePositionsChange,
}: WorkflowCanvasProps) {
  const [rfInstance, setRfInstance] = useState<any>(null);

  // Load persisted positions from localStorage
  const loadPersistedPositions = useCallback((): Record<string, { x: number; y: number }> => {
    if (!workflow) return {};
    try {
      const stored = localStorage.getItem(`workflow-positions-${workflow.id}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, [workflow]);

  // Persist positions to localStorage
  const persistPositions = useCallback(
    (positions: Record<string, { x: number; y: number }>) => {
      if (!workflow) return;
      try {
        localStorage.setItem(`workflow-positions-${workflow.id}`, JSON.stringify(positions));
      } catch {
        // Storage full or unavailable - ignore
      }
    },
    [workflow],
  );

  const allEdges = useMemo(() => {
    // After save, pendingEdges = updated.edges from backend
    // Just use pendingEdges directly since it contains all edges after editing
    return pendingEdges.map((pe) => ({
      id: typeof pe.id === 'number' ? pe.id : Number(pe.id),
      workflow_id: workflow?.id || 0,
      source_department_id: pe.source_department_id,
      target_department_id: pe.target_department_id,
      action_description: pe.action_description,
      trigger_condition: pe.trigger_condition,
      sort_order: 0,
      created_at: Date.now(),
    }));
  }, [workflow?.id, pendingEdges]);

  const initialNodes = useMemo(
    () => layoutNodes(departments, allEdges, loadPersistedPositions()),
    [departments, allEdges, loadPersistedPositions],
  );

  const initialEdges = useMemo(
    () => buildEdges(workflow ? { ...workflow, edges: allEdges } : null, onEdgeDelete),
    [workflow, allEdges, onEdgeDelete]
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);

  const layoutVersionRef = useRef(0);

  // Update both nodes and edges when dependencies change
  useEffect(() => {
    setEdges(initialEdges);
    const newVersion = departments.length * 1000 + (allEdges.length || 0);
    if (layoutVersionRef.current !== newVersion) {
      layoutVersionRef.current = newVersion;
      setNodes((nds) => {
        const existingIds = new Set(nds.map((n) => n.id));
        const newNodes = initialNodes.filter((n) => !existingIds.has(n.id));
        const updated = nds.map((existing) => {
          const initial = initialNodes.find((n) => n.id === existing.id);
          if (initial) {
            return {
              ...existing,
              position: existing.position || initial.position,
              data: {
                ...existing.data,
                ...initial.data,
              },
              width: existing.measured?.width ?? 180,
              height: existing.measured?.height ?? 88,
            };
          }
          return existing;
        });
        return [...updated, ...newNodes];
      });
    }
  }, [initialNodes, initialEdges, allEdges.length, setNodes, setEdges, departments.length]);

  useEffect(() => {
    if (rfInstance) {
      setTimeout(() => rfInstance.fitView({ padding: 0.2 }), 50);
    }
  }, [rfInstance, departments, workflow]);

  const handleInit = useCallback(
    (instance: any) => {
      setRfInstance(instance);
      onLoad?.(instance);
      setTimeout(() => instance.fitView({ padding: 0.2 }), 50);
    },
    [onLoad]
  );

  const handleNodePositionsChange = useCallback(
    (changes: any[]) => {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          positions[change.id] = {
            x: change.position.x,
            y: change.position.y,
          };
        }
      }
      if (Object.keys(positions).length > 0) {
        persistPositions({ ...loadPersistedPositions(), ...positions });
        onNodePositionsChange?.(positions);
      }
    },
    [onNodePositionsChange, persistPositions, loadPersistedPositions],
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChange?.(changes);
      onEdgesChangeInternal(changes);
    },
    [onEdgesChange, onEdgesChangeInternal]
  );

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnect?.(connection);
    },
    [onConnect]
  );

  const handleEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      onEdgeDoubleClick?.(edge);
    },
    [onEdgeDoubleClick]
  );

  const handleNodesChange = useCallback(
    (changes: any[]) => {
      handleNodePositionsChange(changes);
      onNodesChangeInternal(changes);
    },
    [handleNodePositionsChange, onNodesChangeInternal]
  );

  return (
    <div className={cn("h-full w-full", mode === "view" && "cursor-default")}>
      <style>{`
        .workflow-controls .react-flow__controls-button {
          background: #f5f5f5;
          border-color: #e2e8f0;
          border-bottom: none;
        }
        .workflow-controls .react-flow__controls-button:last-child {
          border-bottom: 1px solid #e2e8f0;
        }
        .workflow-controls .react-flow__controls-button:hover {
          background: #e2e8f0;
        }
        .workflow-controls .react-flow__controls-button svg {
          fill: #334155;
        }
        .react-flow__attribution { display: none !important; }
      `}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={handleInit}
        onNodesChange={mode === "edit" ? handleNodesChange : undefined}
        onEdgesChange={mode === "edit" ? handleEdgesChange : undefined}
        onConnect={mode === "edit" ? handleConnect : undefined}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        nodesDraggable={mode === "edit"}
        nodesConnectable={mode === "edit"}
        elementsSelectable={mode === "edit"}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls
          showZoom={true}
          showFitView={true}
          showLock={true}
          showInteractive={false}
          className="workflow-controls"
        />
        <MiniMap
          nodeColor={(node) => {
            const color = node.data?.department?.accent_color;
            return color || "#4a90d9";
          }}
          maskColor="rgba(0, 0, 0, 0.05)"
          nodeBorderRadius={8}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
