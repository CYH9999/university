import * as React from "react";
import { useTranslation } from "react-i18next";
import { CalendarHeart, Search, CheckCircle2, Loader2, CircleDot, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Card, EmptyState } from "@/components/ui/misc";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { MiniCalendar } from "@/components/common/Calendar";
import { Rating } from "@/components/common/RecordForm";
import { useServices } from "@/app/services";
import { useQ, invalidateAll } from "@/app/query";
import { useSaveStatus } from "@/app/saveStatus";
import { confirm } from "@/app/confirm";
import { useAllSubjects, useAllProjects, useDebounced, useSearchParam } from "@/lib/hooks";
import { fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { toDateKey, parseDateKey } from "@/core/utils/dates";
import type { JournalEntry } from "@/core/model/types";
import { monthKey } from "@/core/utils/dates";

const FIELDS = ["studied", "completed", "learned", "notUnderstood", "problems", "tomorrow"] as const;

export function JournalPage() {
  const { t } = useTranslation();
  const s = useServices();
  const [idParam] = useSearchParam("id");
  const [date, setDate] = React.useState(toDateKey(new Date()));
  const [month, setMonth] = React.useState(new Date());
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q);
  React.useEffect(() => {
    if (idParam) void s.repos.journal.get(idParam).then((e) => e && (setDate(e.date), setMonth(parseDateKey(e.date))));
  }, [idParam, s]);
  const { data: marked = [] } = useQ(["journal", "month", monthKey(month)], () => s.journal.datesInMonth(monthKey(month)));
  const { data: results = [] } = useQ(["journal", "search", dq], async () => {
    if (!dq.trim()) return s.journal.list(30);
    const like = `%${dq.trim()}%`;
    return s.repos.journal.list({ where: ["(t.studied LIKE ? OR t.completed LIKE ? OR t.learned LIKE ? OR t.not_understood LIKE ? OR t.problems LIKE ? OR t.tomorrow LIKE ? OR t.free_text LIKE ?)"], params: Array(7).fill(like), limit: 100 });
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader icon={<CalendarHeart />} title={t("nav.journal")} description={t("journal.lead")} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-[300px] shrink-0 overflow-y-auto border-e border-border p-4">
          <MiniCalendar value={date} onSelect={setDate} marked={new Set(marked)} month={month} onMonthChange={setMonth} />
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute start-2.5 top-2.5 size-4 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("journal.search")} className="ps-8" />
          </div>
          <ul className="mt-3 space-y-1">
            {results.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { setDate(e.date); setMonth(parseDateKey(e.date)); }} className={`w-full rounded-md px-2 py-1.5 text-start hover:bg-surface-2 ${e.date === date ? "bg-accent/10" : ""}`}>
                  <div className="text-xs font-medium">{fmtDate(e.date, "EEEE d MMM yyyy")}</div>
                  <div className="truncate text-[11px] text-subtle" dir="auto">{e.learned || e.studied || e.freeText || "—"}</div>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-2 text-xs text-subtle">{t("journal.noEntries")}</li>}
          </ul>
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <EntryEditor key={date} date={date} />
        </div>
      </div>
    </div>
  );
}

