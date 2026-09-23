import type { GradeStatus, ScaleKind } from "../model/enums";
import type { GradeBand } from "./scales";

export interface GradeItemInput {
  weight: number;
  score: number | null;
  maxScore: number;
  status: GradeStatus;
}

export interface ScaleInput {
  kind: ScaleKind;
  maxPoints: number;
  passMark: number;
  bands: GradeBand[];
}

export interface SubjectGradeSummary {
  totalWeight: number;
  /** Weight of items with an actual (confirmed) score. */
  actualWeight: number;
  /** Weight of items with an estimated score. */
  estimatedWeight: number;
  /** Weight of items with no score yet. */
  missingWeight: number;
  /** Points earned so far from actual scores, as % of the whole course (guaranteed minimum). */
  earnedPercent: number;
  /** Average performance on graded (actual) items, in %. Null when nothing is graded. */
  currentPercent: number | null;
  /** Expected final %: actual + estimated scores, missing items assumed at the current average. */
  projectedPercent: number | null;
  /** Final course percentage when every item is actual and weights sum to 100 (or override). */
  finalPercent: number | null;
  state: "final" | "in_progress" | "none";
  weightsValid: boolean;
}

const EPS = 1e-6;

function contribution(i: GradeItemInput): number {
  if (i.score === null || !Number.isFinite(i.score) || i.maxScore <= 0) return 0;
  return (Math.max(0, i.score) / i.maxScore) * i.weight;
}

export function summarizeSubject(items: GradeItemInput[], finalOverride?: number | null): SubjectGradeSummary {
  const totalWeight = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  const actual = items.filter((i) => i.status === "actual" && i.score !== null);
  const estimated = items.filter((i) => i.status === "estimated" && i.score !== null);
  const actualWeight = actual.reduce((s, i) => s + i.weight, 0);
  const estimatedWeight = estimated.reduce((s, i) => s + i.weight, 0);
  const missingWeight = Math.max(0, totalWeight - actualWeight - estimatedWeight);
  const earned = actual.reduce((s, i) => s + contribution(i), 0);
  const estimatedEarned = estimated.reduce((s, i) => s + contribution(i), 0);
  const weightsValid = Math.abs(totalWeight - 100) < 0.01;
  const scaleTo100 = totalWeight > EPS ? 100 / totalWeight : 0;

  const currentPercent = actualWeight > EPS ? (earned / actualWeight) * 100 : null;
  let projectedPercent: number | null = null;
  const knownWeight = actualWeight + estimatedWeight;
  if (knownWeight > EPS) {
    const knownAvg = (earned + estimatedEarned) / knownWeight;
    projectedPercent = (earned + estimatedEarned + knownAvg * missingWeight) * scaleTo100;
  }
  let finalPercent: number | null = null;
  let state: SubjectGradeSummary["state"] = actualWeight > EPS ? "in_progress" : "none";
  if (finalOverride !== null && finalOverride !== undefined && Number.isFinite(finalOverride)) {
    finalPercent = finalOverride;
    projectedPercent = finalOverride;
    state = "final";
  } else if (items.length > 0 && actual.length === items.length && totalWeight > EPS) {
    finalPercent = earned * scaleTo100;
    state = "final";
  }
  return {
    totalWeight,
    actualWeight,
    estimatedWeight,
    missingWeight,
    earnedPercent: earned * scaleTo100,
    currentPercent,
    projectedPercent,
    finalPercent,
    state,
    weightsValid,
  };
}

/** Score needed on the remaining (non-actual) weight to reach `target` %. */
export function requiredAverageForTarget(items: GradeItemInput[], target: number): number | null {
  const totalWeight = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (totalWeight <= EPS) return null;
  const actual = items.filter((i) => i.status === "actual" && i.score !== null);
  const earned = actual.reduce((s, i) => s + contribution(i), 0);
  const remaining = totalWeight - actual.reduce((s, i) => s + i.weight, 0);
  if (remaining <= EPS) return null;
  const needed = ((target / 100) * totalWeight - earned) / remaining;
  return needed * 100;
}

export function bandFor(percent: number, scale: ScaleInput): GradeBand | null {
  const sorted = [...scale.bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percent + EPS >= b.min) ?? null;
}

export function pointsFor(percent: number, scale: ScaleInput): number {
  if (scale.kind === "percentage") return percent;
  return bandFor(percent, scale)?.points ?? 0;
}

export interface GpaInput {
  credits: number;
  percent: number | null;
  countsInGpa: boolean;
}

/**
 * Weighted GPA. For percentage scales the result is the credit-weighted average percentage;
 * for point scales it is the credit-weighted average of grade points.
 */
export function computeGpa(subjects: GpaInput[], scale: ScaleInput): { gpa: number | null; credits: number } {
  let credits = 0;
  let sum = 0;
  for (const s of subjects) {
    if (!s.countsInGpa || s.percent === null || s.credits <= 0) continue;
    credits += s.credits;
    sum += pointsFor(s.percent, scale) * s.credits;
  }
  return { gpa: credits > 0 ? sum / credits : null, credits };
}

export function isPassing(percent: number | null, scale: ScaleInput): boolean | null {
  if (percent === null) return null;
  return percent + EPS >= scale.passMark;
}
