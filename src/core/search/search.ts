/**
 * Global full-text search over the FTS5 `search_index` table (trigram tokenizer).
 * Works for Arabic and English, supports partial words, tags and filters.
 */
import type { Database, SqlValue, Statement } from "../db/types";
import { normalizeForSearch, makeSnippet } from "../utils/text";
import type { Repos } from "../repo";
import type { Repository } from "../repo/repository";
import type { BaseEntity } from "../model/types";

export interface SearchFilters {
  types?: string[];
  subjectId?: string | null;
  from?: string | null;
  to?: string | null;
  tag?: string | null;
  limit?: number;
}

export interface SearchHit {
  entityType: string;
  entityId: string;
  subjectId: string | null;
  date: string | null;
  title: string;
  snippet: { before: string; match: string; after: string } | null;
  rank: number;
}

/** Splits a query into terms; quoted phrases are kept together. */
export function parseQuery(q: string): string[] {
  const terms: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const t = normalizeForSearch(m[1] ?? m[2]).replace(/"/g, "");
    if (t) terms.push(t);
  }
  return terms;
}

function ftsPhrase(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

export async function searchAll(db: Database, query: string, f: SearchFilters = {}): Promise<SearchHit[]> {
  const terms = parseQuery(query);
  const tagOnly = !terms.length && !!f.tag;
  if (!terms.length && !tagOnly) return [];
  const where: string[] = [];
  const params: SqlValue[] = [];
  const long = terms.filter((t) => [...t].length >= 3);
  const short = terms.filter((t) => [...t].length < 3);
  let useMatch = false;
  if (long.length) {
    where.push("search_index MATCH ?");
    params.push(long.map(ftsPhrase).join(" AND "));
    useMatch = true;
  }
  for (const s of short) {
    where.push("(title LIKE ? OR body LIKE ? OR tags LIKE ?)");
    params.push(`%${s}%`, `%${s}%`, `%${s}%`);
  }
  if (f.types?.length) {
    where.push(`entity_type IN (${f.types.map(() => "?").join(",")})`);
    params.push(...f.types);
  }
  if (f.subjectId) {
    where.push("subject_id = ?");
    params.push(f.subjectId);
  }
  if (f.from) {
    where.push("date >= ?");
    params.push(f.from);
  }
  if (f.to) {
    where.push("date <= ?");
    params.push(f.to);
  }
  if (f.tag) {
    where.push("tags LIKE ?");
    params.push(`%${normalizeForSearch(f.tag)}%`);
  }
  const rank = useMatch ? "bm25(search_index, 0, 0, 0, 0, 0, 0, 10.0, 1.0, 4.0)" : "0";
  const sql = `SELECT entity_type, entity_id, subject_id, date, display_title, raw_body, ${rank} AS rank
               FROM search_index WHERE ${where.join(" AND ")}
               ORDER BY rank LIMIT ?`;
  params.push(f.limit ?? 200);
  const rows = await db.query<{
    entity_type: string;
    entity_id: string;
    subject_id: string | null;
    date: string | null;
    display_title: string;
    raw_body: string;
    rank: number;
  }>(sql, params);
  return rows.map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    subjectId: r.subject_id,
    date: r.date,
    title: (r.display_title ?? "").split("\n")[0],
    snippet: terms.length ? makeSnippet(r.raw_body ?? "", terms, 60) : null,
    rank: r.rank,
  }));
}

/** Rebuilds the whole index from the source tables (Settings → Maintenance). */
export async function rebuildSearchIndex(db: Database, repos: Repos): Promise<number> {
  await db.execute("DELETE FROM search_index");
  let n = 0;
  for (const repo of Object.values(repos) as unknown as Repository<BaseEntity>[]) {
    if (!repo.def.search) continue;
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const rows = await repo.list({ limit: pageSize, offset, orderBy: "t.id" });
      if (!rows.length) break;
      const statements: Statement[] = rows.flatMap((r) => repo.searchStatements(r));
      await db.batch(statements);
      n += rows.length;
      if (rows.length < pageSize) break;
    }
  }
  await db.execute("INSERT INTO search_index(search_index) VALUES('optimize')");
  return n;
}
