import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Settings, FolderOpen, ShieldCheck, RefreshCw, LogOut, Replace, Pencil, Trash2, Plus, Star, ScrollText, Search, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, CardHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Field, NativeSelect } from "@/components/ui/input";
import { Switch, ColorPicker, Segmented, Badge, Spinner } from "@/components/ui/controls";
import { Tabs, Modal } from "@/components/ui/overlay";
import { useSettings, applyTheme, DEFAULT_SETTINGS, type Theme } from "@/app/settings";
import { useWorkspace } from "@/app/workspace";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { confirm, promptText } from "@/app/confirm";
import { applyLanguage, type Lang } from "@/i18n";
import { workspaceApi, logApi, desktopNotify, type IntegrityReport } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { fmtDateTime, fmtBytes } from "@/lib/format";
import { CURRENCIES, NOTIFICATION_CATEGORIES } from "@/core/model/enums";
import type { GradingScale } from "@/core/model/types";
import { scaleName, gradeLabel } from "@/lib/grading";

const TABS = ["general", "workspace", "notifications", "grading", "tags", "maintenance", "privacy"] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as string) : "general";
  return (
    <div>
      <PageHeader icon={<Settings />} title={t("nav.settings")} description={t("settings.lead")}>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} tabs={TABS.map((x) => ({ value: x, label: t(`settings.tabs.${x}`) }))} listClassName="border-b-0" />
      </PageHeader>
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        {tab === "general" && <General />}
        {tab === "workspace" && <WorkspaceTab />}
        {tab === "notifications" && <Notifications />}
        {tab === "grading" && <Grading />}
        {tab === "tags" && <TagsTab />}
        {tab === "maintenance" && <Maintenance />}
        {tab === "privacy" && <Privacy />}
      </div>
    </div>
  );
}

function General() {
  const { t } = useTranslation();
  const st = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  return (
    <>
      <Card>
        <CardHeader title={t("settings.appearance")} />
        <div className="space-y-4 p-4">
          <Field label={t("settings.language")}>
            <Segmented value={st.language} onChange={(l: Lang) => { update({ language: l }); applyLanguage(l); }} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} />
          </Field>
          <Field label={t("settings.theme")}>
            <Segmented value={st.theme} onChange={(th: Theme) => { update({ theme: th }); applyTheme(th, st.accent); }} options={(["dark", "light", "system"] as Theme[]).map((x) => ({ value: x, label: t(`settings.themes.${x}`) }))} />
          </Field>
          <Field label={t("settings.accent")}>
            <ColorPicker value={st.accent} onChange={(c) => { if (!c) return; update({ accent: c }); applyTheme(st.theme, c); }} />
          </Field>
          <Field label={t("settings.editorWidth")}>
            <Segmented value={st.editorWidth} onChange={(v) => update({ editorWidth: v })} options={[{ value: "narrow", label: t("notes.narrow") }, { value: "wide", label: t("notes.wide") }]} />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("settings.preferences")} />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label={t("settings.defaultCurrency")}>
            <NativeSelect value={st.defaultCurrency} onChange={(e) => update({ defaultCurrency: e.target.value })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
          <Field label={t("settings.focusMinutes")}>
            <Input type="number" min={5} max={180} dir="ltr" value={st.focusMinutes} onChange={(e) => update({ focusMinutes: Math.max(5, Number(e.target.value) || 25) })} />
          </Field>
          <Field label={t("settings.timetableStart")}>
            <Input type="number" min={0} max={23} dir="ltr" value={st.timetable.startHour} onChange={(e) => update({ timetable: { startHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) } })} />
          </Field>
          <Field label={t("settings.timetableEnd")}>
            <Input type="number" min={1} max={24} dir="ltr" value={st.timetable.endHour} onChange={(e) => update({ timetable: { endHour: Math.min(24, Math.max(1, Number(e.target.value) || 18)) } })} />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="ghost" onClick={() => update({ dashboard: DEFAULT_SETTINGS.dashboard })}>{t("dashboard.reset")}</Button>
          </div>
        </div>
      </Card>
    </>
  );
}

