import * as React from "react";
import { useTranslation } from "react-i18next";
import { Target, Plus, CalendarDays, Trash2 } from "lucide-react";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Checkbox, ProgressBar, Segmented } from "@/components/ui/controls";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { PriorityBadge } from "@/components/common/badges";
import { TaskList } from "@/features/tasks/TaskList";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useNewParam, useOpenParam, useAllSubjects, useSubjectMap } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { diffDays, toDateKey } from "@/core/utils/dates";
import type { Goal } from "@/core/model/types";
import { cn } from "@/lib/cn";

const STATUS_TONE = { not_started: "neutral", active: "accent", paused: "warning", completed: "success", abandoned: "neutral" } as const;

function GoalMilestones({ goalId }: { goalId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const [title, setTitle] = React.useState("");
  const { data = [] } = useQ(["goal-milestones", goalId], () => s.goals.milestones(goalId));
  const add = useMut((x: string) => s.repos.goalMilestones.create({ goalId, title: x, sortOrder: data.length } as never), { onSuccess: () => setTitle("") });
  const toggle = useMut((id: string) => s.goals.toggleMilestone(id));
  const remove = useMut((id: string) => s.repos.goalMilestones.remove(id));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t("goals.milestones")}</h3>
      <ul className="space-y-1">
        {data.map((m) => (
          <li key={m.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
            <Checkbox checked={m.done} onCheckedChange={() => toggle.mutate(m.id)} />
            <span className={cn("flex-1 text-sm", m.done && "text-subtle line-through")}>{m.title}</span>
            <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(m.id)} aria-label={t("common.delete")}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(title.trim()); }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("goals.addMilestone")} />
        <Button type="submit" size="icon" aria-label={t("common.add")}><Plus /></Button>
      </form>
    </div>
  );
}

function LinkedSubjects({ goalId }: { goalId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useAllSubjects().data ?? [];
  const { data: linked = [] } = useQ(["goal-subjects", goalId], () => s.goals.linkedSubjects(goalId));
  const set = useMut((ids: string[]) => s.goals.setLinkedSubjects(goalId, ids));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t("goals.linkedSubjects")}</h3>
      <div className="flex flex-wrap gap-3">
        {subjects.filter((x) => !x.archived || linked.includes(x.id)).map((x) => (
          <Checkbox key={x.id} checked={linked.includes(x.id)} onCheckedChange={(v) => set.mutate(v ? [...linked, x.id] : linked.filter((y) => y !== x.id))} label={x.name} />
        ))}
        {subjects.length === 0 && <span className="text-xs text-subtle">—</span>}
      </div>
    </div>
  );
}

export function GoalsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Goal>();
  const subjectMap = useSubjectMap();
  const [filter, setFilter] = React.useState<"open" | "completed" | "all">("open");
  useNewParam(() => editor.create({}));
  useOpenParam((id) => void s.repos.goals.get(id).then((g) => g && editor.edit(g)));
  const { data = [], isLoading } = useQ(["goals", "page", filter], () =>
    s.repos.goals.list(filter === "open" ? { where: ["t.status IN ('not_started','active','paused')"] } : filter === "completed" ? { where: ["t.status IN ('completed','abandoned')"] } : {}),
  );
  const { data: progress } = useQ(["goals", "progress", data.map((g) => `${g.id}:${g.updatedAt}`).join()], () => s.goals.progress(data), { enabled: data.length > 0 });
  const { data: links } = useQ(["goals", "links", data.map((g) => g.id).join()], async () => {
    const out = new Map<string, string[]>();
    for (const g of data) out.set(g.id, await s.goals.linkedSubjects(g.id));
    return out;
  }, { enabled: data.length > 0 });
  const today = toDateKey(new Date());

  return (
    <div>
      <PageHeader icon={<Target />} title={t("nav.goals")} description={t("goals.lead")} actions={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("goals.new")}</Button>}>
        <Toolbar>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: t("goals.filters.open") }, { value: "completed", label: t("goals.filters.done") }, { value: "all", label: t("common.all") }]} />
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {!isLoading && data.length === 0 ? (
          <EmptyState icon={<Target />} title={t("goals.empty")} description={t("goals.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({})}><Plus /> {t("goals.new")}</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((g) => {
              const p = progress?.get(g.id) ?? g.progress;
              const days = g.deadline ? diffDays(today, g.deadline) : null;
              return (
                <Card key={g.id} className="flex cursor-pointer flex-col p-4 hover:border-accent/40" onClick={() => editor.edit(g)}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold" dir="auto">{g.title}</h3>
                    <Badge tone={STATUS_TONE[g.status]}>{t(`enums.goalStatus.${g.status}`)}</Badge>
                  </div>
                  {g.description && <p className="mt-1 line-clamp-2 text-xs text-muted" dir="auto">{g.description}</p>}
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>{t(`enums.progressMode.${g.progressMode}`)}</span>
                      <span className="tabular-nums">{p}%</span>
                    </div>
                    <ProgressBar value={p} tone={p >= 100 ? "success" : "accent"} />
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-muted">
                    {g.deadline && (
                      <span className={cn("inline-flex items-center gap-1", days !== null && days < 0 && g.status !== "completed" && "text-danger")}>
                        <CalendarDays className="size-3" /> {fmtDate(g.deadline)}
                      </span>
                    )}
                    {(g.priority === "high" || g.priority === "urgent") && <PriorityBadge priority={g.priority} />}
                    {(links?.get(g.id) ?? []).map((sid) => subjectMap.get(sid)).filter(Boolean).map((sub) => (
                      <Badge key={sub!.id} dot={sub!.color}>{sub!.code || sub!.name}</Badge>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <EntityDrawer<Goal>
        editor={editor}
        width="w-[620px]"
        title={{ create: "goals.new", edit: "goals.edit" }}
        initial={(e, d) => (e ? { ...e } : { status: "active", priority: "medium", progressMode: "manual", progress: 0, ...d })}
        fields={(d) => [
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true, placeholder: "goals.titlePlaceholder" },
          { name: "status", kind: "enum", enum: "goalStatus", required: true },
          { name: "priority", kind: "enum", enum: "priority", required: true },
          { name: "semesterId", kind: "semester" },
          { name: "deadline", kind: "date" },
          { name: "category", kind: "text" },
          { name: "progressMode", kind: "enum", enum: "progressMode", required: true, hint: "goals.progressModeHint" },
          d.progressMode === "manual" ? { name: "progress", kind: "number", min: 0, max: 100 } : null,
          { name: "description", kind: "textarea", span: 2, rows: 3 },
          { name: "tags", kind: "tags", span: 2 },
        ]}
        onSave={(d, e) => {
          const patch = { ...(d as Partial<Goal>) };
          if (patch.status === "completed" && !patch.completedAt) patch.completedAt = new Date().toISOString();
          if (patch.status !== "completed") patch.completedAt = null;
          return e ? s.repos.goals.update(e.id, patch) : s.repos.goals.create(patch as never);
        }}
        onDelete={(e) => s.repos.goals.remove(e.id)}
        onRestore={(snap) => s.repos.goals.restore(snap)}
      >
        {(e) =>
          e ? (
            <div className="space-y-6">
              <GoalMilestones goalId={e.id} />
              <LinkedSubjects goalId={e.id} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t("goals.linkedTasks")}</h3>
                <TaskList filter={{ view: "all", goalId: e.id, includeDone: true }} defaults={{ goalId: e.id }} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-subtle">{t("goals.saveFirst")}</p>
          )
        }
      </EntityDrawer>
    </div>
  );
}
