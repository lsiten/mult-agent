import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Translations } from "@/i18n/types";
import type { OrgNodeValues } from "../../types";
import { DialogField } from "./DialogField";

interface AgentFieldsProps {
  values: OrgNodeValues;
  t: Translations;
  update: (key: string, value: string) => void;
}

export function AgentFields({ values, t, update }: AgentFieldsProps) {
  return (
    <>
      <DialogField label={t.organization.form.parentPosition}>
        <Input value={values.position_name ?? ""} readOnly />
      </DialogField>
      <DialogField label={t.organization.role} required>
        <Textarea
          value={values.role_summary ?? ""}
          onChange={(event) => update("role_summary", event.target.value)}
          required
        />
      </DialogField>
      <DialogField label={t.organization.serviceGoal}>
        <Textarea value={values.service_goal ?? ""} onChange={(event) => update("service_goal", event.target.value)} />
      </DialogField>
      <div className="grid gap-4 sm:grid-cols-2">
        <DialogField label={t.organization.employeeNo}>
          <Input value={values.employee_no ?? ""} onChange={(event) => update("employee_no", event.target.value)} />
        </DialogField>
        <DialogField label={t.organization.displayName}>
          <Input value={values.display_name ?? ""} onChange={(event) => update("display_name", event.target.value)} />
        </DialogField>
      </div>
    </>
  );
}