function EntryEditor({ date }: { date: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useAllSubjects().data ?? [];
  const projects = useAllProjects().data ?? [];
  const { data: entry, isLoading } = useQ(["journal", "entry", date], () => s.journal.byDate(date), { staleTime: Infinity });
  const [draft, setDraft] = React.useState<Partial<JournalEntry> | null>(null);
  const [state, setState] = React.useState<"saved" | "saving" | "unsaved">("saved");
  const pending = React.useRef<Partial<JournalEntry> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = `journal:${date}`;

  React.useEffect(() => {
    if (!isLoading) setDraft(entry ?? { date, subjectIds: [], projectIds: [] });
  }, [isLoading, entry, date]);

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState("saving");
    useSaveStatus.getState().begin();
    try {
      await s.journal.save(date, p);
      useSaveStatus.getState().end();
      useSaveStatus.getState().markClean(key);
      setState("saved");
      void invalidateAll();
    } catch (e) {
      pending.current = { ...p, ...(pending.current ?? {}) };
      useSaveStatus.getState().end(errorMessage(e));
      toast.error(errorMessage(e));
      setState("unsaved");
    }
  }, [date, key, s]);

  React.useEffect(() => () => void flush(), [flush]);

  const set = (patch: Partial<JournalEntry>) => {
    setDraft((d) => ({ ...(d ?? {}), ...patch }));
    pending.current = { ...(pending.current ?? {}), ...patch };
    setState("unsaved");
    useSaveStatus.getState().markDirty(key, flush);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  const remove = async () => {
    if (!entry) return;
    if (!(await confirm({ title: t("journal.deleteTitle"), description: t("journal.deleteBody"), confirmLabel: t("common.delete"), danger: true }))) return;
    pending.current = null;
    await s.repos.journal.remove(entry.id);
    await invalidateAll();
    setDraft({ date, subjectIds: [], projectIds: [] });
  };

  if (!draft) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{fmtDate(date, "EEEE d MMMM yyyy")}</h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          {state === "saving" && <><Loader2 className="size-3.5 animate-spin" /> {t("status.saving")}</>}
          {state === "saved" && entry && <><CheckCircle2 className="size-3.5 text-success" /> {t("status.allSaved")}</>}
          {state === "unsaved" && <><CircleDot className="size-3.5 text-warning" /> {t("status.unsaved")}</>}
          {entry && (
            <Button size="icon-sm" variant="ghost" onClick={remove} aria-label={t("common.delete")}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {!entry && state === "saved" && <EmptyState compact title={t("journal.newEntry")} description={t("journal.newEntryHint")} />}
      <Card className="grid grid-cols-2 gap-4 p-4">
        <Field label={t("fields.mood")}>
          <Rating value={draft.mood ?? null} onChange={(v) => set({ mood: v })} />
        </Field>
        <Field label={t("fields.energy")}>
          <Rating value={draft.energy ?? null} onChange={(v) => set({ energy: v })} />
        </Field>
      </Card>
      {FIELDS.map((f) => (
        <Field key={f} label={t(`journal.fields.${f}`)}>
          <Textarea rows={3} value={(draft[f] as string) ?? ""} onChange={(e) => set({ [f]: e.target.value } as Partial<JournalEntry>)} placeholder={t(`journal.placeholders.${f}`)} dir="auto" />
        </Field>
      ))}
      <Field label={t("journal.fields.freeText")}>
        <Textarea rows={8} value={draft.freeText ?? ""} onChange={(e) => set({ freeText: e.target.value })} dir="auto" />
      </Field>
      <Card className="space-y-3 p-4">
        <div>
          <div className="label">{t("journal.relatedSubjects")}</div>
          <div className="flex flex-wrap gap-3">
            {subjects.filter((x) => !x.archived).map((x) => (
              <Checkbox key={x.id} checked={(draft.subjectIds ?? []).includes(x.id)} onCheckedChange={(v) => set({ subjectIds: v ? [...(draft.subjectIds ?? []), x.id] : (draft.subjectIds ?? []).filter((y) => y !== x.id) })} label={x.name} />
            ))}
            {subjects.length === 0 && <span className="text-xs text-subtle">—</span>}
          </div>
        </div>
        <div>
          <div className="label">{t("journal.relatedProjects")}</div>
          <div className="flex flex-wrap gap-3">
            {projects.filter((x) => x.status !== "archived").map((x) => (
              <Checkbox key={x.id} checked={(draft.projectIds ?? []).includes(x.id)} onCheckedChange={(v) => set({ projectIds: v ? [...(draft.projectIds ?? []), x.id] : (draft.projectIds ?? []).filter((y) => y !== x.id) })} label={x.name} />
            ))}
            {projects.length === 0 && <span className="text-xs text-subtle">—</span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
