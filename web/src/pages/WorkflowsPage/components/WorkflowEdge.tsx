import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

interface WorkflowEdgeProps extends EdgeProps {
  data?: { onDelete?: () => void };
}

export const WorkflowEdge = memo((props: WorkflowEdgeProps) => {
  const { t } = useI18n();
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

  const onDelete = data?.onDelete;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn("stroke-[2.5]", selected && "stroke-primary")}
        style={{ stroke: selected ? undefined : "#94a3b8" }}
      />
      {onDelete && (
        <g transform={`translate(${labelX}, ${labelY}) translate(-12, -12)`}>
          <foreignObject width={24} height={24}>
            <button
              xmlns="http://www.w3.org/1999/xhtml"
              className="rounded-full bg-background border border-border shadow-sm opacity-0 hover:opacity-100 transition-opacity p-0.5"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title={t.workflows.deleteEdge}
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </foreignObject>
        </g>
      )}
    </>
  );
});

WorkflowEdge.displayName = "WorkflowEdge";
