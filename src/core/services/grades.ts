import type { GradeItem, GradingScale, Semester, Subject } from "../model/types";
import { computeGpa, summarizeSubject, bandFor, requiredAverageForTarget, type SubjectGradeSummary, type ScaleInput } from "../grading/calc";
import type { ServiceContext } from "./context";

export interface SubjectGradeReport {
  subject: Subject;
  items: GradeItem[];
  scale: GradingScale | null;
  summary: SubjectGradeSummary;
  letter: string | null;
  projectedLetter: string | null;
  neededForTarget: number | null;
}

export interface GpaReport {
  scale: GradingScale | null;
  /** GPA using only subjects with a final grade. */
  actual: number | null;
  /** GPA including in-progress subjects at their projected grade. */
  projected: number | null;
  actualCredits: number;
  projectedCredits: number;
  totalCredits: number;
  subjects: SubjectGradeReport[];
}

const toScaleInput = (s: GradingScale): ScaleInput => ({ kind: s.kind, maxPoints: s.maxPoints, passMark: s.passMark, bands: s.bands });

export function createGradeService(ctx: ServiceContext) {
  const { repos } = ctx;

  async function scales(): Promise<GradingScale[]> {
    return repos.gradingScales.list();
  }

  async function defaultScale(): Promise<GradingScale | null> {
    const all = await scales();
    return all.find((s) => s.isDefault) ?? all[0] ?? null;
  }

  async function scaleFor(subject: Subject, semester: Semester | null, all?: GradingScale[]): Promise<GradingScale | null> {
    const list = all ?? (await scales());
    const id = subject.gradingScaleId ?? semester?.gradingScaleId;
    return list.find((s) => s.id === id) ?? list.find((s) => s.isDefault) ?? list[0] ?? null;
  }

  function report(subject: Subject, items: GradeItem[], scale: GradingScale | null): SubjectGradeReport {
    const summary = summarizeSubject(
      items.map((i) => ({ weight: i.weight, score: i.score, maxScore: i.maxScore, status: i.status })),
      subject.finalGradeOverride,
    );
    const si = scale ? toScaleInput(scale) : null;
    const letter = si && summary.finalPercent !== null ? bandFor(summary.finalPercent, si)?.label ?? null : null;
    const projectedLetter = si && summary.projectedPercent !== null ? bandFor(summary.projectedPercent, si)?.label ?? null : null;
    const neededForTarget =
      subject.targetGrade !== null && subject.targetGrade !== undefined
        ? requiredAverageForTarget(
            items.map((i) => ({ weight: i.weight, score: i.score, maxScore: i.maxScore, status: i.status })),
            subject.targetGrade,
          )
        : null;
    return { subject, items, scale, summary, letter, projectedLetter, neededForTarget };
  }

  const svc = {
    scales,
    defaultScale,

    async setDefaultScale(id: string): Promise<void> {
      await ctx.db.batch([
        { sql: "UPDATE grading_scales SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END", params: [id] },
      ]);
    },

    items: (subjectId: string) => repos.grades.list({ where: ["t.subject_id = ?"], params: [subjectId] }),

    async subjectReport(subjectId: string): Promise<SubjectGradeReport> {
      const subject = await repos.subjects.require(subjectId);
      const semester = subject.semesterId ? await repos.semesters.get(subject.semesterId) : null;
      const [items, scale] = await Promise.all([svc.items(subjectId), scaleFor(subject, semester)]);
      return report(subject, items, scale);
    },

    /** Semester GPA (actual vs projected). */
    async semesterGpa(semesterId: string): Promise<GpaReport> {
      const semester = await repos.semesters.get(semesterId);
      const subjects = await repos.subjects.list({ where: ["t.semester_id = ?", "t.status <> 'dropped'"], params: [semesterId] });
      return svc.gpaFor(subjects, semester);
    },

    /** Cumulative GPA across every semester. */
    async cumulativeGpa(): Promise<GpaReport> {
      const subjects = await repos.subjects.list({ where: ["t.status <> 'dropped'"] });
      return svc.gpaFor(subjects, null);
    },

    async gpaFor(subjects: Subject[], semester: Semester | null): Promise<GpaReport> {
      const allScales = await scales();
      const scale = (semester?.gradingScaleId ? allScales.find((s) => s.id === semester.gradingScaleId) : null) ?? allScales.find((s) => s.isDefault) ?? allScales[0] ?? null;
      const itemRows = subjects.length
        ? await repos.grades.list({ where: [`t.subject_id IN (${subjects.map(() => "?").join(",")})`], params: subjects.map((s) => s.id) })
        : [];
      const bySubject = new Map<string, GradeItem[]>();
      for (const i of itemRows) bySubject.set(i.subjectId, [...(bySubject.get(i.subjectId) ?? []), i]);
      const semesters = new Map<string, Semester>();
      const reports: SubjectGradeReport[] = [];
      for (const s of subjects) {
        let sem = semester;
        if (!sem && s.semesterId) {
          if (!semesters.has(s.semesterId)) {
            const x = await repos.semesters.get(s.semesterId);
            if (x) semesters.set(x.id, x);
          }
          sem = semesters.get(s.semesterId) ?? null;
        }
        reports.push(report(s, bySubject.get(s.id) ?? [], await scaleFor(s, sem, allScales)));
      }
      if (!scale) return { scale: null, actual: null, projected: null, actualCredits: 0, projectedCredits: 0, totalCredits: 0, subjects: reports };
      const si = toScaleInput(scale);
      const actual = computeGpa(reports.map((r) => ({ credits: r.subject.credits, percent: r.summary.finalPercent, countsInGpa: r.subject.countsInGpa })), si);
      const projected = computeGpa(
        reports.map((r) => ({ credits: r.subject.credits, percent: r.summary.finalPercent ?? r.summary.projectedPercent, countsInGpa: r.subject.countsInGpa })),
        si,
      );
      return {
        scale,
        actual: actual.gpa,
        projected: projected.gpa,
        actualCredits: actual.credits,
        projectedCredits: projected.credits,
        totalCredits: reports.filter((r) => r.subject.countsInGpa).reduce((s, r) => s + r.subject.credits, 0),
        subjects: reports,
      };
    },

    /** GPA per semester in chronological order (for trend charts). */
    async gpaTrend(): Promise<{ semester: Semester; actual: number | null; projected: number | null }[]> {
      const sems = await repos.semesters.list({ orderBy: "COALESCE(t.start_date, t.created_at)" });
      const out = [];
      for (const s of sems) {
        const r = await svc.semesterGpa(s.id);
        if (r.subjects.length) out.push({ semester: s, actual: r.actual, projected: r.projected });
      }
      return out;
    },

    /** Adds a typical assessment structure for a subject (user can edit every weight). */
    async applyTemplate(subjectId: string, template: { name: string; category: GradeItem["category"]; weight: number }[]): Promise<void> {
      const existing = await repos.grades.count({ where: ["t.subject_id = ?"], params: [subjectId] });
      const statements = template.flatMap((tpl, i) =>
        repos.grades.createStatements(
          repos.grades.build({ subjectId, name: tpl.name, category: tpl.category, weight: tpl.weight, maxScore: 100, status: "missing", sortOrder: existing + i } as never),
        ),
      );
      await ctx.db.batch(statements);
    },
  };
  return svc;
}
