/**
 * Generic, validated, transactional repository used by every module.
 *
 * Each write is a single `db.batch` (one transaction) that updates the row, its tags,
 * its full-text search document and the audit log together — so the search index and
 * relationships can never drift out of sync with the data after a crash.
 */
import type { z } from "zod";
import type { Database, SqlValue, Statement } from "../db/types";
import { placeholders } from "../db/types";
import type { BaseEntity } from "../model/types";
import { normalizeForSearch } from "../utils/text";
import { validate } from "../validation/schemas";
import type { Clock } from "../utils/clock";

export type ColKind = "text" | "num" | "bool" | "json";

export interface SearchDoc {
  title: string;
  body?: string | null;
  subjectId?: string | null;
  date?: string | null;
}

export interface EntityDef<T extends BaseEntity = BaseEntity> {
  type: string;
  table: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: z.ZodType<any>;
  /** camelCase field -> storage kind. Excludes id / createdAt / updatedAt / tags. */
  columns: Record<string, ColKind>;
  hasTags?: boolean;
  label: (e: T) => string;
  search?: (e: T) => SearchDoc | null;
  defaultOrder?: string;
}

export interface RepoContext {
  db: Database;
  clock: Clock;
  newId: () => string;
}

export interface ListQuery {
  /** SQL conditions joined with AND. Use the alias `t` for the entity table. */
  where?: string[];
  params?: SqlValue[];
  orderBy?: string;
  limit?: number;
  offset?: number;
}

export class NotFoundError extends Error {
  code = "db.not_found";
  constructor(type: string, id: string) {
    super(`${type} ${id} was not found`);
  }
}

export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const TAG_SEP = "\u001f";
const MAX_INDEXED_BODY = 200_000;
const MAX_RAW_BODY = 20_000;

export class Repository<T extends BaseEntity> {
  constructor(
    public readonly def: EntityDef<T>,
    private readonly ctx: RepoContext,
  ) {}

  get db() {
    return this.ctx.db;
  }

  private now() {
    return this.ctx.clock.now().toISOString();
  }

  private selectSql(): string {
    const tags = this.def.hasTags
      ? `, (SELECT group_concat(tg.name, char(31)) FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id
           WHERE et.entity_type = '${this.def.type}' AND et.entity_id = t.id) AS _tags`
      : "";
    return `SELECT t.*${tags} FROM ${this.def.table} t`;
  }

