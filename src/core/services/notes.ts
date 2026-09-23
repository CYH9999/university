import type { ContentVersion, Note } from "../model/types";
import type { Statement } from "../db/types";
import { countWords } from "../utils/text";
import type { ServiceContext } from "./context";
import { nowIso } from "./context";

/** Minimum time between automatic snapshots of the same document. */
export const AUTO_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
/** Automatic snapshots kept per document (manual snapshots are never pruned automatically). */
export const MAX_AUTO_SNAPSHOTS = 50;

export interface NoteFilter {
  subjectId?: string | null;
  projectId?: string | null;
  noteType?: string | null;
  cyberOnly?: boolean;
  cyberTopic?: string | null;
  archived?: boolean;
  favorite?: boolean;
  tag?: string | null;
  text?: string | null;
  limit?: number;
  offset?: number;
}

function rowToVersion(r: Record<string, unknown>): ContentVersion {
  return {
    id: r.id as string,
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    title: (r.title as string) ?? null,
    content: (r.content as string) ?? null,
    contentText: (r.content_text as string) ?? null,
    kind: r.kind as ContentVersion["kind"],
    label: (r.label as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Version history for any rich-text document (notes, CTF write-ups…). */
export function createVersionService(ctx: ServiceContext) {
  const svc = {
    async list(entityType: string, entityId: string): Promise<ContentVersion[]> {
      const rows = await ctx.db.query<Record<string, unknown>>(
        "SELECT * FROM content_versions WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
        [entityType, entityId],
      );
      return rows.map(rowToVersion);
    },

    async latest(entityType: string, entityId: string): Promise<ContentVersion | null> {
      const rows = await ctx.db.query<Record<string, unknown>>(
        "SELECT * FROM content_versions WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 1",
        [entityType, entityId],
      );
      return rows[0] ? rowToVersion(rows[0]) : null;
    },

    snapshotStatement(
      entityType: string,
      entityId: string,
      doc: { title: string | null; content: string | null; contentText: string | null },
      kind: ContentVersion["kind"],
      label: string | null = null,
    ): Statement {
      return {
        sql: `INSERT INTO content_versions (id, entity_type, entity_id, title, content, content_text, kind, label, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [ctx.newId(), entityType, entityId, doc.title, doc.content, doc.contentText, kind, label, nowIso(ctx)],
      };
    },

    pruneStatement(entityType: string, entityId: string): Statement {
      return {
        sql: `DELETE FROM content_versions WHERE id IN (
                SELECT id FROM content_versions WHERE entity_type = ? AND entity_id = ? AND kind = 'auto'
                ORDER BY created_at DESC LIMIT -1 OFFSET ?)`,
        params: [entityType, entityId, MAX_AUTO_SNAPSHOTS],
      };
    },

    /**
     * Returns the statements for an automatic snapshot when the previous one is older than the
     * interval and the content actually changed. Never creates a version per keystroke.
     */
    async autoSnapshotStatements(
      entityType: string,
      entityId: string,
      previous: { title: string | null; content: string | null; contentText: string | null },
      nextContent: string | null,
    ): Promise<Statement[]> {
      if (previous.content === nextContent || !previous.content) return [];
      const last = await svc.latest(entityType, entityId);
      const now = ctx.clock.now().getTime();
      if (last && now - new Date(last.createdAt).getTime() < AUTO_SNAPSHOT_INTERVAL_MS) return [];
      if (last && last.content === previous.content) return [];
      return [svc.snapshotStatement(entityType, entityId, previous, "auto"), svc.pruneStatement(entityType, entityId)];
    },

    async remove(versionId: string): Promise<void> {
      await ctx.db.execute("DELETE FROM content_versions WHERE id = ?", [versionId]);
    },

    async removeOlderThan(entityType: string, entityId: string, isoDate: string): Promise<number> {
      return ctx.db.execute("DELETE FROM content_versions WHERE entity_type = ? AND entity_id = ? AND created_at < ?", [
        entityType,
        entityId,
        isoDate,
      ]);
    },

    async get(versionId: string): Promise<ContentVersion | null> {
      const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM content_versions WHERE id = ?", [versionId]);
      return rows[0] ? rowToVersion(rows[0]) : null;
    },
  };
  return svc;
}

export function createNoteService(ctx: ServiceContext) {
  const { repos } = ctx;
  const versions = createVersionService(ctx);

  return {
    versions,

    async list(f: NoteFilter = {}): Promise<Note[]> {
      const where: string[] = [];
      const params: (string | number)[] = [];
      where.push(f.archived ? "t.archived = 1" : "t.archived = 0");
      if (f.subjectId) {
        where.push("t.subject_id = ?");
        params.push(f.subjectId);
      }
      if (f.projectId) {
        where.push("t.project_id = ?");
        params.push(f.projectId);
      }
      if (f.noteType) {
        where.push("t.note_type = ?");
        params.push(f.noteType);
      }
      if (f.cyberOnly) where.push("(t.cyber_topic IS NOT NULL OR t.note_type IN ('cyber_concept','ctf_writeup','lab'))");
      if (f.cyberTopic) {
        where.push("t.cyber_topic = ?");
        params.push(f.cyberTopic);
      }
      if (f.favorite) where.push("t.favorite = 1");
      if (f.tag) {
        where.push(
          "EXISTS (SELECT 1 FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_type = 'note' AND et.entity_id = t.id AND tg.name = ? COLLATE NOCASE)",
        );
        params.push(f.tag);
      }
      if (f.text?.trim()) {
        where.push("(t.title LIKE ? OR t.content_text LIKE ?)");
        params.push(`%${f.text.trim()}%`, `%${f.text.trim()}%`);
      }
      return repos.notes.list({ where, params, limit: f.limit ?? 500, offset: f.offset });
    },

    async create(input: Partial<Note>): Promise<Note> {
      const text = input.contentText ?? "";
      return repos.notes.create({ ...input, contentText: text, wordCount: countWords(text) } as never);
    },

    /**
     * Saves note content (autosave). Takes an automatic snapshot of the previous content at
     * most every 10 minutes, in the same transaction as the save.
     */
    async saveContent(id: string, patch: { title?: string; content?: string | null; contentText?: string }): Promise<Note> {
      const { before, after } = await repos.notes.prepareUpdate(id, {
        ...patch,
        ...(patch.contentText !== undefined ? { wordCount: countWords(patch.contentText) } : {}),
      });
      const snap = patch.content !== undefined ? await versions.autoSnapshotStatements("note", id, before, patch.content ?? null) : [];
      await ctx.db.batch([...snap, ...repos.notes.updateStatements(after, false)]);
      return after;
    },

    async update(id: string, patch: Partial<Note>): Promise<Note> {
      return repos.notes.update(id, patch);
    },

    async snapshot(id: string, label: string | null): Promise<void> {
      const n = await repos.notes.require(id);
      await ctx.db.batch([versions.snapshotStatement("note", id, n, "manual", label)]);
    },

    /** Restores a version; the current content is kept as a version first, so restore is reversible. */
    async restoreVersion(noteId: string, versionId: string): Promise<Note> {
      const v = await versions.get(versionId);
      if (!v || v.entityId !== noteId) throw new Error("Version not found");
      const current = await repos.notes.require(noteId);
      const { after } = await repos.notes.prepareUpdate(noteId, {
        title: v.title ?? current.title,
        content: v.content,
        contentText: v.contentText ?? "",
        wordCount: countWords(v.contentText ?? ""),
      });
      await ctx.db.batch([
        versions.snapshotStatement("note", noteId, current, "restore", "before-restore"),
        ...repos.notes.updateStatements(after),
      ]);
      return after;
    },

    async duplicate(id: string, titleSuffix: string): Promise<Note> {
      const n = await repos.notes.require(id);
      return repos.notes.create({ ...n, id: undefined, createdAt: undefined, title: `${n.title} ${titleSuffix}`.trim(), pinned: false } as never);
    },

    async recent(limit = 8): Promise<Note[]> {
      return repos.notes.list({ where: ["t.archived = 0"], orderBy: "t.updated_at DESC", limit });
    },

    async markOpened(id: string): Promise<void> {
      await ctx.db.execute("UPDATE notes SET last_opened_at = ? WHERE id = ?", [nowIso(ctx), id]);
    },
  };
}
