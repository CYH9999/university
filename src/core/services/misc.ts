import type { JournalEntry, StudySession, Tag } from "../model/types";
import type { ServiceContext } from "./context";
import { nowIso, today } from "./context";
import { toDateKey } from "../utils/dates";

export function createJournalService(ctx: ServiceContext) {
  const { repos } = ctx;
  return {
    async byDate(date: string): Promise<JournalEntry | null> {
      const rows = await repos.journal.list({ where: ["t.date = ?"], params: [date], limit: 1 });
      return rows[0] ?? null;
    },
    /** Creates or updates the entry for a date (one entry per day). */
    async save(date: string, patch: Partial<JournalEntry>): Promise<JournalEntry> {
      const rows = await repos.journal.list({ where: ["t.date = ?"], params: [date], limit: 1 });
      if (rows[0]) return repos.journal.update(rows[0].id, patch);
      return repos.journal.create({ ...patch, date } as never);
    },
    async datesInMonth(month: string): Promise<string[]> {
      const rows = await ctx.db.query<{ date: string }>("SELECT date FROM journal_entries WHERE substr(date, 1, 7) = ?", [month]);
      return rows.map((r) => r.date);
    },
    list: (limit = 60, offset = 0) => repos.journal.list({ limit, offset }),
  };
}

export function createStudyService(ctx: ServiceContext) {
  const { repos } = ctx;
  return {
    /** Records a finished study session (from the focus timer or entered manually). */
    async record(input: { subjectId?: string | null; projectId?: string | null; taskId?: string | null; kind?: string; startedAt: Date; endedAt: Date; notes?: string | null }): Promise<StudySession | null> {
      const minutes = Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 60000);
      if (minutes < 1) return null;
      return repos.studySessions.create({
        subjectId: input.subjectId ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        kind: input.kind ?? "focus",
        startedAt: input.startedAt.toISOString(),
        endedAt: input.endedAt.toISOString(),
        durationMinutes: Math.min(minutes, 24 * 60),
        date: toDateKey(input.startedAt),
        notes: input.notes ?? null,
      } as never);
    },
    async totals(): Promise<{ todayMinutes: number; weekMinutes: number; streakDays: number }> {
      const t = today(ctx);
      const d = ctx.clock.now();
      const weekAgo = toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6));
      const rows = await ctx.db.query<{ today: number | null; week: number | null }>(
        "SELECT SUM(CASE WHEN date = ? THEN duration_minutes ELSE 0 END) AS today, SUM(CASE WHEN date >= ? THEN duration_minutes ELSE 0 END) AS week FROM study_sessions",
        [t, weekAgo],
      );
      const days = await ctx.db.query<{ date: string }>("SELECT DISTINCT date FROM study_sessions WHERE date <= ? ORDER BY date DESC LIMIT 400", [t]);
      let streak = 0;
      let cursor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const set = new Set(days.map((x) => x.date));
      if (!set.has(toDateKey(cursor))) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
      while (set.has(toDateKey(cursor))) {
        streak++;
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
      }
      return { todayMinutes: rows[0]?.today ?? 0, weekMinutes: rows[0]?.week ?? 0, streakDays: streak };
    },
    recent: (limit = 20) => repos.studySessions.list({ limit }),
  };
}

export function createTagService(ctx: ServiceContext) {
  return {
    async list(): Promise<(Tag & { count: number })[]> {
      const rows = await ctx.db.query<{ id: string; name: string; color: string | null; created_at: string; n: number }>(
        "SELECT t.id, t.name, t.color, t.created_at, COUNT(et.tag_id) AS n FROM tags t LEFT JOIN entity_tags et ON et.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
      );
      return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, createdAt: r.created_at, count: r.n }));
    },
    async names(): Promise<string[]> {
      const rows = await ctx.db.query<{ name: string }>("SELECT name FROM tags ORDER BY name COLLATE NOCASE");
      return rows.map((r) => r.name);
    },
    async rename(id: string, name: string) {
      await ctx.db.execute("UPDATE tags SET name = ? WHERE id = ?", [name.trim(), id]);
    },
    async remove(id: string) {
      await ctx.db.execute("DELETE FROM tags WHERE id = ?", [id]);
    },
    /** Removes tags no longer used by any item. */
    async prune() {
      return ctx.db.execute("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM entity_tags)");
    },
  };
}

export interface RecentItem {
  entityType: string;
  entityId: string;
  title: string;
  openedAt: string;
}

export function createRecentService(ctx: ServiceContext) {
  return {
    async touch(entityType: string, entityId: string, title: string) {
      await ctx.db.execute(
        `INSERT INTO recent_items (entity_type, entity_id, title, opened_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET opened_at = excluded.opened_at, title = excluded.title`,
        [entityType, entityId, title.slice(0, 200), nowIso(ctx)],
      );
    },
    async list(limit = 12, types?: string[]): Promise<RecentItem[]> {
      const where = types?.length ? `WHERE entity_type IN (${types.map(() => "?").join(",")})` : "";
      const rows = await ctx.db.query<{ entity_type: string; entity_id: string; title: string; opened_at: string }>(
        `SELECT * FROM recent_items ${where} ORDER BY opened_at DESC LIMIT ?`,
        [...(types ?? []), limit],
      );
      return rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, title: r.title, openedAt: r.opened_at }));
    },
    async prune(keep = 200) {
      await ctx.db.execute("DELETE FROM recent_items WHERE rowid NOT IN (SELECT rowid FROM recent_items ORDER BY opened_at DESC LIMIT ?)", [keep]);
    },
  };
}

export function createAuditService(ctx: ServiceContext) {
  return {
    async list(limit = 100) {
      const rows = await ctx.db.query<{ id: string; entity_type: string; entity_id: string; action: string; summary: string | null; created_at: string }>(
        "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?",
        [limit],
      );
      return rows.map((r) => ({ id: r.id, entityType: r.entity_type, entityId: r.entity_id, action: r.action, summary: r.summary, createdAt: r.created_at }));
    },
    async prune(keep = 5000) {
      await ctx.db.execute("DELETE FROM audit_log WHERE id NOT IN (SELECT id FROM audit_log ORDER BY created_at DESC LIMIT ?)", [keep]);
    },
  };
}

export function createExpenseService(ctx: ServiceContext) {
  return {
    async totals(from: string, to: string): Promise<{ currency: string; total: number }[]> {
      return ctx.db.query("SELECT currency, SUM(amount) AS total FROM expenses WHERE date BETWEEN ? AND ? GROUP BY currency ORDER BY total DESC", [from, to]);
    },
  };
}
