import * as React from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  CalendarDays,
  Clock,
  MapPin,
  Zap,
  CalendarClock,
  AlarmClock,
  ListTodo,
  AlertTriangle,
  CircleHelp,
  NotebookPen,
  FileClock,
  FolderKanban,
  Target,
  UserX,
  GraduationCap,
  Timer,
  Bell,
  Flame,
} from "lucide-react";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useActiveSemester, useSubjectMap, useNow } from "@/lib/hooks";
import { CardHeader, EmptyState } from "@/components/ui/misc";
import { Checkbox, ProgressBar, Badge, ColorDot } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { CountdownBadge, PriorityBadge, SubjectChip } from "@/components/common/badges";
import { RecentFileRow } from "@/components/common/files";
import { fmtDate, fmtWeekday, fmtRelative, fmtNumber, fmtMinutes } from "@/lib/format";
import { toDateKey } from "@/core/utils/dates";
import { QUICK_ACTIONS } from "@/app/shell/TopBar";
import { notificationText } from "@/app/shell/notificationText";
import type { DashboardWidget } from "@/app/settings";
import { cn } from "@/lib/cn";

export const WIDGET_META: Record<DashboardWidget, { icon: typeof Zap; wide?: boolean }> = {
  today: { icon: CalendarDays },
  nextLecture: { icon: Clock },
  quickActions: { icon: Zap },
  todayLectures: { icon: CalendarClock },
  deadlines: { icon: AlarmClock },
  tasksToday: { icon: ListTodo },
  overdue: { icon: AlertTriangle },
  questions: { icon: CircleHelp },
  recentNotes: { icon: NotebookPen },
  recentFiles: { icon: FileClock },
  projects: { icon: FolderKanban },
  goals: { icon: Target },
  attendance: { icon: UserX },
  gpa: { icon: GraduationCap },
  study: { icon: Timer },
  notifications: { icon: Bell },
};

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-3", className)}>{children}</div>;
}

export function WidgetFrame({ id, children, actions }: { id: DashboardWidget; children: React.ReactNode; actions?: React.ReactNode }) {
  const { t } = useTranslation();
  const Icon = WIDGET_META[id].icon;
  return (
    <>
      <CardHeader title={t(`dashboard.widgets.${id}`)} icon={<Icon />} actions={actions} />
      {children}
    </>
  );
}

export function TodayWidget() {
  const { t } = useTranslation();
  const now = useNow(30_000);
  const { semester } = useActiveSemester();
  return (
    <WidgetFrame id="today">
      <Body className="flex h-[calc(100%-49px)] flex-col justify-center">
        <div className="text-sm text-muted">{fmtWeekday(now)}</div>
        <div className="text-2xl font-semibold tracking-tight">{fmtDate(toDateKey(now), "d MMMM yyyy")}</div>
        <div className="mt-1 font-mono text-3xl tabular-nums text-accent" dir="ltr">
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <CalendarDays className="size-3.5" />
          {semester ? (
            <Link to="/semesters" className="hover:text-fg">
              {semester.name}
              {semester.academicYear ? ` · ${semester.academicYear}` : ""}
            </Link>
          ) : (
            <Link to="/semesters?new=1" className="text-accent hover:underline">
              {t("semesters.createFirst")}
            </Link>
          )}
        </div>
      </Body>
    </WidgetFrame>
  );
}

