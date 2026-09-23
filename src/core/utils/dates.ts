/**
 * Date helpers. Calendar dates are stored as local "YYYY-MM-DD" strings and times as
 * "HH:mm", so a lecture at 08:30 stays at 08:30 regardless of timezone changes.
 * Timestamps (created/updated) are ISO-8601 UTC strings.
 */

export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = parseDateKey(key);
  return toDateKey(d) === key;
}

export function isValidTimeKey(key: unknown): key is string {
  return typeof key === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(key);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addDaysKey(key: string, n: number): string {
  return toDateKey(addDays(parseDateKey(key), n));
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from `from` to `to` (calendar days, DST-safe). */
export function diffDays(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

/**
 * Weekday index used throughout the app, starting on Saturday (Iraq):
 * 0 = Saturday, 1 = Sunday, 2 = Monday, 3 = Tuesday, 4 = Wednesday, 5 = Thursday, 6 = Friday.
 */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 1) % 7;
}

/** Saturday that starts the week containing `d`. */
export function startOfWeek(d: Date, weekStartsOn: number = 6): Date {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStartsOn + 7) % 7;
  return addDays(s, -diff);
}

export function combineDateTime(dateKey: string, time?: string | null): Date {
  const d = parseDateKey(dateKey);
  if (time && isValidTimeKey(time)) {
    const [h, m] = time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(23, 59, 0, 0);
  }
  return d;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** ISO week parity helper for bi-weekly lectures. */
export function weekNumberSince(anchorKey: string, dateKey: string): number {
  return Math.floor(diffDays(toDateKey(startOfWeek(parseDateKey(anchorKey))), dateKey) / 7);
}
