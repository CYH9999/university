import type { FileRecord, Subject, Project, TrashItem } from "../model/types";
import type { Statement } from "../db/types";
import type { DirEntry } from "../ports";
import { safeFileName, fileExt } from "../utils/text";
import type { ServiceContext } from "./context";
import { nowIso } from "./context";

/** Top-level workspace folders the file manager exposes. */
export const WORKSPACE_ROOTS = [
  "Subjects",
  "Projects",
  "Research Library",
  "Cybersecurity Lab",
  "Attachments",
  "Whiteboards",
  "Exports",
  "Backups",
] as const;

export const SUBJECT_SUBFOLDERS = ["Lectures", "Assignments", "Exams", "Resources", "Other"] as const;
export type SubjectFolderKind = (typeof SUBJECT_SUBFOLDERS)[number];

export interface ImportSummary {
  imported: FileRecord[];
  linkedExisting: FileRecord[];
  failed: { name: string; errorCode: string | null; error: string | null }[];
}

export interface ImportOptions {
  sources: string[];
  destRel: string;
  subjectId?: string | null;
  projectId?: string | null;
  link?: { entityType: string; entityId: string } | null;
  /** When a file with identical content already exists in the workspace, link it instead of copying. */
  dedupe?: boolean;
}

export interface MergedEntry extends DirEntry {
  file: FileRecord | null;
}