export function NextLectureWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { semester } = useActiveSemester();
  const now = useNow(60_000);
  const { data: next, isLoading } = useQ(["timetable", "next", semester?.id, toDateKey(now), now.getHours()], () => s.timetable.next(semester?.id ?? null));
  let body: React.ReactNode;
  if (isLoading) body = null;
  else if (!next) body = <EmptyState compact icon={<Clock />} title={t("dashboard.noNextLecture")} action={<Button size="sm" asChild><Link to="/timetable">{t("nav.timetable")}</Link></Button>} />;
  else {
    const mins = Math.round((next.start.getTime() - now.getTime()) / 60000);
    const running = mins <= 0;
    body = (
      <Body>
        <Link to={`/subjects/${next.entry.subjectId}`} className="flex items-center gap-2 text-lg font-semibold hover:text-accent">
          <ColorDot color={next.entry.color ?? next.subject?.color} className="size-3" />
          <span className="truncate">{next.subject?.name}</span>
        </Link>
        <div className="mt-1 text-sm text-muted">
          {next.date === toDateKey(now) ? t("common.today") : fmtWeekday(next.start)} · <span dir="ltr">{next.entry.startTime}–{next.entry.endTime}</span>
        </div>
        {(next.entry.room || next.entry.building) && (
          <div className="mt-1 flex items-center gap-1 text-xs text-subtle">
            <MapPin className="size-3" /> {[next.entry.room, next.entry.building].filter(Boolean).join(" · ")}
          </div>
        )}
        <Badge tone={running ? "success" : mins <= 30 ? "warning" : "accent"} className="mt-3">
          {running ? t("dashboard.lectureNow") : mins < 60 * 24 ? t("dashboard.startsIn", { time: fmtMinutes(mins) }) : t("dashboard.startsOn", { date: fmtDate(next.date, "EEEE d MMM") })}
        </Badge>
      </Body>
    );
  }
  return <WidgetFrame id="nextLecture">{body}</WidgetFrame>;
}

export function QuickActionsWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <WidgetFrame id="quickActions">
      <Body className="grid grid-cols-2 gap-1.5">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} type="button" onClick={() => navigate(a.to)} className="flex items-center gap-2 rounded-md border border-border bg-sunken px-2.5 py-2 text-start text-xs transition-colors hover:border-accent/50 hover:text-accent">
            <a.icon className="size-4 shrink-0" />
            <span className="truncate">{t(`quick.${a.key}`)}</span>
          </button>
        ))}
      </Body>
    </WidgetFrame>
  );
}

