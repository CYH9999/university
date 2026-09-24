import * as React from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Pencil,
  Mail,
  Phone,
  Clock,
  User,
  MapPin,
  Building2,
  LayoutGrid,
  Presentation,
  NotebookPen,
  FolderOpen,
  AlarmClock,
  GraduationCap,
  ListTodo,
  CircleHelp,
  UserCheck,
  Library,
  FolderKanban,
  Plus,
  Upload,
} from "lucide-react";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useEditor } from "@/components/common/EntityDrawer";
import { Breadcrumbs, EmptyState, Stat, Card, CardHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/overlay";
import { Badge, Spinner, ProgressBar } from "@/components/ui/controls";
import { LinkList } from "@/components/common/LinksEditor";
import { SubjectEditor } from "./SubjectsPage";
import { LecturesPanel, SubjectFilesPanel, AttendancePanel } from "./SubjectPanels";
import { DeadlineList } from "@/features/deadlines/DeadlineList";
import { TaskList } from "@/features/tasks/TaskList";
import { NoteList, useCreateNote } from "@/features/notes/NotesPage";
import { QuestionList } from "@/features/questions/QuestionsPage";
import { ResourceGrid, useImportResources } from "@/features/research/ResearchPage";
import { GradeEditor } from "@/features/grades/GradeEditor";
import { fmtNumber, fmtWeekday } from "@/lib/format";
import { addDays, startOfWeek } from "@/core/utils/dates";
import { openApi } from "@/platform/tauri";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import type { Subject } from "@/core/model/types";
import { gradeLabel } from "@/lib/grading";

const TABS = ["overview", "lectures", "notes", "files", "assignments", "exams", "tasks", "questions", "grades", "attendance", "resources", "projects"] as const;
type Tab = (typeof TABS)[number];

export function SubjectPage() {
  const { id = "", tab = "overview" } = useParams();
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const editor = useEditor<Subject>();
  const createNote = useCreateNote();
  const importResources = useImportResources();
  const { data: subject, isLoading } = useQ(["subject", id], () => s.repos.subjects.get(id));
  const { data: overview } = useQ(["subject-overview", id], () => s.subjects.overview(id), { enabled: !!subject });
  const { data: semester } = useQ(["semester", subject?.semesterId], () => (subject?.semesterId ? s.repos.semesters.get(subject.semesterId) : Promise.resolve(null)), { enabled: !!subject });
  React.useEffect(() => {
    if (subject) void s.recent.touch("subject", subject.id, subject.name);
  }, [subject, s]);

  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (!subject) return <EmptyState icon={<BookOpen />} title={t("subjects.notFound")} action={<Button asChild><Link to="/subjects">{t("nav.subjects")}</Link></Button>} />;

  const icons: Record<Tab, React.ReactNode> = {
    overview: <LayoutGrid />,
    lectures: <Presentation />,
    notes: <NotebookPen />,
    files: <FolderOpen />,
    assignments: <AlarmClock />,
    exams: <GraduationCap />,
    tasks: <ListTodo />,
    questions: <CircleHelp />,
    grades: <GraduationCap />,
    attendance: <UserCheck />,
    resources: <Library />,
    projects: <FolderKanban />,
  };
  const counts: Partial<Record<Tab, number>> = {
    lectures: overview?.lectures,
    notes: overview?.notes,
    files: overview?.files,
    tasks: overview?.openTasks,
    questions: overview?.unresolvedQuestions,
    resources: overview?.resources,
    projects: overview?.projects,
  };
  const current = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : "overview";

  return (
    <div>
      <div className="border-b border-border px-6 pt-4" style={{ backgroundImage: `linear-gradient(to bottom, ${subject.color ?? "#2dd4bf"}14, transparent)` }}>
        <Breadcrumbs items={[{ label: t("nav.subjects"), to: "/subjects" }, ...(semester ? [{ label: semester.name }] : []), { label: subject.name }]} />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: subject.color ?? "rgb(var(--accent))" }}>
              {(subject.code ?? subject.name).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{subject.name}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {subject.code && <span className="font-mono" dir="ltr">{subject.code}</span>}
                <span>{t("subjects.creditsShort", { n: fmtNumber(subject.credits, 1) })}</span>
                {subject.professor && <span className="inline-flex items-center gap-1"><User className="size-3" /> {subject.professor}</span>}
                {subject.classroom && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {subject.classroom}</span>}
                {subject.archived && <Badge>{t("common.archived")}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => createNote({ subjectId: subject.id })}>
              <NotebookPen /> {t("notes.new")}
            </Button>
            <Button size="sm" onClick={() => navigate(`/subjects/${subject.id}/files`)}>
              <Upload /> {t("files.upload")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => editor.edit(subject)}>
              <Pencil /> {t("common.edit")}
            </Button>
          </div>
        </div>
        <Tabs
          className="mt-4"
          value={current}
          onValueChange={(v) => navigate(`/subjects/${subject.id}${v === "overview" ? "" : `/${v}`}`, { replace: true })}
          tabs={TABS.map((x) => ({ value: x, label: t(`subjects.tabs.${x}`), icon: icons[x], count: counts[x] }))}
          listClassName="border-b-0"
        />
      </div>

      <div className="p-6">
        {current === "overview" && <Overview subjectId={subject.id} />}
        {current === "lectures" && <LecturesPanel subject={subject} />}
        {current === "notes" && (
          <div>
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="primary" onClick={() => createNote({ subjectId: subject.id })}>
                <Plus /> {t("notes.new")}
              </Button>
            </div>
            <NoteList filter={{ subjectId: subject.id, limit: 2000 }} onCreate={() => createNote({ subjectId: subject.id })} />
          </div>
        )}
        {current === "files" && <SubjectFilesPanel subject={subject} />}
        {current === "assignments" && <DeadlineList filter={{ view: "all", subjectId: subject.id, types: ["assignment", "project", "presentation", "report", "other"] }} defaults={{ subjectId: subject.id, type: "assignment" }} showSubject={false} />}
        {current === "exams" && <DeadlineList filter={{ view: "all", subjectId: subject.id, types: ["exam", "quiz"] }} defaults={{ subjectId: subject.id, type: "exam" }} showSubject={false} />}
        {current === "tasks" && <TaskList filter={{ view: "all", subjectId: subject.id }} defaults={{ subjectId: subject.id }} />}
        {current === "questions" && <QuestionList subjectId={subject.id} status={null} compact />}
        {current === "grades" && <GradeEditor subjectId={subject.id} />}
        {current === "attendance" && <AttendancePanel subject={subject} />}
        {current === "resources" && (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => importResources(subject.id)}>
                <Upload /> {t("research.importFiles")}
              </Button>
              <Button size="sm" variant="primary" asChild>
                <Link to={`/research?new=1&subjectId=${subject.id}`}>
                  <Plus /> {t("research.new")}
                </Link>
              </Button>
            </div>
            {subject.links.length > 0 && (
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">{t("fields.usefulLinks")}</h3>
                <LinkList links={subject.links} />
              </Card>
            )}
            <ResourceGrid subjectId={subject.id} />
          </div>
        )}
        {current === "projects" && <SubjectProjects subjectId={subject.id} />}
      </div>
      <SubjectEditor editor={editor} />
    </div>
  );
}

