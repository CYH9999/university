import * as React from "react";
import { useTranslation } from "react-i18next";
import { AlarmClock, Plus, List, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { SubjectSelect, EnumSelect } from "@/components/common/pickers";
import { useEditor } from "@/components/common/EntityDrawer";
import { MonthHeader, WeekdayRow, monthMatrix } from "@/components/common/Calendar";
import { DeadlineEditor } from "./DeadlineEditor";
import { DeadlineRow } from "./DeadlineList";
import { useServices } from "@/app/services";
import { useQ, useMut, invalidateAll } from "@/app/query";
import { useNewParam, useOpenParam, useSubjectMap, useSearchParam, useActiveSemester } from "@/lib/hooks";
import { parseDateKey, toDateKey } from "@/core/utils/dates";
import { errorMessage } from "@/lib/errors";
import type { Deadline } from "@/core/model/types";
import type { DeadlineView } from "@/core/services/deadlines";
import { cn } from "@/lib/cn";

export function DeadlinesPage() {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Deadline>();
  const [view, setView] = useSearchParam("view");
  const [mode, setMode] = React.useState<"list" | "calendar">("list");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [type, setType] = React.useState<string | null>(null);
  const [month, setMonth] = React.useState(new Date());
  const { semester } = useActiveSemester();
  const v = (view as DeadlineView) ?? "upcoming";

  useNewParam((p) => editor.create({ type: (p.get("type") as Deadline["type"]) ?? "assignment", subjectId: p.get("subjectId"), dueDate: p.get("date") ?? undefined }));
  useOpenParam((id) => void s.repos.deadlines.get(id).then((d) => d && editor.edit(d)));

  const filter = { view: v, subjectId, type, semesterId: v === "all" || v === "completed" ? null : null };
  const { data = [], isLoading } = useQ(["deadlines", "page", filter], () => s.deadlines.list(filter), { enabled: mode === "list" });
  const toggle = useMut((d: Deadline) => s.deadlines.setStatus(d.id, ["completed", "submitted"].includes(d.status) ? "pending" : d.type === "exam" || d.type === "quiz" ? "completed" : "submitted"));

  const grouped = React.useMemo(() => {
    const out = new Map<string, Deadline[]>();
    for (const d of data) {
      const key = v === "completed" ? d.dueDate.slice(0, 7) : d.dueDate;
      out.set(key, [...(out.get(key) ?? []), d]);
    }
    return [...out.entries()];
  }, [data, v]);

  return (
    <div>
      <PageHeader
        icon={<AlarmClock />}
        title={t("nav.deadlines")}
        description={semester ? t("deadlines.lead") : undefined}
        actions={
          <Button variant="primary" onClick={() => editor.create({ subjectId })}>
            <Plus /> {t("deadlines.new")}
          </Button>
        }
      >
        <Toolbar>
          <Segmented value={mode} onChange={setMode} options={[{ value: "list", label: t("views.list"), icon: <List /> }, { value: "calendar", label: t("views.calendar"), icon: <CalendarDays /> }]} />
          {mode === "list" && (
            <Segmented
              value={v}
              onChange={(x) => setView(x)}
              options={(["upcoming", "overdue", "completed", "all"] as DeadlineView[]).map((x) => ({ value: x, label: t(`deadlines.views.${x}`) }))}
            />
          )}
          <SubjectSelect value={subjectId} onChange={setSubjectId} placeholder={t("filters.allSubjects")} className="w-56" />
          <EnumSelect name="deadlineType" value={type} onChange={setType} placeholder={t("filters.allTypes")} className="w-44" />
        </Toolbar>
      </PageHeader>

      <div className="p-6">
        {mode === "calendar" ? (
          <DeadlineCalendar month={month} setMonth={setMonth} subjectId={subjectId} type={type} onOpen={editor.edit} onCreate={(date) => editor.create({ dueDate: date, subjectId, type: (type as Deadline["type"]) ?? "assignment" })} />
        ) : !isLoading && data.length === 0 ? (
          <EmptyState icon={<AlarmClock />} title={t(`deadlines.emptyViews.${v}`)} description={t("deadlines.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({ subjectId })}><Plus /> {t("deadlines.new")}</Button>} />
        ) : (
          <div className="space-y-5">
            {grouped.map(([key, items]) => (
              <section key={key}>
                <h2 className="mb-2 text-xs font-semibold text-subtle">{key.length === 7 ? key : <DayLabel dateKey={key} />}</h2>
                <ul className="card divide-y divide-border overflow-hidden">
                  {items.map((d) => (
                    <DeadlineRow key={d.id} d={d} onOpen={() => editor.edit(d)} onToggle={() => toggle.mutate(d)} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <DeadlineEditor editor={editor} />
    </div>
  );
}

function DayLabel({ dateKey }: { dateKey: string }) {
  const { t } = useTranslation();
  const today = toDateKey(new Date());
  const d = parseDateKey(dateKey);
  const label = new Intl.DateTimeFormat(document.documentElement.lang === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return (
    <span>
      {dateKey === today ? `${t("common.today")} · ` : ""}
      {label}
    </span>
  );
}

function DeadlineCalendar({ month, setMonth, subjectId, type, onOpen, onCreate }: { month: Date; setMonth: (d: Date) => void; subjectId: string | null; type: string | null; onOpen: (d: Deadline) => void; onCreate: (date: string) => void }) {
  const s = useServices();
  const subjects = useSubjectMap();
  const weeks = monthMatrix(month);
  const from = weeks[0][0];
  const to = weeks[5][6];
  const { data = [] } = useQ(["deadlines", "calendar", from, to, subjectId, type], () => s.deadlines.list({ view: "all", from, to, subjectId, type }));
  const byDay = React.useMemo(() => {
    const m = new Map<string, Deadline[]>();
    for (const d of data) m.set(d.dueDate, [...(m.get(d.dueDate) ?? []), d]);
    return m;
  }, [data]);
  const [dragOver, setDragOver] = React.useState<string | null>(null);
  const today = toDateKey(new Date());

  const reschedule = async (id: string, date: string) => {
    try {
      await s.deadlines.reschedule(id, date);
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="card p-3">
      <MonthHeader month={month} onChange={setMonth} />
      <div className="mt-3">
        <WeekdayRow short={false} />
        <div className="grid grid-cols-7 border-s border-t border-border">
          {weeks.flat().map((k) => {
            const inMonth = parseDateKey(k).getMonth() === month.getMonth();
            const items = byDay.get(k) ?? [];
            return (
              <div
                key={k}
                onDoubleClick={() => onCreate(k)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(k);
                }}
                onDragLeave={() => setDragOver((x) => (x === k ? null : x))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData("text/deadline");
                  if (id) void reschedule(id, k);
                }}
                className={cn("min-h-[108px] border-b border-e border-border p-1.5", !inMonth && "bg-sunken/60", dragOver === k && "bg-accent/10")}
              >
                <div className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs tabular-nums", k === today ? "bg-accent font-semibold text-accent-fg" : inMonth ? "text-muted" : "text-subtle/60")}>
                  {parseDateKey(k).getDate()}
                </div>
                <div className="space-y-1">
                  {items.slice(0, 4).map((d) => {
                    const color = d.subjectId ? subjects.get(d.subjectId)?.color : null;
                    const done = ["completed", "submitted"].includes(d.status);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/deadline", d.id)}
                        onClick={() => onOpen(d)}
                        className={cn("block w-full truncate rounded px-1.5 py-0.5 text-start text-[11px] font-medium", done && "line-through opacity-60")}
                        style={{ background: `${color ?? "#2dd4bf"}26`, color: color ?? undefined, borderInlineStart: `2px solid ${color ?? "#2dd4bf"}` }}
                        title={d.title}
                      >
                        {d.dueTime && <span dir="ltr" className="me-1 opacity-70">{d.dueTime}</span>}
                        {d.title}
                      </button>
                    );
                  })}
                  {items.length > 4 && <div className="px-1 text-[10px] text-subtle">+{items.length - 4}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
