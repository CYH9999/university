import * as React from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, FolderOpen, HardDrive, ShieldCheck, WifiOff, ArrowLeft, ArrowRight, LogOut, Clock, Languages, Keyboard, Database, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/controls";
import { useWorkspace, exitApp } from "@/app/workspace";
import { workspaceApi, pointerApi, dialogs, backupApi, type WorkspaceCheck, type ValidationReport } from "@/platform/tauri";
import { applyLanguage } from "@/i18n";
import { confirm } from "@/app/confirm";
import { errorMessage } from "@/lib/errors";
import { useQ } from "@/app/query";
import { fmtDateTime, fmtBytes } from "@/lib/format";
import i18n from "@/i18n";
import { cn } from "@/lib/cn";

function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  return parent.replace(/[\\/]+$/, "") + sep + name.trim();
}

export function LanguageToggle() {
  const { i18n: inst } = useTranslation();
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        const next = inst.language === "ar" ? "en" : "ar";
        applyLanguage(next);
        void pointerApi.setUi({ language: next }).catch(() => undefined);
      }}
    >
      <Languages /> {inst.language === "ar" ? "English" : "العربية"}
    </Button>
  );
}

export function OnboardingFrame({ children, step, total, footer }: { children: React.ReactNode; step?: number; total?: number; footer?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="font-semibold tracking-tight">UniOS</span>
          <span className="text-xs text-subtle">· {t("app.tagline")}</span>
        </div>
        <div className="flex items-center gap-2">
          {step !== undefined && total !== undefined && (
            <div className="me-3 flex items-center gap-1" aria-label={t("onboarding.progress", { step: step + 1, total })}>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className={cn("h-1 w-6 rounded-full", i <= step ? "bg-accent" : "bg-border-strong")} />
              ))}
            </div>
          )}
          <LanguageToggle />
          <Button size="sm" variant="ghost" onClick={() => void exitApp()}>
            <LogOut className="rtl:rotate-180" /> {t("onboarding.exit")}
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-10 animate-in">{children}</div>
      </div>
      {footer && <footer className="flex items-center justify-between border-t border-border px-6 py-3">{footer}</footer>}
    </div>
  );
}

