import type { ScaleKind } from "../model/enums";

export interface GradeBand {
  /** Minimum percentage (inclusive) for this band. */
  min: number;
  /** Letter or label, e.g. "A", "امتياز". */
  label: string;
  /** Grade points on the scale (e.g. 4.0). For percentage scales this is informational. */
  points: number;
}

export interface GradingScaleDef {
  name: string;
  kind: ScaleKind;
  maxPoints: number;
  passMark: number;
  bands: GradeBand[];
}

/** Defaults are only a starting point: every scale is editable in Settings → Grading. */
export const DEFAULT_SCALES: GradingScaleDef[] = [
  {
    name: "Percentage (Iraqi universities)",
    kind: "percentage",
    maxPoints: 100,
    passMark: 50,
    bands: [
      { min: 90, label: "امتياز · Excellent", points: 4 },
      { min: 80, label: "جيد جداً · Very Good", points: 3.5 },
      { min: 70, label: "جيد · Good", points: 3 },
      { min: 60, label: "متوسط · Average", points: 2.5 },
      { min: 50, label: "مقبول · Pass", points: 2 },
      { min: 0, label: "راسب · Fail", points: 0 },
    ],
  },
  {
    name: "4.0 GPA scale",
    kind: "gpa4",
    maxPoints: 4,
    passMark: 60,
    bands: [
      { min: 93, label: "A", points: 4 },
      { min: 90, label: "A-", points: 3.7 },
      { min: 87, label: "B+", points: 3.3 },
      { min: 83, label: "B", points: 3 },
      { min: 80, label: "B-", points: 2.7 },
      { min: 77, label: "C+", points: 2.3 },
      { min: 73, label: "C", points: 2 },
      { min: 70, label: "C-", points: 1.7 },
      { min: 67, label: "D+", points: 1.3 },
      { min: 60, label: "D", points: 1 },
      { min: 0, label: "F", points: 0 },
    ],
  },
  {
    name: "5.0 GPA scale",
    kind: "gpa5",
    maxPoints: 5,
    passMark: 60,
    bands: [
      { min: 95, label: "A+", points: 5 },
      { min: 90, label: "A", points: 4.75 },
      { min: 85, label: "B+", points: 4.5 },
      { min: 80, label: "B", points: 4 },
      { min: 75, label: "C+", points: 3.5 },
      { min: 70, label: "C", points: 3 },
      { min: 65, label: "D+", points: 2.5 },
      { min: 60, label: "D", points: 2 },
      { min: 0, label: "F", points: 1 },
    ],
  },
];
