import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, ListTodo, Repeat, CalendarDays, ListChecks } from "lucide-react";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useSubjectMap, useProjectMap } from "@/lib/hooks";
import { EmptyState } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PriorityBadge, SubjectChip } from "@/components/common/badges";
import { useEditor } from "@/components/common/EntityDrawer";
import { TaskEditor } from "./TaskEditor";
import { fmtDate } from "@/lib/format";
import { toDateKey } from "@/core/utils/dates";
import type { Task } from "@/core/model/types";
import type { TaskFilter } from "@/core/services/tasks";
import { cn } from "@/lib/cn";

export function TaskRow({ task, onOpen, onToggle, sub }: { task: Task; onOpen: () => void; onToggle: () => void; sub?: { done: number; total: number } }) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  const projects = useProjectMap();
  const today = toDateKey(new Date());
  const done = task.status === "completed";
  const overdue = !done && task.dueDate && task.dueDate < today;
  return (
    <li className={cn("group flex items-center gap-3 px-4 py-2 hover:bg-surface-2/40", (done || task.status === "cancelled") && "opacity-60")}>
      <Checkbox checked={done} onCheckedChange={onToggle} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className={cn("truncate text-sm", done && "line-through")}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-subtle">
          {task.dueDate && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-danger", task.dueDate === today && !done && "text-accent")}>
              <CalendarDays className="size-3" />
              {task.dueDate === today ? t("common.today") : fmtDate(task.dueDate, "d MMM")}
              {task.dueTime && <span dir="ltr">{task.dueTime}</span>}
            </span>
          )}
          {task.status !== "completed" && task.status !== "planned" && <span>{t(`enums.taskStatus.${task.status}`)}</span>}
          <SubjectChip subject={task.subjectId ? subjects.get(task.subjectId) : null} link={false} />
          {task.projectId && projects.get(task.projectId) && <span className="truncate">▸ {projects.get(task.projectId)!.name}</span>}
          {task.recurrence && <Repeat className="size-3" aria-label={t("tasks.recurring")} />}
          {sub && sub.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3" /> {sub.done}/{sub.total}
            </span>
          )}
          {task.tags.map((tag) => (
            <span key={tag} className="text-accent/80">#{tag}</span>
          ))}
        </div>
      </button>
      {task.priority !== "medium" && task.priority !== "low" && <PriorityBadge priority={task.priority} />}
    </li>
  );
}

/** Quick-add input + list; embeddable in subject/project/goal pages. */
export function TaskList({ filter, defaults, emptyTitle, groupBy }: { filter: TaskFilter; defaults?: Partial<Task>; emptyTitle?: string; groupBy?: "none" | "subject" | "project" }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Task>();
  const subjects = useSubjectMap();
  const projects = useProjectMap();
  const [quick, setQuick] = React.useState("");
  const { data = [], isLoading } = useQ(["tasks", "list", filter], () => s.tasks.list(filter));
  const { data: subs } = useQ(["subtask-counts", data.map((x) => x.id).join()], () => s.tasks.subtaskCounts(data.map((x) => x.id)), { enabled: data.length > 0 });
  const toggle = useMut((id: string) => s.tasks.toggleDone(id));
  const add = useMut((title: string) => s.tasks.create({ title, ...defaults, dueDate: defaults?.dueDate ?? (filter.view === "today" ? toDateKey(new Date()) : undefined) }), { onSuccess: () => setQuick(""), success: "toast.created" });

  const groups = React.useMemo(() => {
    if (!groupBy || groupBy === "none") return [["", data] as [string, Task[]]];
    const m = new Map<string, Task[]>();
    for (const task of data) {
      const k = (groupBy === "subject" ? task.subjectId : task.projectId) ?? "";
      m.set(k, [...(m.get(k) ?? []), task]);
    }
    return [...m.entries()];
  }, [data, groupBy]);

  return (
    <div>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (quick.trim()) add.mutate(quick.trim());
        }}
      >
        <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t("tasks.quickAdd")} />
        <Button type="submit" loading={add.isPending}>
          <Plus /> {t("common.add")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => editor.create(defaults ?? {})}>
          {t("tasks.detailed")}
        </Button>
      </form>
      {!isLoading && data.length === 0 ? (
        <EmptyState compact icon={<ListTodo />} title={emptyTitle ?? t("tasks.empty")} />
      ) : (
        <div className="space-y-4">
          {groups.map(([key, items]) => (
            <section key={key || "none"}>
              {groupBy && groupBy !== "none" && (
                <h3 className="mb-1.5 text-xs font-semibold text-subtle">
                  {key ? (groupBy === "subject" ? subjects.get(key)?.name : projects.get(key)?.name) ?? "—" : groupBy === "subject" ? t("common.noSubject") : t("common.noProject")}
                  <span className="ms-1 font-normal">({items.length})</span>
                </h3>
              )}
              <ul className="card divide-y divide-border overflow-hidden">
                {items.map((task) => (
                  <TaskRow key={task.id} task={task} sub={subs?.get(task.id)} onOpen={() => editor.edit(task)} onToggle={() => toggle.mutate(task.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TaskEditor editor={editor} />
    </div>
  );
}

