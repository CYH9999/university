import { create } from "zustand";

/**
 * Tracks unsaved edits across the app (editors register a flush function) so the UI can
 * show "Saving… / Saved / Unsaved" and everything can be flushed before the window closes
 * or the workspace is switched.
 */
type Flusher = () => Promise<void>;

interface SaveState {
  pending: Record<string, Flusher>;
  saving: number;
  lastSavedAt: number | null;
  error: string | null;
  markDirty(key: string, flush: Flusher): void;
  markClean(key: string): void;
  begin(): void;
  end(error?: string | null): void;
  flushAll(): Promise<void>;
}

export const useSaveStatus = create<SaveState>((set, get) => ({
  pending: {},
  saving: 0,
  lastSavedAt: null,
  error: null,
  markDirty(key, flush) {
    set((s) => ({ pending: { ...s.pending, [key]: flush } }));
  },
  markClean(key) {
    set((s) => {
      if (!(key in s.pending)) return s;
      const next = { ...s.pending };
      delete next[key];
      return { pending: next };
    });
  },
  begin() {
    set((s) => ({ saving: s.saving + 1 }));
  },
  end(error = null) {
    set((s) => ({ saving: Math.max(0, s.saving - 1), lastSavedAt: error ? s.lastSavedAt : Date.now(), error }));
  },
  async flushAll() {
    const flushers = Object.values(get().pending);
    for (const f of flushers) {
      try {
        await f();
      } catch {
        /* errors are surfaced by the editor itself */
      }
    }
  },
}));

export function saveState(s: Pick<SaveState, "pending" | "saving" | "error">): "saving" | "unsaved" | "error" | "saved" {
  if (s.saving > 0) return "saving";
  if (s.error) return "error";
  if (Object.keys(s.pending).length) return "unsaved";
  return "saved";
}
