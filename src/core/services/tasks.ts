import type { Task, TaskRecurrence, Subtask } from "../model/types";
import type { Statement } from "../db/types";
import { addDays, addMonths, parseDateKey, toDateKey, weekdayIndex, addDaysKey, startOfWeek } from "../utils/dates";
import type { ServiceContext } from "./context";
import { nowIso, today } from "./context";

export type TaskView = "today" | "week" | "upcoming" | "overdue" | "all" | "completed" | "inbox";

export interface TaskFilter {
  view?: TaskView;
  subjectId?: string | null;
  projectId?: string | null;
  goalId?: string | null;
  status?: string | null;
  priority?: string | null;
  tag?: string | null;
  text?: string | null;
  includeDone?: boolean;
  limit?: number;
}

/** Next due date for a recurring task (pure). */
export function nextOccurrence(dueKey: string, r: TaskRecurrence): string | null {
  const interval = Math.max(1, r.interval || 1);
  let next: string;
  if (r.freq === "daily") {
    next = addDaysKey(dueKey, interval);
  } else if (r.freq === "monthly") {
    next = toDateKey(addMonths(parseDateKey(dueKey), interval));
  } else {
    const days = (r.weekdays ?? []).slice().sort((a, b) => a - b);
    const d = parseDateKey(dueKey);
    if (days.length === 0) {
      next = toDateKey(addDays(d, 7 * interval));
    } else {
      const cur = weekdayIndex(d);
      const later = days.find((x) => x > cur);
      if (later !== undefined) {
        next = toDateKey(addDays(d, later - cur));
      } else {
        // First selected weekday of the week `interval` weeks later (weeks start on Saturday).
        const weekStart = startOfWeek(d);
        next = toDateKey(addDays(weekStart, 7 * interval + days[0]));
      }
    }
  }
  if (r.until && next > r.until) return null;
  return next;
}

const OPEN = "t.status NOT IN ('completed','cancelled')";