  decode(row: Record<string, unknown>): T {
    const out: Record<string, unknown> = {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    for (const [key, kind] of Object.entries(this.def.columns)) {
      const v = row[snake(key)];
      switch (kind) {
        case "bool":
          out[key] = v === 1 || v === true || v === "1";
          break;
        case "json":
          out[key] = parseJson(v);
          break;
        case "num":
          out[key] = v === null || v === undefined ? null : Number(v);
          break;
        default:
          out[key] = v ?? null;
      }
    }
    if (this.def.hasTags) {
      const raw = row._tags;
      out.tags = typeof raw === "string" && raw ? raw.split(TAG_SEP).sort((a, b) => a.localeCompare(b)) : [];
    }
    return out as T;
  }

  private encode(key: string, v: unknown): SqlValue {
    const kind = this.def.columns[key];
    if (kind === "bool") return v ? 1 : 0;
    if (kind === "json") return v === undefined || v === null ? null : JSON.stringify(v);
    if (v === undefined) return null;
    return v as SqlValue;
  }

  async get(id: string): Promise<T | null> {
    const rows = await this.ctx.db.query<Record<string, unknown>>(`${this.selectSql()} WHERE t.id = ?`, [id]);
    return rows[0] ? this.decode(rows[0]) : null;
  }

  async require(id: string): Promise<T> {
    const e = await this.get(id);
    if (!e) throw new NotFoundError(this.def.type, id);
    return e;
  }

  async list(q: ListQuery = {}): Promise<T[]> {
    let sql = this.selectSql();
    if (q.where?.length) sql += ` WHERE ${q.where.map((w) => `(${w})`).join(" AND ")}`;
    sql += ` ORDER BY ${q.orderBy ?? this.def.defaultOrder ?? "t.updated_at DESC"}`;
    const params = [...(q.params ?? [])];
    if (q.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(q.limit);
      if (q.offset) {
        sql += " OFFSET ?";
        params.push(q.offset);
      }
    }
    const rows = await this.ctx.db.query<Record<string, unknown>>(sql, params);
    return rows.map((r) => this.decode(r));
  }

  async count(q: Pick<ListQuery, "where" | "params"> = {}): Promise<number> {
    let sql = `SELECT COUNT(*) AS n FROM ${this.def.table} t`;
    if (q.where?.length) sql += ` WHERE ${q.where.map((w) => `(${w})`).join(" AND ")}`;
    const rows = await this.ctx.db.query<{ n: number }>(sql, q.params ?? []);
    return rows[0]?.n ?? 0;
  }

  async getMany(ids: string[]): Promise<T[]> {
    if (!ids.length) return [];
    return this.list({ where: [`t.id IN (${placeholders(ids.length)})`], params: ids });
  }

  /** Validates input against the entity schema (throws ValidationError with i18n keys). */
  validate(input: unknown): Omit<T, "id" | "createdAt" | "updatedAt"> {
    return validate(this.def.schema, input) as Omit<T, "id" | "createdAt" | "updatedAt">;
  }

  // ----- statement builders (composable into larger transactions) -----

  insertStatement(e: T): Statement {
    const keys = Object.keys(this.def.columns);
    const cols = ["id", "created_at", "updated_at", ...keys.map(snake)];
    const values: SqlValue[] = [e.id, e.createdAt, e.updatedAt, ...keys.map((k) => this.encode(k, (e as Record<string, unknown>)[k]))];
    return { sql: `INSERT INTO ${this.def.table} (${cols.join(", ")}) VALUES (${placeholders(cols.length)})`, params: values };
  }

  updateStatement(e: T): Statement {
    const keys = Object.keys(this.def.columns);
    const sets = ["updated_at = ?", ...keys.map((k) => `${snake(k)} = ?`)];
    const values: SqlValue[] = [e.updatedAt, ...keys.map((k) => this.encode(k, (e as Record<string, unknown>)[k])), e.id];
    return { sql: `UPDATE ${this.def.table} SET ${sets.join(", ")} WHERE id = ?`, params: values };
  }

  tagStatements(e: T): Statement[] {
    if (!this.def.hasTags) return [];
    const tags = ((e as unknown as { tags?: string[] }).tags ?? []).map((t) => t.trim()).filter(Boolean);
    const out: Statement[] = [{ sql: "DELETE FROM entity_tags WHERE entity_type = ? AND entity_id = ?", params: [this.def.type, e.id] }];
    const now = this.now();
    for (const tag of tags) {
      out.push({
        sql: "INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING",
        params: [this.ctx.newId(), tag, now],
      });
      out.push({
        sql: "INSERT OR IGNORE INTO entity_tags (entity_type, entity_id, tag_id) SELECT ?, ?, id FROM tags WHERE name = ? COLLATE NOCASE",
        params: [this.def.type, e.id, tag],
      });
    }
    return out;
  }

  searchStatements(e: T): Statement[] {
    const del: Statement = { sql: "DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?", params: [this.def.type, e.id] };
    const doc = this.def.search?.(e);
    if (!doc) return this.def.search ? [del] : [];
    const tags = ((e as unknown as { tags?: string[] }).tags ?? []).join(" ");
    return [
      del,
      {
        sql: "INSERT INTO search_index (entity_type, entity_id, subject_id, date, display_title, raw_body, title, body, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [
          this.def.type,
          e.id,
          doc.subjectId ?? null,
          doc.date ?? e.updatedAt.slice(0, 10),
          doc.title.slice(0, 500),
          (doc.body ?? "").slice(0, MAX_RAW_BODY),
          normalizeForSearch(doc.title),
          normalizeForSearch((doc.body ?? "").slice(0, MAX_INDEXED_BODY)),
          normalizeForSearch(tags),
        ],
      },
    ];
  }

