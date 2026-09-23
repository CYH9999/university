import { create } from "zustand";
import { settingsApi, pointerApi } from "@/platform/tauri";
import type { NotificationPrefs } from "@/core/services/notifications";
import { DEFAULT_NOTIFICATION_PREFS } from "@/core/services/notifications";
import type { Lang } from "@/i18n";

export type Theme = "dark" | "light" | "system";

export const DASHBOARD_WIDGETS = [
  "today",
  "nextLecture",
  "quickActions",
  "todayLectures",
  "deadlines",
  "tasksToday",
  "overdue",
  "questions",
  "recentNotes",
  "recentFiles",
  "projects",
  "goals",
  "attendance",
  "gpa",
  "study",
  "notifications",
] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export interface AppSettings {
  language: Lang;
  theme: Theme;
  accent: string;
  sidebarCollapsed: boolean;
  selectedSemesterId: string | null;
  dashboard: { order: DashboardWidget[]; hidden: DashboardWidget[] };
  notifications: NotificationPrefs;
  backup: { autoEnabled: boolean; intervalDays: number; keep: number; kind: "full" | "database"; lastBackupAt: string | null; lastBackupFile: string | null; lastError: string | null };
  timetable: { startHour: number; endHour: number; view: "week" | "day" | "compact"; showWeekend: boolean };
  defaultCurrency: string;
  onboardingDone: boolean;
  tourDone: boolean;
  focusMinutes: number;
  editorWidth: "narrow" | "wide";
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: "ar",
  theme: "dark",
  accent: "#2dd4bf",
  sidebarCollapsed: false,
  selectedSemesterId: null,
  dashboard: { order: [...DASHBOARD_WIDGETS], hidden: [] },
  notifications: DEFAULT_NOTIFICATION_PREFS,
  backup: { autoEnabled: true, intervalDays: 7, keep: 5, kind: "full", lastBackupAt: null, lastBackupFile: null, lastError: null },
  timetable: { startHour: 8, endHour: 18, view: "week", showWeekend: true },
  defaultCurrency: "IQD",
  onboardingDone: false,
  tourDone: false,
  focusMinutes: 25,
  editorWidth: "narrow",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Deep merge of plain objects (arrays are replaced). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out as T;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  saveError: string | null;
  load(): Promise<void>;
  update(patch: DeepPartial<AppSettings>): void;
  flush(): Promise<void>;
  reset(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void> | null = null;

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  saveError: null,
  async load() {
    const raw = await settingsApi.read();
    const merged = deepMerge(DEFAULT_SETTINGS, raw);
    // Keep the dashboard list complete when new widgets are added in updates.
    const order = merged.dashboard.order.filter((w) => (DASHBOARD_WIDGETS as readonly string[]).includes(w));
    for (const w of DASHBOARD_WIDGETS) if (!order.includes(w)) order.push(w);
    merged.dashboard.order = order;
    set({ settings: merged, loaded: true });
  },
  update(patch) {
    const next = deepMerge(get().settings, patch);
    set({ settings: next });
    if (patch.language || patch.theme) void pointerApi.setUi({ language: next.language, theme: next.theme }).catch(() => undefined);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), 250);
  },
  async flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!get().loaded) return;
    const write = settingsApi
      .write(get().settings as unknown as Record<string, unknown>)
      .then(() => set({ saveError: null }))
      .catch((e: unknown) => set({ saveError: e instanceof Error ? e.message : String(e) }));
    pending = write;
    await write;
    if (pending === write) pending = null;
  },
  reset() {
    set({ settings: DEFAULT_SETTINGS, loaded: false });
  },
}));

export function hexToRgbTriplet(hex: string): string | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}`;
}

/** Applies theme + accent color to the document. */
export function applyTheme(theme: Theme, accent: string) {
  const dark = theme === "system" ? window.matchMedia("(prefers-color-scheme: dark)").matches : theme === "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  const rgb = hexToRgbTriplet(accent);
  if (rgb) root.style.setProperty("--accent", rgb);
  // Readable text on the accent color.
  if (rgb) {
    const [r, g, b] = rgb.split(" ").map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.style.setProperty("--accent-fg", lum > 0.6 ? "4 24 22" : "255 255 255");
  }
}
