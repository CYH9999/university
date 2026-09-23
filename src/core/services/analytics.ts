/**
 * Local analytics computed from real data only. Every series may be empty; the UI shows an
 * empty state instead of inventing numbers.
 */
import type { SqlValue } from "../db/types";
import type { ServiceContext } from "./context";
import { today } from "./context";
import { addDaysKey } from "../utils/dates";

export interface AnalyticsFilter {
  from: string;
  to: string;
  semesterId?: string | null;
  subjectId?: string | null;
  projectId?: string | null;
}

export interface SeriesPoint {
  key: string;
  value: number;
}

function subjectScope(f: AnalyticsFilter, column = "subject_id"): { sql: string; params: SqlValue[] } {
  if (f.subjectId) return { sql: ` AND ${column} = ?`, params: [f.subjectId] };
  if (f.semesterId) return { sql: ` AND ${column} IN (SELECT id FROM subjects WHERE semester_id = ?)`, params: [f.semesterId] };
  return { sql: "", params: [] };
}

export function createAnalyticsService(ctx: ServiceContext) {
  const q = <T>(sql: string, params: SqlValue[]) => ctx.db.query<T>(sql, params);

  return {
    async taskStats(f: AnalyticsFilter) {
      const s = subjectScope(f);
      const proj = f.projectId ? { sql: " AND project_id = ?", params: [f.projectId] } : { sql: "", params: [] };
      const [completed, overdue, created, bySubject, byDay] = await Promise.all([
        q<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tasks WHERE status = 'completed' AND substr(completed_at, 1, 10) BETWEEN ? AND ?${s.sql}${proj.sql}`,
          [f.from, f.to, ...s.params, ...proj.params],
        ),
        q<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date < ?${s.sql}${proj.sql}`,
          [today(ctx), ...s.params, ...proj.params],
        ),
        q<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tasks WHERE substr(created_at, 1, 10) BETWEEN ? AND ?${s.sql}${proj.sql}`,
          [f.from, f.to, ...s.params, ...proj.params],
        ),
        q<{ subject_id: string | null; name: string | null; color: string | null; open: number; done: number }>(
          `SELECT t.subject_id, s.name, s.color,
                  SUM(CASE WHEN t.status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS open,
                  SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS done
           FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id
           WHERE (t.completed_at IS NULL OR substr(t.completed_at, 1, 10) BETWEEN ? AND ?)${s.sql.replace(/subject_id/g, "t.subject_id")}${proj.sql.replace("project_id", "t.project_id")}
           GROUP BY t.subject_id ORDER BY (open + done) DESC LIMIT 12`,
          [f.from, f.to, ...s.params, ...proj.params],
        ),
        q<{ day: string; n: number }>(
          `SELECT substr(completed_at, 1, 10) AS day, COUNT(*) AS n FROM tasks
           WHERE status = 'completed' AND substr(completed_at, 1, 10) BETWEEN ? AND ?${s.sql}${proj.sql} GROUP BY day ORDER BY day`,
          [f.from, f.to, ...s.params, ...proj.params],
        ),
      ]);
      return {
        completed: completed[0]?.n ?? 0,
        overdue: overdue[0]?.n ?? 0,
        created: created[0]?.n ?? 0,
        bySubject: bySubject.map((r) => ({ subjectId: r.subject_id, name: r.name, color: r.color, open: r.open ?? 0, done: r.done ?? 0 })),
        completedByDay: byDay.map((r) => ({ key: r.day, value: r.n })),
      };
    },

    async studyActivity(f: AnalyticsFilter) {
      const s = subjectScope(f);
      const [byDay, bySubject, total] = await Promise.all([
        q<{ date: string; minutes: number }>(
          `SELECT date, SUM(duration_minutes) AS minutes FROM study_sessions WHERE date BETWEEN ? AND ?${s.sql} GROUP BY date ORDER BY date`,
          [f.from, f.to, ...s.params],
        ),
        q<{ name: string | null; color: string | null; minutes: number }>(
          `SELECT s.name, s.color, SUM(x.duration_minutes) AS minutes FROM study_sessions x LEFT JOIN subjects s ON s.id = x.subject_id
           WHERE x.date BETWEEN ? AND ?${s.sql.replace(/subject_id/g, "x.subject_id")} GROUP BY x.subject_id ORDER BY minutes DESC LIMIT 12`,
          [f.from, f.to, ...s.params],
        ),
        q<{ minutes: number | null; sessions: number }>(
          `SELECT SUM(duration_minutes) AS minutes, COUNT(*) AS sessions FROM study_sessions WHERE date BETWEEN ? AND ?${s.sql}`,
          [f.from, f.to, ...s.params],
        ),
      ]);
      return {
        byDay: byDay.map((r) => ({ key: r.date, value: r.minutes })),
        bySubject: bySubject.map((r) => ({ name: r.name, color: r.color, minutes: r.minutes })),
        totalMinutes: total[0]?.minutes ?? 0,
        sessions: total[0]?.sessions ?? 0,
      };
    },

    async notesOverTime(f: AnalyticsFilter): Promise<SeriesPoint[]> {
      const s = subjectScope(f);
      const rows = await q<{ month: string; n: number }>(
        `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM notes WHERE substr(created_at, 1, 10) BETWEEN ? AND ?${s.sql} GROUP BY month ORDER BY month`,
        [f.from, f.to, ...s.params],
      );
      return rows.map((r) => ({ key: r.month, value: r.n }));
    },

    async researchOverTime(f: AnalyticsFilter): Promise<SeriesPoint[]> {
      const s = subjectScope(f);
      const rows = await q<{ month: string; n: number }>(
        `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n FROM research_resources WHERE substr(created_at, 1, 10) BETWEEN ? AND ?${s.sql} GROUP BY month ORDER BY month`,
        [f.from, f.to, ...s.params],
      );
      return rows.map((r) => ({ key: r.month, value: r.n }));
    },

    async attendanceBySubject(f: AnalyticsFilter) {
      const s = subjectScope(f, "a.subject_id");
      const rows = await q<{ name: string; color: string | null; present: number; total: number }>(
        `SELECT s.name, s.color, SUM(CASE WHEN a.status IN ('present','late','excused') THEN 1 ELSE 0 END) AS present, COUNT(*) AS total
         FROM attendance_records a JOIN subjects s ON s.id = a.subject_id
         WHERE a.date BETWEEN ? AND ?${s.sql} GROUP BY a.subject_id ORDER BY s.name`,
        [f.from, f.to, ...s.params],
      );
      return rows.map((r) => ({ name: r.name, color: r.color, percent: r.total ? Math.round((r.present / r.total) * 100) : 0, total: r.total }));
    },

    async expenses(f: AnalyticsFilter) {
      const scope: string[] = [];
      const params: SqlValue[] = [f.from, f.to];
      if (f.semesterId) {
        scope.push("(semester_id = ? OR subject_id IN (SELECT id FROM subjects WHERE semester_id = ?))");
        params.push(f.semesterId, f.semesterId);
      }
      if (f.subjectId) {
        scope.push("subject_id = ?");
        params.push(f.subjectId);
      }
      if (f.projectId) {
        scope.push("project_id = ?");
        params.push(f.projectId);
      }
      const extra = scope.length ? ` AND ${scope.join(" AND ")}` : "";
      const [byCategory, byMonth, byDay] = await Promise.all([
        q<{ category: string; currency: string; total: number }>(
          `SELECT category, currency, SUM(amount) AS total FROM expenses WHERE date BETWEEN ? AND ?${extra} GROUP BY category, currency ORDER BY total DESC`,
          params,
        ),
        q<{ month: string; currency: string; total: number }>(
          `SELECT substr(date, 1, 7) AS month, currency, SUM(amount) AS total FROM expenses WHERE date BETWEEN ? AND ?${extra} GROUP BY month, currency ORDER BY month`,
          params,
        ),
        q<{ date: string; currency: string; total: number }>(
          `SELECT date, currency, SUM(amount) AS total FROM expenses WHERE date BETWEEN ? AND ?${extra} GROUP BY date, currency ORDER BY date`,
          params,
        ),
      ]);
      return { byCategory, byMonth, byDay };
    },

    async cyberActivity(f: AnalyticsFilter) {
      const [ctfByCat, ctfSolved, labs, commands, cyberNotes, roadmap] = await Promise.all([
        q<{ category: string; solved: number; total: number }>(
          "SELECT category, SUM(CASE WHEN status = 'solved' THEN 1 ELSE 0 END) AS solved, COUNT(*) AS total FROM ctf_challenges GROUP BY category ORDER BY total DESC",
          [],
        ),
        q<{ month: string; n: number }>(
          "SELECT substr(completed_at, 1, 7) AS month, COUNT(*) AS n FROM ctf_challenges WHERE status = 'solved' AND completed_at BETWEEN ? AND ? GROUP BY month ORDER BY month",
          [f.from, f.to],
        ),
        q<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM cyber_labs GROUP BY status", []),
        q<{ n: number }>("SELECT COUNT(*) AS n FROM commands", []),
        q<{ n: number }>(
          "SELECT COUNT(*) AS n FROM notes WHERE (cyber_topic IS NOT NULL OR note_type IN ('cyber_concept','ctf_writeup','lab')) AND archived = 0",
          [],
        ),
        q<{ title: string; done: number; total: number }>(
          `SELECT r.title, SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS done, COUNT(i.id) AS total
           FROM roadmaps r LEFT JOIN roadmap_items i ON i.roadmap_id = r.id GROUP BY r.id ORDER BY r.created_at`,
          [],
        ),
      ]);
      return {
        ctfByCategory: ctfByCat,
        ctfSolvedByMonth: ctfSolved.map((r) => ({ key: r.month, value: r.n })),
        labsByStatus: labs,
        commands: commands[0]?.n ?? 0,
        cyberNotes: cyberNotes[0]?.n ?? 0,
        roadmaps: roadmap.map((r) => ({ title: r.title, percent: r.total ? Math.round(((r.done ?? 0) / r.total) * 100) : 0, total: r.total })),
      };
    },

    async deadlinesSummary(f: AnalyticsFilter) {
      const s = subjectScope(f);
      const rows = await q<{ type: string; status: string; n: number }>(
        `SELECT type, status, COUNT(*) AS n FROM deadlines WHERE due_date BETWEEN ? AND ?${s.sql} GROUP BY type, status`,
        [f.from, f.to, ...s.params],
      );
      return rows;
    },

    defaultRange(): { from: string; to: string } {
      const t = today(ctx);
      return { from: addDaysKey(t, -89), to: t };
    },
  };
}
