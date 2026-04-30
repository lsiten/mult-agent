import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Workflow, WorkflowEdge as WorkflowEdgeType, OrgDepartment } from "@/lib/api";
import type { WorkflowNodeData, WorkflowEdgeData, WorkflowMode } from "../types";
import { WorkflowNode } from "./WorkflowNode";
import { WorkflowEdge } from "./WorkflowEdge";

const nodeTypes = { workflowNode: WorkflowNode };
const edgeTypes = { workflowEdge: WorkflowEdge };

interface WorkflowCanvasProps {
  workflow: Workflow | null;
  departments: OrgDepartment[];
  mode: WorkflowMode;
  onEdgesChange?: (changes: any[]) => void;
  onConnect?: (connection: any) => void;
  onEdgeDoubleClick?: (edge: any) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onLoad?: (rf: any) => void;
}

/** Layout nodes left-to-right based on edge connections, fallback to sort_order. */
function layoutNodes(
  departments: OrgDepartment[],
  edges: WorkflowEdgeType[]
): Node<WorkflowNodeData>[] {
  const HORIZONTAL_GAP = 250;
  const VERTICAL_GAP = 150;
  const START_X = 50;
  const START_Y = 50;

  // Build adjacency to determine order
  const outgoing = new Map<number, number[]>();
  const incoming = new Map<number, number[]>();
  departments.forEach((d) => {
    outgoing.set(d.id, []);
    incoming.set(d.id, []);
  });
  edges.forEach((e) => {
    outgoing.get(e.source_department_id)?.push(e.target_department_id);
    incoming.get(e.target_department_id)?.push(e.source_department_id);
  });

  // Topological sort (Kahn's algorithm) for ordering
  const inDegree = new Map<number, number>();
  departments.forEach((d) => inDegree.set(d.id, incoming.get(d.id)?.length || 0));

  const queue: number[] = [];
  const order: number[] = [];
  departments.forEach((d) => {
    if ((inDegree.get(d.id) || 0) === 0) queue.push(d.id);
  });

  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);
    (outgoing.get(curr) || []).forEach((next) => {
      const newDeg = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    });
  }

  // Add any remaining (disconnected) departments sorted by sort_order
  const orderedIds = new Set(order);
  departments
    .filter((d) => !orderedIds.has(d.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((d) => order.push(d.id));

  // Position nodes
  const nodesByRow = new Map<number, number[]>(); // column -> dept ids
  order.forEach((deptId, index) => {
    const col = index;
    if (!nodesByRow.has(col)) nodesByRow.set(col, []);
    nodesByRow.get(col)!.push(deptId);
  });

  const nodes: Node<WorkflowNodeData>[] = [];
  const deptMap = new Map(departments.map((d) => [d.id, d]));

  Array.from(nodesByRow.entries()).forEach(([col, deptIds]) => {
    deptIds.forEach((deptId, row) => {
      const department = deptMap.get(deptId);
      if (!department) return;
      nodes.push({
        id: String(deptId),
        type: "workflowNode",
        position: {
          x: START_X + col * HORIZONTAL_GAP,
          y: START_Y + row * VERTICAL_GAP,
        },
        data: {
          department,
          taskCount: department.agent_count || 0,
          isActive: false,
        },
      });
    });
  });

  return nodes;
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
  onEdgesChange,
  onConnect,
  onEdgeDoubleClick,
  onEdgeDelete,
  onLoad,
}: WorkflowCanvasProps) {
  const [rfInstance, setRfInstance] = useState<any>(null);

  const initialNodes = useMemo(
    () => layoutNodes(departments, workflow?.edges || []),
    [departments, workflow?.edges]
  );

  const initialEdges = useMemo(
    () => buildEdges(workflow, onEdgeDelete),
    [workflow, onEdgeDelete]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);

  // Sync external changes
  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  useEffect(() => {
    onNodesChange(initialNodes);
  }, [initialNodes, onNodesChange]);

  // Auto-fit view
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

  return (
    <div className={cn("h-full w-full", mode === "view" && "cursor-default")}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onInit={handleInit}
        onNodesChange={mode === "edit" ? undefined : () => {}}
        onEdgesChange={mode === "edit" ? handleEdgesChange : undefined}
        onConnect={mode === "edit" ? handleConnect : undefined}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        defaultZoom={0.8}
        nodesDraggable={mode === "edit"}
        nodesConnectable={mode === "edit"}
        elementsSelectable={mode === "edit"}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={mode === "edit"} />
        <MiniMap
          nodeColor={(node: Node) => {
            const data = node.data as WorkflowNodeData;
            return data?.department?.accent_color || "#6366f1";
          }}
          className="bg-background border border-border"
        />
      </ReactFlow>
    </div>
  );
}