export function TodayLecturesWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { semester } = useActiveSemester();
  const now = useNow(60_000);
  const today = toDateKey(now);
  const { data = [] } = useQ(["timetable", "day", semester?.id, today], () => s.timetable.forDay(semester?.id ?? null, today));
  return (
    <WidgetFrame id="todayLectures" actions={<Button size="sm" variant="ghost" asChild><Link to="/timetable">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<CalendarClock />} title={t("dashboard.noLecturesToday")} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((o) => {
            const past = o.end < now;
            const live = o.start <= now && o.end > now;
            return (
              <li key={o.entry.id} className={cn("flex items-center gap-3 px-4 py-2.5", past && "opacity-50")}>
                <span className="w-24 shrink-0 font-mono text-xs text-muted" dir="ltr">{o.entry.startTime}–{o.entry.endTime}</span>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: o.entry.color ?? o.subject?.color ?? "rgb(var(--accent))" }} />
                <Link to={`/subjects/${o.entry.subjectId}`} className="min-w-0 flex-1 hover:text-accent">
                  <div className="truncate text-sm font-medium">{o.subject?.name}</div>
                  <div className="truncate text-xs text-subtle">{[t(`enums.sessionKind.${o.entry.kind}`), o.entry.room, o.entry.building].filter(Boolean).join(" · ")}</div>
                </Link>
                {live && <Badge tone="success">{t("dashboard.now")}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function DeadlinesWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const { data = [] } = useQ(["deadlines", "upcoming", 8], () => s.deadlines.upcoming(8));
  return (
    <WidgetFrame id="deadlines" actions={<Button size="sm" variant="ghost" asChild><Link to="/deadlines">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<AlarmClock />} title={t("dashboard.noDeadlines")} action={<Button size="sm" asChild><Link to="/deadlines?new=1">{t("deadlines.new")}</Link></Button>} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((d) => (
            <li key={d.id}>
              <Link to={`/deadlines?open=${d.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                    <span>{t(`enums.deadlineType.${d.type}`)}</span>·<span>{fmtDate(d.dueDate, "EEE d MMM")}{d.dueTime ? ` ${d.dueTime}` : ""}</span>
                    <SubjectChip subject={d.subjectId ? subjects.get(d.subjectId) : null} link={false} />
                  </div>
                </div>
                <CountdownBadge deadline={d} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function TasksTodayWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const { data = [] } = useQ(["tasks", "view", "today-widget"], () => s.tasks.list({ view: "today", limit: 12 }));
  const toggle = useMut((id: string) => s.tasks.toggleDone(id));
  const today = toDateKey(new Date());
  const list = data.filter((x) => x.dueDate === today);
  return (
    <WidgetFrame id="tasksToday" actions={<Button size="sm" variant="ghost" asChild><Link to="/tasks?view=today">{t("common.viewAll")}</Link></Button>}>
      {list.length === 0 ? (
        <EmptyState compact icon={<ListTodo />} title={t("dashboard.noTasksToday")} action={<Button size="sm" asChild><Link to="/tasks?new=1">{t("tasks.new")}</Link></Button>} />
      ) : (
        <ul className="divide-y divide-border">
          {list.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-2">
              <Checkbox checked={task.status === "completed"} onCheckedChange={() => toggle.mutate(task.id)} />
              <Link to={`/tasks?open=${task.id}`} className="min-w-0 flex-1 truncate text-sm hover:text-accent">
                {task.title}
              </Link>
              <SubjectChip subject={task.subjectId ? subjects.get(task.subjectId) : null} link={false} />
              {task.priority === "urgent" || task.priority === "high" ? <PriorityBadge priority={task.priority} /> : null}
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function OverdueWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { data: tasks = [] } = useQ(["tasks", "view", "overdue-widget"], () => s.tasks.list({ view: "overdue", limit: 8 }));
  const { data: deadlines = [] } = useQ(["deadlines", "overdue-widget"], () => s.deadlines.list({ view: "overdue", limit: 8 }));
  const total = tasks.length + deadlines.length;
  return (
    <WidgetFrame id="overdue">
      {total === 0 ? (
        <EmptyState compact icon={<AlertTriangle />} title={t("dashboard.nothingOverdue")} />
      ) : (
        <ul className="divide-y divide-border">
          {deadlines.map((d) => (
            <li key={d.id}>
              <Link to={`/deadlines?open=${d.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-surface-2/50">
                <AlarmClock className="size-4 shrink-0 text-danger" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                <CountdownBadge deadline={d} />
              </Link>
            </li>
          ))}
          {tasks.map((task) => (
            <li key={task.id}>
              <Link to={`/tasks?open=${task.id}`} className="flex items-center gap-2 px-4 py-2 hover:bg-surface-2/50">
                <ListTodo className="size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                <span className="text-xs text-danger">{fmtDate(task.dueDate, "d MMM")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function QuestionsWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const { data = [] } = useQ(["questions", "unresolved-widget"], () => s.repos.questions.list({ where: ["t.status IN ('unresolved','researching')"], limit: 6 }));
  return (
    <WidgetFrame id="questions" actions={<Button size="sm" variant="ghost" asChild><Link to="/questions">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<CircleHelp />} title={t("dashboard.noQuestions")} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((q) => (
            <li key={q.id}>
              <Link to={`/questions?open=${q.id}`} className="block px-4 py-2 hover:bg-surface-2/50">
                <div className="line-clamp-2 text-sm">{q.text}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <SubjectChip subject={q.subjectId ? subjects.get(q.subjectId) : null} link={false} />
                  <span className="text-[11px] text-subtle">{t(`enums.questionStatus.${q.status}`)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function RecentNotesWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const { data = [] } = useQ(["notes", "recent"], () => s.notes.recent(6));
  return (
    <WidgetFrame id="recentNotes" actions={<Button size="sm" variant="ghost" asChild><Link to="/notes">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<NotebookPen />} title={t("dashboard.noNotes")} action={<Button size="sm" asChild><Link to="/notes?new=1">{t("notes.new")}</Link></Button>} />
      ) : (
        <ul className="p-1.5">
          {data.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                <NotebookPen className="size-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
                <SubjectChip subject={n.subjectId ? subjects.get(n.subjectId) : null} link={false} />
                <span className="shrink-0 text-[11px] text-subtle">{fmtRelative(n.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function RecentFilesWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["files", "recent"], () => s.files.recent(6));
  return (
    <WidgetFrame id="recentFiles" actions={<Button size="sm" variant="ghost" asChild><Link to="/files">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? <EmptyState compact icon={<FileClock />} title={t("dashboard.noRecentFiles")} /> : <div className="p-1.5">{data.map((f) => <RecentFileRow key={f.id} f={f} />)}</div>}
    </WidgetFrame>
  );
}

export function ProjectsWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["projects", "active-widget"], async () => {
    const list = await s.repos.projects.list({ where: ["t.status IN ('planning','in_progress','review')"], limit: 5 });
    const prog = await s.projects.progress(list.map((p) => p.id));
    return list.map((p) => ({ p, progress: prog.get(p.id)?.percent ?? 0 }));
  });
  return (
    <WidgetFrame id="projects" actions={<Button size="sm" variant="ghost" asChild><Link to="/projects">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<FolderKanban />} title={t("dashboard.noProjects")} />
      ) : (
        <ul className="space-y-3 p-4">
          {data.map(({ p, progress }) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`} className="block hover:text-accent">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{progress}%</span>
                </div>
                <ProgressBar value={progress} className="mt-1.5" />
                {p.deadline && <div className="mt-1 text-[11px] text-subtle">{t("projects.dueOn", { date: fmtDate(p.deadline) })}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function GoalsWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["goals", "active-widget"], async () => {
    const list = await s.repos.goals.list({ where: ["t.status IN ('active','not_started')"], limit: 5 });
    const prog = await s.goals.progress(list);
    return list.map((g) => ({ g, progress: prog.get(g.id) ?? 0 }));
  });
  return (
    <WidgetFrame id="goals" actions={<Button size="sm" variant="ghost" asChild><Link to="/goals">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<Target />} title={t("dashboard.noGoals")} />
      ) : (
        <ul className="space-y-3 p-4">
          {data.map(({ g, progress }) => (
            <li key={g.id}>
              <Link to={`/goals?open=${g.id}`} className="block hover:text-accent">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{g.title}</span>
                  <span className="text-xs tabular-nums text-muted">{progress}%</span>
                </div>
                <ProgressBar value={progress} tone="success" className="mt-1.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function AttendanceWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { semester } = useActiveSemester();
  const { data = [] } = useQ(["attendance", "warnings", semester?.id], () => s.subjects.attendanceWarnings(semester?.id ?? null));
  return (
    <WidgetFrame id="attendance">
      {data.length === 0 ? (
        <EmptyState compact icon={<UserX />} title={t("dashboard.noAttendanceWarnings")} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map(({ subject, stats }) => (
            <li key={subject.id}>
              <Link to={`/subjects/${subject.id}/attendance`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-2/50">
                <ColorDot color={subject.color} />
                <span className="min-w-0 flex-1 truncate text-sm">{subject.name}</span>
                <Badge tone={stats.level === "exceeded" ? "danger" : "warning"}>
                  {t("attendance.absencePct", { pct: fmtNumber(stats.absencePercent, 0), limit: stats.threshold })}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  );
}

export function GpaWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { semester } = useActiveSemester();
  const { data: sem } = useQ(["gpa", "semester", semester?.id], () => (semester ? s.grades.semesterGpa(semester.id) : Promise.resolve(null)));
  const { data: cum } = useQ(["gpa", "cumulative"], () => s.grades.cumulativeGpa());
  const fmt = (v: number | null | undefined, kind?: string) => (v === null || v === undefined ? "—" : kind === "percentage" ? `${fmtNumber(v, 1)}%` : fmtNumber(v, 2));
  const hasAny = (sem?.subjects.length ?? 0) > 0 || (cum?.subjects.length ?? 0) > 0;
  return (
    <WidgetFrame id="gpa" actions={<Button size="sm" variant="ghost" asChild><Link to="/grades">{t("common.viewAll")}</Link></Button>}>
      {!hasAny ? (
        <EmptyState compact icon={<GraduationCap />} title={t("dashboard.noGrades")} />
      ) : (
        <Body className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted">{t("grades.semesterGpa")}</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(sem?.actual, sem?.scale?.kind)}</div>
            <div className="text-[11px] text-subtle">{t("grades.projected")}: {fmt(sem?.projected, sem?.scale?.kind)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">{t("grades.cumulativeGpa")}</div>
            <div className="text-2xl font-semibold tabular-nums">{fmt(cum?.actual, cum?.scale?.kind)}</div>
            <div className="text-[11px] text-subtle">{t("grades.creditsDone", { n: fmtNumber(cum?.actualCredits ?? 0, 1) })}</div>
          </div>
        </Body>
      )}
    </WidgetFrame>
  );
}

export function StudyWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const { data } = useQ(["study", "totals"], () => s.study.totals());
  return (
    <WidgetFrame id="study" actions={<Button size="sm" variant="ghost" asChild><Link to="/study?start=1">{t("study.start")}</Link></Button>}>
      <Body className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-semibold tabular-nums">{fmtMinutes(data?.todayMinutes ?? 0)}</div>
          <div className="text-[11px] text-subtle">{t("study.today")}</div>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums">{fmtMinutes(data?.weekMinutes ?? 0)}</div>
          <div className="text-[11px] text-subtle">{t("study.last7")}</div>
        </div>
        <div>
          <div className="flex items-center justify-center gap-1 text-xl font-semibold tabular-nums">
            <Flame className="size-4 text-warning" /> {data?.streakDays ?? 0}
          </div>
          <div className="text-[11px] text-subtle">{t("study.streak")}</div>
        </div>
      </Body>
    </WidgetFrame>
  );
}

export function NotificationsWidget() {
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const { data = [] } = useQ(["notifications", "widget"], () => s.notifications.list({ status: "active", limit: 6 }));
  return (
    <WidgetFrame id="notifications" actions={<Button size="sm" variant="ghost" asChild><Link to="/notifications">{t("common.viewAll")}</Link></Button>}>
      {data.length === 0 ? (
        <EmptyState compact icon={<Bell />} title={t("notifications.empty")} />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((n) => {
            const txt = notificationText(n);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-4 py-2 text-start hover:bg-surface-2/50"
                  onClick={async () => {
                    await s.notifications.setStatus(n.id, "read");
                    if (n.route) navigate(n.route);
                  }}
                >
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.status === "unread" ? "bg-accent" : "bg-transparent")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{txt.title}</div>
                    <div className="truncate text-xs text-subtle">{txt.body}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-subtle">{fmtRelative(n.triggerAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetFrame>
  );
}

export const WIDGETS: Record<DashboardWidget, React.ComponentType> = {
  today: TodayWidget,
  nextLecture: NextLectureWidget,
  quickActions: QuickActionsWidget,
  todayLectures: TodayLecturesWidget,
  deadlines: DeadlinesWidget,
  tasksToday: TasksTodayWidget,
  overdue: OverdueWidget,
  questions: QuestionsWidget,
  recentNotes: RecentNotesWidget,
  recentFiles: RecentFilesWidget,
  projects: ProjectsWidget,
  goals: GoalsWidget,
  attendance: AttendanceWidget,
  gpa: GpaWidget,
  study: StudyWidget,
  notifications: NotificationsWidget,
};
