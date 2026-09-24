import * as React from "react";
import { toast } from "sonner";
import { useSaveStatus } from "@/app/saveStatus";
import { invalidateAll } from "@/app/query";
import { errorMessage } from "@/lib/errors";

/**
 * Debounced autosave for detail pages: queues partial patches, saves them after a pause,
 * registers with the global save status and flushes on unmount / window close.
 */
export function useAutosave<T>(key: string, save: (patch: Partial<T>) => Promise<unknown>, delay = 800) {
  const pending = React.useRef<Partial<T> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = React.useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const saveRef = React.useRef(save);
  saveRef.current = save;

  const flush = React.useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState("saving");
    useSaveStatus.getState().begin();
    try {
      await saveRef.current(p);
      useSaveStatus.getState().end();
      if (!pending.current) {
        useSaveStatus.getState().markClean(key);
        setState("saved");
      }
      void invalidateAll();
    } catch (e) {
      pending.current = { ...p, ...(pending.current ?? {}) };
      useSaveStatus.getState().end(errorMessage(e));
      setState("error");
      toast.error(errorMessage(e));
    }
  }, [key]);

  const queue = React.useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...(pending.current ?? {}), ...patch };
      setState("unsaved");
      useSaveStatus.getState().markDirty(key, flush);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush, key],
  );

  React.useEffect(() => () => void flush(), [flush]);
  return { queue, flush, state };
}
