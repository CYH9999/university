import { describe, it, expect } from "vitest";
import { summarizeSubject, computeGpa, requiredAverageForTarget, bandFor } from "../src/core/grading/calc";
import { DEFAULT_SCALES } from "../src/core/grading/scales";
import { setup } from "./helpers/setup";

const [iraqi, gpa4, gpa5] = DEFAULT_SCALES;

describe("grade calculations", () => {
  it("separates actual, estimated and missing grades", () => {
    const s = summarizeSubject([
      { weight: 20, score: 18, maxScore: 20, status: "actual" }, // 90%
      { weight: 20, score: 70, maxScore: 100, status: "estimated" },
      { weight: 60, score: null, maxScore: 100, status: "missing" },
    ]);
    expect(s.actualWeight).toBe(20);
    expect(s.estimatedWeight).toBe(20);
    expect(s.missingWeight).toBe(60);
    expect(s.earnedPercent).toBeCloseTo(18);
    expect(s.currentPercent).toBeCloseTo(90);
    expect(s.projectedPercent).toBeCloseTo(80); // (18+14 + 0.8*60)
    expect(s.finalPercent).toBeNull();
    expect(s.state).toBe("in_progress");
    expect(s.weightsValid).toBe(true);
  });

  it("produces a final grade when everything is actual, or when overridden", () => {
    const s = summarizeSubject([
      { weight: 40, score: 30, maxScore: 40, status: "actual" },
      { weight: 60, score: 45, maxScore: 60, status: "actual" },
    ]);
    expect(s.finalPercent).toBeCloseTo(75);
    expect(s.state).toBe("final");
    expect(summarizeSubject([], 88).finalPercent).toBe(88);
    expect(summarizeSubject([]).state).toBe("none");
  });

  it("maps percentages to bands on every scale", () => {
    expect(bandFor(92, iraqi)?.label).toContain("Excellent");
    expect(bandFor(49.9, iraqi)?.label).toContain("Fail");
    expect(bandFor(90, gpa4)?.points).toBe(3.7);
    expect(bandFor(95, gpa5)?.points).toBe(5);
  });

  it("computes credit-weighted GPA and ignores excluded subjects", () => {
    const subjects = [
      { credits: 3, percent: 95, countsInGpa: true }, // A 4.0
      { credits: 2, percent: 81, countsInGpa: true }, // B- 2.7
      { credits: 3, percent: null, countsInGpa: true },
      { credits: 1, percent: 40, countsInGpa: false },
    ];
    const g = computeGpa(subjects, gpa4);
    expect(g.credits).toBe(5);
    expect(g.gpa).toBeCloseTo((4 * 3 + 2.7 * 2) / 5);
    expect(computeGpa(subjects, iraqi).gpa).toBeCloseTo((95 * 3 + 81 * 2) / 5);
    expect(computeGpa([], gpa4).gpa).toBeNull();
  });

  it("computes the average needed for a target", () => {
    const items = [
      { weight: 40, score: 20, maxScore: 40, status: "actual" as const },
      { weight: 60, score: null, maxScore: 100, status: "missing" as const },
    ];
    expect(requiredAverageForTarget(items, 80)).toBeCloseTo(100);
    expect(requiredAverageForTarget(items, 50)).toBeCloseTo(50);
  });

  it("computes semester and cumulative GPA from stored grades", async () => {
    const { s } = await setup();
    const scales = await s.grades.scales();
    const four = scales.find((x) => x.kind === "gpa4")!;
    const sem = await s.semesters.create({ name: "S1", gradingScaleId: four.id });
    const a = await s.repos.subjects.create({ name: "A", credits: 3, semesterId: sem.id, gradingScaleId: four.id });
    const b = await s.repos.subjects.create({ name: "B", credits: 3, semesterId: sem.id, gradingScaleId: four.id });
    await s.repos.grades.create({ subjectId: a.id, name: "All", weight: 100, score: 95, status: "actual" });
    await s.repos.grades.create({ subjectId: b.id, name: "Mid", weight: 40, score: 32, maxScore: 40, status: "actual" });
    await s.repos.grades.create({ subjectId: b.id, name: "Final", weight: 60, status: "missing" });
    const r = await s.grades.semesterGpa(sem.id);
    expect(r.actual).toBe(4);
    expect(r.actualCredits).toBe(3);
    expect(r.projected).toBeCloseTo((4 * 3 + 2.7 * 3) / 6); // B projects to 80% (B-)
    const rep = await s.grades.subjectReport(b.id);
    expect(rep.summary.state).toBe("in_progress");
    expect((await s.grades.cumulativeGpa()).totalCredits).toBe(6);
  });
});

import { diffLines } from "../src/core/utils/diff";
describe("diff", () => {
  it("computes line differences", () => {
    const d = diffLines("a\nb\nc", "a\nc\nd");
    expect(d).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
});