export function WorkspaceSelect() {
  const { t } = useTranslation();
  const reason = useWorkspace((w) => w.selectReason);
  const [step, setStep] = React.useState(reason === "first" ? 0 : 2);

  if (step === 0)
    return (
      <OnboardingFrame step={0} total={8} footer={<><span /><Button variant="primary" onClick={() => setStep(1)} data-testid="onboarding-next">{t("onboarding.start")} <ArrowRight className="rtl:rotate-180" /></Button></>}>
        <div className="text-center">
          <img src="/logo.svg" alt="" className="mx-auto size-20" />
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("onboarding.welcomeTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">{t("onboarding.welcomeBody")}</p>
          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-3 text-start">
            {[
              { icon: <HardDrive />, title: t("onboarding.feature.local"), body: t("onboarding.feature.localBody") },
              { icon: <WifiOff />, title: t("onboarding.feature.offline"), body: t("onboarding.feature.offlineBody") },
              { icon: <ShieldCheck />, title: t("onboarding.feature.cyber"), body: t("onboarding.feature.cyberBody") },
            ].map((f) => (
              <div key={f.title} className="card p-4">
                <div className="text-accent [&_svg]:size-5">{f.icon}</div>
                <div className="mt-2 text-sm font-semibold">{f.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{f.body}</div>
              </div>
            ))}
          </div>
        </div>
      </OnboardingFrame>
    );

  if (step === 1)
    return (
      <OnboardingFrame
        step={1}
        total={8}
        footer={
          <>
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="rtl:rotate-180" /> {t("common.back")}
            </Button>
            <Button variant="primary" onClick={() => setStep(2)} data-testid="onboarding-next">
              {t("common.continue")} <ArrowRight className="rtl:rotate-180" />
            </Button>
          </>
        }
      >
        <h1 className="text-2xl font-semibold">{t("onboarding.storageTitle")}</h1>
        <p className="mt-3 rounded-lg border border-accent/30 bg-accent/8 p-4 text-sm leading-relaxed">{t("onboarding.storageLead")}</p>
        <ul className="mt-5 space-y-3 text-sm text-muted">
          {["storage1", "storage2", "storage3", "storage4"].map((k) => (
            <li key={k} className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              {t(`onboarding.${k}`)}
            </li>
          ))}
        </ul>
        <pre dir="ltr" className="mt-6 rounded-lg border border-border bg-sunken p-4 text-xs leading-6 text-muted">{`Workspace/
├── AppData/          database.sqlite · settings.json · workspace.json
├── Subjects/         ${i18n.t("onboarding.tree.subjects")}
├── Projects/         ${i18n.t("onboarding.tree.projects")}
├── Research Library/ ${i18n.t("onboarding.tree.research")}
├── Cybersecurity Lab/${i18n.t("onboarding.tree.cyber")}
├── Attachments/      ${i18n.t("onboarding.tree.attachments")}
├── Whiteboards/      ${i18n.t("onboarding.tree.whiteboards")}
├── Backups/          ${i18n.t("onboarding.tree.backups")}
├── Exports/          ${i18n.t("onboarding.tree.exports")}
└── Trash/            ${i18n.t("onboarding.tree.trash")}`}</pre>
      </OnboardingFrame>
    );

  return <PickWorkspace onBack={reason === "first" ? () => setStep(1) : undefined} />;
}

function PickWorkspace({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const openChecked = useWorkspace((w) => w.openChecked);
  const reason = useWorkspace((w) => w.selectReason);
  const [parent, setParent] = React.useState("");
  const [name, setName] = React.useState(t("onboarding.defaultFolderName"));
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState<{ path: string; check: WorkspaceCheck } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [restoreZip, setRestoreZip] = React.useState<{ path: string; report: ValidationReport } | null>(null);
  const { data: pointer } = useQ(["pointer"], () => pointerApi.read());

  const target = parent ? joinPath(parent, name || "UniOS Workspace") : "";

  const openPath = async (path: string) => {
    setError(null);
    setProblem(null);
    setBusy("open");
    try {
      const check = await workspaceApi.check(path);
      if (check.status === "ok") {
        const opened = await workspaceApi.open(path);
        await openChecked(opened);
      } else setProblem({ path, check });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const createAt = async (path: string, allowNonEmpty = false) => {
    setError(null);
    setBusy("create");
    try {
      const empty = await workspaceApi.isDirEmpty(path);
      if (!empty && !allowNonEmpty) {
        const ok = await confirm({ title: t("onboarding.nonEmptyTitle"), description: t("onboarding.nonEmptyBody", { path }), confirmLabel: t("onboarding.useAnyway") });
        if (!ok) return;
      }
      const check = await workspaceApi.create(path, name || "UniOS Workspace", true);
      await openChecked(check);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "workspace.already_exists") {
        if (await confirm({ title: t("onboarding.existsTitle"), description: t("onboarding.existsBody"), confirmLabel: t("onboarding.openIt") })) await openPath(path);
      } else setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const chooseParent = async () => {
    const p = await dialogs.pickFolder(t("onboarding.chooseParent"));
    if (p) setParent(p);
  };
  const chooseExisting = async () => {
    const p = await dialogs.pickFolder(t("onboarding.chooseExisting"));
    if (p) await openPath(p);
  };
  const chooseBackup = async () => {
    const zip = await dialogs.pickFile(t("backup.chooseArchive"), ["zip"]);
    if (!zip) return;
    setBusy("inspect");
    try {
      setRestoreZip({ path: zip, report: await backupApi.inspect(zip) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const restoreToNew = async () => {
    if (!restoreZip) return;
    const p = await dialogs.pickFolder(t("backup.chooseEmptyFolder"));
    if (!p) return;
    setBusy("restore");
    try {
      const check = await backupApi.restoreNew(restoreZip.path, p);
      await openChecked(check);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <OnboardingFrame
      step={reason === "first" ? 2 : undefined}
      total={reason === "first" ? 8 : undefined}
      footer={
        onBack ? (
          <>
            <Button variant="ghost" onClick={onBack}>
              <ArrowLeft className="rtl:rotate-180" /> {t("common.back")}
            </Button>
            <span className="text-xs text-subtle">{t("onboarding.workspaceRequired")}</span>
          </>
        ) : undefined
      }
    >
      <h1 className="text-2xl font-semibold">{reason === "first" ? t("onboarding.chooseTitle") : reason === "disconnected" ? t("workspace.disconnectedTitle") : t("workspace.switchTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("onboarding.chooseLead")}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2 font-semibold">
            <FolderPlus className="size-5 text-accent" /> {t("onboarding.createTitle")}
          </div>
          <p className="mt-1 text-xs text-muted">{t("onboarding.createBody")}</p>
          <div className="mt-4 space-y-3">
            <Field label={t("onboarding.location")}>
              <div className="flex gap-2">
                <Input readOnly value={parent} placeholder={t("onboarding.noFolder")} dir="ltr" className="font-mono text-xs" />
                <Button onClick={chooseParent}>{t("common.browse")}</Button>
              </div>
            </Field>
            <Field label={t("onboarding.folderName")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {target && (
              <p className="break-all rounded-md border border-border bg-sunken px-3 py-2 font-mono text-[11px] text-muted" dir="ltr">
                {target}
              </p>
            )}
          </div>
          <Button variant="primary" className="mt-4" disabled={!parent || !name.trim()} loading={busy === "create"} onClick={() => createAt(target)}>
            {t("onboarding.createConfirm")}
          </Button>
        </div>

        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2 font-semibold">
            <FolderOpen className="size-5 text-accent" /> {t("onboarding.openTitle")}
          </div>
          <p className="mt-1 text-xs text-muted">{t("onboarding.openBody")}</p>
          <Button className="mt-4" onClick={chooseExisting} loading={busy === "open"}>
            <FolderOpen /> {t("onboarding.selectFolder")}
          </Button>
          <div className="mt-4 border-t border-border pt-3">
            <div className="label flex items-center gap-1.5">
              <Keyboard className="size-3.5" /> {t("onboarding.typePath")}
            </div>
            <div className="flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="D:\\University\\UniOS Workspace" dir="ltr" className="font-mono text-xs" data-testid="manual-path" />
              <Button onClick={() => manual.trim() && openPath(manual.trim())} data-testid="manual-open">
                {t("common.open")}
              </Button>
            </div>
            <Button variant="link" size="sm" className="mt-1" onClick={() => manual.trim() && createAt(manual.trim())} data-testid="manual-create">
              {t("onboarding.createHere")}
            </Button>
          </div>
          <div className="mt-auto border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={chooseBackup} loading={busy === "inspect"}>
              <FileArchive /> {t("onboarding.restoreFromBackup")}
            </Button>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {problem && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/8 p-4 text-sm" role="alert">
          <p className="font-medium">{t(`workspace.status.${problem.check.status}`)}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted" dir="ltr">{problem.path}</p>
          {problem.check.detail && <p className="mt-1 text-xs text-subtle">{problem.check.detail}</p>}
          {problem.check.status === "not_a_workspace" && (
            <Button className="mt-3" variant="primary" size="sm" onClick={() => createAt(problem.path)}>
              {t("onboarding.initializeHere")}
            </Button>
          )}
        </div>
      )}

      {restoreZip && (
        <div className="mt-4 rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{restoreZip.report.manifest?.workspaceName ?? t("backup.unknown")}</p>
            <Badge tone={restoreZip.report.valid ? "success" : "danger"}>{restoreZip.report.valid ? t("backup.valid") : t("backup.invalid")}</Badge>
          </div>
          {restoreZip.report.manifest && (
            <p className="mt-1 text-xs text-muted">
              {t(`backup.kind.${restoreZip.report.manifest.kind}`)} · {fmtDateTime(restoreZip.report.manifest.createdAt)} · {fmtBytes(restoreZip.report.manifest.totalSize)}
            </p>
          )}
          {restoreZip.report.errors.map((e) => (
            <p key={e} className="mt-1 text-xs text-danger">{e}</p>
          ))}
          <Button className="mt-3" variant="primary" size="sm" disabled={!restoreZip.report.valid || restoreZip.report.manifest?.kind === "attachments"} loading={busy === "restore"} onClick={restoreToNew}>
            <Database /> {t("backup.restoreToNew")}
          </Button>
        </div>
      )}

      {!!pointer?.recent.length && (
        <div className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            <Clock className="size-3.5" /> {t("onboarding.recent")}
          </h2>
          <ul className="space-y-1">
            {pointer.recent.map((p) => (
              <li key={p}>
                <button type="button" onClick={() => openPath(p)} className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-start hover:border-accent/50">
                  <FolderOpen className="size-4 shrink-0 text-muted" />
                  <span className="truncate font-mono text-xs" dir="ltr">{p}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OnboardingFrame>
  );
}
