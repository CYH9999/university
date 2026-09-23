import { createServices } from "../../src/core";
import { createNodeDb } from "./nodeDb";
import { createFakeFs } from "./fakeFs";

export class TestClock {
  constructor(public current: Date) {}
  now = () => new Date(this.current);
  set(d: Date) { this.current = d; }
  advanceMinutes(m: number) { this.current = new Date(this.current.getTime() + m * 60000); }
}

export async function setup(opts: { now?: Date; external?: Record<string, string> } = {}) {
  const db = createNodeDb();
  const fs = createFakeFs(opts.external ?? {});
  const clock = new TestClock(opts.now ?? new Date(2026, 8, 23, 9, 0, 0)); // Wed 23 Sep 2026 09:00 local
  const s = createServices({ db, fs, clock });
  await s.migrate();
  return { s, db, fs, clock };
}
