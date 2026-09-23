import type { Goal, Meeting, Project, ActionItem } from "../model/types";
import type { Statement } from "../db/types";
import type { ServiceContext } from "./context";
import { nowIso, today } from "./context";

export interface ProjectProgress {
  percent: number;
  tasksDone: number;
  tasksTotal: number;
  milestonesDone: number;
  milestonesTotal: number;
}

export function createProjectService(ctx: ServiceContext) {
  const { repos } = ctx;

  const svc = {
    async list(opts: { status?: string | null; subjectId?: string | null; semesterId?: string | null; includeArchived?: boolean } = {}) {
      const where: string[] = [];
      const params: string[] = [];
      if (opts.status) {
        where.push("t.status = ?");
        params.push(opts.status);
      } else if (!opts.includeArchived) where.push("t.status <> 'archived'");
      if (opts.subjectId) {
        where.push("t.subject_id = ?");
        params.push(opts.subjectId);
      }
      if (opts.semesterId) {
        where.push("(t.semester_id = ? OR t.subject_id IN (SELECT id FROM subjects WHERE semester_id = ?))");
        params.push(opts.semesterId, opts.semesterId);
      }
      return repos.projects.list({ where, params });
    },

    async progress(projectIds: string[]): Promise<Map<string, ProjectProgress>> {
      const out = new Map<string, ProjectProgress>();
      if (!projectIds.length) return out;
      const ph = projectIds.map(() => "?").join(",");
      const [taskRows, msRows, projects] = await Promise.all([
        ctx.db.query<{ project_id: string; done: number; total: number }>(
          `SELECT project_id, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS total
           FROM tasks WHERE project_id IN (${ph}) GROUP BY project_id`,
          projectIds,
        ),
        ctx.db.query<{ project_id: string; done: number; total: number }>(
          `SELECT project_id, SUM(done) AS done, COUNT(*) AS total FROM project_milestones WHERE project_id IN (${ph}) GROUP BY project_id`,
          projectIds,
        ),
        repos.projects.getMany(projectIds),
      ]);
      const t = new Map(taskRows.map((r) => [r.project_id, r]));
      const m = new Map(msRows.map((r) => [r.project_id, r]));
      for (const p of projects) {
        const tr = t.get(p.id);
        const mr = m.get(p.id);
        const tasksDone = tr?.done ?? 0;
        const tasksTotal = tr?.total ?? 0;
        const milestonesDone = mr?.done ?? 0;
        const milestonesTotal = mr?.total ?? 0;
        let percent = p.progress;
        if (p.progressMode === "tasks") percent = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;
        if (p.progressMode === "milestones") percent = milestonesTotal ? Math.round((milestonesDone / milestonesTotal) * 100) : 0;
        if (p.status === "completed" || p.status === "submitted") percent = Math.max(percent, p.status === "completed" ? 100 : percent);
        out.set(p.id, { percent, tasksDone, tasksTotal, milestonesDone, milestonesTotal });
      }
      return out;
    },

    milestones: (projectId: string) => repos.milestones.list({ where: ["t.project_id = ?"], params: [projectId] }),
    members: (projectId: string) => repos.members.list({ where: ["t.project_id = ?"], params: [projectId] }),
    meetings: (projectId: string) => repos.meetings.list({ where: ["t.project_id = ?"], params: [projectId] }),

    async toggleMilestone(id: string) {
      const m = await repos.milestones.require(id);
      return repos.milestones.update(id, { done: !m.done, completedAt: !m.done ? nowIso(ctx) : null });
    },

    /** Member workload: open/completed tasks assigned to each member. */
    async memberWorkload(projectId: string): Promise<Map<string, { open: number; done: number }>> {
      const rows = await ctx.db.query<{ assignee_id: string; open: number; done: number }>(
        `SELECT assignee_id, SUM(CASE WHEN status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done
         FROM tasks WHERE project_id = ? AND assignee_id IS NOT NULL GROUP BY assignee_id`,
        [projectId],
      );
      return new Map(rows.map((r) => [r.assignee_id, { open: r.open ?? 0, done: r.done ?? 0 }]));
    },

    /**
     * Saves a meeting and turns new action items into project tasks (assigned to the
     * member), keeping the link in `taskId` so they are not duplicated on later saves.
     */
    async saveMeeting(input: Partial<Meeting> & { projectId: string }, createTasks: boolean): Promise<Meeting> {
      const items: ActionItem[] = (input.actionItems ?? []).map((a) => ({ ...a, id: a.id || ctx.newId() }));
      const statements: Statement[] = [];
      if (createTasks) {
        for (const a of items) {
          if (a.taskId) continue;
          const task = repos.tasks.build({
            title: a.text,
            projectId: input.projectId,
            assigneeId: a.assigneeId,
            dueDate: a.dueDate,
            status: a.done ? "completed" : "planned",
            completedAt: a.done ? nowIso(ctx) : null,
          } as never);
          a.taskId = task.id;
          statements.push(...repos.tasks.createStatements(task));
        }
      }
      let meeting: Meeting;
      if (input.id) {
        const { after } = await repos.meetings.prepareUpdate(input.id, { ...input, actionItems: items });
        meeting = after;
        statements.unshift(...repos.meetings.updateStatements(after));
      } else {
        meeting = repos.meetings.build({ ...input, actionItems: items } as never);
        statements.unshift(...repos.meetings.createStatements(meeting));
      }
      await ctx.db.batch(statements);
      return meeting;
    },

    /** Timeline items: milestones, deadlines, meetings and dated tasks. */
    async timeline(projectId: string) {
      const [p, milestones, meetings, deadlines, tasks] = await Promise.all([
        repos.projects.require(projectId),
        svc.milestones(projectId),
        svc.meetings(projectId),
        repos.deadlines.list({ where: ["t.project_id = ?"], params: [projectId] }),
        repos.tasks.list({ where: ["t.project_id = ?", "t.due_date IS NOT NULL"], params: [projectId] }),
      ]);
      type Item = { date: string; kind: "start" | "deadline" | "milestone" | "meeting" | "task"; title: string; id: string; done: boolean };
      const items: Item[] = [];
      if (p.startDate) items.push({ date: p.startDate, kind: "start", title: p.name, id: p.id, done: true });
      if (p.deadline) items.push({ date: p.deadline, kind: "deadline", title: p.name, id: p.id, done: p.status === "completed" || p.status === "submitted" });
      for (const m of milestones) if (m.dueDate) items.push({ date: m.dueDate, kind: "milestone", title: m.title, id: m.id, done: m.done });
      for (const m of meetings) items.push({ date: m.date, kind: "meeting", title: m.title, id: m.id, done: m.date < today(ctx) });
      for (const d of deadlines) items.push({ date: d.dueDate, kind: "deadline", title: d.title, id: d.id, done: ["completed", "submitted"].includes(d.status) });
      for (const t of tasks) items.push({ date: t.dueDate!, kind: "task", title: t.title, id: t.id, done: t.status === "completed" });
      return items.sort((a, b) => a.date.localeCompare(b.date));
    },

    async create(input: Partial<Project>): Promise<Project> {
      return repos.projects.create(input as never);
    },
  };
  return svc;
}

