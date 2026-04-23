import { Input } from "@/components/ui/input";
import type { Translations } from "@/i18n/types";
import type { OrgNodeType, OrgNodeValues } from "../../types";
import { ColorField } from "../ColorField";
import { DialogField } from "./DialogField";

interface SharedNodeFieldsProps {
  type: OrgNodeType;
  values: OrgNodeValues;
  t: Translations;
  update: (key: string, value: string) => void;
}

export function SharedNodeFields({ type, values, t, update }: SharedNodeFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
      {type !== "agent" ? (
        <DialogField label={t.organization.icon}>
          <Input value={values.icon ?? ""} onChange={(event) => update("icon", event.target.value)} />
        </DialogField>
      ) : (
        <DialogField label={t.organization.avatarUrl}>
          <Input
            type="url"
            value={values.avatar_url ?? ""}
            onChange={(event) => update("avatar_url", event.target.value)}
          />
        </DialogField>
      )}
      <ColorField value={values.accent_color} t={t} update={update} />
    </div>
  );
}
