export const DEFAULT_COLOR = "#3ecf8e";

export function cleanPayload<T extends Record<string, unknown>>(payload: T): T {
  const clean = { ...payload };
  for (const key of Object.keys(clean)) {
    if (clean[key] === "") {
      delete clean[key];
    }
  }
  return clean;
}

export function nodeColor(value?: string | null, fallback?: string | null) {
  const candidate = value || fallback || DEFAULT_COLOR;
  return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : DEFAULT_COLOR;
}

export function normalizeColor(value?: string | null) {
  if (!value) return null;
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`;
  return null;
}

export function alphaColor(hex: string, alpha: number) {
  const normalized = nodeColor(hex).replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || "");
}

export function formatReason(template: string, reason: string) {
  return template.replace("{reason}", reason || "");
}

export function nodeKey(item: unknown, index: number) {
  if (item && typeof item === "object" && "id" in item) {
    return String((item as { id: number }).id);
  }
  return String(index);
}
