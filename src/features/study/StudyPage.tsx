import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Timer, Play, Pause, Square, Plus, Flame, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { SubjectSelect, EnumSelect, ProjectSelect } from "@/components/common/pickers";
import { DatePicker, TimeInput } from "@/components/common/DatePicker";
import { SubjectChip } from "@/components/common/badges";
import { Modal } from "@/components/ui/overlay";
import { useServices } from "@/app/services";
import { useQ, invalidateAll, useMut } from "@/app/query";
import { useSettings } from "@/app/settings";
import { useSubjectMap } from "@/lib/hooks";
import { fmtMinutes, fmtDate } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import { combineDateTime, toDateKey } from "@/core/utils/dates";
import { desktopNotify } from "@/platform/tauri";
import { cn } from "@/lib/cn";

interface TimerState {
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
  subjectId: string | null;
  projectId: string | null;
  kind: string;
  targetMin: number;
  set(p: Partial<TimerState>): void;
}

/** Focus timer state survives navigation between pages (not app restarts). */
const useTimer = create<TimerState>((set) => ({
  running: false,
  startedAt: null,
  elapsedMs: 0,
  subjectId: null,
  projectId: null,
  kind: "focus",
  targetMin: 25,
  set: (p) => set(p),
}));

function elapsed(st: TimerState, now: number) {
  return st.elapsedMs + (st.running && st.startedAt ? now - st.startedAt : 0);
}

