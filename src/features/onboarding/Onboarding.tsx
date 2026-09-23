import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Moon, Sun, Monitor, Plus, Trash2, LayoutDashboard, BookOpen, NotebookPen, FolderOpen, ShieldCheck, Search, DatabaseBackup, FolderCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ColorPicker } from "@/components/ui/controls";
import { OnboardingFrame } from "./WorkspaceSelect";
import { useWorkspace } from "@/app/workspace";
import { useSettings, applyTheme, type Theme } from "@/app/settings";
import { applyLanguage, type Lang } from "@/i18n";
import { useServices } from "@/app/services";
import { RecordForm } from "@/components/common/RecordForm";
import { fieldErrors, errorMessage } from "@/lib/errors";
import { PALETTE } from "@/components/ui/controls";
import { cn } from "@/lib/cn";

const TOTAL = 8;

export function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = React.useState(3);
  const finish = useWorkspace((w) => w.finishOnboarding);
  const info = useWorkspace((w) => w.info);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const s = useServices();
  const [semester, setSemester] = React.useState<Record<string, unknown>>({ name: "", academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, type: "first", status: "active" });
  const [semErrors, setSemErrors] = React.useState<Record<string, string>>({});
  const [semesterId, setSemesterId] = React.useState<string | null>(null);
  const [subjects, setSubjects] = React.useState<{ name: string; code: string; credits: string; color: string }[]>([{ name: "", code: "", credits: "3", color: PALETTE[0] }]);
  const [busy, setBusy] = React.useState(false);

  const next = () => setStep((x) => Math.min(x + 1, TOTAL - 1));
  const back = () => setStep((x) => Math.max(x - 1, 3));

  const saveSemester = async () => {
    if (!String(semester.name ?? "").trim()) return next();
    setBusy(true);
    try {
      const created = semesterId ? await s.semesters.update(semesterId, semester) : await s.semesters.create({ ...semester, isCurrent: true } as never);
      setSemesterId(created.id);
      setSemErrors({});
      next();
    } catch (e) {
      setSemErrors(fieldErrors(e));
      if (!Object.keys(fieldErrors(e)).length) toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSubjects = async () => {
    const rows = subjects.filter((r) => r.name.trim());
    if (!rows.length) return next();
    setBusy(true);
    try {
      for (const r of rows) {
        await s.repos.subjects.create({ name: r.name.trim(), code: r.code.trim() || null, credits: Number(r.credits) || 0, color: r.color, semesterId } as never);
      }
      toast.success(t("onboarding.subjectsAdded", { count: rows.length }));
      setSubjects([{ name: "", code: "", credits: "3", color: PALETTE[rows.length % PALETTE.length] }]);
      next();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const footer = (primary: React.ReactNode, skip?: () => void) => (
    <>
      <Button variant="ghost" onClick={back} disabled={step === 3}>
        <ArrowLeft className="rtl:rotate-180" /> {t("common.back")}
      </Button>
      <div className="flex items-center gap-2">
        {skip && (
          <Button variant="ghost" onClick={skip}>
            {t("onboarding.skip")}
          </Button>
        )}
        {primary}
      </div>
    </>
  );

  if (step === 3)
    return (
      <OnboardingFrame step={3} total={TOTAL} footer={footer(<Button variant="primary" onClick={next}>{t("common.continue")} <ArrowRight className="rtl:rotate-180" /></Button>)}>
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-success/30 bg-success/8 p-3 text-sm">
          <FolderCheck className="size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <div className="font-medium">{t("onboarding.workspaceReady")}</div>
            <div className="truncate font-mono text-xs text-muted" dir="ltr">{info?.path}</div>
          </div>
        </div>
        <h1 className="text-2xl font-semibold">{t("onboarding.languageTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("onboarding.languageLead")}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(["ar", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                update({ language: l });
                applyLanguage(l);
              }}
              className={cn("card flex items-center justify-between p-5 text-start transition-colors hover:border-accent/50", settings.language === l && "border-accent ring-2 ring-accent/25")}
            >
              <div>
                <div className="text-lg font-semibold">{l === "ar" ? "العربية" : "English"}</div>
                <div className="text-xs text-muted">{l === "ar" ? "من اليمين إلى اليسار · RTL" : "Left to right · LTR"}</div>
              </div>
              {settings.language === l && <Check className="size-5 text-accent" />}
            </button>
          ))}
        </div>
      </OnboardingFrame>
    );

  if (step === 4)
    return (
      <OnboardingFrame step={4} total={TOTAL} footer={footer(<Button variant="primary" onClick={next}>{t("common.continue")} <ArrowRight className="rtl:rotate-180" /></Button>)}>
        <h1 className="text-2xl font-semibold">{t("onboarding.themeTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("onboarding.themeLead")}</p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {([
            ["dark", Moon],
            ["light", Sun],
            ["system", Monitor],
          ] as [Theme, typeof Moon][]).map(([th, Icon]) => (
            <button
              key={th}
              type="button"
              onClick={() => {
                update({ theme: th });
                applyTheme(th, settings.accent);
              }}
              className={cn("card flex flex-col items-center gap-2 p-5 transition-colors hover:border-accent/50", settings.theme === th && "border-accent ring-2 ring-accent/25")}
            >
              <Icon className="size-6 text-accent" />
              <span className="text-sm font-medium">{t(`settings.themes.${th}`)}</span>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <div className="label">{t("settings.accent")}</div>
          <ColorPicker
            value={settings.accent}
            onChange={(c) => {
              if (!c) return;
              update({ accent: c });
              applyTheme(settings.theme, c);
            }}
          />
        </div>
      </OnboardingFrame>
    );

  if (step === 5)
    return (
      <OnboardingFrame step={5} total={TOTAL} footer={footer(<Button variant="primary" loading={busy} onClick={saveSemester}>{t("common.continue")} <ArrowRight className="rtl:rotate-180" /></Button>, next)}>
        <h1 className="text-2xl font-semibold">{t("onboarding.semesterTitle")}</h1>
        <p className="mb-6 mt-2 text-sm text-muted">{t("onboarding.semesterLead")}</p>
        <RecordForm
          value={semester}
          errors={semErrors}
          onChange={(p) => setSemester((x) => ({ ...x, ...p }))}
          fields={[
            { name: "name", kind: "text", required: true, placeholder: "onboarding.semesterPlaceholder", autoFocus: true },
            { name: "academicYear", kind: "text", placeholder: "2026-2027" },
            { name: "type", kind: "enum", enum: "semesterType", required: true },
            { name: "status", kind: "enum", enum: "semesterStatus", required: true },
            { name: "startDate", kind: "date" },
            { name: "endDate", kind: "date" },
          ]}
        />
      </OnboardingFrame>
    );

  if (step === 6)
    return (
      <OnboardingFrame step={6} total={TOTAL} footer={footer(<Button variant="primary" loading={busy} onClick={saveSubjects}>{t("common.continue")} <ArrowRight className="rtl:rotate-180" /></Button>, next)}>
        <h1 className="text-2xl font-semibold">{t("onboarding.subjectsTitle")}</h1>
        <p className="mb-6 mt-2 text-sm text-muted">{t("onboarding.subjectsLead")}</p>
        <div className="space-y-2">
          {subjects.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_80px_auto_auto] items-end gap-2">
              <Field label={i === 0 ? t("fields.name") : undefined}>
                <Input value={r.name} placeholder={t("onboarding.subjectPlaceholder")} onChange={(e) => setSubjects((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              </Field>
              <Field label={i === 0 ? t("fields.code") : undefined}>
                <Input value={r.code} dir="ltr" onChange={(e) => setSubjects((x) => x.map((y, j) => (j === i ? { ...y, code: e.target.value } : y)))} />
              </Field>
              <Field label={i === 0 ? t("fields.credits") : undefined}>
                <Input value={r.credits} type="number" dir="ltr" onChange={(e) => setSubjects((x) => x.map((y, j) => (j === i ? { ...y, credits: e.target.value } : y)))} />
              </Field>
              <input
                type="color"
                aria-label={t("fields.color")}
                value={r.color}
                onChange={(e) => setSubjects((x) => x.map((y, j) => (j === i ? { ...y, color: e.target.value } : y)))}
                className="h-9 w-10 cursor-pointer rounded-md border border-border bg-sunken"
              />
              <Button size="icon" variant="ghost" aria-label={t("common.remove")} onClick={() => setSubjects((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <Button className="mt-3" variant="ghost" size="sm" onClick={() => setSubjects((x) => [...x, { name: "", code: "", credits: "3", color: PALETTE[x.length % PALETTE.length] }])}>
          <Plus /> {t("onboarding.addAnother")}
        </Button>
      </OnboardingFrame>
    );

  const tour = [
    { icon: LayoutDashboard, key: "dashboard" },
    { icon: BookOpen, key: "subjects" },
    { icon: NotebookPen, key: "notes" },
    { icon: FolderOpen, key: "files" },
    { icon: ShieldCheck, key: "cyber" },
    { icon: Search, key: "search" },
    { icon: DatabaseBackup, key: "backup" },
  ];
  return (
    <OnboardingFrame
      step={7}
      total={TOTAL}
      footer={footer(
        <Button variant="primary" onClick={finish} data-testid="onboarding-finish">
          {t("onboarding.openDashboard")} <ArrowRight className="rtl:rotate-180" />
        </Button>,
      )}
    >
      <h1 className="text-2xl font-semibold">{t("onboarding.tourTitle")}</h1>
      <p className="mt-2 text-sm text-muted">{t("onboarding.tourLead")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {tour.map((x) => (
          <div key={x.key} className="card flex gap-3 p-4">
            <x.icon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <div className="text-sm font-semibold">{t(`onboarding.tour.${x.key}.title`)}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted">{t(`onboarding.tour.${x.key}.body`)}</div>
            </div>
          </div>
        ))}
      </div>
    </OnboardingFrame>
  );
}
