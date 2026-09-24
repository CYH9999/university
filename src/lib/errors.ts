import i18n from "@/i18n";
import { ValidationError } from "@/core/validation/schemas";
import { PlatformError } from "@/platform/tauri";

/** Turns any thrown value into a translated, user-facing message. */
export function errorMessage(e: unknown): string {
  const t = i18n.t.bind(i18n);
  if (e instanceof ValidationError) {
    const first = e.issues[0];
    // Nested paths ("links.0.url") are reported against their top-level field.
    const path = first?.path?.split(".")[0] ?? "";
    const field = path ? t(`fields.${path}`) : "";
    return field ? `${field}: ${t(first.message)}` : t(first?.message ?? "validation.invalid");
  }
  const code = (e as { code?: string })?.code;
  if (code) {
    const key = `errors.${code.replace(/\./g, "_")}`;
    if (i18n.exists(key)) return t(key);
  }
  if (e instanceof PlatformError) return `${t("errors.generic")} (${e.message})`;
  const msg = e instanceof Error ? e.message : String(e);
  if (/UNIQUE constraint failed/i.test(msg)) return t("errors.duplicate");
  if (/FOREIGN KEY constraint failed/i.test(msg)) return t("errors.reference");
  return `${t("errors.generic")} (${msg})`;
}

/** Field → message map for forms. */
export function fieldErrors(e: unknown): Record<string, string> {
  const t = i18n.t.bind(i18n);
  if (!(e instanceof ValidationError)) return {};
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const path = i.path.split(".")[0];
    if (!out[path]) out[path] = t(i.message);
  }
  return out;
}

/** "report.pdf: The file is open in another program" for a per-file import failure. */
export function fileFailureMessage(f: { name: string; errorCode?: string | null; error?: string | null }): string {
  const t = i18n.t.bind(i18n);
  const key = f.errorCode ? `errors.${f.errorCode.replace(/\./g, "_")}` : null;
  const reason = key && i18n.exists(key) ? t(key) : f.error ? `${t("errors.generic")} (${f.error})` : t("errors.generic");
  return `${f.name}: ${reason}`;
}