export function createGoalService(ctx: ServiceContext) {
  const { repos } = ctx;
  const svc = {
    milestones: (goalId: string) => repos.goalMilestones.list({ where: ["t.goal_id = ?"], params: [goalId] }),

    async progress(goals: Goal[]): Promise<Map<string, number>> {
      const out = new Map<string, number>();
      if (!goals.length) return out;
      const ids = goals.map((g) => g.id);
      const ph = ids.map(() => "?").join(",");
      const [taskRows, msRows] = await Promise.all([
        ctx.db.query<{ goal_id: string; done: number; total: number }>(
          `SELECT goal_id, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS total FROM tasks WHERE goal_id IN (${ph}) GROUP BY goal_id`,
          ids,
        ),
        ctx.db.query<{ goal_id: string; done: number; total: number }>(
          `SELECT goal_id, SUM(done) AS done, COUNT(*) AS total FROM goal_milestones WHERE goal_id IN (${ph}) GROUP BY goal_id`,
          ids,
        ),
      ]);
      const t = new Map(taskRows.map((r) => [r.goal_id, r]));
      const m = new Map(msRows.map((r) => [r.goal_id, r]));
      for (const g of goals) {
        let p = g.progress;
        if (g.progressMode === "tasks") {
          const r = t.get(g.id);
          p = r?.total ? Math.round((r.done / r.total) * 100) : 0;
        } else if (g.progressMode === "milestones") {
          const r = m.get(g.id);
          p = r?.total ? Math.round((r.done / r.total) * 100) : 0;
        }
        if (g.status === "completed") p = 100;
        out.set(g.id, p);
      }
      return out;
    },

    async toggleMilestone(id: string) {
      const m = await repos.goalMilestones.require(id);
      return repos.goalMilestones.update(id, { done: !m.done });
    },

    async linkedSubjects(goalId: string): Promise<string[]> {
      const rows = await ctx.db.query<{ target_id: string }>(
        "SELECT target_id FROM entity_links WHERE source_type = 'goal' AND source_id = ? AND target_type = 'subject'",
        [goalId],
      );
      return rows.map((r) => r.target_id);
    },

    async setLinkedSubjects(goalId: string, subjectIds: string[]): Promise<void> {
      await ctx.db.batch([
        { sql: "DELETE FROM entity_links WHERE source_type = 'goal' AND source_id = ? AND target_type = 'subject'", params: [goalId] },
        ...subjectIds.map((sid) => ({
          sql: "INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relation, created_at) VALUES (?, 'goal', ?, 'subject', ?, 'focus', ?)",
          params: [ctx.newId(), goalId, sid, nowIso(ctx)],
        })),
      ]);
    },
  };
  return svc;
}

/** Generic many-to-many links between any two entities (e.g. project ↔ research resource). */
export function createLinkService(ctx: ServiceContext) {
  return {
    async targets(sourceType: string, sourceId: string, targetType: string): Promise<string[]> {
      const rows = await ctx.db.query<{ target_id: string }>(
        "SELECT target_id FROM entity_links WHERE source_type = ? AND source_id = ? AND target_type = ? ORDER BY created_at",
        [sourceType, sourceId, targetType],
      );
      return rows.map((r) => r.target_id);
    },
    async sources(targetType: string, targetId: string, sourceType: string): Promise<string[]> {
      const rows = await ctx.db.query<{ source_id: string }>(
        "SELECT source_id FROM entity_links WHERE target_type = ? AND target_id = ? AND source_type = ?",
        [targetType, targetId, sourceType],
      );
      return rows.map((r) => r.source_id);
    },
    async link(sourceType: string, sourceId: string, targetType: string, targetId: string, relation: string | null = null) {
      await ctx.db.execute(
        "INSERT OR IGNORE INTO entity_links (id, source_type, source_id, target_type, target_id, relation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [ctx.newId(), sourceType, sourceId, targetType, targetId, relation, nowIso(ctx)],
      );
    },
    async unlink(sourceType: string, sourceId: string, targetType: string, targetId: string) {
      await ctx.db.execute("DELETE FROM entity_links WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?", [
        sourceType,
        sourceId,
        targetType,
        targetId,
      ]);
    },
  };
}