function WorkspaceTab() {
  const { t } = useTranslation();
  const { info, refreshInfo, closeWorkspace } = useWorkspace();
  const [report, setReport] = React.useState<IntegrityReport | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [logs, setLogs] = React.useState<string | null>(null);

  const validate = async () => {
    setChecking(true);
    try {
      setReport(await workspaceApi.validate());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };
  const rename = async () => {
    const name = await promptText({ title: t("settings.renameWorkspace"), initial: info?.manifest?.name ?? "", confirmLabel: t("common.save") });
    if (!name?.trim()) return;
    try {
      await workspaceApi.rename(name.trim());
      await refreshInfo();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const change = async (reason: "switch" | "disconnected") => {
    const ok = await confirm({
      title: reason === "switch" ? t("settings.changeWorkspace") : t("settings.disconnect"),
      description: reason === "switch" ? t("settings.changeWorkspaceBody") : t("settings.disconnectBody"),
      confirmLabel: reason === "switch" ? t("settings.changeWorkspace") : t("settings.disconnect"),
    });
    if (ok) await closeWorkspace(reason);
  };

  return (
    <>
      <Card>
        <CardHeader title={t("settings.currentWorkspace")} icon={<FolderOpen />} />
        <div className="space-y-3 p-4">
          <div>
            <div className="text-xs text-muted">{t("settings.workspaceName")}</div>
            <div className="flex items-center gap-2 font-medium">{info?.manifest?.name}<Button size="icon-sm" variant="ghost" onClick={rename} aria-label={t("common.edit")}><Pencil /></Button></div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("settings.workspacePath")}</div>
            <div className="break-all rounded-md border border-border bg-sunken px-3 py-2 font-mono text-xs" dir="ltr" data-testid="workspace-path">{info?.path}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-3">
            <div>{t("settings.databaseSize")}: <span className="text-fg">{fmtBytes(info?.dbSize ?? 0)}</span></div>
            <div>{t("settings.created")}: <span className="text-fg">{fmtDateTime(info?.manifest?.createdAt)}</span></div>
            <div>{t("settings.workspaceId")}: <span className="font-mono text-fg" dir="ltr">{info?.manifest?.id.slice(0, 8)}</span></div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => workspaceApi.reveal().catch((e) => toast.error(errorMessage(e)))}><FolderOpen /> {t("settings.openInExplorer")}</Button>
            <Button onClick={validate} loading={checking}><ShieldCheck /> {t("settings.validate")}</Button>
            <Button onClick={async () => setLogs(await logApi.read().catch(() => ""))}><ScrollText /> {t("settings.viewLogs")}</Button>
            <Button onClick={() => void change("switch")}><Replace /> {t("settings.changeWorkspace")}</Button>
            <Button variant="danger-ghost" onClick={() => void change("disconnected")}><LogOut /> {t("settings.disconnect")}</Button>
          </div>
        </div>
      </Card>
      {report && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("settings.integrityReport")}</h3>
          <ul className="space-y-1 text-sm">
            <li className="flex items-center gap-2"><Badge tone={report.structure.status === "ok" ? "success" : "danger"}>{t(`workspace.status.${report.structure.status}`)}</Badge> {t("settings.structure")}</li>
            <li className="flex items-center gap-2"><Badge tone={report.databaseProblems.length ? "danger" : "success"}>{report.databaseProblems.length ? t("settings.dbProblems", { count: report.databaseProblems.length }) : t("settings.dbHealthy")}</Badge> {t("settings.databaseIntegrity")}</li>
            {report.repairedFolders.length > 0 && <li className="text-xs text-warning">{t("settings.repaired", { folders: report.repairedFolders.join(", ") })}</li>}
            {report.databaseProblems.slice(0, 10).map((p) => <li key={p} className="font-mono text-xs text-danger" dir="ltr">{p}</li>)}
          </ul>
        </Card>
      )}
      <Modal open={logs !== null} onOpenChange={(o) => !o && setLogs(null)} title={t("settings.viewLogs")} size="xl">
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-sunken p-3 text-[11px]" dir="ltr">{logs || t("settings.noLogs")}</pre>
      </Modal>
    </>
  );
}

