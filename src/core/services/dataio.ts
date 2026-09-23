/**
 * Structured data export (JSON / CSV / Markdown / HTML) and validated JSON import.
 */
import type { Row, SqlValue, Statement } from "../db/types";
import { LATEST_SCHEMA_VERSION } from "../db/migrations";
import { rebuildSearchIndex } from "../search/search";
import { toCsv, safeFileName } from "../utils/text";
import { docToHtml, docToMarkdown, htmlDocument, parseDoc } from "../utils/richtext";
import type { ServiceContext } from "./context";

/** Tables in dependency order (parents before children). */
export const EXPORT_TABLES = [
  "grading_scales",
  "semesters",
  "subjects",
  "timetable_entries",
  "lectures",
  "attendance_records",
  "projects",
  "project_milestones",
  "project_members",
  "project_meetings",
  "notes",
  "content_versions",
  "files",
  "file_links",
  "folders",
  "trash_items",
  "deadlines",
  "reminders",
  "goals",
  "goal_milestones",
  "tasks",
  "subtasks",
  "notifications",
  "grade_items",
  "questions",
  "journal_entries",
  "research_resources",
  "expenses",
  "whiteboards",
  "cyber_labs",
  "commands",
  "ctf_challenges",
  "roadmaps",
  "roadmap_items",
  "study_sessions",
  "tags",
  "entity_tags",
  "entity_links",
] as const;

export const EXPORT_MODULES: Record<string, string[]> = {
  academic: ["grading_scales", "semesters", "subjects", "timetable_entries", "lectures", "attendance_records", "grade_items"],
  notes: ["notes", "content_versions"],
  deadlines: ["deadlines", "reminders"],
  tasks: ["tasks", "subtasks"],
  projects: ["projects", "project_milestones", "project_members", "project_meetings"],
  files: ["files", "file_links", "folders"],
  questions: ["questions"],
  journal: ["journal_entries"],
  research: ["research_resources"],
  goals: ["goals", "goal_milestones"],
  expenses: ["expenses"],
  whiteboards: ["whiteboards"],
  cyber: ["cyber_labs", "commands", "ctf_challenges", "roadmaps", "roadmap_items"],
  study: ["study_sessions"],
  meta: ["tags", "entity_tags", "entity_links"],
};

export interface ExportBundle {
  format: "unios-export";
  version: 1;
  schemaVersion: number;
  exportedAt: string;
  modules: string[];
  tables: Record<string, Row[]>;
}

export interface ImportReport {
  ok: boolean;
  tables: { table: string; received: number; imported: number; skipped: number }[];
  errors: string[];
  warnings: string[];
}

interface FkInfo {
  from: string;
  table: string;
  to: string;
}

