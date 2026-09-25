import type { Database, Statement } from "./types";
import { SCHEMA_V1 } from "./schema";
import { DEFAULT_SCALES } from "../grading/scales";
import { newId } from "../utils/id";

export interface Migration {
  version: number;
  name: string;
  /** Multi-statement SQL applied inside a transaction. */
  sql: string;
}

export const MIGRATIONS: Migration[] = [{ version: 1, name: "initial_schema", sql: SCHEMA_V1 }];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function currentSchemaVersion(db: Database): Promise<number> {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const rows = await db.query<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  return rows[0]?.v ?? 0;
}

export async function pendingMigrations(db: Database): Promise<Migration[]> {
  const v = await currentSchemaVersion(db);
  return MIGRATIONS.filter((m) => m.version > v);
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
}

/**
 * Applies pending migrations. Each migration and its bookkeeping row are applied in one
 * transaction, so a crash can never leave a half-migrated schema behind.
 */
export async function runMigrations(db: Database): Promise<MigrationResult> {
  const from = await currentSchemaVersion(db);
  if (from > LATEST_SCHEMA_VERSION) {
    throw Object.assign(new Error("The workspace database was created by a newer version of University."), {
      code: "db.newer_schema",
    });
  }
  const applied: string[] = [];
  for (const m of MIGRATIONS.filter((x) => x.version > from)) {
    const statements: Statement[] = [
      { sql: m.sql, script: true },
      {
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        params: [m.version, m.name, new Date().toISOString()],
      },
    ];
    await db.batch(statements);
    applied.push(`${m.version}_${m.name}`);
  }
  await ensureDefaults(db);
  return { from, to: LATEST_SCHEMA_VERSION, applied };
}

/** Inserts configuration defaults that the app needs (never user data). Idempotent. */
export async function ensureDefaults(db: Database): Promise<void> {
  const rows = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM grading_scales");
  if ((rows[0]?.n ?? 0) > 0) return;
  const now = new Date().toISOString();
  await db.batch(
    DEFAULT_SCALES.map((s, i) => ({
      sql: `INSERT INTO grading_scales (id, name, kind, max_points, pass_mark, bands, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [newId(), s.name, s.kind, s.maxPoints, s.passMark, JSON.stringify(s.bands), i === 0 ? 1 : 0, now, now],
    })),
  );
}
