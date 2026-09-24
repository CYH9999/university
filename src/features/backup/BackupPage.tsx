import * as React from "react";
import { useTranslation } from "react-i18next";
import { DatabaseBackup, Archive, Database, Paperclip, ShieldCheck, RotateCcw, Trash2, FolderSearch, FileArchive, Download, CheckCircle2, XCircle, AlertTriangle, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, CardHeader, EmptyState, Stat } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Field, NativeSelect } from "@/components/ui/input";
import { Badge, Checkbox, Switch, Spinner } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { useQ } from "@/app/query";
import { useSettings } from "@/app/settings";
import { useWorkspace, flushEverything } from "@/app/workspace";
import { confirm } from "@/app/confirm";
import { backupApi, dialogs, openApi, type BackupInfo, type BackupKind, type ValidationReport } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { formatBytes } from "@/core/utils/text";
import { fmtDateTime, fmtRelative } from "@/lib/format";

const KIND_ICON = { full: Archive, database: Database, attachments: Paperclip } as const;

function reveal(path: string) {
  void openApi.externalPath(path).catch((e) => toast.error(errorMessage(e)));
}

export function BackupPage() {
  const { t } = useTranslation();
  const backup = useSettings((s) => s.settings.backup);
  const update = useSettings((s) => s.update);
  const info = useWorkspace((w) => w.info);
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [inspect, setInspect] = React.useState<{ path: string; report: ValidationReport | null; external: boolean } | null>(null);
  const { data: list = [], isLoading, refetch } = useQ(["backups"], () => backupApi.list());

  const create = async (kind: BackupKind) => {
    setBusy(kind);
    try {
      await flushEverything();
      const r = await backupApi.create(kind, label.trim() || "manual");
      // Only claim success after the archive was written and renamed into place.
      update({ backup: { lastBackupAt: new Date().toISOString(), lastBackupFile: r.fileName, lastError: null } });
      toast.success(t("backup.created", { size: formatBytes(r.size) }), { action: { label: t("files.reveal"), onClick: () => reveal(r.path) } });
      setLabel("");
      await refetch();
    } catch (e) {
      update({ backup: { lastError: errorMessage(e) } });
      toast.error(`${t("backup.failed")}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const exportZip = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = await dialogs.saveFile(t("backup.exportZip"), `UniOS-Workspace-${stamp}.zip`, ["zip"]);
    if (!dest) return;
    setBusy("export");
    try {
      await flushEverything();
      const r = await backupApi.create("full", "export", dest);
      toast.success(t("backup.exported", { size: formatBytes(r.size) }), { action: { label: t("files.reveal"), onClick: () => reveal(r.path) } });
    } catch (e) {
      toast.error(`${t("backup.failed")}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const openInspect = async (path: string, external: boolean) => {
    setInspect({ path, report: null, external });
    try {
      setInspect({ path, report: await backupApi.inspect(path), external });
    } catch (e) {
      toast.error(errorMessage(e));
      setInspect(null);
    }
  };

  const importFromOther = async () => {
    const zip = await dialogs.pickFile(t("backup.chooseArchive"), ["zip"]);
    if (zip) await openInspect(zip, true);
  };

  const remove = async (b: BackupInfo) => {
    if (!(await confirm({ title: t("backup.deleteTitle"), description: t("backup.deleteBody", { name: b.fileName }), confirmLabel: t("common.delete"), danger: true }))) return;
    try {
      await backupApi.remove(b.fileName);
      await refetch();
      toast.success(t("toast.deleted"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const ageDays = backup.lastBackupAt ? Math.floor((Date.now() - new Date(backup.lastBackupAt).getTime()) / 86400000) : null;

  return (
    <div>
      <PageHeader
        icon={<DatabaseBackup />}
        title={t("nav.backup")}
        description={t("backup.lead")}
        actions={
          <>
            <Button onClick={importFromOther}><FileArchive /> {t("backup.importOther")}</Button>
            <Button onClick={exportZip} loading={busy === "export"}><Download /> {t("backup.exportZip")}</Button>
          </>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("backup.last")} value={backup.lastBackupAt ? fmtRelative(backup.lastBackupAt) : t("backup.never")} tone={ageDays === null || ageDays > backup.intervalDays ? "warning" : "success"} hint={backup.lastBackupFile ?? undefined} />
          <Stat label={t("backup.count")} value={list.length} />
          <Stat label={t("backup.totalSize")} value={formatBytes(list.reduce((a, b) => a + b.size, 0))} />
          <Stat label={t("backup.location")} value={<span className="block truncate font-mono text-xs" dir="ltr">{info?.path ? `${info.path}/Backups` : "—"}</span>} />
        </div>
        {backup.lastError && (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("backup.lastFailed")}: {backup.lastError}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t("backup.createTitle")} icon={<ShieldCheck />} />
            <div className="space-y-3 p-4">
              <Field label={t("backup.label")} hint={t("backup.labelHint")}>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("backup.labelPlaceholder")} />
              </Field>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["full", "database", "attachments"] as BackupKind[]).map((k) => {
                  const Icon = KIND_ICON[k];
                  return (
                    <Button key={k} variant={k === "full" ? "primary" : "secondary"} loading={busy === k} disabled={!!busy} onClick={() => create(k)} className="h-auto flex-col gap-1 py-3">
                      <Icon className="size-5" />
                      <span>{t(`backup.kind.${k}`)}</span>
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-subtle">{t("backup.kindsHint")}</p>
            </div>
          </Card>
          <Card>
            <CardHeader title={t("backup.autoTitle")} icon={<DatabaseBackup />} />
            <div className="space-y-3 p-4">
              <Switch checked={backup.autoEnabled} onCheckedChange={(v) => update({ backup: { autoEnabled: v } })} label={t("backup.autoEnabled")} description={t("backup.autoHint")} />
              <div className="grid grid-cols-3 gap-3">
                <Field label={t("backup.interval")}>
                  <NativeSelect value={String(backup.intervalDays)} onChange={(e) => update({ backup: { intervalDays: Number(e.target.value) } })} options={[1, 3, 7, 14, 30].map((d) => ({ value: String(d), label: t("reminders.days", { count: d }) }))} />
                </Field>
                <Field label={t("backup.keep")}>
                  <NativeSelect value={String(backup.keep)} onChange={(e) => update({ backup: { keep: Number(e.target.value) } })} options={[3, 5, 10, 20].map((n) => ({ value: String(n), label: String(n) }))} />
                </Field>
                <Field label={t("backup.autoKind")}>
                  <NativeSelect value={backup.kind} onChange={(e) => update({ backup: { kind: e.target.value as "full" } })} options={[{ value: "full", label: t("backup.kind.full") }, { value: "database", label: t("backup.kind.database") }]} />
                </Field>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title={t("backup.listTitle")} icon={<Archive />} />
          {isLoading ? (
            <div className="flex justify-center p-6"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState compact icon={<Archive />} title={t("backup.empty")} description={t("backup.emptyHint")} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-2 text-start font-medium">{t("backup.date")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("backup.type")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("backup.label")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("files.size")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("backup.files")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((b) => {
                  const Icon = b.manifest ? KIND_ICON[b.manifest.kind] : AlertTriangle;
                  return (
                    <tr key={b.path}>
                      <td className="px-4 py-2">
                        <div>{b.manifest ? fmtDateTime(b.manifest.createdAt) : fmtDateTime(new Date(b.modified).toISOString())}</div>
                        <div className="truncate font-mono text-[10px] text-subtle" dir="ltr">{b.fileName}</div>
                      </td>
                      <td className="px-3 py-2">{b.manifest ? <Badge><Icon className="size-3" /> {t(`backup.kind.${b.manifest.kind}`)}</Badge> : <Badge tone="danger">{t("backup.unreadable")}</Badge>}</td>
                      <td className="px-3 py-2 text-xs text-muted">{b.manifest?.label ?? "—"}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{formatBytes(b.size)}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{b.manifest?.files.length ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openInspect(b.path, false)}><ShieldCheck /> {t("backup.validate")}</Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => reveal(b.path)} aria-label={t("files.reveal")}><FolderSearch /></Button>
                          <Button size="icon-sm" variant="ghost" onClick={() => remove(b)} aria-label={t("common.delete")}><Trash2 /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <InspectModal state={inspect} onClose={() => setInspect(null)} />
    </div>
  );
}

function InspectModal({ state, onClose }: { state: { path: string; report: ValidationReport | null; external: boolean } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [safety, setSafety] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const report = state?.report;
  const m = report?.manifest;

  const restoreCurrent = async () => {
    if (!state || !report?.valid) return;
    const ok = await confirm({
      title: t("backup.restoreTitle"),
      description: (
        <div className="space-y-2">
          <p>{t("backup.restoreWarning", { kind: m ? t(`backup.kind.${m.kind}`) : "" })}</p>
          <p>{safety ? t("backup.safetyWillRun") : t("backup.noSafety")}</p>
        </div>
      ),
      confirmLabel: t("backup.restore"),
      danger: true,
      typeToConfirm: t("backup.restoreWord"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await flushEverything();
      if (safety) await backupApi.create("full", "pre-restore");
      const r = await backupApi.restoreCurrent(state.path);
      toast.success(t("backup.restored", { folder: r.previousDataRel }), { duration: 10000 });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(`${t("backup.restoreFailed")}: ${errorMessage(e)}`);
      setBusy(false);
    }
  };

  const restoreNew = async () => {
    if (!state || !report?.valid) return;
    const target = await dialogs.pickFolder(t("backup.chooseEmptyFolder"));
    if (!target) return;
    setBusy(true);
    try {
      await flushEverything();
      await backupApi.restoreNew(state.path, target);
      toast.success(t("backup.restoredNew"));
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`${t("backup.restoreFailed")}: ${errorMessage(e)}`);
      setBusy(false);
    }
  };

  const counts = (report?.tableCounts ?? []).filter(([, n]) => n > 0);
  return (
    <Modal
      open={!!state}
      onOpenChange={(o) => !o && !busy && onClose()}
      size="lg"
      title={t("backup.previewTitle")}
      description={state?.path}
      footer={
        report && (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.close")}</Button>
            <Button onClick={restoreNew} disabled={!report.valid || busy || m?.kind === "attachments"}><FolderPlus /> {t("backup.restoreToNew")}</Button>
            <Button variant="danger" onClick={restoreCurrent} loading={busy} disabled={!report.valid}><RotateCcw /> {t("backup.restoreCurrent")}</Button>
          </>
        )
      }
    >
      {!report ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><Spinner /> {t("backup.validating")}</div>
      ) : (
        <div className="space-y-4">
          <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${report.valid ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger"}`}>
            {report.valid ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {report.valid ? t("backup.validReport", { files: report.checkedFiles }) : t("backup.invalidReport")}
          </div>
          {report.errors.length > 0 && (
            <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto ps-5 text-xs text-danger">
              {report.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {m && (
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">{t("backup.workspace")}</dt><dd>{m.workspaceName}</dd>
              <dt className="text-muted">{t("backup.type")}</dt><dd>{t(`backup.kind.${m.kind}`)}</dd>
              <dt className="text-muted">{t("backup.date")}</dt><dd>{fmtDateTime(m.createdAt)}</dd>
              <dt className="text-muted">{t("backup.appVersion")}</dt><dd>{m.appVersion} · {t("backup.schema", { v: m.schemaVersion ?? "—" })}</dd>
              <dt className="text-muted">{t("files.size")}</dt><dd>{formatBytes(m.totalSize)} · {t("backup.fileCount", { count: m.files.length })}</dd>
              <dt className="text-muted">{t("backup.database")}</dt><dd>{report.databaseOk === null ? "—" : report.databaseOk ? t("backup.dbOk") : t("backup.dbBad")}</dd>
            </dl>
          )}
          {counts.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-subtle">{t("backup.contents")}</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                {counts.map(([table, n]) => (
                  <div key={table} className="flex justify-between"><span className="font-mono text-muted" dir="ltr">{table}</span><span className="tabular-nums">{n}</span></div>
                ))}
              </div>
            </div>
          )}
          {report.valid && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
              <p className="mb-2 text-warning">{t("backup.beforeRestore")}</p>
              <Checkbox checked={safety} onCheckedChange={setSafety} label={t("backup.safetyFirst")} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

