import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Plus, Presentation, NotebookPen, Upload, FolderOpen, Check, X, Clock, ShieldAlert, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useServices } from "@/app/services";
import { useQ, useMut, invalidateAll } from "@/app/query";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { AttachmentsPanel } from "@/components/common/files";
import { DatePicker } from "@/components/common/DatePicker";
import { Button } from "@/components/ui/button";
import { Badge, ProgressBar, Segmented } from "@/components/ui/controls";
import { EmptyState, Stat } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { dialogs, openApi } from "@/platform/tauri";
import { errorMessage, fileFailureMessage } from "@/lib/errors";
import { fmtDate, fmtNumber } from "@/lib/format";
import { toDateKey } from "@/core/utils/dates";
import { SUBJECT_SUBFOLDERS, type SubjectFolderKind } from "@/core/services/files";
import type { Lecture, Subject, AttendanceRecord } from "@/core/model/types";
import { cn } from "@/lib/cn";

export function LecturesPanel({ subject }: { subject: Subject }) {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Lecture>();
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const { data = [], isLoading } = useQ(["lectures", subject.id], () => s.subjects.lectures(subject.id));
  const { data: noteCounts } = useQ(["lectures", "notecounts", subject.id], async () => {
    const rows = await s.db.query<{ lecture_id: string; n: number }>("SELECT lecture_id, COUNT(*) AS n FROM notes WHERE subject_id = ? AND lecture_id IS NOT NULL GROUP BY lecture_id", [subject.id]);
    return new Map(rows.map((r) => [r.lecture_id, r.n]));
  });
  const create = async () => editor.create({ subjectId: subject.id, number: await s.subjects.nextLectureNumber(subject.id), date: toDateKey(new Date()) });
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="primary" onClick={() => void create()}>
          <Plus /> {t("lectures.new")}
        </Button>
      </div>
      {!isLoading && data.length === 0 ? (
        <EmptyState compact icon={<Presentation />} title={t("lectures.empty")} description={t("lectures.emptyHint")} />
      ) : (
        <ul className="space-y-2">
          {data.map((l) => (
            <li key={l.id} className="card">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-mono text-sm text-muted">{l.number ?? "·"}</div>
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                  <div className="truncate font-medium">{l.title}</div>
                  <div className="text-xs text-subtle">
                    {l.date ? fmtDate(l.date, "EEEE d MMM yyyy") : t("lectures.noDate")}
                    {l.topic ? ` · ${l.topic}` : ""}
                  </div>
                </button>
                <Badge>{t("lectures.notesCount", { count: noteCounts?.get(l.id) ?? 0 })}</Badge>
                <Button size="sm" variant="ghost" asChild>
                  <Link to={`/notes?new=1&subjectId=${subject.id}&lectureId=${l.id}${l.date ? `&date=${l.date}` : ""}`}>
                    <NotebookPen /> {t("lectures.addNote")}
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => editor.edit(l)}>
                  {t("common.edit")}
                </Button>
              </div>
              {expanded === l.id && (
                <div className="space-y-3 border-t border-border px-4 py-3">
                  {l.summary && <p className="whitespace-pre-wrap text-sm text-muted" dir="auto">{l.summary}</p>}
                  <AttachmentsPanel entityType="lecture" entityId={l.id} title={t("lectures.files")} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <EntityDrawer<Lecture>
        editor={editor}
        title={{ create: "lectures.new", edit: "lectures.edit" }}
        fields={[
          { name: "title", kind: "text", required: true, span: 2, autoFocus: true },
          { name: "number", kind: "number", min: 0 },
          { name: "date", kind: "date" },
          { name: "topic", kind: "text", span: 2 },
          { name: "summary", kind: "textarea", span: 2, rows: 5 },
        ]}
        onSave={(d, e) => (e ? s.repos.lectures.update(e.id, d as Partial<Lecture>) : s.repos.lectures.create({ ...d, subjectId: subject.id } as never))}
        onDelete={(e) => s.repos.lectures.remove(e.id)}
        onRestore={(snap) => s.repos.lectures.restore(snap)}
      >
        {(e) => (e ? <AttachmentsPanel entityType="lecture" entityId={e.id} title={t("lectures.files")} /> : null)}
      </EntityDrawer>
    </div>
  );
}

export function SubjectFilesPanel({ subject }: { subject: Subject }) {
  const { t } = useTranslation();
  const s = useServices();
  const [kind, setKind] = React.useState<SubjectFolderKind>("Lectures");
  const [busy, setBusy] = React.useState(false);
  const upload = async () => {
    const picked = await dialogs.pickFiles(t("files.chooseFiles"));
    if (!picked.length) return;
    setBusy(true);
    try {
      const dest = await s.files.subjectFolder(subject.id, kind);
      const r = await s.files.importFiles({ sources: picked, destRel: dest, subjectId: subject.id, link: { entityType: "subject", entityId: subject.id } });
      if (r.imported.length) toast.success(t("files.importedTo", { count: r.imported.length, folder: dest }));
      if (r.linkedExisting.length) toast.info(t("files.linkedExisting", { count: r.linkedExisting.length }));
      for (const f of r.failed) toast.error(fileFailureMessage(f));
      await invalidateAll();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const openFolder = async () => {
    try {
      await openApi.reveal(await s.files.subjectFolder(subject.id));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <span className="text-sm text-muted">{t("files.uploadInto")}</span>
        <NativeSelect className="w-44" value={kind} onChange={(e) => setKind(e.target.value as SubjectFolderKind)} options={SUBJECT_SUBFOLDERS.map((k) => ({ value: k, label: t(`files.subjectFolders.${k}`) }))} />
        <Button variant="primary" onClick={upload} loading={busy}>
          <Upload /> {t("files.upload")}
        </Button>
        <Button variant="ghost" onClick={openFolder} className="ms-auto">
          <FolderOpen /> {t("files.openSubjectFolder")}
        </Button>
        {subject.folderRel && <span className="w-full truncate font-mono text-[11px] text-subtle" dir="ltr">{subject.folderRel}</span>}
      </div>
      <AttachmentsPanel entityType="subject" entityId={subject.id} title={t("files.subjectFiles")} hideUpload />
    </div>
  );
}

const ATT_ICON = { present: Check, absent: X, late: Clock, excused: ShieldAlert } as const;
const ATT_TONE = { present: "success", absent: "danger", late: "warning", excused: "info" } as const;

export function AttendancePanel({ subject }: { subject: Subject }) {
  const { t } = useTranslation();
  const s = useServices();
  const [date, setDate] = React.useState<string | null>(toDateKey(new Date()));
  const [filter, setFilter] = React.useState<"all" | "absent">("all");
  const { data: overview } = useQ(["subject-overview", subject.id], () => s.subjects.overview(subject.id));
  const { data: records = [] } = useQ(["attendance", subject.id], () => s.subjects.attendance(subject.id));
  const mark = useMut(({ status }: { status: AttendanceRecord["status"] }) => s.subjects.markAttendance(subject.id, date!, status), { success: "attendance.marked" });
  const remove = useMut((id: string) => s.repos.attendance.remove(id));
  const st = overview?.attendance;
  const list = filter === "absent" ? records.filter((r) => r.status === "absent") : records;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("attendance.rate")} value={st?.attendancePercent === null || st?.attendancePercent === undefined ? "—" : `${fmtNumber(st.attendancePercent, 0)}%`} tone="accent" />
        <Stat label={t("enums.attendanceStatus.absent")} value={st?.absent ?? 0} tone={st?.level === "exceeded" ? "danger" : st?.level === "warning" ? "warning" : undefined} hint={t("attendance.limitHint", { limit: subject.attendanceThreshold })} />
        <Stat label={t("enums.attendanceStatus.late")} value={st?.late ?? 0} />
        <Stat label={t("attendance.sessions")} value={st?.total ?? 0} />
      </div>
      {st && st.total > 0 && (
        <div className="card p-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{t("attendance.absenceRate", { pct: fmtNumber(st.absencePercent, 0) })}</span>
            <span>{t("attendance.limit", { limit: subject.attendanceThreshold })}</span>
          </div>
          <ProgressBar value={((st.absencePercent ?? 0) / Math.max(1, subject.attendanceThreshold)) * 100} tone={st.level === "exceeded" ? "danger" : st.level === "warning" ? "warning" : "success"} />
          {st.level !== "ok" && st.level !== "none" && <p className={cn("mt-2 text-xs", st.level === "exceeded" ? "text-danger" : "text-warning")}>{t(`attendance.level.${st.level}`)}</p>}
        </div>
      )}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <CalendarDays className="size-4 text-muted" />
        <DatePicker value={date} onChange={setDate} clearable={false} className="w-56" />
        {(["present", "absent", "late", "excused"] as const).map((k) => {
          const Icon = ATT_ICON[k];
          return (
            <Button key={k} size="sm" variant="outline" disabled={!date} onClick={() => mark.mutate({ status: k })}>
              <Icon /> {t(`enums.attendanceStatus.${k}`)}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("attendance.history")}</h3>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "all", label: t("common.all") }, { value: "absent", label: t("enums.attendanceStatus.absent") }]} />
      </div>
      {list.length === 0 ? (
        <EmptyState compact title={t("attendance.empty")} />
      ) : (
        <ul className="card divide-y divide-border">
          {list.map((r) => {
            const Icon = ATT_ICON[r.status];
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Icon className={cn("size-4", r.status === "present" ? "text-success" : r.status === "absent" ? "text-danger" : r.status === "late" ? "text-warning" : "text-info")} />
                <span className="flex-1">{fmtDate(r.date, "EEEE d MMM yyyy")}</span>
                <Badge tone={ATT_TONE[r.status]}>{t(`enums.attendanceStatus.${r.status}`)}</Badge>
                <Button size="icon-sm" variant="ghost" onClick={() => remove.mutate(r.id)} aria-label={t("common.delete")}>
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
