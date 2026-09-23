import * as React from "react";
import { useTranslation } from "react-i18next";
import { Bell, X, Plus, CheckCircle2 } from "lucide-react";
import { EntityDrawer, type useEditor } from "@/components/common/EntityDrawer";
import { AttachmentsPanel } from "@/components/common/files";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_REMINDERS } from "@/core/services/deadlines";
import type { Deadline } from "@/core/model/types";
import { cn } from "@/lib/cn";

const PRESETS = [10080, 4320, 2880, 1440, 360, 180, 60, 30];

export function offsetLabel(min: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (min % 10080 === 0) return t("reminders.weeks", { count: min / 10080 });
  if (min % 1440 === 0) return t("reminders.days", { count: min / 1440 });
  if (min % 60 === 0) return t("reminders.hours", { count: min / 60 });
  return t("reminders.minutes", { count: min });
}

export function RemindersField({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t } = useTranslation();
  const [custom, setCustom] = React.useState("");
  const [unit, setUnit] = React.useState<"m" | "h" | "d">("h");
  const toggle = (m: number) => onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => b - a));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...PRESETS, ...value])].sort((a, b) => b - a).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => toggle(m)}
            className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors", value.includes(m) ? "border-accent bg-accent/12 text-accent" : "border-border text-muted hover:border-border-strong")}
          >
            <Bell className="size-3" /> {offsetLabel(m, t)}
            {value.includes(m) && !PRESETS.includes(m) && <X className="size-3" />}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input className="w-24" type="number" min={1} dir="ltr" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="2" />
        <select className="input-base w-28" value={unit} onChange={(e) => setUnit(e.target.value as "m")}>
          <option value="m">{t("reminders.unitMinutes")}</option>
          <option value="h">{t("reminders.unitHours")}</option>
          <option value="d">{t("reminders.unitDays")}</option>
        </select>
        <Button
          size="sm"
          onClick={() => {
            const n = Number(custom);
            if (!Number.isFinite(n) || n <= 0) return;
            const m = Math.round(n * (unit === "m" ? 1 : unit === "h" ? 60 : 1440));
            if (!value.includes(m)) onChange([...value, m].sort((a, b) => b - a));
            setCustom("");
          }}
        >
          <Plus /> {t("reminders.add")}
        </Button>
      </div>
      <p className="mt-1 text-xs text-subtle">{t("reminders.hint")}</p>
    </div>
  );
}

export function DeadlineEditor({ editor }: { editor: ReturnType<typeof useEditor<Deadline>> }) {
  const { t } = useTranslation();
  const s = useServices();
  const id = editor.entity?.id;
  const { data: reminders } = useQ(["reminders", id], () => (id ? s.deadlines.reminders(id) : Promise.resolve([])), { enabled: editor.open });
  return (
    <EntityDrawer<Deadline>
      editor={editor}
      title={{ create: "deadlines.new", edit: "deadlines.edit" }}
      resetKey={reminders ? `${id}:${reminders.length}` : undefined}
      initial={(e, d) => {
        if (e) return { ...e, reminders: reminders?.map((r) => r.offsetMinutes) ?? null };
        const type = (d.type as string) ?? "assignment";
        return { type, priority: type === "exam" ? "high" : "medium", status: "pending", ...d, reminders: DEFAULT_REMINDERS[type] ?? [1440] };
      }}
      fields={(d) => [
        { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
        { name: "type", kind: "enum", enum: "deadlineType", required: true },
        { name: "subjectId", kind: "subject" },
        { name: "dueDate", kind: "date", required: true },
        { name: "dueTime", kind: "time" },
        d.type === "exam" || d.type === "quiz" || d.type === "presentation" ? { name: "endTime", kind: "time" } : null,
        { name: "location", kind: "text" },
        { name: "priority", kind: "enum", enum: "priority", required: true },
        { name: "status", kind: "enum", enum: "deadlineStatus", required: true },
        { name: "projectId", kind: "project" },
        { name: "weight", kind: "number", min: 0, max: 100, hint: "deadlines.weightHint" },
        { name: "description", kind: "textarea", span: 2, rows: 4 },
        { name: "tags", kind: "tags", span: 2 },
        {
          name: "reminders",
          kind: "custom",
          span: 2,
          label: "fields.reminders",
          render: (v, set) => <RemindersField value={(v.reminders as number[]) ?? []} onChange={(r) => set({ reminders: r })} />,
        },
      ]}
      onSave={async (d, e) => {
        const { reminders: rem, ...rest } = d as Record<string, unknown> & { reminders?: number[] };
        const patch = rest as Partial<Deadline>;
        if (["completed", "submitted"].includes(String(patch.status)) && !patch.completedAt) patch.completedAt = new Date().toISOString();
        return e ? s.deadlines.update(e.id, patch, rem ?? undefined) : s.deadlines.create(patch, rem ?? undefined);
      }}
      onDelete={(e) => s.repos.deadlines.remove(e.id)}
      onRestore={(snap) => s.repos.deadlines.restore(snap)}
      footerExtra={(e) =>
        e && !["completed", "submitted"].includes(e.status) ? (
          <Button
            variant="outline"
            onClick={async () => {
              await s.deadlines.setStatus(e.id, e.type === "exam" || e.type === "quiz" ? "completed" : "submitted");
              await invalidateAll();
              editor.close();
            }}
          >
            <CheckCircle2 /> {t("deadlines.markDone")}
          </Button>
        ) : null
      }
    >
      {(e) => (e ? <AttachmentsPanel entityType="deadline" entityId={e.id} /> : <p className="text-xs text-subtle">{t("files.saveFirst")}</p>)}
    </EntityDrawer>
  );
}
