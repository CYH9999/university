import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Repeat } from "lucide-react";
import { EntityDrawer, type useEditor } from "@/components/common/EntityDrawer";
import { AttachmentsPanel } from "@/components/common/files";
import { DatePicker } from "@/components/common/DatePicker";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/controls";
import type { Task, TaskRecurrence } from "@/core/model/types";
import { fmtWeekday } from "@/lib/format";
import { addDays, startOfWeek } from "@/core/utils/dates";
import { cn } from "@/lib/cn";

export function RecurrenceField({ value, onChange }: { value: TaskRecurrence | null; onChange: (v: TaskRecurrence | null) => void }) {
  const { t } = useTranslation();
  const weekStart = startOfWeek(new Date());
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Repeat className="size-4 text-muted" />
        <select
          className="input-base w-40"
          value={value?.freq ?? ""}
          onChange={(e) => onChange(e.target.value ? { freq: e.target.value as TaskRecurrence["freq"], interval: value?.interval ?? 1, weekdays: value?.weekdays ?? [], until: value?.until ?? null } : null)}
        >
          <option value="">{t("recurrence.none")}</option>
          <option value="daily">{t("enums.recurrenceFreq.daily")}</option>
          <option value="weekly">{t("enums.recurrenceFreq.weekly")}</option>
          <option value="monthly">{t("enums.recurrenceFreq.monthly")}</option>
        </select>
        {value && (
          <>
            <span className="text-xs text-muted">{t("recurrence.every")}</span>
            <Input type="number" min={1} max={365} dir="ltr" className="w-20" value={value.interval} onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })} />
            <span className="text-xs text-muted">{t(`recurrence.unit.${value.freq}`)}</span>
          </>
        )}
      </div>
      {value?.freq === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 7 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const cur = value.weekdays ?? [];
                onChange({ ...value, weekdays: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort() });
              }}
              className={cn("h-7 rounded-md border px-2 text-xs", value.weekdays?.includes(i) ? "border-accent bg-accent/12 text-accent" : "border-border text-muted")}
            >
              {fmtWeekday(addDays(weekStart, i), false)}
            </button>
          ))}
        </div>
      )}
      {value && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t("recurrence.until")}</span>
          <DatePicker value={value.until ?? null} onChange={(u) => onChange({ ...value, until: u })} className="w-56" />
        </div>
      )}
      {value && <p className="text-xs text-subtle">{t("recurrence.hint")}</p>}
    </div>
  );
}

export function SubtasksPanel({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const [title, setTitle] = React.useState("");
  const { data = [] } = useQ(["subtasks", taskId], () => s.tasks.subtasks(taskId));
  const add = useMut((x: string) => s.tasks.addSubtask(taskId, x), { onSuccess: () => setTitle("") });
  const toggle = useMut((id: string) => s.tasks.toggleSubtask(id));
  const remove = useMut((id: string) => s.tasks.removeSubtask(id));
  const done = data.filter((x) => x.done).length;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        {t("tasks.subtasks")} {data.length > 0 && <span className="text-xs font-normal text-subtle">({done}/{data.length})</span>}
      </h3>
      <ul className="space-y-1">
        {data.map((st) => (
          <li key={st.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-2">
            <Checkbox checked={st.done} onCheckedChange={() => toggle.mutate(st.id)} />
            <span className={cn("flex-1 text-sm", st.done && "text-subtle line-through")}>{st.title}</span>
            <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(st.id)} aria-label={t("common.delete")}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("tasks.addSubtask")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (title.trim()) add.mutate(title.trim());
            }
          }}
        />
        <Button size="icon" onClick={() => title.trim() && add.mutate(title.trim())} aria-label={t("common.add")}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export function TaskEditor({ editor }: { editor: ReturnType<typeof useEditor<Task>> }) {
  const { t } = useTranslation();
  const s = useServices();
  return (
    <EntityDrawer<Task>
      editor={editor}
      title={{ create: "tasks.new", edit: "tasks.edit" }}
      initial={(e, d) => (e ? { ...e } : { priority: "medium", rollover: true, ...d })}
      fields={(d) => [
        { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
        { name: "status", kind: "enum", enum: "taskStatus", placeholder: "tasks.autoStatus" },
        { name: "priority", kind: "enum", enum: "priority", required: true },
        { name: "dueDate", kind: "date" },
        { name: "dueTime", kind: "time" },
        { name: "subjectId", kind: "subject" },
        { name: "projectId", kind: "project" },
        d.projectId ? { name: "assigneeId", kind: "member", projectField: "projectId" } : null,
        { name: "goalId", kind: "goal" },
        { name: "estimateMinutes", kind: "number", min: 0, label: "fields.estimateMinutes" },
        { name: "actualMinutes", kind: "number", min: 0, label: "fields.actualMinutes" },
        { name: "description", kind: "textarea", span: 2, rows: 3 },
        { name: "notes", kind: "textarea", span: 2, rows: 2 },
        { name: "tags", kind: "tags", span: 2 },
        { name: "recurrence", kind: "custom", span: 2, render: (v, set) => <RecurrenceField value={(v.recurrence as TaskRecurrence) ?? null} onChange={(r) => set({ recurrence: r })} /> },
        { name: "rollover", kind: "bool", description: "tasks.rolloverHint", span: 2 },
      ]}
      onSave={async (d, e) => {
        const patch = d as Partial<Task>;
        if (e) return s.tasks.update(e.id, patch);
        return s.tasks.create(patch);
      }}
      onDelete={(e) => s.repos.tasks.remove(e.id)}
      onRestore={(snap) => s.repos.tasks.restore(snap)}
    >
      {(e) =>
        e ? (
          <div className="space-y-6">
            <SubtasksPanel taskId={e.id} />
            <AttachmentsPanel entityType="task" entityId={e.id} />
          </div>
        ) : (
          <p className="text-xs text-subtle">{t("tasks.saveForSubtasks")}</p>
        )
      }
    </EntityDrawer>
  );
}
