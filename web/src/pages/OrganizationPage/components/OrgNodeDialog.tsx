import { useMemo, useState } from "react";
import type React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { OrganizationTreeResponse } from "@/lib/api";
import type { Translations } from "@/i18n/types";
import { createOrgNodeLabel, initialOrgNodeValues, orgNodeLabel } from "../dialogUtils";
import type { OrgDialogItem, OrgDialogParent, OrgNodeType, OrgNodeValues } from "../types";
import { DEFAULT_COLOR, normalizeColor } from "../utils";
import { AgentFields } from "./dialog/AgentFields";
import { CompanyFields } from "./dialog/CompanyFields";
import { DepartmentFields } from "./dialog/DepartmentFields";
import { DialogField } from "./dialog/DialogField";
import { PositionFields } from "./dialog/PositionFields";
import { SharedNodeFields } from "./dialog/SharedNodeFields";

interface OrgNodeDialogProps {
  open: boolean;
  type: OrgNodeType;
  item: OrgDialogItem | null;
  parent: OrgDialogParent;
  tree: OrganizationTreeResponse;
  saving: boolean;
  t: Translations;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: OrgNodeValues) => Promise<void>;
}

export function OrgNodeDialog({
  open,
  type,
  item,
  parent,
  tree,
  saving,
  t,
  onOpenChange,
  onSubmit,
}: OrgNodeDialogProps) {
  const [values, setValues] = useState<OrgNodeValues>(() => initialOrgNodeValues(type, item, parent, tree));
  const editing = Boolean(item);

  const title = useMemo(() => {
    if (!editing) return createOrgNodeLabel(type, t);
    return `${t.organization.form.editMode} ${orgNodeLabel(type, t)}`;
  }, [editing, t, type]);

  const update = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({ ...values, accent_color: normalizeColor(values.accent_color) ?? DEFAULT_COLOR });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{t.organization.subtitle}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={submit}>
          <DialogField label={t.organization.name} required>
            <Input value={values.name ?? ""} onChange={(event) => update("name", event.target.value)} required />
          </DialogField>

          {type === "company" ? <CompanyFields values={values} t={t} update={update} /> : null}

          {type === "department" ? <DepartmentFields values={values} t={t} update={update} /> : null}

          {type === "position" ? <PositionFields values={values} t={t} update={update} /> : null}

          {type === "agent" ? <AgentFields values={values} t={t} update={update} /> : null}

          <SharedNodeFields type={type} values={values} t={t} update={update} />

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