const FILE_TYPE_GROUPS: Record<string, string[]> = {
  pdf: ["pdf"],
  document: ["doc", "docx", "odt", "rtf", "txt", "md"],
  presentation: ["ppt", "pptx", "odp", "key"],
  spreadsheet: ["xls", "xlsx", "ods", "csv"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
  archive: ["zip", "7z", "rar", "tar", "gz"],
  code: ["py", "js", "ts", "c", "cpp", "h", "java", "cs", "go", "rs", "sh", "ps1", "html", "css", "json", "yml", "yaml", "sql", "php", "rb", "asm"],
  media: ["mp4", "mkv", "mp3", "wav", "mov", "webm"],
  capture: ["pcap", "pcapng", "cap"],
};

export function fileGroup(ext: string): string {
  const e = ext.toLowerCase();
  for (const [g, list] of Object.entries(FILE_TYPE_GROUPS)) if (list.includes(e)) return g;
  return "other";
}

export function fileGroupExts(group: string): string[] {
  return FILE_TYPE_GROUPS[group] ?? [];
}

const prefixWhere = "(rel_path = ? OR substr(rel_path, 1, ?) = ?)";
const prefixParams = (rel: string) => [rel, rel.length + 1, `${rel}/`];

export function createFileService(ctx: ServiceContext) {
  const { repos, fs } = ctx;

  async function byPath(rel: string): Promise<FileRecord | null> {
    const rows = await repos.files.list({ where: ["t.rel_path = ?"], params: [rel], limit: 1 });
    return rows[0] ?? null;
  }

  async function reindexPrefix(rel: string): Promise<Statement[]> {
    const affected = await repos.files.list({ where: [prefixWhere.replace(/rel_path/g, "t.rel_path")], params: prefixParams(rel) });
    return affected.flatMap((f) => repos.files.searchStatements(f));
  }

  const svc = {
    byPath,

    async ensureSubjectFolder(subject: Subject): Promise<string> {
      if (subject.folderRel) {
        const [st] = await fs.statMany([subject.folderRel]);
        if (st?.exists) return subject.folderRel;
      }
      const base = safeFileName(subject.code ? `${subject.code} - ${subject.name}` : subject.name, "Subject");
      const rel = await fs.ensureDir(`Subjects/${base}`);
      await ctx.db.execute("UPDATE subjects SET folder_rel = ?, updated_at = ? WHERE id = ?", [rel, nowIso(ctx), subject.id]);
      return rel;
    },

    async subjectFolder(subjectId: string, kind?: SubjectFolderKind): Promise<string> {
      const s = await repos.subjects.require(subjectId);
      const root = await svc.ensureSubjectFolder(s);
      return kind ? fs.ensureDir(`${root}/${kind}`) : root;
    },

    async ensureProjectFolder(project: Project): Promise<string> {
      if (project.folderRel) {
        const [st] = await fs.statMany([project.folderRel]);
        if (st?.exists) return project.folderRel;
      }
      const rel = await fs.ensureDir(`Projects/${safeFileName(project.name, "Project")}`);
      await ctx.db.execute("UPDATE projects SET folder_rel = ?, updated_at = ? WHERE id = ?", [rel, nowIso(ctx), project.id]);
      return rel;
    },

    /** Destination folder for attachments of an entity. */
    async folderForEntity(entityType: string, entityId: string): Promise<string> {
      switch (entityType) {
        case "subject":
          return svc.subjectFolder(entityId, "Lectures");
        case "project":
          return svc.ensureProjectFolder(await repos.projects.require(entityId));
        case "lecture": {
          const l = await repos.lectures.require(entityId);
          return svc.subjectFolder(l.subjectId, "Lectures");
        }
        case "deadline": {
          const d = await repos.deadlines.require(entityId);
          if (d.projectId) return svc.ensureProjectFolder(await repos.projects.require(d.projectId));
          if (d.subjectId) return svc.subjectFolder(d.subjectId, d.type === "exam" || d.type === "quiz" ? "Exams" : "Assignments");
          return fs.ensureDir("Attachments/Deadlines");
        }
        case "resource": {
          const r = await repos.resources.require(entityId);
          if (r.subjectId) {
            const s = await repos.subjects.get(r.subjectId);
            if (s) return fs.ensureDir(`Research Library/${safeFileName(s.name)}`);
          }
          return fs.ensureDir("Research Library/General");
        }
        case "lab": {
          const l = await repos.labs.require(entityId);
          return fs.ensureDir(`Cybersecurity Lab/Labs/${safeFileName(l.name)}`);
        }
        case "ctf": {
          const c = await repos.ctf.require(entityId);
          return fs.ensureDir(`Cybersecurity Lab/CTF/${safeFileName(c.name)}`);
        }
        default: {
          const folder: Record<string, string> = {
            note: "Notes",
            task: "Tasks",
            question: "Questions",
            expense: "Receipts",
            journal: "Journal",
            goal: "Goals",
            meeting: "Meetings",
            command: "Commands",
          };
          return fs.ensureDir(`Attachments/${folder[entityType] ?? "Other"}`);
        }
      }
    },

    /** Copies files into the workspace, registers them and links them. */
    async importFiles(opts: ImportOptions): Promise<ImportSummary> {
      const summary: ImportSummary = { imported: [], linkedExisting: [], failed: [] };
      let sources = opts.sources;
      if (opts.dedupe !== false) {
        const remaining: string[] = [];
        for (const src of sources) {
          let existing: FileRecord | null = null;
          try {
            const hash = await fs.hashExternal(src);
            const rows = await repos.files.list({ where: ["t.sha256 = ?", "t.trashed_at IS NULL"], params: [hash], limit: 1 });
            existing = rows[0] ?? null;
          } catch {
            existing = null;
          }
          if (existing) {
            const stat = (await fs.statMany([existing.relPath]))[0];
            if (stat?.exists) {
              if (opts.link) await svc.link(existing.id, opts.link.entityType, opts.link.entityId);
              summary.linkedExisting.push(existing);
              continue;
            }
          }
          remaining.push(src);
        }
        sources = remaining;
      }
      if (!sources.length) return summary;
      const results = await fs.importFiles(sources, opts.destRel);
      const statements: Statement[] = [];
      for (const r of results) {
        if (!r.relPath) {
          summary.failed.push({ name: r.name, errorCode: r.errorCode, error: r.error });
          continue;
        }
        const f = repos.files.build({
          relPath: r.relPath,
          name: r.name,
          ext: r.ext || fileExt(r.name),
          size: r.size,
          sha256: r.sha256,
          subjectId: opts.subjectId ?? null,
          projectId: opts.projectId ?? null,
        } as never);
        statements.push(...repos.files.createStatements(f));
        if (opts.link) {
          statements.push({
            sql: "INSERT OR IGNORE INTO file_links (file_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)",
            params: [f.id, opts.link.entityType, opts.link.entityId, nowIso(ctx)],
          });
        }
        summary.imported.push(f);
      }
      if (statements.length) await ctx.db.batch(statements);
      return summary;
    },

    /** Imports files as attachments of an entity into its natural folder. */
    async attach(entityType: string, entityId: string, sources: string[]): Promise<ImportSummary> {
      const destRel = await svc.folderForEntity(entityType, entityId);
      let subjectId: string | null = null;
      let projectId: string | null = null;
      if (entityType === "subject") subjectId = entityId;
      else if (entityType === "project") projectId = entityId;
      else {
        const def = (repos as unknown as Record<string, { get?: (id: string) => Promise<Record<string, unknown> | null> }>)[
          { note: "notes", deadline: "deadlines", task: "tasks", lecture: "lectures", resource: "resources", question: "questions", lab: "labs" }[
            entityType
          ] ?? ""
        ];
        const e = def?.get ? await def.get(entityId) : null;
        subjectId = (e?.subjectId as string) ?? null;
        projectId = (e?.projectId as string) ?? null;
      }
      return svc.importFiles({ sources, destRel, subjectId, projectId, link: { entityType, entityId } });
    },

    /** Registers a file that already exists on disk (e.g. copied in with Explorer). */
    async register(entry: DirEntry, extra: Partial<FileRecord> = {}): Promise<FileRecord> {
      const existing = await byPath(entry.relPath);
      if (existing) return existing;
      return repos.files.create({ relPath: entry.relPath, name: entry.name, ext: entry.ext, size: entry.size, ...extra } as never);
    },

    async link(fileId: string, entityType: string, entityId: string): Promise<void> {
      await ctx.db.execute("INSERT OR IGNORE INTO file_links (file_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)", [
        fileId,
        entityType,
        entityId,
        nowIso(ctx),
      ]);
    },

    async unlink(fileId: string, entityType: string, entityId: string): Promise<void> {
      await ctx.db.execute("DELETE FROM file_links WHERE file_id = ? AND entity_type = ? AND entity_id = ?", [fileId, entityType, entityId]);
    },

    async linksOf(fileId: string): Promise<{ entityType: string; entityId: string }[]> {
      const rows = await ctx.db.query<{ entity_type: string; entity_id: string }>(
        "SELECT entity_type, entity_id FROM file_links WHERE file_id = ?",
        [fileId],
      );
      return rows.map((r) => ({ entityType: r.entity_type, entityId: r.entity_id }));
    },

    /** Files linked to an entity (plus, for subjects/projects, files assigned to them). */
    async forEntity(entityType: string, entityId: string): Promise<FileRecord[]> {
      const where = [
        "t.trashed_at IS NULL",
        entityType === "subject"
          ? "(t.subject_id = ? OR t.id IN (SELECT file_id FROM file_links WHERE entity_type = 'subject' AND entity_id = ?))"
          : entityType === "project"
            ? "(t.project_id = ? OR t.id IN (SELECT file_id FROM file_links WHERE entity_type = 'project' AND entity_id = ?))"
            : "t.id IN (SELECT file_id FROM file_links WHERE entity_type = ? AND entity_id = ?)",
      ];
      const params = entityType === "subject" || entityType === "project" ? [entityId, entityId] : [entityType, entityId];
      return repos.files.list({ where, params, orderBy: "t.created_at DESC" });
    },

    /** Lists a folder from disk and merges database metadata; unknown files are registered. */
    async listDir(rel: string): Promise<MergedEntry[]> {
      const entries = await fs.listDir(rel);
      const files = entries.filter((e) => !e.isDir);
      const known = new Map<string, FileRecord>();
      if (files.length) {
        const rows = await repos.files.list({
          where: [`t.rel_path IN (${files.map(() => "?").join(",")})`],
          params: files.map((f) => f.relPath),
        });
        for (const r of rows) known.set(r.relPath, r);
      }
      const statements: Statement[] = [];
      const out: MergedEntry[] = [];
      const inTrash = rel === "Trash" || rel.startsWith("Trash/");
      const canRegister = !inTrash && !rel.startsWith("Backups") && !rel.startsWith("Exports");
      for (const e of entries) {
        let file = e.isDir ? null : known.get(e.relPath) ?? null;
        if (!e.isDir && !file && canRegister) {
          file = repos.files.build({ relPath: e.relPath, name: e.name, ext: e.ext, size: e.size } as never);
          statements.push(...repos.files.createStatements(file));
        } else if (file && file.size !== e.size) {
          statements.push({ sql: "UPDATE files SET size = ? WHERE id = ?", params: [e.size, file.id] });
          file = { ...file, size: e.size };
        }
        out.push({ ...e, file });
      }
      if (statements.length) await ctx.db.batch(statements);
      return out;
    },

    async createFolder(parentRel: string, name: string): Promise<string> {
      return fs.createDir(parentRel, name);
    },

    async rename(rel: string, newName: string): Promise<string> {
      const newRel = await fs.rename(rel, newName);
      await ctx.db.batch([
        { sql: `UPDATE files SET rel_path = ? || substr(rel_path, ?), updated_at = ? WHERE ${prefixWhere}`, params: [newRel, rel.length + 1, nowIso(ctx), ...prefixParams(rel)] },
        { sql: "UPDATE files SET name = ? WHERE rel_path = ?", params: [newRel.split("/").pop() ?? newName, newRel] },
        { sql: "UPDATE subjects SET folder_rel = ? WHERE folder_rel = ?", params: [newRel, rel] },
        { sql: "UPDATE projects SET folder_rel = ? WHERE folder_rel = ?", params: [newRel, rel] },
      ]);
      const reindex = await reindexPrefix(newRel);
      if (reindex.length) await ctx.db.batch(reindex);
      return newRel;
    },

    async move(rel: string, destDirRel: string): Promise<string> {
      const newRel = await fs.move(rel, destDirRel);
      if (newRel !== rel) {
        await ctx.db.batch([
          { sql: `UPDATE files SET rel_path = ? || substr(rel_path, ?), updated_at = ? WHERE ${prefixWhere}`, params: [newRel, rel.length + 1, nowIso(ctx), ...prefixParams(rel)] },
          { sql: "UPDATE subjects SET folder_rel = ? WHERE folder_rel = ?", params: [newRel, rel] },
          { sql: "UPDATE projects SET folder_rel = ? WHERE folder_rel = ?", params: [newRel, rel] },
        ]);
      }
      return newRel;
    },

    async copy(rel: string, destDirRel: string): Promise<string> {
      const newRel = await fs.copy(rel, destDirRel);
      const src = await byPath(rel);
      if (src) {
        await repos.files.create({ ...src, id: undefined, createdAt: undefined, relPath: newRel, name: newRel.split("/").pop() ?? src.name, lastOpenedAt: null } as never);
      }
      return newRel;
    },

    /** Moves a file or folder to Workspace/Trash and remembers where it came from. */
    async trash(rel: string, isDir: boolean, size = 0): Promise<TrashItem> {
      const trashRel = await fs.trash(rel);
      const file = isDir ? null : await byPath(rel);
      const item: TrashItem = {
        id: ctx.newId(),
        originalRel: rel,
        trashRel,
        name: rel.split("/").pop() ?? rel,
        isDir,
        size,
        fileId: file?.id ?? null,
        deletedAt: nowIso(ctx),
      };
      await ctx.db.batch([
        {
          sql: "INSERT INTO trash_items (id, original_rel, trash_rel, name, is_dir, size, file_id, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          params: [item.id, item.originalRel, item.trashRel, item.name, isDir ? 1 : 0, size, item.fileId, item.deletedAt],
        },
        {
          sql: `DELETE FROM search_index WHERE entity_type = 'file' AND entity_id IN (SELECT id FROM files WHERE ${prefixWhere})`,
          params: prefixParams(rel),
        },
        {
          // The record follows the file into the Trash so the original path is free again.
          sql: `UPDATE files SET trashed_at = ?, rel_path = ? || substr(rel_path, ?), trash_rel = ? || substr(rel_path, ?) WHERE ${prefixWhere}`,
          params: [item.deletedAt, trashRel, rel.length + 1, trashRel, rel.length + 1, ...prefixParams(rel)],
        },
      ]);
      return item;
    },

    async trashItems(): Promise<TrashItem[]> {
      const rows = await ctx.db.query<Record<string, unknown>>("SELECT * FROM trash_items ORDER BY deleted_at DESC");
      return rows.map((r) => ({
        id: r.id as string,
        originalRel: r.original_rel as string,
        trashRel: r.trash_rel as string,
        name: r.name as string,
        isDir: r.is_dir === 1,
        size: (r.size as number) ?? 0,
        fileId: (r.file_id as string) ?? null,
        deletedAt: r.deleted_at as string,
      }));
    },

    async restoreFromTrash(itemId: string): Promise<string> {
      const item = (await svc.trashItems()).find((i) => i.id === itemId);
      if (!item) throw new Error("Trash item not found");
      const restoredRel = await fs.restore(item.trashRel, item.originalRel);
      await ctx.db.batch([
        {
          sql: `UPDATE files SET rel_path = ? || substr(rel_path, ?), trashed_at = NULL, trash_rel = NULL WHERE ${prefixWhere}`,
          params: [restoredRel, item.trashRel.length + 1, ...prefixParams(item.trashRel)],
        },
        { sql: "DELETE FROM trash_items WHERE id = ?", params: [itemId] },
      ]);
      const reindex = await reindexPrefix(restoredRel);
      if (reindex.length) await ctx.db.batch(reindex);
      return restoredRel;
    },

    async deleteFromTrash(itemId: string): Promise<void> {
      const item = (await svc.trashItems()).find((i) => i.id === itemId);
      if (!item) return;
      await fs.deletePermanent(item.trashRel);
      await ctx.db.batch([
        { sql: `DELETE FROM files WHERE trashed_at IS NOT NULL AND ${prefixWhere}`, params: prefixParams(item.trashRel) },
        { sql: "DELETE FROM trash_items WHERE id = ?", params: [itemId] },
      ]);
    },

    async emptyTrash(): Promise<number> {
      const n = await fs.emptyTrash();
      await ctx.db.batch([
        { sql: "DELETE FROM files WHERE trashed_at IS NOT NULL", params: [] },
        { sql: "DELETE FROM trash_items", params: [] },
      ]);
      return n;
    },

    /** Checks every tracked file on disk; returns the ones that are missing. */
    async findMissing(limit = 5000): Promise<FileRecord[]> {
      const files = await repos.files.list({ where: ["t.trashed_at IS NULL"], limit });
      const missing: FileRecord[] = [];
      for (let i = 0; i < files.length; i += 500) {
        const chunk = files.slice(i, i + 500);
        const stats = await fs.statMany(chunk.map((f) => f.relPath));
        stats.forEach((s, idx) => {
          if (!s.exists) missing.push(chunk[idx]);
        });
      }
      return missing;
    },

    async existence(files: FileRecord[]): Promise<Map<string, boolean>> {
      const out = new Map<string, boolean>();
      if (!files.length) return out;
      const stats = await fs.statMany(files.map((f) => f.relPath));
      stats.forEach((s, i) => out.set(files[i].id, s.exists));
      return out;
    },

    /** Removes the database record of a missing file (the file itself is already gone). */
    async forget(fileId: string): Promise<void> {
      await repos.files.remove(fileId);
    },

    /** Re-points a missing record at a file that exists elsewhere in the workspace. */
    async relink(fileId: string, newRel: string): Promise<FileRecord> {
      return repos.files.update(fileId, { relPath: newRel, name: newRel.split("/").pop() ?? newRel });
    },

    async markOpened(file: FileRecord): Promise<void> {
      const now = nowIso(ctx);
      await ctx.db.batch([
        { sql: "UPDATE files SET last_opened_at = ? WHERE id = ?", params: [now, file.id] },
        {
          sql: "INSERT INTO recent_items (entity_type, entity_id, title, opened_at) VALUES ('file', ?, ?, ?) ON CONFLICT(entity_type, entity_id) DO UPDATE SET opened_at = excluded.opened_at, title = excluded.title",
          params: [file.id, file.name, now],
        },
      ]);
    },

    async recent(limit = 8): Promise<FileRecord[]> {
      return repos.files.list({ where: ["t.last_opened_at IS NOT NULL", "t.trashed_at IS NULL"], orderBy: "t.last_opened_at DESC", limit });
    },

    async search(opts: { text?: string; group?: string; subjectId?: string | null; projectId?: string | null; limit?: number }): Promise<FileRecord[]> {
      const where = ["t.trashed_at IS NULL"];
      const params: (string | number)[] = [];
      if (opts.text?.trim()) {
        where.push("(t.name LIKE ? OR t.rel_path LIKE ?)");
        params.push(`%${opts.text.trim()}%`, `%${opts.text.trim()}%`);
      }
      if (opts.group && opts.group !== "all") {
        const exts = fileGroupExts(opts.group);
        if (opts.group === "other") {
          const all = Object.values(FILE_TYPE_GROUPS).flat();
          where.push(`t.ext NOT IN (${all.map(() => "?").join(",")})`);
          params.push(...all);
        } else if (exts.length) {
          where.push(`t.ext IN (${exts.map(() => "?").join(",")})`);
          params.push(...exts);
        }
      }
      if (opts.subjectId) {
        where.push("(t.subject_id = ? OR t.id IN (SELECT file_id FROM file_links WHERE entity_type='subject' AND entity_id = ?))");
        params.push(opts.subjectId, opts.subjectId);
      }
      if (opts.projectId) {
        where.push("(t.project_id = ? OR t.id IN (SELECT file_id FROM file_links WHERE entity_type='project' AND entity_id = ?))");
        params.push(opts.projectId, opts.projectId);
      }
      return repos.files.list({ where, params, orderBy: "t.created_at DESC", limit: opts.limit ?? 500 });
    },

    async stats(): Promise<{ count: number; bytes: number }> {
      const rows = await ctx.db.query<{ n: number; b: number | null }>("SELECT COUNT(*) AS n, SUM(size) AS b FROM files WHERE trashed_at IS NULL");
      return { count: rows[0]?.n ?? 0, bytes: rows[0]?.b ?? 0 };
    },
  };
  return svc;
}
