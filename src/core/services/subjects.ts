import type { Subject, AttendanceRecord } from "../model/types";
import type { ServiceContext } from "./context";
import { today } from "./context";

export interface AttendanceStats {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  /** Share of sessions attended (present + late + excused) in %. */
  attendancePercent: number | null;
  /** Unexcused absences as % of recorded sessions. */
  absencePercent: number | null;
  threshold: number;
  /** "warning" when within 5 points of the limit, "exceeded" when over. */
  level: "ok" | "warning" | "exceeded" | "none";
}

export function attendanceStats(records: Pick<AttendanceRecord, "status">[], threshold: number): AttendanceStats {
  const c = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of records) c[r.status] += 1;
  const total = records.length;
  const absencePercent = total ? (c.absent / total) * 100 : null;
  const attendancePercent = total ? ((c.present + c.late + c.excused) / total) * 100 : null;
  let level: AttendanceStats["level"] = "none";
  if (absencePercent !== null) {
    level = absencePercent > threshold ? "exceeded" : absencePercent >= threshold - 5 && c.absent > 0 ? "warning" : "ok";
  }
  return { ...c, total, attendancePercent, absencePercent, threshold, level };
}

export interface SubjectOverview {
  notes: number;
  files: number;
  openTasks: number;
  upcomingDeadlines: number;
  unresolvedQuestions: number;
  lectures: number;
  projects: number;
  resources: number;
  attendance: AttendanceStats;
}

export function createSubjectService(ctx: ServiceContext) {
  const { repos } = ctx;
  const svc = {
    async list(opts: { semesterId?: string | null; includeArchived?: boolean; all?: boolean } = {}): Promise<Subject[]> {
      const where: string[] = [];
      const params: string[] = [];
      if (!opts.all && opts.semesterId) {
        where.push("t.semester_id = ?");
        params.push(opts.semesterId);
      }
      if (!opts.includeArchived) where.push("t.archived = 0");
      return repos.subjects.list({ where, params });
    },

    async overview(subjectId: string): Promise<SubjectOverview> {
      const t = today(ctx);
      const rows = await ctx.db.query<Record<string, number>>(
        `SELECT
          (SELECT COUNT(*) FROM notes WHERE subject_id = ?1 AND archived = 0) AS notes,
          (SELECT COUNT(*) FROM files WHERE trashed_at IS NULL AND (subject_id = ?1 OR id IN (SELECT file_id FROM file_links WHERE entity_type='subject' AND entity_id = ?1))) AS files,
          (SELECT COUNT(*) FROM tasks WHERE subject_id = ?1 AND status NOT IN ('completed','cancelled')) AS open_tasks,
          (SELECT COUNT(*) FROM deadlines WHERE subject_id = ?1 AND status NOT IN ('completed','submitted','cancelled') AND due_date >= ?2) AS upcoming,
          (SELECT COUNT(*) FROM questions WHERE subject_id = ?1 AND status IN ('unresolved','researching')) AS questions,
          (SELECT COUNT(*) FROM lectures WHERE subject_id = ?1) AS lectures,
          (SELECT COUNT(*) FROM projects WHERE subject_id = ?1) AS projects,
          (SELECT COUNT(*) FROM research_resources WHERE subject_id = ?1) AS resources`,
        [subjectId, t],
      );
      const r = rows[0] ?? {};
      const subject = await repos.subjects.require(subjectId);
      const att = await repos.attendance.list({ where: ["t.subject_id = ?"], params: [subjectId] });
      return {
        notes: r.notes ?? 0,
        files: r.files ?? 0,
        openTasks: r.open_tasks ?? 0,
        upcomingDeadlines: r.upcoming ?? 0,
        unresolvedQuestions: r.questions ?? 0,
        lectures: r.lectures ?? 0,
        projects: r.projects ?? 0,
        resources: r.resources ?? 0,
        attendance: attendanceStats(att, subject.attendanceThreshold),
      };
    },

    /** Counters for subject cards (one query for many subjects). */
    async cardStats(ids: string[]): Promise<Map<string, { notes: number; files: number; tasks: number; deadlines: number }>> {
      const out = new Map<string, { notes: number; files: number; tasks: number; deadlines: number }>();
      if (!ids.length) return out;
      const ph = ids.map(() => "?").join(",");
      const t = today(ctx);
      const rows = await ctx.db.query<{ id: string; notes: number; files: number; tasks: number; deadlines: number }>(
        `SELECT s.id,
           (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id AND n.archived = 0) AS notes,
           (SELECT COUNT(*) FROM files f WHERE f.trashed_at IS NULL AND (f.subject_id = s.id OR f.id IN (SELECT file_id FROM file_links WHERE entity_type='subject' AND entity_id = s.id))) AS files,
           (SELECT COUNT(*) FROM tasks k WHERE k.subject_id = s.id AND k.status NOT IN ('completed','cancelled')) AS tasks,
           (SELECT COUNT(*) FROM deadlines d WHERE d.subject_id = s.id AND d.status NOT IN ('completed','submitted','cancelled') AND d.due_date >= ?) AS deadlines
         FROM subjects s WHERE s.id IN (${ph})`,
        [t, ...ids],
      );
      for (const r of rows) out.set(r.id, { notes: r.notes, files: r.files, tasks: r.tasks, deadlines: r.deadlines });
      return out;
    },

    attendance: (subjectId: string) => repos.attendance.list({ where: ["t.subject_id = ?"], params: [subjectId] }),

    /** Records attendance for a date (one record per subject/date/session; updates if present). */
    async markAttendance(subjectId: string, date: string, status: AttendanceRecord["status"], timetableEntryId: string | null = null, notes: string | null = null) {
      const existing = await repos.attendance.list({
        where: ["t.subject_id = ?", "t.date = ?", timetableEntryId ? "t.timetable_entry_id = ?" : "t.timetable_entry_id IS NULL"],
        params: timetableEntryId ? [subjectId, date, timetableEntryId] : [subjectId, date],
        limit: 1,
      });
      if (existing[0]) return repos.attendance.update(existing[0].id, { status, notes: notes ?? existing[0].notes });
      return repos.attendance.create({ subjectId, date, status, timetableEntryId, notes } as never);
    },

    /** Attendance summary for all subjects in a semester (dashboard warnings). */
    async attendanceWarnings(semesterId: string | null): Promise<{ subject: Subject; stats: AttendanceStats }[]> {
      const subjects = await svc.list({ semesterId, all: !semesterId });
      if (!subjects.length) return [];
      const recs = await repos.attendance.list({
        where: [`t.subject_id IN (${subjects.map(() => "?").join(",")})`],
        params: subjects.map((s) => s.id),
      });
      const by = new Map<string, AttendanceRecord[]>();
      for (const r of recs) by.set(r.subjectId, [...(by.get(r.subjectId) ?? []), r]);
      return subjects
        .map((s) => ({ subject: s, stats: attendanceStats(by.get(s.id) ?? [], s.attendanceThreshold) }))
        .filter((x) => x.stats.level === "warning" || x.stats.level === "exceeded");
    },

    lectures: (subjectId: string) => repos.lectures.list({ where: ["t.subject_id = ?"], params: [subjectId] }),

    async nextLectureNumber(subjectId: string): Promise<number> {
      const rows = await ctx.db.query<{ n: number | null }>("SELECT MAX(number) AS n FROM lectures WHERE subject_id = ?", [subjectId]);
      return (rows[0]?.n ?? 0) + 1;
    },

    async remove(id: string): Promise<Subject> {
      return repos.subjects.remove(id);
    },
  };
  return svc;
}
