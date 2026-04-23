import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Translations } from "@/i18n/types";
import type { OrgNodeValues } from "../../types";
import { DialogField } from "./DialogField";

interface PositionFieldsProps {
  values: OrgNodeValues;
  t: Translations;
  update: (key: string, value: string) => void;
}

export function PositionFields({ values, t, update }: PositionFieldsProps) {
  return (
    <>
      <DialogField label={t.organization.form.parentDepartment}>
        <Input value={values.department_name ?? ""} readOnly />
      </DialogField>
      <DialogField label={t.organization.goal}>
        <Textarea value={values.goal ?? ""} onChange={(event) => update("goal", event.target.value)} />
      </DialogField>
      <DialogField label={t.organization.responsibilities} required>
        <Textarea
          value={values.responsibilities ?? ""}
          onChange={(event) => update("responsibilities", event.target.value)}
          required
        />
      </DialogField>
      <div className="grid gap-4 sm:grid-cols-2">
        <DialogField label={t.organization.headcount}>
          <Input
            min="0"
            type="number"
            value={values.headcount ?? ""}
            onChange={(event) => update("headcount", event.target.value)}
          />
        </DialogField>
        <DialogField label={t.organization.templateKey}>
          <Input value={values.template_key ?? ""} onChange={(event) => update("template_key", event.target.value)} />
        </DialogField>
      </div>
    </>
  );
}