function Notifications() {
  const { t } = useTranslation();
  const prefs = useSettings((s) => s.settings.notifications);
  const update = useSettings((s) => s.update);
  const { data: granted, refetch } = useQ(["notif-permission"], () => desktopNotify.permission());
  return (
    <>
      <Card>
        <CardHeader title={t("settings.desktopNotifications")} />
        <div className="space-y-3 p-4">
          <Switch checked={prefs.desktop} onCheckedChange={(v) => update({ notifications: { desktop: v } })} label={t("settings.desktopEnabled")} description={granted === false ? t("settings.permissionDenied") : t("settings.desktopHint")} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void refetch()}>{t("settings.checkPermission")}</Button>
            <Button
              size="sm"
              onClick={async () => {
                const ok = await desktopNotify.send("UniOS", t("settings.testBody"));
                if (ok) toast.success(t("settings.testSent"));
                else toast.error(t("settings.testFailed"));
              }}
            >
              {t("settings.sendTest")}
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("settings.categories")} />
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          {NOTIFICATION_CATEGORIES.filter((c) => c !== "system").map((c) => (
            <Switch key={c} checked={prefs.categories[c] !== false} onCheckedChange={(v) => update({ notifications: { categories: { ...prefs.categories, [c]: v } } })} label={t(`enums.notificationCategory.${c}`)} />
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title={t("settings.timing")} />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label={t("settings.lectureLead")}>
            <NativeSelect value={String(prefs.lectureLeadMinutes)} onChange={(e) => update({ notifications: { lectureLeadMinutes: Number(e.target.value) } })} options={[5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: t("reminders.minutes", { count: m }) }))} />
          </Field>
          <Field label={t("settings.backupReminder")}>
            <NativeSelect value={String(prefs.backupReminderDays)} onChange={(e) => update({ notifications: { backupReminderDays: Number(e.target.value) } })} options={[0, 3, 7, 14, 30].map((d) => ({ value: String(d), label: d ? t("time.days", { count: d }) : t("settings.off") }))} />
          </Field>
          <Field label={t("settings.goalWarning")}>
            <NativeSelect value={String(prefs.goalWarningDays)} onChange={(e) => update({ notifications: { goalWarningDays: Number(e.target.value) } })} options={[1, 3, 7, 14].map((d) => ({ value: String(d), label: t("reminders.days", { count: d }) }))} />
          </Field>
        </div>
      </Card>
    </>
  );
}

