import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw, FolderOpen, FolderSearch, FolderPlus, DatabaseBackup, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { OnboardingFrame } from "./WorkspaceSelect";
import { useWorkspace } from "@/app/workspace";
import { workspaceApi, backupApi, dialogs, type BackupInfo } from "@/platform/tauri";
import { confirm } from "@/app/confirm";
import { errorMessage } from "@/lib/errors";
import { fmtDateTime, fmtBytes } from "@/lib/format";

/**
 * Shown whenever the remembered Workspace cannot be used. Normal usage stays blocked and
 * nothing is created silently; the user decides how to proceed.
 */
export function RecoveryScreen() {
  const { t } = useTranslation();
  const { check, retry, openChecked } = useWorkspace();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [backups, setBackups] = React.useState<BackupInfo[]>([]);
  const path = check?.path ?? "";

  React.useEffect(() => {
    if (path && check?.backups.length) backupApi.listAt(path).then(setBackups).catch(() => setBackups([]));
  }, [path, check?.backups.length]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const openOther = (title: string) =>
    run("open", async () => {
      const p = await dialogs.pickFolder(title);
      if (!p) return;
      const c = await workspaceApi.check(p);
      if (c.status !== "ok") {
        setError(`${t(`workspace.status.${c.status}`)} — ${p}`);
        return;
      }
      await openChecked(await workspaceApi.open(p));
    });

  const selectAnother = () =>
    run("select", async () => {
      const p = await dialogs.pickFolder(t("recovery.selectAnother"));
      if (!p) return;
      const c = await workspaceApi.check(p);
      if (c.status === "ok") return void (await openChecked(await workspaceApi.open(p)));
      if (c.status === "not_a_workspace") {
        const empty = await workspaceApi.isDirEmpty(p);
        const ok = await confirm({
          title: t("recovery.createInFolderTitle"),
          description: empty ? t("recovery.createInFolderBody", { path: p }) : t("onboarding.nonEmptyBody", { path: p }),
          confirmLabel: t("onboarding.createConfirm"),
        });
        if (ok) await openChecked(await workspaceApi.create(p, "University Workspace", true));
        return;
      }
      setError(`${t(`workspace.status.${c.status}`)} — ${p}`);
    });

  const createNew = () => useWorkspace.setState({ phase: "select", selectReason: "switch" });

  const restore = (b: BackupInfo) =>
    run(`restore:${b.path}`, async () => {
      const ok = await confirm({
        title: t("recovery.restoreTitle"),
        description: t("recovery.restoreBody", { date: b.manifest ? fmtDateTime(b.manifest.createdAt) : b.fileName }),
        confirmLabel: t("backup.restore"),
        danger: true,
      });
      if (!ok) return;
      await openChecked(await backupApi.restoreAt(path, b.path));
    });

  const initDb = () =>
    run("init", async () => {
      const ok = await confirm({ title: t("recovery.initDbTitle"), description: t("recovery.initDbBody"), confirmLabel: t("recovery.initDb"), danger: true, typeToConfirm: "OK" });
      if (ok) await openChecked(await workspaceApi.initDatabase(path));
    });

  return (
    <OnboardingFrame>
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning/12 text-warning">
          <AlertTriangle className="size-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("recovery.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("recovery.lead")}</p>
        </div>
      </div>

      <div className="card mt-6 p-4">
        <div className="text-xs text-subtle">{t("recovery.previousPath")}</div>
        <div className="mt-1 break-all font-mono text-sm" dir="ltr" data-testid="recovery-path">
          {path}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="warning">{t(`workspace.status.${check?.status ?? "missing"}`)}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted">{t(`recovery.reason.${check?.status ?? "missing"}`)}</p>
        {check?.detail && (
          <details className="mt-2 text-xs text-subtle">
            <summary className="cursor-pointer select-none">{t("recovery.technicalDetails")}</summary>
            <p className="mt-1 break-all font-mono" dir="ltr">{check.detail}</p>
          </details>
        )}
      </div>

      {error && <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button variant="primary" size="lg" loading={busy === "retry"} onClick={() => run("retry", retry)} data-testid="recovery-retry">
          <RefreshCw /> {t("recovery.retry")}
        </Button>
        <Button size="lg" loading={busy === "open"} onClick={() => openOther(t("recovery.openExisting"))}>
          <FolderOpen /> {t("recovery.openExisting")}
        </Button>
        <Button size="lg" loading={busy === "select"} onClick={selectAnother}>
          <FolderSearch /> {t("recovery.selectAnother")}
        </Button>
        <Button size="lg" onClick={createNew}>
          <FolderPlus /> {t("recovery.createNew")}
        </Button>
      </div>

      {check?.status === "database_missing" && (
        <div className="card mt-6 p-4">
          <p className="text-sm font-medium">{t("recovery.initDbTitle")}</p>
          <p className="mt-1 text-xs text-muted">{t("recovery.initDbHint")}</p>
          <Button className="mt-3" variant="danger" size="sm" loading={busy === "init"} onClick={initDb}>
            <DatabaseZap /> {t("recovery.initDb")}
          </Button>
        </div>
      )}

      {backups.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            <DatabaseBackup className="size-3.5" /> {t("recovery.backupsFound")}
          </h2>
          <ul className="space-y-1.5">
            {backups
              .filter((b) => b.manifest && b.manifest.kind !== "attachments")
              .slice(0, 8)
              .map((b) => (
                <li key={b.path} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{b.manifest ? fmtDateTime(b.manifest.createdAt) : b.fileName}</div>
                    <div className="text-xs text-subtle">
                      {b.manifest && t(`backup.kind.${b.manifest.kind}`)} · {fmtBytes(b.size)}
                    </div>
                  </div>
                  <Button size="sm" loading={busy === `restore:${b.path}`} onClick={() => restore(b)}>
                    {t("backup.restore")}
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </OnboardingFrame>
  );
}
