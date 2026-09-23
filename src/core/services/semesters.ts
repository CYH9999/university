import type { Semester, Subject } from "../model/types";
import type { Statement } from "../db/types";
import type { ServiceContext } from "./context";

export interface DuplicateSemesterOptions {
  name: string;
  academicYear?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  copySubjects: boolean;
  copyTimetable: boolean;
  copyGradeStructure: boolean;
}

export function createSemesterService(ctx: ServiceContext) {
  const { repos } = ctx;
  return {
    list: (includeArchived = true) =>
      repos.semesters.list(includeArchived ? {} : { where: ["t.status <> 'archived'"] }),

    async current(): Promise<Semester | null> {
      const rows = await repos.semesters.list({ where: ["t.is_current = 1"], limit: 1 });
      if (rows[0]) return rows[0];
      const active = await repos.semesters.list({ where: ["t.status = 'active'"], limit: 1 });
      return active[0] ?? null;
    },

    /** Creates a semester; the first semester ever created becomes the current one. */
    async create(input: Partial<Semester>): Promise<Semester> {
      const count = await repos.semesters.count();
      const makeCurrent = input.isCurrent || count === 0;
      const e = repos.semesters.build({ ...input, isCurrent: makeCurrent } as Partial<Semester> & Record<string, unknown>);
      const extra: Statement[] = makeCurrent ? [{ sql: "UPDATE semesters SET is_current = 0 WHERE id <> ?", params: [e.id] }] : [];
      await ctx.db.batch([...repos.semesters.createStatements(e), ...extra]);
      return e;
    },

    async update(id: string, patch: Partial<Semester>): Promise<Semester> {
      const extra: Statement[] = patch.isCurrent ? [{ sql: "UPDATE semesters SET is_current = 0 WHERE id <> ?", params: [id] }] : [];
      return repos.semesters.update(id, patch, extra);
    },

    /** Switches the active semester (only one semester is current at a time). */
    async setCurrent(id: string): Promise<Semester> {
      const s = await repos.semesters.require(id);
      const { after } = await repos.semesters.prepareUpdate(id, {
        isCurrent: true,
        status: s.status === "archived" || s.status === "upcoming" ? "active" : s.status,
      });
      await ctx.db.batch([
        { sql: "UPDATE semesters SET is_current = 0 WHERE id <> ?", params: [id] },
        ...repos.semesters.updateStatements(after),
      ]);
      return after;
    },

    async archive(id: string): Promise<Semester> {
      return repos.semesters.update(id, { status: "archived", isCurrent: false });
    },

    /**
     * Creates a new semester with the same structure: optionally copies subjects (without
     * grades/attendance), their weekly timetable and their grade structure (weights only).
     */
    async duplicate(sourceId: string, opts: DuplicateSemesterOptions): Promise<Semester> {
      const src = await repos.semesters.require(sourceId);
      const sem = repos.semesters.build({
        name: opts.name,
        academicYear: opts.academicYear ?? src.academicYear,
        type: src.type,
        startDate: opts.startDate ?? null,
        endDate: opts.endDate ?? null,
        status: "upcoming",
        isCurrent: false,
        gradingScaleId: src.gradingScaleId,
        notes: null,
      } as Partial<Semester> & Record<string, unknown>);
      const statements: Statement[] = [...repos.semesters.createStatements(sem)];
      if (opts.copySubjects) {
        const subjects = await repos.subjects.list({ where: ["t.semester_id = ?"], params: [sourceId] });
        for (const s of subjects) {
          const copy = repos.subjects.build({
            ...s,
            id: undefined,
            createdAt: undefined,
            semesterId: sem.id,
            finalGradeOverride: null,
            status: "active",
            archived: false,
          } as unknown as Partial<Subject> & Record<string, unknown>);
          statements.push(...repos.subjects.createStatements(copy));
          if (opts.copyTimetable) {
            const entries = await repos.timetable.list({ where: ["t.subject_id = ?"], params: [s.id] });
            for (const en of entries) {
              if (en.recurrence === "once") continue;
              const c = repos.timetable.build({ ...en, id: undefined, createdAt: undefined, subjectId: copy.id, semesterId: sem.id, validFrom: null, validUntil: null } as never);
              statements.push(...repos.timetable.createStatements(c));
            }
          }
          if (opts.copyGradeStructure) {
            const items = await repos.grades.list({ where: ["t.subject_id = ?"], params: [s.id] });
            for (const g of items) {
              const c = repos.grades.build({ ...g, id: undefined, createdAt: undefined, subjectId: copy.id, score: null, status: "missing", date: null, deadlineId: null, notes: null } as never);
              statements.push(...repos.grades.createStatements(c));
            }
          }
        }
      }
      await ctx.db.batch(statements);
      return sem;
    },

    /** Copies selected subjects (and optionally timetable/grade structure) into another semester. */
    async copySubjects(subjectIds: string[], targetSemesterId: string, withTimetable: boolean, withGrades: boolean): Promise<number> {
      await repos.semesters.require(targetSemesterId);
      const statements: Statement[] = [];
      const subjects = await repos.subjects.getMany(subjectIds);
      for (const s of subjects) {
        const copy = repos.subjects.build({ ...s, id: undefined, createdAt: undefined, semesterId: targetSemesterId, finalGradeOverride: null, status: "active", archived: false } as never);
        statements.push(...repos.subjects.createStatements(copy));
        if (withTimetable) {
          for (const en of await repos.timetable.list({ where: ["t.subject_id = ?"], params: [s.id] })) {
            if (en.recurrence === "once") continue;
            statements.push(...repos.timetable.createStatements(repos.timetable.build({ ...en, id: undefined, createdAt: undefined, subjectId: copy.id, semesterId: targetSemesterId } as never)));
          }
        }
        if (withGrades) {
          for (const g of await repos.grades.list({ where: ["t.subject_id = ?"], params: [s.id] })) {
            statements.push(...repos.grades.createStatements(repos.grades.build({ ...g, id: undefined, createdAt: undefined, subjectId: copy.id, score: null, status: "missing", deadlineId: null } as never)));
          }
        }
      }
      await ctx.db.batch(statements);
      return subjects.length;
    },
  };
}
