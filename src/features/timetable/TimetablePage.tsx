import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CalendarClock, Plus, AlertTriangle, MapPin, LayoutGrid, Rows3, Columns3, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Toolbar, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Segmented, Badge, ColorDot } from "@/components/ui/controls";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { useSettings } from "@/app/settings";
import { useActiveSemester, useSubjectMap, useNow, useNewParam } from "@/lib/hooks";
import { conflictsFor, findConflicts, occursOn } from "@/core/services/timetable";
import { addDays, startOfWeek, timeToMinutes, minutesToTime, toDateKey, weekdayIndex } from "@/core/utils/dates";
import { fmtWeekday, fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import type { TimetableEntry } from "@/core/model/types";
import { cn } from "@/lib/cn";

const HOUR_PX = 56;
const SNAP = 15;

type Layout = { entry: TimetableEntry; lane: number; lanes: number };

/** Places overlapping sessions side by side. */
function layoutDay(entries: TimetableEntry[]): Layout[] {
  const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const out: Layout[] = [];
  let group: Layout[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = lanes));
    out.push(...group);
    group = [];
  };
  for (const e of sorted) {
    const s = timeToMinutes(e.startTime);
    if (s >= groupEnd && group.length) flush();
    const used = new Set(group.filter((g) => timeToMinutes(g.entry.endTime) > s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    group.push({ entry: e, lane, lanes: 1 });
    groupEnd = Math.max(groupEnd, timeToMinutes(e.endTime));
  }
  if (group.length) flush();
  return out;
}

export function TimetablePage() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const { semester } = useActiveSemester();
  const settings = useSettings((st) => st.settings.timetable);
  const update = useSettings((st) => st.update);
  const editor = useEditor<TimetableEntry>();
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [dayIndex, setDayIndex] = React.useState(() => weekdayIndex(new Date()));
  const { data: entries = [], isLoading } = useQ(["timetable", "entries", semester?.id ?? null], () => s.timetable.semesterEntries(semester?.id ?? null));
  const conflicts = React.useMemo(() => findConflicts(entries), [entries]);
  const conflictIds = React.useMemo(() => new Set(conflicts.flatMap((c) => [c.a.id, c.b.id])), [conflicts]);
  const weekStart = addDays(startOfWeek(new Date()), weekOffset * 7);
  useNewParam(() => editor.create({ day: weekdayIndex(new Date()), startTime: "08:30", endTime: "10:00" }));

  const startHour = Math.min(settings.startHour, ...entries.map((e) => Math.floor(timeToMinutes(e.startTime) / 60)));
  const endHour = Math.max(settings.endHour, ...entries.map((e) => Math.ceil(timeToMinutes(e.endTime) / 60)));

  const entriesFor = (day: number) => {
    const date = toDateKey(addDays(weekStart, day));
    return entries.filter((e) => (e.recurrence === "once" ? e.specificDate === date : e.day === day && occursOn(e, date, semester?.startDate)));
  };

  const reschedule = async (id: string, day: number, start: number, end: number) => {
    try {
      await s.timetable.reschedule(id, day, minutesToTime(start), minutesToTime(end));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<CalendarClock />}
        title={t("nav.timetable")}
        description={semester ? `${semester.name}${semester.academicYear ? ` · ${semester.academicYear}` : ""}` : t("timetable.noSemester")}
        actions={
          <Button variant="primary" onClick={() => editor.create({ day: settings.view === "day" ? dayIndex : weekdayIndex(new Date()), startTime: "08:30", endTime: "10:00" })}>
            <Plus /> {t("timetable.new")}
          </Button>
        }
      >
        <Toolbar>
          <Segmented
            value={settings.view}
            onChange={(v) => update({ timetable: { view: v } })}
            options={[
              { value: "week", label: t("timetable.views.week"), icon: <Columns3 /> },
              { value: "day", label: t("timetable.views.day"), icon: <LayoutGrid /> },
              { value: "compact", label: t("timetable.views.compact"), icon: <Rows3 /> },
            ]}
          />
          {settings.view !== "compact" && (
            <div className="flex items-center gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => (settings.view === "day" ? setDayIndex((d) => (d + 6) % 7) : setWeekOffset((w) => w - 1))} aria-label={t("common.previous")}>
                <ChevronLeft className="rtl:rotate-180" />
              </Button>
              <span className="min-w-[160px] text-center text-xs text-muted">
                {settings.view === "day" ? fmtWeekday(addDays(weekStart, dayIndex)) : `${fmtDate(toDateKey(weekStart), "d MMM")} — ${fmtDate(toDateKey(addDays(weekStart, 6)), "d MMM yyyy")}`}
              </span>
              <Button size="icon-sm" variant="ghost" onClick={() => (settings.view === "day" ? setDayIndex((d) => (d + 1) % 7) : setWeekOffset((w) => w + 1))} aria-label={t("common.next")}>
                <ChevronRight className="rtl:rotate-180" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setWeekOffset(0); setDayIndex(weekdayIndex(new Date())); }}>
                {t("common.today")}
              </Button>
            </div>
          )}
        </Toolbar>
      </PageHeader>

      {conflicts.length > 0 && (
        <div className="mx-6 mt-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-warning">
            <AlertTriangle className="size-4" /> {t("timetable.conflicts", { count: conflicts.length })}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {conflicts.slice(0, 5).map((c, i) => (
              <li key={i}>
                {fmtWeekday(addDays(weekStart, c.a.day))}: {subjects.get(c.a.subjectId)?.name} (<span dir="ltr">{c.a.startTime}–{c.a.endTime}</span>) ↔ {subjects.get(c.b.subjectId)?.name} (<span dir="ltr">{c.b.startTime}–{c.b.endTime}</span>)
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {!isLoading && entries.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title={t("timetable.empty")} description={t("timetable.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({ day: 0, startTime: "08:30", endTime: "10:00" })}><Plus /> {t("timetable.new")}</Button>} />
        ) : settings.view === "compact" ? (
          <CompactView entries={entries} weekStart={weekStart} conflictIds={conflictIds} onOpen={editor.edit} />
        ) : (
          <WeekGrid
            days={settings.view === "day" ? [dayIndex] : [0, 1, 2, 3, 4, 5, 6]}
            weekStart={weekStart}
            startHour={startHour}
            endHour={endHour}
            entriesFor={entriesFor}
            conflictIds={conflictIds}
            onOpen={editor.edit}
            onCreate={(day, start) => editor.create({ day, startTime: minutesToTime(start), endTime: minutesToTime(start + 90) })}
            onMove={reschedule}
          />
        )}
      </div>
      <TimetableEditor editor={editor} entries={entries} semesterId={semester?.id ?? null} />
    </div>
  );
}

function WeekGrid({
  days,
  weekStart,
  startHour,
  endHour,
  entriesFor,
  conflictIds,
  onOpen,
  onCreate,
  onMove,
}: {
  days: number[];
  weekStart: Date;
  startHour: number;
  endHour: number;
  entriesFor: (day: number) => TimetableEntry[];
  conflictIds: Set<string>;
  onOpen: (e: TimetableEntry) => void;
  onCreate: (day: number, startMin: number) => void;
  onMove: (id: string, day: number, start: number, end: number) => void;
}) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  const now = useNow(60_000);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<{ id: string; mode: "move" | "resize"; x0: number; y0: number; day: number; start: number; end: number; nDay: number; nStart: number; nEnd: number; moved: boolean } | null>(null);
  const ppm = HOUR_PX / 60;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const todayKey = toDateKey(now);
  const rtl = document.documentElement.dir === "rtl";

  React.useEffect(() => {
    if (!drag) return;
    const onMoveEv = (ev: PointerEvent) => {
      const grid = gridRef.current;
      if (!grid) return;
      const colW = (grid.clientWidth - 56) / days.length;
      const dx = (ev.clientX - drag.x0) * (rtl ? -1 : 1);
      const dy = ev.clientY - drag.y0;
      const moved = drag.moved || Math.abs(dx) > 3 || Math.abs(dy) > 3;
      const dMin = Math.round(dy / ppm / SNAP) * SNAP;
      if (drag.mode === "move") {
        const dDay = days.length > 1 ? Math.round(dx / colW) : 0;
        const nDay = Math.min(6, Math.max(0, drag.day + dDay));
        const dur = drag.end - drag.start;
        const nStart = Math.min(Math.max(drag.start + dMin, startHour * 60), endHour * 60 - dur);
        setDrag({ ...drag, nDay, nStart, nEnd: nStart + dur, moved });
      } else {
        const nEnd = Math.max(drag.start + SNAP, Math.min(drag.end + dMin, endHour * 60));
        setDrag({ ...drag, nEnd, moved });
      }
    };
    const onUp = () => {
      const d = drag;
      setDrag(null);
      if (!d.moved) {
        const e = days.flatMap(entriesFor).find((x) => x.id === d.id);
        if (e) onOpen(e);
        return;
      }
      if (d.nDay !== d.day || d.nStart !== d.start || d.nEnd !== d.end) onMove(d.id, d.nDay, d.nStart, d.nEnd);
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, days, ppm, startHour, endHour, rtl, entriesFor, onMove, onOpen]);

  return (
    <div className="card min-w-[760px] overflow-hidden" ref={gridRef}>
      <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => {
          const date = addDays(weekStart, d);
          const isToday = toDateKey(date) === todayKey;
          return (
            <div key={d} className={cn("border-s border-border px-2 py-2 text-center", isToday && "bg-accent/8")}>
              <div className={cn("text-xs font-semibold", isToday ? "text-accent" : "text-fg")}>{fmtWeekday(date)}</div>
              <div className="text-[11px] text-subtle">{fmtDate(toDateKey(date), "d MMM")}</div>
            </div>
          );
        })}
      </div>
      <div className="relative grid select-none" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div>
          {hours.map((h) => (
            <div key={h} className="relative border-b border-border/60 pe-2 text-end text-[10px] text-subtle" style={{ height: HOUR_PX }}>
              <span className="relative -top-1.5 font-mono" dir="ltr">{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>
        {days.map((d) => {
          const date = addDays(weekStart, d);
          const isToday = toDateKey(date) === todayKey;
          const layout = layoutDay(entriesFor(d));
          return (
            <div
              key={d}
              className={cn("relative border-s border-border", isToday && "bg-accent/[0.03]")}
              onDoubleClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const min = startHour * 60 + Math.floor((e.clientY - rect.top) / ppm / SNAP) * SNAP;
                onCreate(d, min);
              }}
            >
              {hours.map((h) => (
                <div key={h} className="border-b border-border/60" style={{ height: HOUR_PX }} />
              ))}
              {isToday && now.getHours() >= startHour && now.getHours() < endHour && (
                <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-danger" style={{ top: (now.getHours() * 60 + now.getMinutes() - startHour * 60) * ppm }}>
                  <span className="absolute -top-1 start-0 size-2 rounded-full bg-danger" />
                </div>
              )}
              {layout.map(({ entry: e, lane, lanes }) => {
                const isDragging = drag?.id === e.id;
                const start = isDragging ? drag.nStart : timeToMinutes(e.startTime);
                const end = isDragging ? drag.nEnd : timeToMinutes(e.endTime);
                if (isDragging && drag.nDay !== d) return null;
                const sub = subjects.get(e.subjectId);
                const color = e.color ?? sub?.color ?? "#2dd4bf";
                const conflict = conflictIds.has(e.id);
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(k) => k.key === "Enter" && onOpen(e)}
                    onPointerDown={(ev) => {
                      if (ev.button !== 0) return;
                      ev.preventDefault();
                      setDrag({ id: e.id, mode: "move", x0: ev.clientX, y0: ev.clientY, day: e.day, start: timeToMinutes(e.startTime), end: timeToMinutes(e.endTime), nDay: e.day, nStart: timeToMinutes(e.startTime), nEnd: timeToMinutes(e.endTime), moved: false });
                    }}
                    className={cn(
                      "group absolute z-20 cursor-grab overflow-hidden rounded-md border px-1.5 py-1 text-[11px] leading-tight shadow-sm active:cursor-grabbing",
                      conflict && "ring-2 ring-danger/70",
                      isDragging && "z-30 opacity-90 shadow-lg",
                    )}
                    style={{
                      top: (start - startHour * 60) * ppm,
                      height: Math.max(18, (end - start) * ppm - 2),
                      insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                      background: `${color}22`,
                      borderColor: `${color}66`,
                      borderInlineStartWidth: 3,
                      borderInlineStartColor: color,
                    }}
                    title={`${sub?.name ?? ""} ${minutesToTime(start)}–${minutesToTime(end)}`}
                  >
                    <div className="truncate font-semibold" style={{ color }}>{sub?.name ?? t("timetable.unknownSubject")}</div>
                    <div className="truncate font-mono text-muted" dir="ltr">{minutesToTime(start)}–{minutesToTime(end)}</div>
                    {(e.room || e.building) && (end - start) >= 60 && (
                      <div className="flex items-center gap-1 truncate text-subtle"><MapPin className="size-2.5" />{[e.room, e.building].filter(Boolean).join(" · ")}</div>
                    )}
                    {(end - start) >= 75 && <div className="truncate text-subtle">{t(`enums.sessionKind.${e.kind}`)}{e.recurrence !== "weekly" ? ` · ${t(`enums.recurrence.${e.recurrence}`)}` : ""}</div>}
                    <div
                      className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                      style={{ background: `${color}55` }}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        ev.preventDefault();
                        setDrag({ id: e.id, mode: "resize", x0: ev.clientX, y0: ev.clientY, day: e.day, start: timeToMinutes(e.startTime), end: timeToMinutes(e.endTime), nDay: e.day, nStart: timeToMinutes(e.startTime), nEnd: timeToMinutes(e.endTime), moved: false });
                      }}
                    />
                  </div>
                );
              })}
              {drag && drag.nDay === d && !layout.some((l) => l.entry.id === drag.id) && (
                <div className="absolute inset-x-1 z-30 rounded-md border-2 border-dashed border-accent bg-accent/10" style={{ top: (drag.nStart - startHour * 60) * ppm, height: (drag.nEnd - drag.nStart) * ppm }} />
              )}
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-subtle">{t("timetable.hint")}</p>
    </div>
  );
}

function CompactView({ entries, weekStart, conflictIds, onOpen }: { entries: TimetableEntry[]; weekStart: Date; conflictIds: Set<string>; onOpen: (e: TimetableEntry) => void }) {
  const { t } = useTranslation();
  const subjects = useSubjectMap();
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 7 }, (_, d) => {
        const items = entries.filter((e) => e.day === d || (e.recurrence === "once" && e.specificDate && weekdayIndex(new Date(e.specificDate)) === d)).sort((a, b) => a.startTime.localeCompare(b.startTime));
        return (
          <Card key={d} className="p-3">
            <h3 className="mb-2 text-sm font-semibold">{fmtWeekday(addDays(weekStart, d))}</h3>
            {items.length === 0 ? (
              <p className="text-xs text-subtle">{t("timetable.freeDay")}</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => onOpen(e)} className={cn("flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-start hover:bg-surface-2", conflictIds.has(e.id) && "border-danger/50")}>
                      <ColorDot color={e.color ?? subjects.get(e.subjectId)?.color} />
                      <span className="w-[86px] shrink-0 font-mono text-[11px] text-muted" dir="ltr">{e.startTime}–{e.endTime}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{subjects.get(e.subjectId)?.name}</span>
                      {e.room && <span className="text-[11px] text-subtle">{e.room}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TimetableEditor({ editor, entries, semesterId }: { editor: ReturnType<typeof useEditor<TimetableEntry>>; entries: TimetableEntry[]; semesterId: string | null }) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const weekStart = startOfWeek(new Date());
  const dayOptions = Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: fmtWeekday(addDays(weekStart, i)) }));
  return (
    <EntityDrawer<TimetableEntry>
      editor={editor}
      title={{ create: "timetable.new", edit: "timetable.edit" }}
      initial={(e, d) => (e ? { ...e, day: String(e.day) } : { kind: "lecture", recurrence: "weekly", ...d, day: String(d.day ?? 0) })}
      fields={(d) => [
        { name: "subjectId", kind: "subject", required: true, span: 2 },
        { name: "day", kind: "select", options: dayOptions, required: true },
        { name: "kind", kind: "enum", enum: "sessionKind", required: true },
        { name: "startTime", kind: "time", required: true },
        { name: "endTime", kind: "time", required: true },
        { name: "room", kind: "text" },
        { name: "building", kind: "text" },
        { name: "professor", kind: "text", hint: "timetable.professorHint" },
        { name: "color", kind: "color", hint: "timetable.colorHint" },
        { name: "recurrence", kind: "enum", enum: "recurrence", required: true },
        d.recurrence === "once" ? { name: "specificDate", kind: "date", required: true } : null,
        d.recurrence !== "once" ? { name: "validFrom", kind: "date" } : null,
        d.recurrence !== "once" ? { name: "validUntil", kind: "date" } : null,
        { name: "notes", kind: "textarea", span: 2, rows: 2 },
        {
          name: "conflicts",
          kind: "custom",
          span: 2,
          label: "timetable.conflictCheck",
          render: (v) => {
            if (!v.startTime || !v.endTime || v.day === undefined) return null;
            const c = conflictsFor({ id: (v.id as string) ?? "", day: Number(v.day), startTime: String(v.startTime), endTime: String(v.endTime), recurrence: (v.recurrence as TimetableEntry["recurrence"]) ?? "weekly", specificDate: (v.specificDate as string) ?? null }, entries);
            if (!c.length) return <Badge tone="success">{t("timetable.noConflicts")}</Badge>;
            return (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
                <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="size-3.5" /> {t("timetable.overlapWarning")}</div>
                {c.map((x) => (
                  <div key={x.id} className="mt-1 text-muted">
                    {subjects.get(x.subjectId)?.name} · <span dir="ltr">{x.startTime}–{x.endTime}</span>
                  </div>
                ))}
              </div>
            );
          },
        },
      ]}
      onSave={async (d, e) => {
        const patch = { ...d, day: Number(d.day), semesterId: e?.semesterId ?? semesterId } as Partial<TimetableEntry>;
        if (patch.recurrence === "once" && patch.specificDate) patch.day = weekdayIndex(new Date(`${patch.specificDate}T12:00:00`));
        const r = await s.timetable.save({ ...patch, id: e?.id });
        if (r.conflicts.length) toast.warning(t("timetable.savedWithConflicts", { count: r.conflicts.length }));
        return r.entry;
      }}
      onDelete={(e) => s.repos.timetable.remove(e.id)}
      onRestore={(snap) => s.repos.timetable.restore(snap)}
    >
      {(e) =>
        e && (
          <Link to={`/subjects/${e.subjectId}`} className="text-sm text-accent hover:underline">
            {t("timetable.openSubject")} → {subjects.get(e.subjectId)?.name}
          </Link>
        )
      }
    </EntityDrawer>
  );
}