  auditStatement(e: T, action: "create" | "update" | "delete" | "restore"): Statement {
    return {
      sql: "INSERT INTO audit_log (id, entity_type, entity_id, action, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      params: [this.ctx.newId(), this.def.type, e.id, action, this.def.label(e).slice(0, 200), this.now()],
    };
  }

  cleanupStatements(id: string): Statement[] {
    const type = this.def.type;
    return [
      { sql: "DELETE FROM entity_tags WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      { sql: "DELETE FROM file_links WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      { sql: "DELETE FROM reminders WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      { sql: "DELETE FROM content_versions WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      {
        sql: "DELETE FROM entity_links WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)",
        params: [type, id, type, id],
      },
      { sql: "DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      { sql: "DELETE FROM recent_items WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
      { sql: "UPDATE notifications SET status = 'archived' WHERE entity_type = ? AND entity_id = ?", params: [type, id] },
    ];
  }

  /** Builds a validated entity ready to insert, without writing it. */
  build(input: Partial<T> & Record<string, unknown>): T {
    const data = this.validate(input);
    const now = this.now();
    return {
      ...(data as object),
      ...(this.def.hasTags ? { tags: (data as { tags?: string[] }).tags ?? [] } : {}),
      id: (input.id as string) || this.ctx.newId(),
      createdAt: (input.createdAt as string) || now,
      updatedAt: now,
    } as T;
  }

  createStatements(e: T): Statement[] {
    return [this.insertStatement(e), ...this.tagStatements(e), ...this.searchStatements(e), this.auditStatement(e, "create")];
  }

  async create(input: Partial<T> & Record<string, unknown>, extra: Statement[] = []): Promise<T> {
    const e = this.build(input);
    await this.ctx.db.batch([...this.createStatements(e), ...extra]);
    return e;
  }

  /** Merges `patch` into the stored entity, validates and saves. */
  async prepareUpdate(id: string, patch: Partial<T>): Promise<{ before: T; after: T }> {
    const before = await this.require(id);
    const merged = { ...before, ...patch };
    const data = this.validate(merged);
    const after = {
      ...(data as object),
      ...(this.def.hasTags ? { tags: (data as { tags?: string[] }).tags ?? [] } : {}),
      id,
      createdAt: before.createdAt,
      updatedAt: this.now(),
    } as T;
    return { before, after };
  }

  updateStatements(e: T, audit = true): Statement[] {
    return [
      this.updateStatement(e),
      ...this.tagStatements(e),
      ...this.searchStatements(e),
      ...(audit ? [this.auditStatement(e, "update")] : []),
    ];
  }

  async update(id: string, patch: Partial<T>, extra: Statement[] = []): Promise<T> {
    const { after } = await this.prepareUpdate(id, patch);
    await this.ctx.db.batch([...this.updateStatements(after), ...extra]);
    return after;
  }

  deleteStatements(e: T): Statement[] {
    return [
      ...this.cleanupStatements(e.id),
      { sql: `DELETE FROM ${this.def.table} WHERE id = ?`, params: [e.id] },
      this.auditStatement(e, "delete"),
    ];
  }

  /** Deletes the entity and returns a snapshot that can be passed to `restore` (undo). */
  async remove(id: string, extra: Statement[] = []): Promise<T> {
    const e = await this.require(id);
    await this.ctx.db.batch([...this.deleteStatements(e), ...extra]);
    return e;
  }

  async restore(snapshot: T): Promise<T> {
    await this.ctx.db.batch([
      this.insertStatement(snapshot),
      ...this.tagStatements(snapshot),
      ...this.searchStatements(snapshot),
      this.auditStatement(snapshot, "restore"),
    ]);
    return snapshot;
  }
}

export function parseJson(v: unknown): unknown {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
