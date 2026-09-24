import i18n from "@/i18n";
import { DEFAULT_SCALES } from "@/core/grading/scales";

/** Built-in scales are stored with a fixed English name; show them in the UI language. */
const BUILTIN = new Map<string, string>(DEFAULT_SCALES.map((s) => [s.name, s.kind]));

export function scaleName(name: string | null | undefined): string {
  if (!name) return "—";
  const kind = BUILTIN.get(name);
  return kind ? i18n.t(`grades.builtinScales.${kind}`) : name;
}

/** Default band labels are bilingual ("امتياز · Excellent"); show the half for the UI language. */
export function gradeLabel(label: string | null | undefined): string {
  if (!label) return "";
  const m = /^(.+?) · (.+)$/.exec(label);
  if (m && /[؀-ۿ]/.test(m[1]) && !/[؀-ۿ]/.test(m[2])) return i18n.language === "ar" ? m[1] : m[2];
  return label;
}
