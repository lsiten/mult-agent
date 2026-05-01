import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowDepartment } from "../types";
import { useI18n } from "@/i18n";

interface WorkflowEdgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: WorkflowDepartment[];
  edge?: {
    source_department_id: number;
    target_department_id: number;
    action_description: string;
    trigger_condition?: string;
  };
  newConnection?: {
    source: number;
    target: number;
  };
  onSave: (data: {
    source_department_id: number;
    target_department_id: number;
    action_description: string;
    trigger_condition?: string;
  }) => void;
}

export function WorkflowEdgeDialog({
  open,
  onOpenChange,
  departments,
  edge,
  newConnection,
  onSave,
}: WorkflowEdgeDialogProps) {
  const { t } = useI18n();
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [triggerCondition, setTriggerCondition] = useState("");

  useEffect(() => {
    if (edge) {
      setSource(edge.source_department_id.toString());
      setTarget(edge.target_department_id.toString());
      setActionDescription(edge.action_description);
      setTriggerCondition(edge.trigger_condition || "");
    } else if (newConnection) {
      setSource(newConnection.source.toString());
      setTarget(newConnection.target.toString());
      setActionDescription("");
      setTriggerCondition("");
    } else {
      setSource("");
      setTarget("");
      setActionDescription("");
      setTriggerCondition("");
    }
  }, [edge, newConnection, open]);

  const isValid = () => {
    const sourceId = parseInt(source);
    const targetId = parseInt(target);
    return (
      source !== "" &&
      target !== "" &&
      sourceId !== targetId &&
      actionDescription.trim() !== ""
    );
  };

  const handleSubmit = () => {
    if (!isValid()) return;
    onSave({
      source_department_id: parseInt(source),
      target_department_id: parseInt(target),
      action_description: actionDescription.trim(),
      trigger_condition: triggerCondition.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{edge ? t.workflows.editEdge : t.workflows.addEdge}</DialogTitle>
          <DialogDescription>
            {edge
              ? t.workflows.updateEdgeDescription
              : t.workflows.createEdgeDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="source">{t.workflows.sourceDepartment}</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="source">
                <SelectValue placeholder={t.workflows.selectSource} />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="target">{t.workflows.targetDepartment}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="target">
                <SelectValue placeholder={t.workflows.selectTarget} />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="action">{t.workflows.actionDescription}</Label>
            <Textarea
              id="action"
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              placeholder={t.workflows.actionPlaceholder}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="trigger">{t.workflows.triggerCondition}</Label>
            <Input
              id="trigger"
              value={triggerCondition}
              onChange={(e) => setTriggerCondition(e.target.value)}
              placeholder={t.workflows.triggerPlaceholder}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t.workflows.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid()}>
            {edge ? t.workflows.update : t.workflows.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
