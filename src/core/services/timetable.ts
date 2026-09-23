import type { Subject, TimetableEntry } from "../model/types";
import { parseDateKey, timeToMinutes, weekdayIndex, weekNumberSince, addDaysKey, toDateKey, combineDateTime } from "../utils/dates";
import type { ServiceContext } from "./context";
import { today } from "./context";

export interface Conflict {
  a: TimetableEntry;
  b: TimetableEntry;
  overlapMinutes: number;
}

function sameWeekPattern(a: TimetableEntry, b: TimetableEntry): boolean {
  if (a.recurrence === "once" || b.recurrence === "once") {
    if (a.recurrence === "once" && b.recurrence === "once") return a.specificDate === b.specificDate;
    return true; // a one-off may collide with any weekly class on that weekday
  }
  if (a.recurrence === "weekly" || b.recurrence === "weekly") return true;
  return a.recurrence === b.recurrence; // biweekly A vs B never collide
}

/** Detects overlapping sessions on the same day (pure; used for warnings in the UI). */
export function findConflicts(entries: TimetableEntry[]): Conflict[] {
  const out: Conflict[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.day !== b.day || !sameWeekPattern(a, b)) continue;
      const start = Math.max(timeToMinutes(a.startTime), timeToMinutes(b.startTime));
      const end = Math.min(timeToMinutes(a.endTime), timeToMinutes(b.endTime));
      if (end > start) out.push({ a, b, overlapMinutes: end - start });
    }
  }
  return out;
}

export function conflictsFor(candidate: Pick<TimetableEntry, "id" | "day" | "startTime" | "endTime" | "recurrence" | "specificDate">, entries: TimetableEntry[]): TimetableEntry[] {
  return entries.filter((e) => {
    if (e.id === candidate.id || e.day !== candidate.day) return false;
    if (!sameWeekPattern(e, candidate as TimetableEntry)) return false;
    return Math.min(timeToMinutes(e.endTime), timeToMinutes(candidate.endTime)) > Math.max(timeToMinutes(e.startTime), timeToMinutes(candidate.startTime));
  });
}

/** Does `entry` take place on `dateKey`? Honours weekday, validity range and recurrence. */
export function occursOn(entry: TimetableEntry, dateKey: string, semesterStart?: string | null): boolean {
  if (entry.recurrence === "once") return entry.specificDate === dateKey;
  if (weekdayIndex(parseDateKey(dateKey)) !== entry.day) return false;
  if (entry.validFrom && dateKey < entry.validFrom) return false;
  if (entry.validUntil && dateKey > entry.validUntil) return false;
  if (entry.recurrence === "biweekly_a" || entry.recurrence === "biweekly_b") {
    const anchor = entry.validFrom ?? semesterStart ?? "2000-01-01";
    const week = weekNumberSince(anchor, dateKey);
    return entry.recurrence === "biweekly_a" ? week % 2 === 0 : week % 2 !== 0;
  }
  return true;
}

export interface Occurrence {
  entry: TimetableEntry;
  subject: Subject | null;
  date: string;
  start: Date;
  end: Date;
}

export function createTimetableService(ctx: ServiceContext) {
  const { repos } = ctx;

  async function semesterEntries(semesterId: string | null): Promise<TimetableEntry[]> {
    if (!semesterId) return repos.timetable.list({ where: ["t.semester_id IS NULL"] });
    return repos.timetable.list({ where: ["t.semester_id = ?"], params: [semesterId] });
  }

  async function occurrencesBetween(semesterId: string | null, fromKey: string, days: number): Promise<Occurrence[]> {
    const [entries, semester] = await Promise.all([semesterEntries(semesterId), semesterId ? repos.semesters.get(semesterId) : null]);
    if (!entries.length) return [];
    const subjects = new Map((await repos.subjects.getMany([...new Set(entries.map((e) => e.subjectId))])).map((s) => [s.id, s]));
    const out: Occurrence[] = [];
    for (let i = 0; i < days; i++) {
      const date = addDaysKey(fromKey, i);
      if (semester?.startDate && date < semester.startDate) continue;
      if (semester?.endDate && date > semester.endDate) continue;
      for (const e of entries) {
        if (!occursOn(e, date, semester?.startDate)) continue;
        out.push({ entry: e, subject: subjects.get(e.subjectId) ?? null, date, start: combineDateTime(date, e.startTime), end: combineDateTime(date, e.endTime) });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  return {
    semesterEntries,
    occurrencesBetween,

    async forDay(semesterId: string | null, dateKey: string): Promise<Occurrence[]> {
      return occurrencesBetween(semesterId, dateKey, 1);
    },

    /** The next session that has not ended yet (looks ahead two weeks). */
    async next(semesterId: string | null): Promise<Occurrence | null> {
      const now = ctx.clock.now();
      const occ = await occurrencesBetween(semesterId, today(ctx), 14);
      return occ.find((o) => o.end.getTime() > now.getTime()) ?? null;
    },

    async conflicts(semesterId: string | null): Promise<Conflict[]> {
      return findConflicts(await semesterEntries(semesterId));
    },

    async save(input: Partial<TimetableEntry> & { id?: string }): Promise<{ entry: TimetableEntry; conflicts: TimetableEntry[] }> {
      const entry = input.id ? await repos.timetable.update(input.id, input) : await repos.timetable.create(input as never);
      const others = await semesterEntries(entry.semesterId);
      return { entry, conflicts: conflictsFor(entry, others) };
    },

    /** Moves/resizes an entry (drag & drop in the weekly grid). */
    async reschedule(id: string, day: number, startTime: string, endTime: string) {
      return repos.timetable.update(id, { day, startTime, endTime });
    },

    todayKey: () => toDateKey(ctx.clock.now()),
  };
}