export function createDataIoService(ctx: ServiceContext) {
  async function columns(table: string): Promise<{ name: string; notnull: boolean; pk: number }[]> {
    const rows = await ctx.db.query<{ name: string; notnull: number; pk: number }>(`PRAGMA table_info(${table})`);
    return rows.map((r) => ({ name: r.name, notnull: r.notnull === 1, pk: r.pk }));
  }

  async function foreignKeys(table: string): Promise<FkInfo[]> {
    return ctx.db.query<FkInfo>(`PRAGMA foreign_key_list(${table})`);
  }

  function tablesFor(modules: string[]): string[] {
    const set = new Set(modules.flatMap((m) => EXPORT_MODULES[m] ?? []));
    return EXPORT_TABLES.filter((t) => set.has(t));
  }

  const svc = {
    modules: Object.keys(EXPORT_MODULES),

    async exportJson(modules: string[] = Object.keys(EXPORT_MODULES)): Promise<ExportBundle> {
      const tables: Record<string, Row[]> = {};
      for (const t of tablesFor(modules)) tables[t] = await ctx.db.query<Row>(`SELECT * FROM ${t}`);
      return {
        format: "unios-export",
        version: 1,
        schemaVersion: LATEST_SCHEMA_VERSION,
        exportedAt: ctx.clock.now().toISOString(),
        modules,
        tables,
      };
    },

    async tableCsv(table: string): Promise<string> {
      if (!(EXPORT_TABLES as readonly string[]).includes(table)) throw new Error("Unknown table");
      const cols = (await columns(table)).map((c) => c.name);
      const rows = await ctx.db.query<Row>(`SELECT * FROM ${table}`);
      return toCsv(rows, cols);
    },

    /** Notes as Markdown or standalone HTML files: [{ name, content }]. */
    async notesAsFiles(format: "md" | "html", dir: "rtl" | "ltr", noteIds?: string[]): Promise<{ name: string; content: string }[]> {
      const notes = noteIds?.length ? await ctx.repos.notes.getMany(noteIds) : await ctx.repos.notes.list({ limit: 100000 });
      const used = new Set<string>();
      return notes.map((n) => {
        let base = safeFileName(n.title, "note");
        let i = 1;
        while (used.has(base.toLowerCase())) base = `${safeFileName(n.title, "note")} (${i++})`;
        used.add(base.toLowerCase());
        const doc = parseDoc(n.content);
        if (format === "md") {
          const front = [`# ${n.title}`, "", n.tags.length ? `Tags: ${n.tags.join(", ")}` : "", n.lectureDate ? `Date: ${n.lectureDate}` : ""]
            .filter((x, idx) => idx < 2 || x)
            .join("\n");
          return { name: `${base}.md`, content: `${front}\n\n${doc ? docToMarkdown(doc) : n.contentText}` };
        }
        const body = doc ? docToHtml(doc) : `<pre>${n.contentText.replace(/</g, "&lt;")}</pre>`;
        return { name: `${base}.html`, content: htmlDocument(n.title, body, dir) };
      });
    },

    /** Checks the structure of an export bundle without writing anything. */
    async validateBundle(data: unknown): Promise<{ ok: boolean; errors: string[]; counts: Record<string, number> }> {
      const errors: string[] = [];
      const counts: Record<string, number> = {};
      if (!data || typeof data !== "object") return { ok: false, errors: ["import.notObject"], counts };
      const b = data as Partial<ExportBundle>;
      if (b.format !== "unios-export") errors.push("import.wrongFormat");
      if (typeof b.schemaVersion === "number" && b.schemaVersion > LATEST_SCHEMA_VERSION) errors.push("import.newerSchema");
      if (!b.tables || typeof b.tables !== "object") errors.push("import.noTables");
      else {
        for (const [t, rows] of Object.entries(b.tables)) {
          if (!(EXPORT_TABLES as readonly string[]).includes(t)) {
            errors.push(`import.unknownTable:${t}`);
            continue;
          }
          if (!Array.isArray(rows)) {
            errors.push(`import.badRows:${t}`);
            continue;
          }
          counts[t] = rows.length;
        }
      }
      return { ok: errors.length === 0, errors, counts };
    },

    /**
     * Imports a bundle in one transaction. `merge` keeps existing rows (same id wins),
     * `replace` overwrites rows with the same id. Unknown columns are dropped, broken
     * references to missing rows are cleared (or the row skipped when the reference is required).
     */
    async importBundle(data: unknown, mode: "merge" | "replace"): Promise<ImportReport> {
      const report: ImportReport = { ok: false, tables: [], errors: [], warnings: [] };
      const v = await svc.validateBundle(data);
      if (!v.ok) {
        report.errors = v.errors;
        return report;
      }
      const bundle = data as ExportBundle;
      const statements: Statement[] = [];
      const known = new Map<string, Set<string>>();
      const idsIn = async (table: string): Promise<Set<string>> => {
        if (!known.has(table)) {
          const rows = await ctx.db.query<{ id: string }>(`SELECT id FROM ${table}`);
          known.set(table, new Set(rows.map((r) => String(r.id))));
        }
        return known.get(table)!;
      };
      for (const table of EXPORT_TABLES) {
        const rows = bundle.tables[table];
        if (!rows) continue;
        const cols = await columns(table);
        const colNames = new Set(cols.map((c) => c.name));
        const fks = await foreignKeys(table);
        const hasId = colNames.has("id");
        let imported = 0;
        let skipped = 0;
        for (const raw of rows) {
          if (!raw || typeof raw !== "object") {
            skipped++;
            continue;
          }
          const row: Record<string, SqlValue> = {};
          for (const [k, val] of Object.entries(raw)) {
            if (!colNames.has(k)) continue;
            row[k] = val === undefined ? null : typeof val === "object" && val !== null ? JSON.stringify(val) : (val as SqlValue);
          }
          if (hasId && (typeof row.id !== "string" || !row.id)) {
            skipped++;
            continue;
          }
          const missingRequired = cols.find((c) => c.notnull && c.pk === 0 && (row[c.name] === null || row[c.name] === undefined) && !["created_at", "updated_at"].includes(c.name));
          if (missingRequired && !(missingRequired.name in raw)) {
            // Column absent entirely: let the table default apply.
            delete row[missingRequired.name];
          }
          const now = ctx.clock.now().toISOString();
          if (colNames.has("created_at") && !row.created_at) row.created_at = now;
          if (colNames.has("updated_at") && !row.updated_at) row.updated_at = now;
          let drop = false;
          for (const fk of fks) {
            const val = row[fk.from];
            if (val === null || val === undefined) continue;
            const target = await idsIn(fk.table);
            if (!target.has(String(val))) {
              const col = cols.find((c) => c.name === fk.from);
              if (col?.notnull) drop = true;
              else row[fk.from] = null;
            }
          }
          if (drop) {
            skipped++;
            continue;
          }
          const keys = Object.keys(row);
          const values = `(${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
          // Upsert (not INSERT OR REPLACE) so replacing a parent row never cascades deletes to its children.
          const updates = keys.filter((k) => k !== "id").map((k) => `${k} = excluded.${k}`);
          const sql =
            mode === "replace" && hasId && updates.length
              ? `INSERT INTO ${table} ${values} ON CONFLICT(id) DO UPDATE SET ${updates.join(", ")}`
              : `INSERT OR IGNORE INTO ${table} ${values}`;
          statements.push({ sql, params: keys.map((k) => row[k]) });
          if (hasId) (await idsIn(table)).add(String(row.id));
          imported++;
        }
        report.tables.push({ table, received: rows.length, imported, skipped });
        if (skipped) report.warnings.push(`import.skippedRows:${table}:${skipped}`);
      }
      try {
        await ctx.db.batch(statements);
      } catch (e) {
        report.errors.push(e instanceof Error ? e.message : String(e));
        return report;
      }
      await rebuildSearchIndex(ctx.db, ctx.repos);
      report.ok = true;
      return report;
    },
  };
  return svc;
}