export function createTaskService(ctx: ServiceContext) {
  const { repos } = ctx;

  const svc = {
    async list(f: TaskFilter = {}): Promise<Task[]> {
      const where: string[] = [];
      const params: (string | number)[] = [];
      const t = today(ctx);
      switch (f.view) {
        case "today":
          where.push(OPEN, "t.due_date IS NOT NULL AND t.due_date <= ?");
          params.push(t);
          break;
        case "week": {
          const end = toDateKey(addDays(startOfWeek(ctx.clock.now()), 6));
          where.push(OPEN, "t.due_date IS NOT NULL AND t.due_date <= ?");
          params.push(end);
          break;
        }
        case "upcoming":
          where.push(OPEN, "t.due_date > ?");
          params.push(t);
          break;
        case "overdue":
          where.push(OPEN, "t.due_date < ?");
          params.push(t);
          break;
        case "inbox":
          where.push("t.status = 'inbox'");
          break;
        case "completed":
          where.push("t.status IN ('completed','cancelled')");
          break;
        default:
          if (!f.includeDone) where.push(OPEN);
      }
      if (f.subjectId) {
        where.push("t.subject_id = ?");
        params.push(f.subjectId);
      }
      if (f.projectId) {
        where.push("t.project_id = ?");
        params.push(f.projectId);
      }
      if (f.goalId) {
        where.push("t.goal_id = ?");
        params.push(f.goalId);
      }
      if (f.status) {
        where.push("t.status = ?");
        params.push(f.status);
      }
      if (f.priority) {
        where.push("t.priority = ?");
        params.push(f.priority);
      }
      if (f.tag) {
        where.push(
          "EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'task' AND et.entity_id = t.id AND tg.name = ? COLLATE NOCASE)",
        );
        params.push(f.tag);
      }
      if (f.text?.trim()) {
        where.push("(t.title LIKE ? OR t.description LIKE ?)");
        params.push(`%${f.text.trim()}%`, `%${f.text.trim()}%`);
      }
      const orderBy =
        f.view === "completed"
          ? "t.completed_at DESC"
          : "CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.sort_order";
      return repos.tasks.list({ where, params, orderBy, limit: f.limit ?? 1000 });
    },

    async create(input: Partial<Task>): Promise<Task> {
      const status = input.status ?? (input.dueDate ? "planned" : "inbox");
      return repos.tasks.create({ ...input, status } as never);
    },

    async update(id: string, patch: Partial<Task>): Promise<Task> {
      const before = await repos.tasks.require(id);
      if (patch.status && patch.status !== before.status) return svc.setStatus(id, patch.status, patch);
      return repos.tasks.update(id, patch);
    },

    /**
     * Changes status. Completing a recurring task creates its next occurrence (once) in the
     * same transaction; re-opening clears `completedAt`.
     */
    async setStatus(id: string, status: Task["status"], extraPatch: Partial<Task> = {}): Promise<Task> {
      const before = await repos.tasks.require(id);
      const done = status === "completed";
      const { after } = await repos.tasks.prepareUpdate(id, {
        ...extraPatch,
        status,
        completedAt: done ? before.completedAt ?? nowIso(ctx) : null,
      });
      const statements: Statement[] = [...repos.tasks.updateStatements(after)];
      if (done && before.status !== "completed" && before.recurrence && before.dueDate) {
        const nextDue = nextOccurrence(before.dueDate, before.recurrence);
        const parentId = before.recurrenceParentId ?? before.id;
        if (nextDue) {
          const existing = await repos.tasks.count({
            where: ["(t.recurrence_parent_id = ? OR t.id = ?)", "t.due_date = ?"],
            params: [parentId, parentId, nextDue],
          });
          if (existing === 0) {
            const next = repos.tasks.build({
              ...before,
              id: undefined,
              createdAt: undefined,
              dueDate: nextDue,
              status: "planned",
              completedAt: null,
              actualMinutes: null,
              recurrenceParentId: parentId,
            } as never);
            statements.push(...repos.tasks.createStatements(next));
            const subs = await repos.subtasks.list({ where: ["t.task_id = ?"], params: [before.id] });
            for (const s of subs) {
              statements.push(...repos.subtasks.createStatements(repos.subtasks.build({ taskId: next.id, title: s.title, done: false, sortOrder: s.sortOrder } as never)));
            }
          }
        }
      }
      await ctx.db.batch(statements);
      return after;
    },

    async toggleDone(id: string): Promise<Task> {
      const t = await repos.tasks.require(id);
      return svc.setStatus(id, t.status === "completed" ? "planned" : "completed");
    },

    /** Moves unfinished tasks with rollover enabled from past days to today. Returns count. */
    async rollover(): Promise<number> {
      const t = today(ctx);
      const overdue = await repos.tasks.list({ where: [OPEN, "t.rollover = 1", "t.due_date < ?", "t.recurrence IS NULL"], params: [t] });
      if (!overdue.length) return 0;
      const statements: Statement[] = [];
      for (const task of overdue) {
        const { after } = await repos.tasks.prepareUpdate(task.id, { dueDate: t });
        statements.push(...repos.tasks.updateStatements(after, false));
      }
      await ctx.db.batch(statements);
      return overdue.length;
    },

    async reorder(ids: string[], status?: Task["status"]): Promise<void> {
      const statements: Statement[] = ids.map((id, i) => ({
        sql: status ? "UPDATE tasks SET sort_order = ?, status = ?, updated_at = ? WHERE id = ?" : "UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?",
        params: status ? [i, status, nowIso(ctx), id] : [i, nowIso(ctx), id],
      }));
      await ctx.db.batch(statements);
    },

    // ---- subtasks ----
    subtasks: (taskId: string) => repos.subtasks.list({ where: ["t.task_id = ?"], params: [taskId] }),

    async subtaskCounts(taskIds: string[]): Promise<Map<string, { done: number; total: number }>> {
      const out = new Map<string, { done: number; total: number }>();
      if (!taskIds.length) return out;
      const rows = await ctx.db.query<{ task_id: string; done: number; total: number }>(
        `SELECT task_id, SUM(done) AS done, COUNT(*) AS total FROM subtasks WHERE task_id IN (${taskIds.map(() => "?").join(",")}) GROUP BY task_id`,
        taskIds,
      );
      for (const r of rows) out.set(r.task_id, { done: r.done ?? 0, total: r.total });
      return out;
    },

    addSubtask: async (taskId: string, title: string): Promise<Subtask> => {
      const n = await repos.subtasks.count({ where: ["t.task_id = ?"], params: [taskId] });
      return repos.subtasks.create({ taskId, title, sortOrder: n } as never);
    },
    toggleSubtask: async (id: string): Promise<Subtask> => {
      const s = await repos.subtasks.require(id);
      return repos.subtasks.update(id, { done: !s.done });
    },
    renameSubtask: (id: string, title: string) => repos.subtasks.update(id, { title }),
    removeSubtask: (id: string) => repos.subtasks.remove(id),

    async counts(): Promise<{ today: number; overdue: number; inbox: number; open: number }> {
      const t = today(ctx);
      const rows = await ctx.db.query<{ today: number; overdue: number; inbox: number; open: number }>(
        `SELECT
          SUM(CASE WHEN due_date = ? THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN status = 'inbox' THEN 1 ELSE 0 END) AS inbox,
          COUNT(*) AS open
         FROM tasks WHERE status NOT IN ('completed','cancelled')`,
        [t, t],
      );
      const r = rows[0];
      return { today: r?.today ?? 0, overdue: r?.overdue ?? 0, inbox: r?.inbox ?? 0, open: r?.open ?? 0 };
    },
  };
  return svc;
}