function Grading() {
  const { t } = useTranslation();
  const s = useServices();
  const { data: scales = [] } = useQ(["scales"], () => s.grades.scales());
  const [editing, setEditing] = React.useState<Partial<GradingScale> | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const save = async () => {
    if (!editing) return;
    try {
      const bands = [...(editing.bands ?? [])].sort((a, b) => b.min - a.min);
      if (editing.id) await s.repos.gradingScales.update(editing.id, { ...editing, bands });
      else await s.repos.gradingScales.create({ ...editing, bands } as never);
      await invalidateAll();
      setEditing(null);
      toast.success(t("toast.saved"));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <>
      <p className="text-sm text-muted">{t("settings.gradingLead")}</p>
      <div className="space-y-3">
        {scales.map((sc) => (
          <Card key={sc.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="font-medium">{scaleName(sc.name)}</span>
              <Badge>{t(`enums.scaleKind.${sc.kind}`)}</Badge>
              {sc.isDefault && <Badge tone="accent"><Star className="size-3" /> {t("settings.default")}</Badge>}
              <div className="ms-auto flex gap-1">
                {!sc.isDefault && <Button size="sm" variant="ghost" onClick={async () => { await s.grades.setDefaultScale(sc.id); await invalidateAll(); }}>{t("settings.makeDefault")}</Button>}
                <Button size="sm" variant="ghost" onClick={() => { setErr(null); setEditing(sc); }}><Pencil /> {t("common.edit")}</Button>
                {!sc.isDefault && (
                  <Button size="icon-sm" variant="ghost" aria-label={t("common.delete")} onClick={async () => { if (await confirm({ title: t("confirm.deleteTitle"), description: t("settings.deleteScaleBody"), danger: true, confirmLabel: t("common.delete") })) { await s.repos.gradingScales.remove(sc.id); await invalidateAll(); } }}><Trash2 /></Button>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {sc.bands.map((b, i) => <span key={i} className="rounded border border-border px-1.5 py-0.5"><span className="text-muted">≥{b.min}%</span> {gradeLabel(b.label)}{sc.kind !== "percentage" ? ` · ${b.points}` : ""}</span>)}
            </div>
            <div className="mt-1 text-[11px] text-subtle">{t("settings.passMark", { n: sc.passMark })}</div>
          </Card>
        ))}
      </div>
      <Button onClick={() => { setErr(null); setEditing({ name: "", kind: "gpa4", maxPoints: 4, passMark: 60, bands: [{ min: 90, label: "A", points: 4 }, { min: 0, label: "F", points: 0 }] }); }}><Plus /> {t("settings.newScale")}</Button>
      <Modal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t("settings.editScale") : t("settings.newScale")}
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button variant="primary" onClick={save}>{t("common.save")}</Button></>}
      >
        {editing && (
          <div className="space-y-3">
            {err && <p className="text-sm text-danger">{err}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("fields.name")} className="col-span-2"><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label={t("settings.scaleKind")}>
                <NativeSelect value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as GradingScale["kind"] })} options={(["percentage", "gpa4", "gpa5", "custom"] as const).map((k) => ({ value: k, label: t(`enums.scaleKind.${k}`) }))} />
              </Field>
              <Field label={t("settings.passMarkLabel")}><Input type="number" dir="ltr" value={editing.passMark ?? 50} onChange={(e) => setEditing({ ...editing, passMark: Number(e.target.value) })} /></Field>
            </div>
            <div>
              <div className="label">{t("settings.bands")}</div>
              <div className="space-y-1.5">
                {(editing.bands ?? []).map((b, i) => (
                  <div key={i} className="grid grid-cols-[100px_1fr_100px_auto] gap-2">
                    <Input type="number" dir="ltr" value={b.min} aria-label={t("settings.minPercent")} onChange={(e) => setEditing({ ...editing, bands: editing.bands!.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />
                    <Input value={b.label} aria-label={t("settings.bandLabel")} onChange={(e) => setEditing({ ...editing, bands: editing.bands!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <Input type="number" dir="ltr" step="0.01" value={b.points} aria-label={t("settings.points")} onChange={(e) => setEditing({ ...editing, bands: editing.bands!.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)) })} />
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...editing, bands: editing.bands!.filter((_, j) => j !== i) })} aria-label={t("common.remove")}><Trash2 /></Button>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-subtle">{t("settings.bandsHint")}</p>
              <Button className="mt-2" size="sm" variant="ghost" onClick={() => setEditing({ ...editing, bands: [...(editing.bands ?? []), { min: 0, label: "", points: 0 }] })}><Plus /> {t("settings.addBand")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function TagsTab() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [], isLoading } = useQ(["tags", "all"], () => s.tags.list());
  return (
    <Card>
      <CardHeader title={t("settings.tags")} actions={<Button size="sm" variant="ghost" onClick={async () => { const n = await s.tags.prune(); await invalidateAll(); toast.success(t("settings.tagsPruned", { count: n })); }}>{t("settings.pruneTags")}</Button>} />
      {isLoading ? <div className="p-4"><Spinner /></div> : data.length === 0 ? <p className="p-4 text-sm text-subtle">{t("settings.noTags")}</p> : (
        <ul className="divide-y divide-border">
          {data.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1 text-accent">#{tag.name}</span>
              <span className="text-xs text-subtle">{t("settings.tagUses", { count: tag.count })}</span>
              <Button size="icon-sm" variant="ghost" aria-label={t("common.edit")} onClick={async () => { const name = await promptText({ title: t("settings.renameTag"), initial: tag.name, confirmLabel: t("common.save") }); if (name?.trim()) { try { await s.tags.rename(tag.id, name); await s.rebuildSearchIndex(); await invalidateAll(); } catch (e) { toast.error(errorMessage(e)); } } }}><Pencil /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={t("common.delete")} onClick={async () => { if (await confirm({ title: t("settings.deleteTag"), description: t("settings.deleteTagBody", { name: tag.name }), danger: true, confirmLabel: t("common.delete") })) { await s.tags.remove(tag.id); await s.rebuildSearchIndex(); await invalidateAll(); } }}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Maintenance() {
  const { t } = useTranslation();
  const s = useServices();
  const [busy, setBusy] = React.useState<string | null>(null);
  const { data: audit = [] } = useQ(["audit"], () => s.audit.list(50));
  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      toast.success(await fn());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Card>
        <CardHeader title={t("settings.maintenance")} />
        <div className="flex flex-wrap gap-2 p-4">
          <Button loading={busy === "index"} onClick={() => run("index", async () => t("settings.indexRebuilt", { count: await s.rebuildSearchIndex() }))}><Search /> {t("settings.rebuildIndex")}</Button>
          <Button loading={busy === "missing"} onClick={() => run("missing", async () => t("settings.missingFound", { count: (await s.files.findMissing()).length }))}><RefreshCw /> {t("settings.checkFiles")}</Button>
          <Button loading={busy === "scan"} onClick={() => run("scan", async () => t("notifications.scanned", { count: (await s.notifications.scan()).length }))}><RefreshCw /> {t("notifications.checkNow")}</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title={t("settings.activity")} subtitle={t("settings.activityHint")} />
        <ul className="max-h-96 divide-y divide-border overflow-y-auto text-xs">
          {audit.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-1.5">
              <span className="w-36 shrink-0 text-subtle">{fmtDateTime(a.createdAt)}</span>
              <Badge>{t(`settings.actions.${a.action}`)}</Badge>
              <span className="text-muted">{t(`entity.${a.entityType}`, { defaultValue: a.entityType })}</span>
              <span className="min-w-0 flex-1 truncate" dir="auto">{a.summary}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Privacy() {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-base font-semibold"><Lock className="size-5 text-accent" /> {t("settings.privacyTitle")}</div>
      <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm text-muted">
        {["privacy1", "privacy2", "privacy3", "privacy4", "privacy5"].map((k) => <li key={k}>{t(`settings.${k}`)}</li>)}
      </ul>
      <p className="mt-4 text-xs text-subtle">{t("settings.version", { version: __APP_VERSION__ })}</p>
    </Card>
  );
}