export function StudyPage() {
  const { t } = useTranslation();
  const s = useServices();
  const subjects = useSubjectMap();
  const focusMinutes = useSettings((x) => x.settings.focusMinutes);
  const timer = useTimer();
  const [now, setNow] = React.useState(Date.now());
  const [params, setParams] = useSearchParams();
  const [manual, setManual] = React.useState(false);
  const notified = React.useRef(false);

  React.useEffect(() => {
    if (!timer.startedAt && !timer.running && timer.elapsedMs === 0) timer.set({ targetMin: focusMinutes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMinutes]);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const start = React.useCallback(() => {
    const st = useTimer.getState();
    if (st.running) return;
    notified.current = false;
    st.set({ running: true, startedAt: Date.now() });
  }, []);

  React.useEffect(() => {
    if (params.get("start") === "1") {
      setParams({}, { replace: true });
      start();
    }
  }, [params, setParams, start]);

  const ms = elapsed(timer, now);
  const target = timer.targetMin * 60000;
  const remaining = Math.max(0, target - ms);

  React.useEffect(() => {
    if (timer.running && ms >= target && !notified.current) {
      notified.current = true;
      toast.success(t("study.targetReached"));
      void desktopNotify.send(t("study.targetReached"), t("study.targetReachedBody", { min: timer.targetMin }));
    }
  }, [ms, target, timer.running, timer.targetMin, t]);

  const pause = () => timer.set({ running: false, elapsedMs: ms, startedAt: null });
  const reset = () => timer.set({ running: false, elapsedMs: 0, startedAt: null });
  const stop = async () => {
    const total = ms;
    const end = new Date();
    const begin = new Date(end.getTime() - total);
    reset();
    try {
      const saved = await s.study.record({ subjectId: timer.subjectId, projectId: timer.projectId, kind: timer.kind, startedAt: begin, endedAt: end });
      if (saved) toast.success(t("study.saved", { time: fmtMinutes(saved.durationMinutes) }));
      else toast.info(t("study.tooShort"));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const { data: totals } = useQ(["study", "totals"], () => s.study.totals());
  const { data: recent = [] } = useQ(["study", "recent"], () => s.study.recent(30));
  const remove = useMut((id: string) => s.repos.studySessions.remove(id), { success: "toast.deleted" });

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const over = ms > target;
  const pct = Math.min(100, (ms / target) * 100);

  return (
    <div>
      <PageHeader icon={<Timer />} title={t("nav.study")} description={t("study.lead")} actions={<Button onClick={() => setManual(true)}><Plus /> {t("study.addManual")}</Button>} />
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="flex flex-col items-center p-8">
            <div className="relative flex size-64 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(var(--border))" strokeWidth="4" />
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 282.7} 282.7`} />
              </svg>
              <div className="text-center">
                <div className="font-mono text-5xl font-semibold tabular-nums" dir="ltr">
                  {over ? "+" : ""}{over ? fmtClock(ms - target) : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`}
                </div>
                <div className="mt-1 text-xs text-muted">{t("study.elapsed", { time: fmtClock(ms) })}</div>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              {timer.running ? (
                <Button size="lg" onClick={pause}><Pause /> {t("study.pause")}</Button>
              ) : (
                <Button size="lg" variant="primary" onClick={start}><Play /> {ms > 0 ? t("study.resume") : t("study.start")}</Button>
              )}
              <Button size="lg" onClick={stop} disabled={ms < 1000}><Square /> {t("study.finish")}</Button>
              <Button size="lg" variant="ghost" onClick={reset} disabled={ms === 0}><RotateCcw /> {t("common.reset")}</Button>
            </div>
            <div className="mt-6 grid w-full max-w-xl grid-cols-2 gap-3">
              <Field label={t("fields.subjectId")}><SubjectSelect value={timer.subjectId} onChange={(v) => timer.set({ subjectId: v })} /></Field>
              <Field label={t("fields.kind")}><EnumSelect name="studyKind" value={timer.kind} onChange={(v) => timer.set({ kind: v ?? "focus" })} /></Field>
              <Field label={t("fields.projectId")}><ProjectSelect value={timer.projectId} onChange={(v) => timer.set({ projectId: v })} /></Field>
              <Field label={t("study.targetMinutes")}>
                <Input type="number" min={5} max={240} dir="ltr" value={timer.targetMin} disabled={timer.running} onChange={(e) => timer.set({ targetMin: Math.max(1, Number(e.target.value) || 25) })} />
              </Field>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t("study.today")} value={fmtMinutes(totals?.todayMinutes ?? 0)} />
            <Stat label={t("study.last7")} value={fmtMinutes(totals?.weekMinutes ?? 0)} />
            <Stat label={t("study.streak")} value={<span className="inline-flex items-center gap-1"><Flame className="size-5 text-warning" />{totals?.streakDays ?? 0}</span>} />
          </div>
          <Card>
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">{t("study.history")}</div>
            {recent.length === 0 ? (
              <EmptyState compact icon={<Timer />} title={t("study.empty")} />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id} className="group flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted">{fmtDate(r.date, "EEE d MMM")}</span>
                    <span className="flex-1 truncate">
                      <SubjectChip subject={r.subjectId ? subjects.get(r.subjectId) : null} link={false} />
                      {!r.subjectId && <span className="text-xs text-subtle">{t(`enums.studyKind.${r.kind}`)}</span>}
                    </span>
                    <span className="tabular-nums">{fmtMinutes(r.durationMinutes)}</span>
                    <Button size="icon-sm" variant="ghost" className={cn("opacity-0 group-hover:opacity-100")} onClick={() => remove.mutate(r.id)} aria-label={t("common.delete")}><Trash2 /></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <ManualSession open={manual} onClose={() => setManual(false)} />
    </div>
  );
}

function fmtClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ManualSession({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const [date, setDate] = React.useState<string | null>(toDateKey(new Date()));
  const [start, setStart] = React.useState<string | null>("16:00");
  const [end, setEnd] = React.useState<string | null>("17:00");
  const [subjectId, setSubjectId] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<string | null>("review");
  const save = async () => {
    if (!date || !start || !end) return;
    const a = combineDateTime(date, start);
    const b = combineDateTime(date, end);
    if (b <= a) return void toast.error(t("validation.endAfterStart"));
    try {
      await s.study.record({ subjectId, kind: kind ?? "focus", startedAt: a, endedAt: b });
      await invalidateAll();
      toast.success(t("toast.created"));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t("study.addManual")} footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" onClick={save}>{t("common.save")}</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("fields.date")} className="col-span-2"><DatePicker value={date} onChange={setDate} clearable={false} /></Field>
        <Field label={t("fields.startTime")}><TimeInput value={start} onChange={setStart} /></Field>
        <Field label={t("fields.endTime")}><TimeInput value={end} onChange={setEnd} /></Field>
        <Field label={t("fields.subjectId")}><SubjectSelect value={subjectId} onChange={setSubjectId} /></Field>
        <Field label={t("fields.kind")}><EnumSelect name="studyKind" value={kind} onChange={setKind} /></Field>
      </div>
    </Modal>
  );
}
