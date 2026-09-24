import type { Deadline, Reminder } from "../model/types";
import type { Statement } from "../db/types";
import { diffDays, combineDateTime } from "../utils/dates";
import type { ServiceContext } from "./context";
import { nowIso, today } from "./context";

export type DeadlineView = "upcoming" | "overdue" | "all" | "completed";

export interface DeadlineFilter {
  view?: DeadlineView;
  subjectId?: string | null;
  projectId?: string | null;
  type?: string | null;
  from?: string | null;
  to?: string | null;
  semesterId?: string | null;
  limit?: number;
}

export const DEFAULT_REMINDERS: Record<string, number[]> = {
  exam: [7 * 1440, 1440, 180],
  quiz: [1440, 120],
  assignment: [2 * 1440, 1440, 180],
  project: [7 * 1440, 2 * 1440],
  presentation: [2 * 1440, 1440],
  report: [2 * 1440, 1440],
  other: [1440],
};

const DONE = "('completed','submitted','cancelled')";

export interface Countdown {
  /** Calendar days until due (negative = overdue). */
  days: number;
  /** Minutes until due when a time is set and it is today. */
  minutes: number | null;
  state: "overdue" | "today" | "tomorrow" | "soon" | "later" | "done";
}

/** Human-friendly countdown (pure). */
export function countdown(d: Pick<Deadline, "dueDate" | "dueTime" | "status">, now: Date): Countdown {
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const days = diffDays(todayKey, d.dueDate);
  if (["completed", "submitted", "cancelled"].includes(d.status)) return { days, minutes: null, state: "done" };
  let minutes: number | null = null;
  if (days === 0 && d.dueTime) minutes = Math.round((combineDateTime(d.dueDate, d.dueTime).getTime() - now.getTime()) / 60000);
  if (days < 0 || (minutes !== null && minutes < 0)) return { days, minutes, state: "overdue" };
  if (days === 0) return { days, minutes, state: "today" };
  if (days === 1) return { days, minutes, state: "tomorrow" };
  if (days <= 7) return { days, minutes, state: "soon" };
  return { days, minutes, state: "later" };
}

export function createDeadlineService(ctx: ServiceContext) {
  const { repos } = ctx;

  const reminderStatements = (id: string, offsets: number[]): Statement[] => [
    { sql: "DELETE FROM reminders WHERE entity_type = 'deadline' AND entity_id = ?", params: [id] },
    ...[...new Set(offsets.filter((o) => Number.isFinite(o) && o >= 0))].map((o) => ({
      sql: "INSERT INTO reminders (id, entity_type, entity_id, offset_minutes, created_at) VALUES (?, 'deadline', ?, ?, ?)",
      params: [ctx.newId(), id, Math.round(o), nowIso(ctx)],
    })),
  ];

  const svc = {
    async list(f: DeadlineFilter = {}): Promise<Deadline[]> {
      const where: string[] = [];
      const params: (string | number)[] = [];
      const t = today(ctx);
      if (f.view === "upcoming") {
        where.push(`t.status NOT IN ${DONE}`, "t.due_date >= ?");
        params.push(t);
      } else if (f.view === "overdue") {
        where.push(`t.status NOT IN ${DONE}`, "t.due_date < ?");
        params.push(t);
      } else if (f.view === "completed") {
        where.push(`t.status IN ${DONE}`);
      }
      if (f.subjectId) {
        where.push("t.subject_id = ?");
        params.push(f.subjectId);
      }
      if (f.projectId) {
        where.push("t.project_id = ?");
        params.push(f.projectId);
      }
      if (f.type) {
        where.push("t.type = ?");
        params.push(f.type);
      }
      if (f.from) {
        where.push("t.due_date >= ?");
        params.push(f.from);
      }
      if (f.to) {
        where.push("t.due_date <= ?");
        params.push(f.to);
      }
      if (f.semesterId) {
        where.push("(t.subject_id IS NULL OR t.subject_id IN (SELECT id FROM subjects WHERE semester_id = ?))");
        params.push(f.semesterId);
      }
      const orderBy = f.view === "completed" ? "t.due_date DESC" : undefined;
      return repos.deadlines.list({ where, params, orderBy, limit: f.limit ?? 2000 });
    },

    async reminders(id: string): Promise<Reminder[]> {
      const rows = await ctx.db.query<Record<string, unknown>>(
        "SELECT * FROM reminders WHERE entity_type = 'deadline' AND entity_id = ? ORDER BY offset_minutes DESC",
        [id],
      );
      return rows.map((r) => ({
        id: r.id as string,
        entityType: "deadline",
        entityId: id,
        offsetMinutes: r.offset_minutes as number,
        createdAt: r.created_at as string,
      }));
    },

    async create(input: Partial<Deadline>, reminderOffsets?: number[]): Promise<Deadline> {
      const e = repos.deadlines.build(input as never);
      const offsets = reminderOffsets ?? DEFAULT_REMINDERS[e.type] ?? [1440];
      await ctx.db.batch([...repos.deadlines.createStatements(e), ...reminderStatements(e.id, offsets)]);
      return e;
    },

    async update(id: string, patch: Partial<Deadline>, reminderOffsets?: number[]): Promise<Deadline> {
      const { before, after } = await repos.deadlines.prepareUpdate(id, patch);
      const statements = [...repos.deadlines.updateStatements(after)];
      if (reminderOffsets) statements.push(...reminderStatements(id, reminderOffsets));
      // Rescheduling makes previously delivered reminders relevant again for the new date.
      if (before.dueDate !== after.dueDate || before.dueTime !== after.dueTime) {
        statements.push({
          sql: "DELETE FROM notifications WHERE entity_type = 'deadline' AND entity_id = ? AND dedupe_key LIKE 'deadline:%'",
          params: [id],
        });
      }
      await ctx.db.batch(statements);
      return after;
    },

    async setStatus(id: string, status: Deadline["status"]): Promise<Deadline> {
      const done = ["completed", "submitted"].includes(status);
      return svc.update(id, { status, completedAt: done ? nowIso(ctx) : null });
    },

    async reschedule(id: string, dueDate: string, dueTime?: string | null): Promise<Deadline> {
      return svc.update(id, { dueDate, ...(dueTime !== undefined ? { dueTime } : {}), status: "pending" });
    },

    async upcoming(limit = 10, types?: string[]): Promise<Deadline[]> {
      const where = [`t.status NOT IN ${DONE}`, "t.due_date >= ?"];
      const params: (string | number)[] = [today(ctx)];
      if (types?.length) {
        where.push(`t.type IN (${types.map(() => "?").join(",")})`);
        params.push(...types);
      }
      return repos.deadlines.list({ where, params, limit });
    },
  };
  return svc;
}
