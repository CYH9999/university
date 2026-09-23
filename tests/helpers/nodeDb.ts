/** Database port implemented with node:sqlite, used to test the core against real SQLite. */
import { DatabaseSync } from "node:sqlite";
import type { Database, SqlValue, Statement } from "../../src/core/db/types";

const conv = (p: SqlValue[] = []) => p.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));

export function createNodeDb(path = ":memory:"): Database & { raw: DatabaseSync; close(): void } {
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA foreign_keys = ON;");
  return {
    raw,
    close: () => raw.close(),
    async query<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return raw.prepare(sql).all(...(conv(params) as never[])) as T[];
    },
    async execute(sql: string, params: SqlValue[] = []): Promise<number> {
      return Number(raw.prepare(sql).run(...(conv(params) as never[])).changes);
    },
    async batch(statements: Statement[]): Promise<number[]> {
      raw.exec("BEGIN");
      try {
        const out: number[] = [];
        for (const s of statements) {
          if (s.script) {
            raw.exec(s.sql);
            out.push(0);
          } else out.push(Number(raw.prepare(s.sql).run(...(conv(s.params) as never[])).changes));
        }
        raw.exec("COMMIT");
        return out;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
