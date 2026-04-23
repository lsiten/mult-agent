import { Input } from "@/components/ui/input";
import type { Translations } from "@/i18n/types";
import { DEFAULT_COLOR, normalizeColor } from "../utils";

const COLOR_SWATCHES = ["#3ecf8e", "#38bdf8", "#f59e0b", "#ef4444", "#a855f7", "#64748b"];

interface ColorFieldProps {
  value?: string;
  t: Translations;
  update: (key: string, value: string) => void;
}

export function ColorField({ value, t, update }: ColorFieldProps) {
  const color = normalizeColor(value) ?? DEFAULT_COLOR;
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-display text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
        {t.organization.color}
      </span>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Input
            className="h-9 w-12 shrink-0 p-1"
            type="color"
            value={color}
            onChange={(event) => update("accent_color", event.target.value)}
          />
          <Input
            aria-label={t.organization.colorHex}
            className="font-courier"
            value={value || color}
            maxLength={7}
            onBlur={(event) => update("accent_color", normalizeColor(event.target.value) ?? color)}
            onChange={(event) => update("accent_color", event.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-105"
              type="button"
              style={{ backgroundColor: swatch, outline: color === swatch ? "2px solid currentColor" : undefined }}
              aria-label={`${t.organization.color} ${swatch}`}
              onClick={() => update("accent_color", swatch)}
            />
          ))}
        </div>
      </div>
    </label>
  );
}
