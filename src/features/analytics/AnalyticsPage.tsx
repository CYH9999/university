import * as React from "react";
import { useTranslation } from "react-i18next";
import { BarChart3, ListTodo, Timer, NotebookPen, UserCheck, GraduationCap, Target, Wallet, ShieldCheck, Library, FolderKanban, AlarmClock } from "lucide-react";
import { PageHeader, Toolbar, Stat } from "@/components/ui/misc";
import { Segmented, ProgressBar } from "@/components/ui/controls";
import { SubjectSelect, ProjectSelect, SemesterSelect } from "@/components/common/pickers";
import { DatePicker } from "@/components/common/DatePicker";
import { ChartCard, SimpleBars, CategoryBars, StackedPair, TrendLine, SERIES } from "@/components/charts/Chart";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { fmtMinutes, fmtNumber, fmtMoney } from "@/lib/format";
import { addDaysKey, toDateKey } from "@/core/utils/dates";

export function AnalyticsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const today = toDateKey(new Date());
  const [preset, setPreset] = React.useState<"30" | "90" | "365" | "custom">("90");
  const [from, setFrom] = React.useState<string | null>(addDaysKey(today, -89));
  const [to, setTo] = React.useState<string | null>(today);
  const [semesterId, setSemesterId] = React.useState<string | null>(null);
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);

  const applyPreset = (p: typeof preset) => {
    setPreset(p);
    if (p !== "custom") {
      setFrom(addDaysKey(today, -(Number(p) - 1)));
      setTo(today);
    }
  };
  const f = { from: from ?? "0000-01-01", to: to ?? "9999-12-31", semesterId, subjectId, projectId };
  const key = [f.from, f.to, semesterId, subjectId, projectId];

  const { data: tasks } = useQ(["analytics", "tasks", ...key], () => s.analytics.taskStats(f));
  const { data: study } = useQ(["analytics", "study", ...key], () => s.analytics.studyActivity(f));
  const { data: notes = [] } = useQ(["analytics", "notes", ...key], () => s.analytics.notesOverTime(f));
  const { data: research = [] } = useQ(["analytics", "research", ...key], () => s.analytics.researchOverTime(f));
  const { data: attendance = [] } = useQ(["analytics", "attendance", ...key], () => s.analytics.attendanceBySubject(f));
  const { data: expenses } = useQ(["analytics", "expenses", ...key], () => s.analytics.expenses(f));
  const { data: cyber } = useQ(["analytics", "cyber", ...key], () => s.analytics.cyberActivity(f));
  const { data: deadlines = [] } = useQ(["analytics", "deadlines", ...key], () => s.analytics.deadlinesSummary(f));
  const { data: gpa = [] } = useQ(["analytics", "gpa"], () => s.grades.gpaTrend());
  const { data: goals = [] } = useQ(["analytics", "goals"], async () => {
    const list = await s.repos.goals.list({ where: ["t.status <> 'abandoned'"] });
    const prog = await s.goals.progress(list);
    return list.map((g) => ({ title: g.title, progress: prog.get(g.id) ?? 0 }));
  });
  const { data: projects = [] } = useQ(["analytics", "projects", projectId, subjectId], async () => {
    const list = (await s.projects.list({ subjectId })).filter((p) => !projectId || p.id === projectId);
    const prog = await s.projects.progress(list.map((p) => p.id));
    return list.map((p) => ({ name: p.name, percent: prog.get(p.id)?.percent ?? 0 }));
  });

  const currency = expenses?.byCategory[0]?.currency ?? null;
  const expenseCats = (expenses?.byCategory ?? []).filter((r) => r.currency === currency).map((r, i) => ({ label: t(`enums.expenseCategory.${r.category}`), value: r.total, color: SERIES[i % 8] }));
  const deadlineTotal = deadlines.reduce((a, r) => a + r.n, 0);
  const deadlineDone = deadlines.filter((r) => ["completed", "submitted"].includes(r.status)).reduce((a, r) => a + r.n, 0);

  return (
    <div>
      <PageHeader icon={<BarChart3 />} title={t("nav.analytics")} description={t("analytics.lead")}>
        <Toolbar>
          <Segmented value={preset} onChange={applyPreset} options={[{ value: "30", label: t("analytics.last30") }, { value: "90", label: t("analytics.last90") }, { value: "365", label: t("analytics.lastYear") }, { value: "custom", label: t("analytics.custom") }]} />
          {preset === "custom" && (
            <>
              <DatePicker value={from} onChange={setFrom} placeholder={t("filters.from")} className="w-44" />
              <DatePicker value={to} onChange={setTo} placeholder={t("filters.to")} className="w-44" />
            </>
          )}
          <SemesterSelect value={semesterId} onChange={setSemesterId} placeholder={t("filters.allSemesters")} className="w-44" />
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-48" />
          <ProjectSelect value={projectId} onChange={setProjectId} placeholder={t("filters.allProjects")} className="w-44" />
        </Toolbar>
      </PageHeader>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("analytics.tasksCompleted")} value={tasks?.completed ?? 0} icon={<ListTodo />} tone="success" />
          <Stat label={t("analytics.tasksOverdue")} value={tasks?.overdue ?? 0} icon={<AlarmClock />} tone={tasks?.overdue ? "danger" : undefined} />
          <Stat label={t("analytics.studyTime")} value={fmtMinutes(study?.totalMinutes ?? 0)} hint={t("analytics.sessions", { count: study?.sessions ?? 0 })} icon={<Timer />} />
          <Stat label={t("analytics.deadlinesDone")} value={`${deadlineDone}/${deadlineTotal}`} icon={<AlarmClock />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title={t("analytics.completedPerDay")} icon={<ListTodo />} empty={!tasks?.completedByDay.length}>
            <SimpleBars data={(tasks?.completedByDay ?? []).map((d) => ({ key: d.key.slice(5), value: d.value }))} name={t("analytics.tasksCompleted")} format={(v) => fmtNumber(v, 0)} />
          </ChartCard>
          <ChartCard title={t("analytics.tasksBySubject")} icon={<ListTodo />} empty={!tasks?.bySubject.length}>
            <StackedPair data={(tasks?.bySubject ?? []).map((r) => ({ label: r.name ?? t("common.noSubject"), a: r.open, b: r.done }))} a={t("analytics.open")} b={t("analytics.done")} />
          </ChartCard>
          <ChartCard title={t("analytics.studyPerDay")} icon={<Timer />} empty={!study?.byDay.length}>
            <SimpleBars data={(study?.byDay ?? []).map((d) => ({ key: d.key.slice(5), value: d.value }))} name={t("analytics.minutes")} format={(v) => fmtMinutes(v)} color={SERIES[2]} />
          </ChartCard>
          <ChartCard title={t("analytics.studyBySubject")} icon={<Timer />} empty={!study?.bySubject.length}>
            <CategoryBars data={(study?.bySubject ?? []).map((r) => ({ label: r.name ?? t("common.noSubject"), value: r.minutes, color: r.color }))} name={t("analytics.minutes")} format={(v) => fmtMinutes(v)} />
          </ChartCard>
          <ChartCard title={t("analytics.gpaTrend")} icon={<GraduationCap />} empty={gpa.length < 1}>
            <TrendLine
              data={gpa.map((g) => ({ key: g.semester.name, actual: g.actual, projected: g.projected }))}
              series={[{ key: "actual", name: t("grades.actual") }, { key: "projected", name: t("grades.projected") }]}
              format={(v) => fmtNumber(v, 2)}
            />
          </ChartCard>
          <ChartCard title={t("analytics.attendance")} icon={<UserCheck />} empty={!attendance.length}>
            <CategoryBars data={attendance.map((a) => ({ label: a.name, value: a.percent, color: a.color }))} name="%" format={(v) => `${fmtNumber(v, 0)}%`} />
          </ChartCard>
          <ChartCard title={t("analytics.notesOverTime")} icon={<NotebookPen />} empty={!notes.length}>
            <SimpleBars data={notes} name={t("nav.notes")} format={(v) => fmtNumber(v, 0)} color={SERIES[6]} />
          </ChartCard>
          <ChartCard title={t("analytics.researchOverTime")} icon={<Library />} empty={!research.length}>
            <SimpleBars data={research} name={t("nav.research")} format={(v) => fmtNumber(v, 0)} color={SERIES[3]} />
          </ChartCard>
          <ChartCard title={currency ? t("analytics.expensesByCategory", { currency }) : t("analytics.expenses")} icon={<Wallet />} empty={!expenseCats.length}>
            <CategoryBars data={expenseCats} name={currency ?? ""} format={(v) => (currency ? fmtMoney(v, currency) : fmtNumber(v))} />
          </ChartCard>
          <ChartCard title={t("analytics.ctfByCategory")} icon={<ShieldCheck />} empty={!cyber?.ctfByCategory.length}>
            <StackedPair data={(cyber?.ctfByCategory ?? []).map((r) => ({ label: t(`enums.ctfCategory.${r.category}`), a: r.total - r.solved, b: r.solved }))} a={t("analytics.unsolved")} b={t("analytics.solved")} />
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <ProgressList icon={<Target />} title={t("analytics.goalsProgress")} items={goals.map((g) => ({ label: g.title, value: g.progress }))} />
          <ProgressList icon={<FolderKanban />} title={t("analytics.projectProgress")} items={projects.map((p) => ({ label: p.name, value: p.percent }))} />
          <ProgressList icon={<ShieldCheck />} title={t("analytics.roadmaps")} items={(cyber?.roadmaps ?? []).filter((r) => r.total > 0).map((r) => ({ label: r.title, value: r.percent }))} footer={cyber ? t("analytics.cyberCounts", { commands: cyber.commands, notes: cyber.cyberNotes }) : undefined} />
        </div>
      </div>
    </div>
  );
}

function ProgressList({ title, icon, items, footer }: { title: string; icon: React.ReactNode; items: { label: string; value: number }[]; footer?: string }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={title} icon={icon} empty={items.length === 0} height="auto">
      <ul className="space-y-3 p-1">
        {items.map((it, i) => (
          <li key={i}>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="truncate text-fg">{it.label}</span>
              <span className="tabular-nums text-muted">{it.value}%</span>
            </div>
            <ProgressBar value={it.value} tone={it.value >= 100 ? "success" : "accent"} />
          </li>
        ))}
      </ul>
      {footer && <p className="mt-3 text-[11px] text-subtle">{footer}</p>}
      <span className="sr-only">{t("analytics.progressList")}</span>
    </ChartCard>
  );
}
