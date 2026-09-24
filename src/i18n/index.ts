import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./en";
import { ar } from "./ar";

export type Lang = "ar" | "en";
export const LANGS: Lang[] = ["ar", "en"];

/** Keys that could not be resolved in any language (inspected by tests and the E2E run). */
export const missingKeys = new Set<string>();
const listeners = new Set<(key: string) => void>();

/** Subscribe to missing-key reports (the app forwards them to the workspace log). */
export function onMissingKey(fn: (key: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * Last-resort text for a key that has no translation: the final key segment turned into
 * words ("dashboard.noTasksToday" → "No tasks today"). A raw dotted key is never shown.
 */
export function humanizeKey(key: string): string {
  const last = key.split(".").filter(Boolean).pop() ?? key;
  const words = last
    .replace(PLURAL_SUFFIX, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

function reportMissing(key: string) {
  if (missingKeys.has(key)) return;
  missingKeys.add(key);
  if (import.meta.env?.DEV) console.warn(`[i18n] missing translation key: ${key}`);
  for (const fn of listeners) fn(key);
  if (typeof window !== "undefined") (window as unknown as { __i18nMissing?: string[] }).__i18nMissing = [...missingKeys];
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: "ar",
  fallbackLng: "en",
  supportedLngs: LANGS,
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  showSupportNotice: false,
  // Called only when a key resolves in no language (Arabic falls back to English first).
  parseMissingKeyHandler: (key: string, defaultValue?: string) => {
    if (defaultValue !== undefined && defaultValue !== key) return defaultValue;
    reportMissing(key);
    return humanizeKey(key);
  },
});

export function dirOf(lang: Lang): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

/** Switches language and document direction (RTL for Arabic). */
export function applyLanguage(lang: Lang) {
  void i18n.changeLanguage(lang);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }
}

export default i18n;
