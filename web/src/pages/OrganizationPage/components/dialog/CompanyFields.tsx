import { Textarea } from "@/components/ui/textarea";
import type { Translations } from "@/i18n/types";
import type { OrgNodeValues } from "../../types";
import { DialogField } from "./DialogField";

interface CompanyFieldsProps {
  values: OrgNodeValues;
  t: Translations;
  update: (key: string, value: string) => void;
}

export function CompanyFields({ values, t, update }: CompanyFieldsProps) {
  return (
    <>
      <DialogField label={t.organization.goal} required>
        <Textarea value={values.goal ?? ""} onChange={(event) => update("goal", event.target.value)} required />
      </DialogField>
      <DialogField label={t.organization.description}>
        <Textarea value={values.description ?? ""} onChange={(event) => update("description", event.target.value)} />
      </DialogField>
    </>
  );
}
