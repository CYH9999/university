import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ArrowLeftRight, FileJson, FileSpreadsheet, FileText, Upload, FileArchive, FolderSearch, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, CardHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { useServices } from "@/app/services";
import { invalidateAll } from "@/app/query";
import { confirm } from "@/app/confirm";
import { flushEverything } from "@/app/workspace";
import { dialogs, openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { EXPORT_TABLES, EXPORT_MODULES, type ImportReport } from "@/core/services/dataio";

const stamp = () => new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);

export function DataPage() {
  const { t } = useTranslation();
  const s = useServices();
  const [modules, setModules] = React.useState<string[]>(Object.keys(EXPORT_MODULES));
  const [table, setTable] = React.useState<string>("tasks");
  const [noteFormat, setNoteFormat] = React.useState<"md" | "html">("md");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{ name: string; data: unknown; counts: Record<string, number>; errors: string[] } | null>(null);
  const [mode, setMode] = React.useState<"merge" | "replace">("merge");
  const [report, setReport] = React.useState<ImportReport | null>(null);

  const done = (rel: string, msg: string) => toast.success(msg, { description: rel, action: { label: t("files.reveal"), onClick: () => void openApi.reveal(rel) } });
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await flushEverything();
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const exportJson = () =>
    run("json", async () => {
      const bundle = await s.dataio.exportJson(modules);
      const rel = await s.ctx.fs.writeText(`Exports/Data/unios-export-${stamp()}.json`, JSON.stringify(bundle, null, 2));
      done(rel, t("data.exported"));
    });
  const exportCsv = (all: boolean) =>
    run("csv", async () => {
      const dir = `Exports/CSV/${stamp()}`;
      const tables = all ? [...EXPORT_TABLES] : [table];
      for (const tb of tables) await s.ctx.fs.writeText(`${dir}/${tb}.csv`, await s.dataio.tableCsv(tb));
      done(dir, t("data.csvExported", { count: tables.length }));
    });
  const exportNotes = () =>
    run("notes", async () => {
      const files = await s.dataio.notesAsFiles(noteFormat, document.dir === "rtl" ? "rtl" : "ltr");
      const dir = `Exports/Notes-${stamp()}`;
      for (const f of files) await s.ctx.fs.writeText(`${dir}/${f.name}`, f.content);
      if (!files.length) toast.info(t("data.noNotes"));
      else done(dir, t("data.notesExported", { count: files.length }));
    });

  const pickImport = async () => {
    const path = await dialogs.pickFile(t("data.chooseJson"), ["json"]);
    if (!path) return;
    await run("pick", async () => {
      const text = await openApi.readExternalText(path);
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw Object.assign(new Error(t("data.notJson")), { code: "json.invalid" });
      }
      const v = await s.dataio.validateBundle(data);
      setReport(null);
      setPending({ name: path.split(/[\\/]/).pop() ?? path, data, counts: v.counts, errors: v.errors });
    });
  };
  const doImport = async () => {
    if (!pending) return;
    if (mode === "replace" && !(await confirm({ title: t("data.replaceTitle"), description: t("data.replaceBody"), confirmLabel: t("data.import"), danger: true }))) return;
    await run("import", async () => {
      const r = await s.dataio.importBundle(pending.data, mode);
      setReport(r);
      if (r.ok) {
        await invalidateAll();
        toast.success(t("data.imported"));
      } else toast.error(t("data.importFailed"));
    });
  };

  return (
    <div>
      <PageHeader icon={<ArrowLeftRight />} title={t("nav.data")} description={t("data.lead")} />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("data.exportJson")} icon={<FileJson />} subtitle={t("data.exportJsonHint")} />
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.keys(EXPORT_MODULES).map((m) => (
                <Checkbox key={m} checked={modules.includes(m)} onCheckedChange={(v) => setModules((cur) => (v ? [...cur, m] : cur.filter((x) => x !== m)))} label={t(`data.modules.${m}`)} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setModules(Object.keys(EXPORT_MODULES))}>{t("common.selectAll")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setModules([])}>{t("common.selectNone")}</Button>
              <Button className="ms-auto" variant="primary" disabled={!modules.length} loading={busy === "json"} onClick={exportJson}><FileJson /> {t("data.export")}</Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("data.importJson")} icon={<Upload />} subtitle={t("data.importJsonHint")} />
          <div className="space-y-3 p-4">
            <Button onClick={pickImport} loading={busy === "pick"}><Upload /> {t("data.chooseJson")}</Button>
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              <Button variant="ghost" asChild><Link to="/files?upload=1"><Upload /> {t("data.importFiles")}</Link></Button>
              <Button variant="ghost" asChild><Link to="/backup"><FileArchive /> {t("data.importZip")}</Link></Button>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("data.exportCsv")} icon={<FileSpreadsheet />} subtitle={t("data.exportCsvHint")} />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <NativeSelect className="w-56" value={table} onChange={(e) => setTable(e.target.value)} options={EXPORT_TABLES.map((x) => ({ value: x, label: t(`data.tables.${x}`, { defaultValue: x }) }))} />
            <Button loading={busy === "csv"} onClick={() => exportCsv(false)}><FileSpreadsheet /> {t("data.export")}</Button>
            <Button variant="ghost" onClick={() => exportCsv(true)}>{t("data.exportAllCsv")}</Button>
          </div>
        </Card>
        <Card>
          <CardHeader title={t("data.exportNotes")} icon={<FileText />} subtitle={t("data.exportNotesHint")} />
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Segmented value={noteFormat} onChange={setNoteFormat} options={[{ value: "md", label: "Markdown" }, { value: "html", label: "HTML" }]} />
            <Button loading={busy === "notes"} onClick={exportNotes}><FileText /> {t("data.export")}</Button>
            <Button variant="ghost" className="ms-auto" onClick={() => void openApi.reveal("Exports")}><FolderSearch /> {t("data.openExports")}</Button>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t("data.zipTitle")} icon={<FileArchive />} subtitle={t("data.zipHint")} actions={<Button size="sm" asChild><Link to="/backup">{t("nav.backup")}</Link></Button>} />
        </Card>
      </div>

      <Modal
        open={!!pending}
        onOpenChange={(o) => !o && busy !== "import" && (setPending(null), setReport(null))}
        title={t("data.importPreview")}
        description={pending?.name}
        size="lg"
        footer={
          pending && (
            <>
              <Button variant="ghost" onClick={() => (setPending(null), setReport(null))}>{t("common.close")}</Button>
              {!report?.ok && <Button variant="primary" disabled={pending.errors.length > 0} loading={busy === "import"} onClick={doImport}><Upload /> {t("data.import")}</Button>}
            </>
          )
        }
      >
        {pending && (
          <div className="space-y-4">
            {pending.errors.length > 0 ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                <div className="flex items-center gap-2 font-medium"><XCircle className="size-4" /> {t("data.invalidFile")}</div>
                <ul className="mt-1 list-disc ps-5 text-xs">{pending.errors.map((e) => <li key={e}>{t(`data.errors.${e.split(":")[0].replace("import.", "")}`, { defaultValue: e })}{e.includes(":") ? ` (${e.split(":").slice(1).join(":")})` : ""}</li>)}</ul>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                  {Object.entries(pending.counts).filter(([, n]) => n > 0).map(([tb, n]) => (
                    <div key={tb} className="flex justify-between"><span className="text-muted">{t(`data.tables.${tb}`, { defaultValue: tb })}</span><span className="tabular-nums">{n}</span></div>
                  ))}
                </div>
                {!report && (
                  <div>
                    <div className="label">{t("data.mode")}</div>
                    <Segmented value={mode} onChange={setMode} options={[{ value: "merge", label: t("data.merge") }, { value: "replace", label: t("data.replace") }]} />
                    <p className="mt-1 text-xs text-subtle">{t(`data.${mode}Hint`)}</p>
                  </div>
                )}
              </>
            )}
            {report && (
              <div className={`rounded-md border p-3 text-sm ${report.ok ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"}`}>
                <div className="flex items-center gap-2 font-medium">{report.ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />} {report.ok ? t("data.importSummary") : t("data.importFailed")}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3">
                  {report.tables.map((r) => (
                    <div key={r.table} className="flex justify-between"><span className="text-muted">{t(`data.tables.${r.table}`, { defaultValue: r.table })}</span><span className="tabular-nums">{r.imported}/{r.received}{r.skipped ? ` · ${t("data.skipped", { count: r.skipped })}` : ""}</span></div>
                  ))}
                </div>
                {report.errors.map((e) => <p key={e} className="mt-1 text-xs text-danger">{e}</p>)}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
