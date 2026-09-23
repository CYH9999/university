/**
 * Database port. The business logic only depends on this interface, so the same
 * services can run on the Tauri SQLite bridge (desktop), node:sqlite (tests) or a
 * future mobile SQLite driver.
 */
export type SqlValue = string | number | boolean | null;

export interface Statement {
  sql: string;
  params?: SqlValue[];
  /** Multi-statement SQL (migrations). Params are ignored. */
  script?: boolean;
}

export type Row = Record<string, unknown>;

export interface Database {
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<number>;
  /** Runs all statements in a single transaction (all-or-nothing). */
  batch(statements: Statement[]): Promise<number[]>;
}

export async function queryOne<T = Row>(db: Database, sql: string, params?: SqlValue[]): Promise<T | null> {
  const rows = await db.query<T>(sql, params);
  return rows[0] ?? null;
}

export async function scalar<T = number>(db: Database, sql: string, params?: SqlValue[]): Promise<T | null> {
  const row = await queryOne<Row>(db, sql, params);
  if (!row) return null;
  const v = Object.values(row)[0];
  return (v ?? null) as T | null;
}

/** Builds "?, ?, ?" for IN clauses. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}
