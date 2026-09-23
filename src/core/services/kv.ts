import type { ServiceContext } from "./context";

/** Small internal key/value store inside the database (app state, never user settings). */
export function createKvService(ctx: ServiceContext) {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const rows = await ctx.db.query<{ value: string | null }>("SELECT value FROM kv WHERE key = ?", [key]);
      if (!rows[0]?.value) return null;
      try {
        return JSON.parse(rows[0].value) as T;
      } catch {
        return null;
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      await ctx.db.execute(
        "INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, JSON.stringify(value), ctx.clock.now().toISOString()],
      );
    },
  };
}
