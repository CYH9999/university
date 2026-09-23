import * as React from "react";
import { useTranslation } from "react-i18next";
import { ListTodo, Plus, List, Columns3 } from "lucide-react";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { PageHeader, Toolbar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { NativeSelect } from "@/components/ui/input";
import { SubjectSelect, ProjectSelect, EnumSelect } from "@/components/common/pickers";
import { useEditor } from "@/components/common/EntityDrawer";
import { PriorityBadge, SubjectChip } from "@/components/common/badges";
import { TaskEditor } from "./TaskEditor";
import { TaskList } from "./TaskList";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useNewParam, useOpenParam, useSearchParam, useSubjectMap } from "@/lib/hooks";
import { TASK_STATUSES, type TaskStatus } from "@/core/model/enums";
import type { Task } from "@/core/model/types";
import type { TaskView } from "@/core/services/tasks";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/cn";

const VIEWS: TaskView[] = ["today", "week", "upcoming", "overdue", "inbox", "all", "completed"];

export function TasksPage() {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Task>();
  const [viewParam, setView] = useSearchParam("view");
  const view = (viewParam as TaskView) ?? "today";
  const [mode, setMode] = React.useState<"list" | "kanban">("list");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<string | null>(null);
  const [groupBy, setGroupBy] = React.useState<"none" | "subject" | "project">("none");
  const { data: counts } = useQ(["tasks", "counts"], () => s.tasks.counts());

  useNewParam((p) => editor.create({ subjectId: p.get("subjectId"), projectId: p.get("projectId"), dueDate: p.get("date") ?? undefined }));
  useOpenParam((id) => void s.repos.tasks.get(id).then((x) => x && editor.edit(x)));

  const filter = { view: mode === "kanban" ? ("all" as TaskView) : view, subjectId, projectId, priority, includeDone: mode === "kanban" };

  return (
    <div>
      <PageHeader
        icon={<ListTodo />}
        title={t("nav.tasks")}
        description={counts ? t("tasks.summary", { today: counts.today, overdue: counts.overdue, open: counts.open }) : undefined}
        actions={
          <Button variant="primary" onClick={() => editor.create({ subjectId, projectId })}>
            <Plus /> {t("tasks.new")}
          </Button>
        }
      >
        <Toolbar>
          <Segmented value={mode} onChange={setMode} options={[{ value: "list", label: t("views.list"), icon: <List /> }, { value: "kanban", label: t("views.kanban"), icon: <Columns3 /> }]} />
          {mode === "list" && (
            <Segmented
              value={view}
              onChange={(v) => setView(v)}
              options={VIEWS.map((v) => ({ value: v, label: `${t(`tasks.views.${v}`)}${v === "overdue" && counts?.overdue ? ` (${counts.overdue})` : v === "inbox" && counts?.inbox ? ` (${counts.inbox})` : ""}` }))}
            />
          )}
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-48" />
          <ProjectSelect value={projectId} onChange={setProjectId} placeholder={t("filters.allProjects")} className="w-44" />
          <EnumSelect name="priority" value={priority} onChange={setPriority} placeholder={t("filters.anyPriority")} className="w-36" />
          {mode === "list" && (
            <NativeSelect
              className="w-40"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "none")}
              options={[
                { value: "none", label: t("tasks.groupNone") },
                { value: "subject", label: t("tasks.groupSubject") },
                { value: "project", label: t("tasks.groupProject") },
              ]}
            />
          )}
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {mode === "list" ? (
          <TaskList filter={filter} groupBy={groupBy} defaults={{ subjectId, projectId }} emptyTitle={t(`tasks.emptyViews.${view}`)} />
        ) : (
          <Kanban filter={filter} onOpen={editor.edit} />
        )}
      </div>
      <TaskEditor editor={editor} />
    </div>
  );
}

function KanbanCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const subjects = useSubjectMap();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("cursor-grab rounded-md border border-border bg-surface p-2.5 text-sm shadow-sm hover:border-border-strong active:cursor-grabbing", isDragging && "z-20 opacity-80 shadow-lg")}
    >
      <div className={cn("line-clamp-2", task.status === "completed" && "text-subtle line-through")}>{task.title}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-subtle">
        <SubjectChip subject={task.subjectId ? subjects.get(task.subjectId) : null} link={false} />
        {task.dueDate && <span>{fmtDate(task.dueDate, "d MMM")}</span>}
        {(task.priority === "high" || task.priority === "urgent") && <PriorityBadge priority={task.priority} />}
      </div>
    </div>
  );
}

function Column({ status, tasks, onOpen }: { status: TaskStatus; tasks: Task[]; onOpen: (t: Task) => void }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-border bg-sunken/60", isOver && "border-accent/60 bg-accent/5")}>
      <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold">
        <span>{t(`enums.taskStatus.${status}`)}</span>
        <span className="rounded bg-surface-2 px-1.5 text-subtle">{tasks.length}</span>
      </div>
      <div className="min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.map((task) => (
          <KanbanCard key={task.id} task={task} onOpen={() => onOpen(task)} />
        ))}
      </div>
    </div>
  );
}

export function Kanban({ filter, onOpen }: { filter: Parameters<ReturnType<typeof useServices>["tasks"]["list"]>[0]; onOpen: (t: Task) => void }) {
  const s = useServices();
  const { data = [] } = useQ(["tasks", "kanban", filter], () => s.tasks.list({ ...filter, view: "all", includeDone: true, limit: 2000 }));
  const move = useMut(({ id, status }: { id: string; status: TaskStatus }) => s.tasks.setStatus(id, status));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const task = data.find((x) => x.id === e.active.id);
    const status = e.over.id as TaskStatus;
    if (task && task.status !== status) move.mutate({ id: task.id, status });
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {TASK_STATUSES.map((st) => (
          <Column key={st} status={st} tasks={data.filter((x) => x.status === st)} onOpen={onOpen} />
        ))}
      </div>
    </DndContext>
  );
}