function Overview({ subjectId }: { subjectId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data: subject } = useQ(["subject", subjectId], () => s.repos.subjects.get(subjectId));
  const { data: ov } = useQ(["subject-overview", subjectId], () => s.subjects.overview(subjectId));
  const { data: report } = useQ(["grades", "report", subjectId], () => s.grades.subjectReport(subjectId));
  const { data: entries = [] } = useQ(["timetable", "subject", subjectId], () => s.repos.timetable.list({ where: ["t.subject_id = ?"], params: [subjectId] }));
  if (!subject) return null;
  const weekStart = startOfWeek(new Date());
  const pct = report?.summary.finalPercent ?? report?.summary.projectedPercent ?? null;
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("subjects.stats.notes")} value={ov?.notes ?? 0} icon={<NotebookPen />} />
          <Stat label={t("subjects.stats.files")} value={ov?.files ?? 0} icon={<FolderOpen />} />
          <Stat label={t("subjects.stats.openTasks")} value={ov?.openTasks ?? 0} icon={<ListTodo />} />
          <Stat label={t("subjects.stats.upcoming")} value={ov?.upcomingDeadlines ?? 0} icon={<AlarmClock />} tone={ov?.upcomingDeadlines ? "warning" : undefined} />
        </div>
        <Card>
          <CardHeader title={t("subjects.upcoming")} icon={<AlarmClock />} actions={<Button size="sm" variant="ghost" asChild><Link to={`/subjects/${subjectId}/exams`}>{t("common.viewAll")}</Link></Button>} />
          <div className="p-3">
            <DeadlineList filter={{ view: "upcoming", subjectId, limit: 6 }} showSubject={false} allowCreate={false} emptyTitle={t("subjects.noUpcoming")} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("dashboard.widgets.recentNotes")} icon={<NotebookPen />} actions={<Button size="sm" variant="ghost" asChild><Link to={`/subjects/${subjectId}/notes`}>{t("common.viewAll")}</Link></Button>} />
          <div className="p-3">
            <NoteList filter={{ subjectId, limit: 6 }} />
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("subjects.info")}</h3>
          <div className="space-y-2 text-sm">
            {subject.professor && <Info icon={<User />} value={subject.professor} />}
            {subject.department && <Info icon={<Building2 />} value={subject.department} />}
            {subject.contactEmail && (
              <Info icon={<Mail />} value={<button type="button" className="text-accent hover:underline" dir="ltr" onClick={() => openApi.url(`mailto:${subject.contactEmail}`).catch((e) => toast.error(errorMessage(e)))}>{subject.contactEmail}</button>} />
            )}
            {subject.contactPhone && <Info icon={<Phone />} value={<span dir="ltr">{subject.contactPhone}</span>} />}
            {subject.officeHours && <Info icon={<Clock />} value={subject.officeHours} />}
            {subject.contactNotes && <p className="whitespace-pre-wrap text-xs text-muted">{subject.contactNotes}</p>}
            {!subject.professor && !subject.contactEmail && !subject.officeHours && <p className="text-xs text-subtle">{t("subjects.noInfo")}</p>}
          </div>
          {subject.links.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <LinkList links={subject.links} />
            </div>
          )}
          {subject.description && <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted" dir="auto">{subject.description}</p>}
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 flex items-center justify-between text-sm font-semibold">
            {t("subjects.weeklySchedule")}
            <Link to="/timetable" className="text-xs font-normal text-accent hover:underline">{t("nav.timetable")}</Link>
          </h3>
          {entries.length === 0 ? (
            <p className="text-xs text-subtle">{t("subjects.noSchedule")}</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className="w-20 text-muted">{fmtWeekday(addDays(weekStart, e.day))}</span>
                  <span className="font-mono text-xs" dir="ltr">{e.startTime}–{e.endTime}</span>
                  <span className="truncate text-xs text-subtle">{[t(`enums.sessionKind.${e.kind}`), e.room].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            {t("nav.grades")}
            <Link to={`/subjects/${subjectId}/grades`} className="text-xs font-normal text-accent hover:underline">{t("common.details")}</Link>
          </h3>
          {report && report.items.length > 0 ? (
            <>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-semibold tabular-nums">{pct === null ? "—" : `${fmtNumber(pct, 1)}%`}</div>
                <Badge tone={report.summary.state === "final" ? "success" : "warning"}>{t(`grades.states.${report.summary.state}`)}</Badge>
              </div>
              <ProgressBar className="mt-2" value={pct ?? 0} />
              <p className="mt-1 text-xs text-subtle">{gradeLabel(report.summary.state === "final" ? report.letter : report.projectedLetter)}</p>
            </>
          ) : (
            <p className="text-xs text-subtle">{t("grades.noItems")}</p>
          )}
        </Card>
        {ov && ov.attendance.total > 0 && (
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("subjects.tabs.attendance")}</h3>
            <div className="text-2xl font-semibold tabular-nums">{fmtNumber(ov.attendance.attendancePercent, 0)}%</div>
            <p className="text-xs text-subtle">{t("attendance.absencePct", { pct: fmtNumber(ov.attendance.absencePercent, 0), limit: ov.attendance.threshold })}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Info({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted">
      {icon}
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function SubjectProjects({ subjectId }: { subjectId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["projects", "subject", subjectId], () => s.projects.list({ subjectId, includeArchived: true }));
  const { data: prog } = useQ(["projects", "progress", data.map((p) => p.id).join()], () => s.projects.progress(data.map((p) => p.id)), { enabled: data.length > 0 });
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="primary" asChild>
          <Link to={`/projects?new=1&subjectId=${subjectId}`}>
            <Plus /> {t("projects.new")}
          </Link>
        </Button>
      </div>
      {data.length === 0 ? (
        <EmptyState compact icon={<FolderKanban />} title={t("projects.emptySubject")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card p-4 hover:border-accent/40">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{p.name}</span>
                <Badge>{t(`enums.projectStatus.${p.status}`)}</Badge>
              </div>
              <ProgressBar className="mt-3" value={prog?.get(p.id)?.percent ?? 0} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
