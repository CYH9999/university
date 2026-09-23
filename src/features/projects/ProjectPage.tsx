import * as React from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { FolderKanban, Pencil, LayoutGrid, Columns3, GanttChart, ListTodo, FolderOpen, Users, CalendarDays, NotebookPen, Library, Milestone, AlarmClock, Plus } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { useEditor } from "@/components/common/EntityDrawer";
import { Breadcrumbs, EmptyState, Stat, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/overlay";
import { Badge, ProgressBar, Spinner } from "@/components/ui/controls";
import { LinkList } from "@/components/common/LinksEditor";
import { AttachmentsPanel } from "@/components/common/files";
import { SubjectChip, PriorityBadge } from "@/components/common/badges";
import { ProjectEditor, PROJECT_TONE } from "./ProjectsPage";
import { MilestonesPanel, TeamPanel, MeetingsPanel, TimelinePanel, ProjectResearchPanel } from "./ProjectPanels";
import { TaskList } from "@/features/tasks/TaskList";
import { Kanban } from "@/features/tasks/TasksPage";
import { TaskEditor } from "@/features/tasks/TaskEditor";
import { NoteList, useCreateNote } from "@/features/notes/NotesPage";
import { DeadlineList } from "@/features/deadlines/DeadlineList";
import { useSubjectMap } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { openApi } from "@/platform/tauri";
import { errorMessage } from "@/lib/errors";
import { diffDays, toDateKey } from "@/core/utils/dates";
import type { Project, Task } from "@/core/model/types";

const TABS = ["overview", "board", "timeline", "tasks", "milestones", "deadlines", "files", "team", "meetings", "notes", "research"] as const;
type Tab = (typeof TABS)[number];

export function ProjectPage() {
  const { id = "", tab = "overview" } = useParams();
  const { t } = useTranslation();
  const s = useServices();
  const navigate = useNavigate();
  const editor = useEditor<Project>();
  const taskEditor = useEditor<Task>();
  const createNote = useCreateNote();
  const subjects = useSubjectMap();
  const { data: project, isLoading } = useQ(["project", id], () => s.repos.projects.get(id));
  const { data: prog } = useQ(["projects", "progress", id], () => s.projects.progress([id]), { enabled: !!project });
  React.useEffect(() => {
    if (project) void s.recent.touch("project", project.id, project.name);
  }, [project, s]);
  if (isLoading) return <div className="flex h-full items-center justify-center"><Spinner className="size-6" /></div>;
  if (!project) return <EmptyState icon={<FolderKanban />} title={t("projects.notFound")} />;
  const pr = prog?.get(project.id);
  const current = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : "overview";
  const icons: Record<Tab, React.ReactNode> = {
    overview: <LayoutGrid />,
    board: <Columns3 />,
    timeline: <GanttChart />,
    tasks: <ListTodo />,
    milestones: <Milestone />,
    deadlines: <AlarmClock />,
    files: <FolderOpen />,
    team: <Users />,
    meetings: <CalendarDays />,
    notes: <NotebookPen />,
    research: <Library />,
  };
  const days = project.deadline ? diffDays(toDateKey(new Date()), project.deadline) : null;

  const openFolder = async () => {
    try {
      await openApi.reveal(await s.files.ensureProjectFolder(project));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <div className="border-b border-border px-6 pt-4">
        <Breadcrumbs items={[{ label: t("nav.projects"), to: "/projects" }, { label: project.name }]} />
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: project.color ?? "rgb(var(--accent))" }} />
              <h1 className="truncate text-xl font-semibold">{project.name}</h1>
              <Badge tone={PROJECT_TONE[project.status]}>{t(`enums.projectStatus.${project.status}`)}</Badge>
              {(project.priority === "high" || project.priority === "urgent") && <PriorityBadge priority={project.priority} />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
              <SubjectChip subject={project.subjectId ? subjects.get(project.subjectId) : null} />
              {project.professor && <span>{project.professor}</span>}
              {project.deadline && (
                <span className={days !== null && days < 0 && !["completed", "submitted"].includes(project.status) ? "text-danger" : ""}>
                  {t("projects.dueOn", { date: fmtDate(project.deadline) })}
                  {days !== null && days >= 0 && ` · ${t("projects.daysLeft", { count: days })}`}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-40">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>{t("projects.progress")}</span>
                <span className="tabular-nums">{pr?.percent ?? project.progress}%</span>
              </div>
              <ProgressBar value={pr?.percent ?? project.progress} />
            </div>
            <Button size="sm" onClick={openFolder}>
              <FolderOpen /> {t("projects.openFolder")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => editor.edit(project)}>
              <Pencil /> {t("common.edit")}
            </Button>
          </div>
        </div>
        <Tabs className="mt-4" listClassName="border-b-0" value={current} onValueChange={(v) => navigate(`/projects/${project.id}${v === "overview" ? "" : `/${v}`}`, { replace: true })} tabs={TABS.map((x) => ({ value: x, label: t(`projects.tabs.${x}`), icon: icons[x] }))} />
      </div>
      <div className="p-6">
        {current === "overview" && (
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label={t("projects.stats.tasks")} value={`${pr?.tasksDone ?? 0}/${pr?.tasksTotal ?? 0}`} />
                <Stat label={t("projects.stats.milestones")} value={`${pr?.milestonesDone ?? 0}/${pr?.milestonesTotal ?? 0}`} />
                <Stat label={t("projects.stats.progress")} value={`${pr?.percent ?? project.progress}%`} tone="accent" />
                <Stat label={t("projects.stats.daysLeft")} value={days === null ? "—" : days} tone={days !== null && days < 3 ? "danger" : undefined} />
              </div>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">{t("fields.description")}</h3>
                {project.description ? <p className="whitespace-pre-wrap text-sm text-muted" dir="auto">{project.description}</p> : <p className="text-xs text-subtle">{t("projects.noDescription")}</p>}
                {project.links.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <LinkList links={project.links} />
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t("projects.openTasks")}</h3>
                  <Button size="sm" variant="ghost" asChild><Link to={`/projects/${project.id}/tasks`}>{t("common.viewAll")}</Link></Button>
                </div>
                <TaskList filter={{ view: "all", projectId: project.id, limit: 8 }} defaults={{ projectId: project.id, subjectId: project.subjectId }} />
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold">{t("projects.tabs.milestones")}</h3>
                <MilestonesPanel project={project} />
              </Card>
            </div>
          </div>
        )}
        {current === "board" && (
          <div>
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="primary" onClick={() => taskEditor.create({ projectId: project.id, subjectId: project.subjectId })}>
                <Plus /> {t("tasks.new")}
              </Button>
            </div>
            <Kanban filter={{ projectId: project.id }} onOpen={taskEditor.edit} />
          </div>
        )}
        {current === "timeline" && <TimelinePanel project={project} />}
        {current === "tasks" && <TaskList filter={{ view: "all", projectId: project.id, includeDone: true }} defaults={{ projectId: project.id, subjectId: project.subjectId }} />}
        {current === "milestones" && <MilestonesPanel project={project} />}
        {current === "deadlines" && <DeadlineList filter={{ view: "all", projectId: project.id }} defaults={{ projectId: project.id, subjectId: project.subjectId, type: "project" }} />}
        {current === "files" && (
          <div className="space-y-3">
            {project.folderRel && <p className="font-mono text-[11px] text-subtle" dir="ltr">{project.folderRel}</p>}
            <AttachmentsPanel entityType="project" entityId={project.id} title={t("projects.files")} />
          </div>
        )}
        {current === "team" && <TeamPanel project={project} />}
        {current === "meetings" && <MeetingsPanel project={project} />}
        {current === "notes" && (
          <div>
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="primary" onClick={() => createNote({ projectId: project.id, subjectId: project.subjectId, noteType: "personal" })}>
                <Plus /> {t("notes.new")}
              </Button>
            </div>
            <NoteList filter={{ projectId: project.id }} />
          </div>
        )}
        {current === "research" && <ProjectResearchPanel project={project} />}
      </div>
      <ProjectEditor editor={editor} />
      <TaskEditor editor={taskEditor} />
    </div>
  );
}
