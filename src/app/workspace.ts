/**
 * Workspace lifecycle for the UI. Normal usage is only possible in the "ready" phase,
 * i.e. after a valid, readable/writable Workspace has been opened and migrated.
 */
import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isDesktop,
  pointerApi,
  workspaceApi,
  backupApi,
  logApi,
  type WorkspaceCheck,
  type WorkspaceInfo,
} from "@/platform/tauri";
import { applyLanguage, type Lang } from "@/i18n";
import { getServices } from "./services";
import { useSettings, applyTheme, type Theme } from "./settings";
import { useSaveStatus } from "./saveStatus";
import { queryClient } from "./query";

export type Phase = "booting" | "no-desktop" | "select" | "recovery" | "opening" | "onboarding" | "ready" | "error";

interface WorkspaceState {
  phase: Phase;
  check: WorkspaceCheck | null;
  info: WorkspaceInfo | null;
  error: string | null;
  openingStep: string | null;
  /** Why the selection screen is shown: first launch, switch or disconnect. */
  selectReason: "first" | "switch" | "disconnected";
  boot(): Promise<void>;
  retry(): Promise<void>;
  openChecked(check: WorkspaceCheck): Promise<void>;
  refreshInfo(): Promise<void>;
  closeWorkspace(reason: "switch" | "disconnected"): Promise<void>;
  finishOnboarding(): void;
}

async function prepareUi() {
  try {
    const p = await pointerApi.read();
    const lang = (p.ui.language as Lang) ?? "ar";
    const theme = (p.ui.theme as Theme) ?? "dark";
    applyLanguage(lang === "en" ? "en" : "ar");
    applyTheme(theme, "#2dd4bf");
  } catch {
    applyLanguage("ar");
  }
}

/** Saves every pending edit and the settings file. Used before switching/closing. */
export async function flushEverything() {
  await useSaveStatus.getState().flushAll();
  await useSettings.getState().flush();
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  phase: "booting",
  check: null,
  info: null,
  error: null,
  openingStep: null,
  selectReason: "first",

  async boot() {
    if (!isDesktop()) {
      set({ phase: "no-desktop" });
      return;
    }
    await prepareUi();
    await get().retry();
  },

  async retry() {
    set({ phase: "booting", error: null });
    try {
      const check = await workspaceApi.startup();
      if (check.status === "not_configured") {
        set({ phase: "select", check, selectReason: "first" });
      } else if (check.status !== "ok") {
        set({ phase: "recovery", check });
        void logApi.write("warn", `Workspace unavailable at startup: ${check.status} ${check.detail ?? ""}`);
      } else {
        await get().openChecked(check);
      }
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  /** Continues after the Rust side has opened a valid workspace: migrate, load settings, go. */
  async openChecked(check) {
    if (check.status !== "ok") {
      set({ phase: "recovery", check });
      return;
    }
    set({ phase: "opening", check, openingStep: "database" });
    const s = getServices();
    try {
      const pending = await s.pendingMigrations();
      const version = await s.db.query<{ n: number }>("SELECT COUNT(*) AS n FROM schema_migrations");
      if (pending.length && (version[0]?.n ?? 0) > 0) {
        // Never migrate an existing database without a safety copy.
        set({ openingStep: "safety" });
        await backupApi.create("database", "pre-migration");
      }
      set({ openingStep: "migrate" });
      const res = await s.migrate();
      if (res.applied.length) void logApi.write("info", `Applied migrations: ${res.applied.join(", ")}`);
      set({ openingStep: "settings" });
      await useSettings.getState().load();
      const st = useSettings.getState().settings;
      applyLanguage(st.language);
      applyTheme(st.theme, st.accent);
      void pointerApi.setUi({ language: st.language, theme: st.theme }).catch(() => undefined);
      const info = await workspaceApi.info();
      queryClient.clear();
      set({ info, phase: st.onboardingDone ? "ready" : "onboarding", openingStep: null });
      // Routine maintenance (non-blocking).
      void (async () => {
        await s.tasks.rollover().catch(() => 0);
        await s.recent.prune().catch(() => undefined);
        await s.audit.prune().catch(() => undefined);
        await s.notifications.prune().catch(() => 0);
      })();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      void logApi.write("error", `Opening workspace failed: ${msg}`);
      await workspaceApi.close().catch(() => undefined);
      set({ phase: "error", error: msg, openingStep: null });
    }
  },

  async refreshInfo() {
    try {
      set({ info: await workspaceApi.info() });
    } catch {
      /* ignore */
    }
  },

  async closeWorkspace(reason) {
    await flushEverything();
    await workspaceApi.close();
    queryClient.clear();
    useSettings.getState().reset();
    set({ phase: "select", info: null, selectReason: reason });
  },

  finishOnboarding() {
    useSettings.getState().update({ onboardingDone: true });
    set({ phase: "ready" });
  },
}));

/** Flush all pending edits before the window closes. */
export function installCloseGuard() {
  if (!isDesktop()) return;
  void getCurrentWindow().onCloseRequested(async () => {
    try {
      await flushEverything();
      await workspaceApi.close();
    } catch {
      /* closing must never be blocked forever */
    }
  });
}

export async function exitApp() {
  await flushEverything().catch(() => undefined);
  await getCurrentWindow().close();
}
