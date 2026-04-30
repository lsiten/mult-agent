import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowEdgeData } from "../types";

interface WorkflowEdgeProps extends EdgeProps {
  data?: WorkflowEdgeData & { onDelete?: () => void };
}

export const WorkflowEdge = memo((props: WorkflowEdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const actionDescription = data?.action_description || "";
  const triggerCondition = data?.trigger_condition;
  const onDelete = data?.onDelete;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn("stroke-2", selected && "stroke-primary")}
        style={{ stroke: selected ? undefined : "#6366f1" }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{
            transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
          }}
        >
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 shadow-sm">
            <span className="text-xs font-medium text-foreground whitespace-nowrap">
              {actionDescription}
            </span>
            {onDelete && (
              <button
                className="ml-1 rounded-sm opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 focus:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete edge"
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
          {triggerCondition && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {triggerCondition}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

WorkflowEdge.displayName = "WorkflowEdge";
