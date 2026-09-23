/**
 * Background work while the app is open: notification scans (with OS delivery), scheduled
 * backups, missing-file checks and continuous Workspace availability monitoring.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useSettings } from "@/app/settings";
import { useWorkspace } from "@/app/workspace";
import { invalidateAll } from "@/app/query";
import { backupApi, desktopNotify, logApi, workspaceApi } from "@/platform/tauri";
import { notificationText } from "./notificationText";
import { toDateKey } from "@/core/utils/dates";

const MINUTE = 60_000;

export function BackgroundJobs() {
  const s = useServices();
  const { t } = useTranslation();
  const running = React.useRef({ scan: false, backup: false, health: false });

  const scan = React.useCallback(async () => {
    if (running.current.scan) return;
    running.current.scan = true;
    try {
      const st = useSettings.getState().settings;
      const prefs = { ...st.notifications, lastBackupAt: st.backup.lastBackupAt };
      const created = await s.notifications.scan(prefs);
      if (created.length) {
        void invalidateAll();
        if (prefs.desktop) {
          for (const n of created.slice(0, 5)) {
            const txt = notificationText(n);
            // Only mark as delivered when the OS accepted the notification.
            if (await desktopNotify.send(txt.title, txt.body)) await s.notifications.markOsDelivered(n.id);
          }
        }
      }
    } catch (e) {
      void logApi.write("error", `Notification scan failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      running.current.scan = false;
    }
  }, [s]);

  const autoBackup = React.useCallback(async () => {
    const st = useSettings.getState();
    const b = st.settings.backup;
    if (!b.autoEnabled || running.current.backup) return;
    const last = b.lastBackupAt ? new Date(b.lastBackupAt).getTime() : 0;
    if (Date.now() - last < b.intervalDays * 24 * 60 * MINUTE) return;
    const hasData = (await s.db.query<{ n: number }>("SELECT (SELECT COUNT(*) FROM subjects) + (SELECT COUNT(*) FROM notes) + (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM files) AS n"))[0]?.n ?? 0;
    if (!hasData) return;
    running.current.backup = true;
    try {
      const info = await backupApi.create(b.kind, "auto");
      st.update({ backup: { lastBackupAt: new Date().toISOString(), lastBackupFile: info.fileName, lastError: null } });
      await backupApi.prune("auto", b.keep).catch(() => 0);
      toast.success(t("backup.autoDone"));
      void invalidateAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      st.update({ backup: { lastError: msg } });
      await s.notifications.push([
        { category: "backup", title: "notif.backupFailed", params: { error: msg.slice(0, 200) }, entityType: null, entityId: null, route: "/backup", dedupeKey: `backup-failed:${toDateKey(new Date())}`, triggerAt: new Date().toISOString() },
      ]);
      void invalidateAll();
    } finally {
      running.current.backup = false;
    }
  }, [s, t]);

  const missingFiles = React.useCallback(async () => {
    const today = toDateKey(new Date());
    if ((await s.kv.get<string>("lastMissingCheck")) === today) return;
    try {
      const missing = await s.files.findMissing();
      await s.kv.set("lastMissingCheck", today);
      if (missing.length) {
        await s.notifications.push([
          { category: "file", title: "notif.filesMissing", params: { count: missing.length }, entityType: null, entityId: null, route: "/files?view=missing", dedupeKey: `files-missing:${today}:${missing.length}`, triggerAt: new Date().toISOString() },
        ]);
        void invalidateAll();
      }
    } catch (e) {
      void logApi.write("warn", `Missing-file check failed: ${String(e)}`);
    }
  }, [s]);

  /** If the workspace disappears while the app is open (USB unplugged…), block usage. */
  const health = React.useCallback(async () => {
    const ws = useWorkspace.getState();
    const path = ws.info?.path;
    if (!path || running.current.health) return;
    running.current.health = true;
    try {
      const c = await workspaceApi.check(path);
      if (c.status !== "ok" && c.status !== "database_corrupt") {
        void logApi.write("error", `Workspace became unavailable: ${c.status}`);
        await workspaceApi.close().catch(() => undefined);
        useWorkspace.setState({ phase: "recovery", check: c });
      }
    } catch {
      /* ignore transient errors */
    } finally {
      running.current.health = false;
    }
  }, []);

  React.useEffect(() => {
    void desktopNotify.permission();
    const first = setTimeout(() => {
      void scan();
      void missingFiles();
    }, 3000);
    const firstBackup = setTimeout(() => void autoBackup(), 30_000);
    const a = setInterval(() => void scan(), MINUTE);
    const b = setInterval(() => void autoBackup(), 30 * MINUTE);
    const c = setInterval(() => void health(), 20_000);
    const d = setInterval(() => void missingFiles(), 60 * MINUTE);
    return () => {
      clearTimeout(first);
      clearTimeout(firstBackup);
      [a, b, c, d].forEach(clearInterval);
    };
  }, [scan, autoBackup, health, missingFiles]);

  return null;
}
