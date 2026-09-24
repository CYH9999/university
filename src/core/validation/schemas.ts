/**
 * Input validation for every entity. Error messages are i18n keys (`validation.*`) so the
 * UI can show them in Arabic or English.
 */
import { z } from "zod";
import * as E from "../model/enums";
import { isValidDateKey, isValidTimeKey, timeToMinutes } from "../utils/dates";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const text = (max = 300) =>
  z
    .string({ error: "validation.required" })
    .trim()
    .min(1, "validation.required")
    .max(max, "validation.tooLong");

export const optText = (max = 20000) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, "validation.tooLong").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const dateKey = () =>
  z.string({ error: "validation.required" }).refine((v) => isValidDateKey(v), "validation.date");

export const optDate = () =>
  z.preprocess(
    emptyToNull,
    z.string().refine((v) => isValidDateKey(v), "validation.date").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const timeKey = () => z.string({ error: "validation.required" }).refine((v) => isValidTimeKey(v), "validation.time");

export const optTime = () =>
  z.preprocess(
    emptyToNull,
    z.string().refine((v) => isValidTimeKey(v), "validation.time").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const optId = () =>
  z.preprocess(emptyToNull, z.string().max(64).nullable().optional().default(null)) as unknown as z.ZodType<string | null>;

export const optNum = (min = -1e12, max = 1e12) =>
  z.preprocess(
    (v) => (v === "" || v === undefined ? null : typeof v === "string" ? Number(v) : v),
    z.number({ error: "validation.number" }).min(min, "validation.min").max(max, "validation.max").nullable().default(null),
  ) as unknown as z.ZodType<number | null>;

export const num = (def: number, min = -1e12, max = 1e12) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? def : typeof v === "string" ? Number(v) : v),
    z.number({ error: "validation.number" }).finite("validation.number").min(min, "validation.min").max(max, "validation.max"),
  ) as unknown as z.ZodType<number>;

export const int = (def: number, min = -1e9, max = 1e9) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? def : typeof v === "string" ? Number(v) : v),
    z.number({ error: "validation.number" }).int("validation.integer").min(min, "validation.min").max(max, "validation.max"),
  ) as unknown as z.ZodType<number>;

export const bool = (def = false) => z.boolean().optional().default(def) as unknown as z.ZodType<boolean>;

export const enumOf = <T extends readonly [string, ...string[]]>(values: T, def: T[number]) =>
  z.enum(values, { error: "validation.invalidOption" }).optional().default(def as never) as unknown as z.ZodType<T[number]>;

export const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(emptyToNull, z.enum(values, { error: "validation.invalidOption" }).nullable().optional().default(null)) as unknown as z.ZodType<
    T[number] | null
  >;

export const color = () =>
  z.preprocess(
    emptyToNull,
    z.string().regex(/^#[0-9a-fA-F]{6}$/, "validation.color").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const isSafeUrl = (v: string) => /^(https?:\/\/|mailto:)[^\s]+$/i.test(v.trim());

export const optUrl = () =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(2000, "validation.tooLong").refine(isSafeUrl, "validation.url").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const optEmail = () =>
  z.preprocess(
    emptyToNull,
    z.string().trim().email("validation.email").nullable().optional().default(null),
  ) as unknown as z.ZodType<string | null>;

export const tags = () =>
  z
    .array(z.string().trim().min(1).max(40, "validation.tooLong"))
    .max(30, "validation.tooMany")
    .optional()
    .default([])
    .transform((arr) => Array.from(new Map(arr.map((t) => [t.toLowerCase(), t])).values())) as unknown as z.ZodType<string[]>;

export const stringList = (maxItems = 100) =>
  z
    .array(z.string().trim().min(1).max(200))
    .max(maxItems, "validation.tooMany")
    .optional()
    .default([]) as unknown as z.ZodType<string[]>;

export const links = () =>
  z
    .array(z.object({ title: z.string().trim().max(200).default(""), url: z.string().trim().refine(isSafeUrl, "validation.url") }))
    .max(50, "validation.tooMany")
    .optional()
    .default([]) as unknown as z.ZodType<{ title: string; url: string }[]>;

const timeRangeOk = (s: { startTime?: string | null; endTime?: string | null }) =>
  !s.startTime || !s.endTime || timeToMinutes(s.endTime) > timeToMinutes(s.startTime);

const dateRangeOk = (a?: string | null, b?: string | null) => !a || !b || a <= b;

export const schemas = {
  gradingScale: z.object({
    name: text(120),
    kind: enumOf(E.SCALE_KINDS, "percentage"),
    maxPoints: num(4, 0, 1000),
    passMark: num(50, 0, 100),
    bands: z
      .array(z.object({ min: num(0, 0, 100), label: text(60), points: num(0, 0, 1000) }))
      .min(1, "validation.required"),
    isDefault: bool(false),
  }),

  semester: z
    .object({
      name: text(120),
      academicYear: optText(40),
      type: enumOf(E.SEMESTER_TYPES, "first"),
      startDate: optDate(),
      endDate: optDate(),
      status: enumOf(E.SEMESTER_STATUSES, "upcoming"),
      isCurrent: bool(false),
      gradingScaleId: optId(),
      notes: optText(),
    })
    .refine((s) => dateRangeOk(s.startDate, s.endDate), { message: "validation.endAfterStart", path: ["endDate"] }),

  subject: z.object({
    semesterId: optId(),
    name: text(160),
    code: optText(40),
    professor: optText(160),
    department: optText(160),
    credits: num(3, 0, 60),
    classroom: optText(120),
    color: color(),
    description: optText(),
    contactEmail: optEmail(),
    contactPhone: optText(60),
    officeHours: optText(300),
    contactNotes: optText(),
    links: links(),
    gradingScaleId: optId(),
    targetGrade: optNum(0, 100),
    finalGradeOverride: optNum(0, 100),
    countsInGpa: bool(true),
    attendanceThreshold: num(25, 0, 100),
    folderRel: optText(400),
    status: enumOf(E.SUBJECT_STATUSES, "active"),
    archived: bool(false),
    tags: tags(),
  }),

  timetable: z
    .object({
      semesterId: optId(),
      subjectId: z.string({ error: "validation.required" }).min(1, "validation.required"),
      day: int(0, 0, 6),
      startTime: timeKey(),
      endTime: timeKey(),
      kind: enumOf(E.SESSION_KINDS, "lecture"),
      room: optText(80),
      building: optText(120),
      professor: optText(160),
      color: color(),
      notes: optText(2000),
      recurrence: enumOf(E.RECURRENCES, "weekly"),
      specificDate: optDate(),
      validFrom: optDate(),
      validUntil: optDate(),
    })
    .refine(timeRangeOk, { message: "validation.endAfterStart", path: ["endTime"] })
    .refine((s) => s.recurrence !== "once" || !!s.specificDate, { message: "validation.required", path: ["specificDate"] }),

  lecture: z.object({
    subjectId: z.string().min(1, "validation.required"),
    number: optNum(0, 1000),
    title: text(200),
    date: optDate(),
    topic: optText(300),
    summary: optText(),
    timetableEntryId: optId(),
  }),

  attendance: z.object({
    subjectId: z.string().min(1, "validation.required"),
    lectureId: optId(),
    timetableEntryId: optId(),
    date: dateKey(),
    status: enumOf(E.ATTENDANCE_STATUSES, "present"),
    notes: optText(1000),
  }),

  note: z.object({
    title: text(300),
    content: z.string().nullable().optional().default(null),
    contentText: z.string().optional().default(""),
    subjectId: optId(),
    lectureId: optId(),
    projectId: optId(),
    noteType: enumOf(E.NOTE_TYPES, "lecture"),
    cyberTopic: optEnum(E.CYBER_TOPICS),
    lectureDate: optDate(),
    status: enumOf(E.NOTE_STATUSES, "draft"),
    links: links(),
    pinned: bool(false),
    favorite: bool(false),
    archived: bool(false),
    wordCount: int(0, 0),
    lastOpenedAt: z.string().nullable().optional().default(null),
    tags: tags(),
  }),

  file: z.object({
    relPath: text(1000),
    name: text(300),
    ext: z.string().optional().default(""),
    size: int(0, 0, Number.MAX_SAFE_INTEGER),
    sha256: z.string().nullable().optional().default(null),
    description: optText(2000),
    subjectId: optId(),
    projectId: optId(),
    trashedAt: z.string().nullable().optional().default(null),
    trashRel: z.string().nullable().optional().default(null),
    lastOpenedAt: z.string().nullable().optional().default(null),
    tags: tags(),
  }),

  deadline: z
    .object({
      title: text(200),
      type: enumOf(E.DEADLINE_TYPES, "assignment"),
      subjectId: optId(),
      projectId: optId(),
      dueDate: dateKey(),
      dueTime: optTime(),
      endTime: optTime(),
      location: optText(200),
      description: optText(),
      priority: enumOf(E.PRIORITIES, "medium"),
      status: enumOf(E.DEADLINE_STATUSES, "pending"),
      weight: optNum(0, 100),
      completedAt: z.string().nullable().optional().default(null),
      tags: tags(),
    })
    .refine((s) => timeRangeOk({ startTime: s.dueTime, endTime: s.endTime }), { message: "validation.endAfterStart", path: ["endTime"] }),

  task: z.object({
    title: text(300),
    description: optText(),
    subjectId: optId(),
    projectId: optId(),
    deadlineId: optId(),
    goalId: optId(),
    milestoneId: optId(),
    assigneeId: optId(),
    dueDate: optDate(),
    dueTime: optTime(),
    priority: enumOf(E.PRIORITIES, "medium"),
    status: enumOf(E.TASK_STATUSES, "inbox"),
    estimateMinutes: optNum(0, 100000),
    actualMinutes: optNum(0, 100000),
    notes: optText(),
    recurrence: z
      .object({
        freq: z.enum(E.RECURRENCE_FREQS),
        interval: int(1, 1, 365),
        weekdays: z.array(z.number().int().min(0).max(6)).optional(),
        until: z.string().nullable().optional(),
      })
      .nullable()
      .optional()
      .default(null),
    recurrenceParentId: optId(),
    rollover: bool(true),
    completedAt: z.string().nullable().optional().default(null),
    sortOrder: num(0),
    tags: tags(),
  }),

  subtask: z.object({
    taskId: z.string().min(1),
    title: text(300),
    done: bool(false),
    sortOrder: num(0),
  }),

  project: z
    .object({
      name: text(200),
      description: optText(),
      subjectId: optId(),
      semesterId: optId(),
      professor: optText(160),
      startDate: optDate(),
      deadline: optDate(),
      priority: enumOf(E.PRIORITIES, "medium"),
      status: enumOf(E.PROJECT_STATUSES, "planning"),
      progress: int(0, 0, 100),
      progressMode: enumOf(E.PROGRESS_MODES, "tasks"),
      links: links(),
      color: color(),
      folderRel: optText(400),
      tags: tags(),
    })
    .refine((s) => dateRangeOk(s.startDate, s.deadline), { message: "validation.endAfterStart", path: ["deadline"] }),

  milestone: z.object({
    projectId: z.string().min(1),
    title: text(200),
    description: optText(4000),
    dueDate: optDate(),
    done: bool(false),
    completedAt: z.string().nullable().optional().default(null),
    sortOrder: num(0),
  }),

  member: z.object({
    projectId: z.string().min(1),
    name: text(160),
    role: optText(120),
    email: optEmail(),
    phone: optText(60),
    contact: optText(300),
    responsibilities: optText(4000),
    notes: optText(4000),
    status: enumOf(E.MEMBER_STATUSES, "active"),
    isMe: bool(false),
  }),

  meeting: z.object({
    projectId: z.string().min(1),
    title: text(200),
    date: dateKey(),
    time: optTime(),
    location: optText(200),
    attendees: z.array(z.string()).optional().default([]),
    agenda: optText(),
    notes: optText(),
    decisions: optText(),
    actionItems: z
      .array(
        z.object({
          id: z.string(),
          text: z.string().trim().min(1).max(500),
          assigneeId: z.string().nullable().default(null),
          dueDate: z.string().nullable().default(null),
          done: z.boolean().default(false),
          taskId: z.string().nullable().optional(),
        }),
      )
      .optional()
      .default([]),
  }),

  grade: z.object({
    subjectId: z.string().min(1, "validation.required"),
    name: text(160),
    category: enumOf(E.GRADE_CATEGORIES, "assignment"),
    weight: num(0, 0, 100),
    score: optNum(0, 100000),
    maxScore: num(100, 0.0001, 100000),
    status: enumOf(E.GRADE_STATUSES, "missing"),
    date: optDate(),
    notes: optText(2000),
    deadlineId: optId(),
    sortOrder: num(0),
  }),

  question: z.object({
    text: text(4000),
    subjectId: optId(),
    lectureId: optId(),
    topic: optText(200),
    priority: enumOf(E.PRIORITIES, "medium"),
    status: enumOf(E.QUESTION_STATUSES, "unresolved"),
    answer: optText(),
    noteId: optId(),
    fileId: optId(),
    answeredAt: z.string().nullable().optional().default(null),
    tags: tags(),
  }),

  journal: z.object({
    date: dateKey(),
    mood: optNum(1, 5),
    energy: optNum(1, 5),
    studied: optText(),
    completed: optText(),
    learned: optText(),
    notUnderstood: optText(),
    problems: optText(),
    tomorrow: optText(),
    freeText: optText(100000),
    subjectIds: z.array(z.string()).optional().default([]),
    projectIds: z.array(z.string()).optional().default([]),
  }),

  resource: z.object({
    title: text(300),
    type: enumOf(E.RESOURCE_TYPES, "pdf"),
    authors: optText(400),
    subjectId: optId(),
    projectId: optId(),
    description: optText(),
    fileId: optId(),
    url: optUrl(),
    readStatus: enumOf(E.READ_STATUSES, "unread"),
    favorite: bool(false),
    notes: optText(),
    citation: optText(4000),
    year: optNum(0, 3000),
    publisher: optText(200),
    tags: tags(),
  }),

  goal: z.object({
    title: text(200),
    description: optText(),
    semesterId: optId(),
    deadline: optDate(),
    priority: enumOf(E.PRIORITIES, "medium"),
    progress: int(0, 0, 100),
    progressMode: enumOf(E.PROGRESS_MODES, "manual"),
    status: enumOf(E.GOAL_STATUSES, "active"),
    category: optText(80),
    completedAt: z.string().nullable().optional().default(null),
    tags: tags(),
  }),

  goalMilestone: z.object({
    goalId: z.string().min(1),
    title: text(200),
    done: bool(false),
    dueDate: optDate(),
    sortOrder: num(0),
  }),

  expense: z.object({
    amount: num(0, 0, 1e12),
    currency: z.string().trim().min(3, "validation.required").max(8).optional().default("IQD"),
    category: enumOf(E.EXPENSE_CATEGORIES, "other"),
    date: dateKey(),
    description: optText(1000),
    subjectId: optId(),
    projectId: optId(),
    semesterId: optId(),
    paymentMethod: enumOf(E.PAYMENT_METHODS, "cash"),
    receiptFileId: optId(),
  }),

  whiteboard: z.object({
    title: text(200),
    fileRel: text(1000),
    subjectId: optId(),
    projectId: optId(),
    thumbnail: z.string().nullable().optional().default(null),
    tags: tags(),
  }),

  command: z.object({
    title: optText(200),
    command: text(20000),
    tool: optText(80),
    category: enumOf(E.COMMAND_CATEGORIES, "other"),
    platform: enumOf(E.COMMAND_PLATFORMS, "linux"),
    language: z.string().trim().max(30).optional().default("bash"),
    explanation: optText(),
    example: optText(),
    expectedOutput: optText(),
    warnings: optText(4000),
    subjectId: optId(),
    labId: optId(),
    favorite: bool(false),
    tags: tags(),
  }),

  ctf: z.object({
    name: text(200),
    platform: optText(120),
    event: optText(200),
    category: enumOf(E.CTF_CATEGORIES, "misc"),
    difficulty: enumOf(E.CTF_DIFFICULTIES, "easy"),
    url: optUrl(),
    status: enumOf(E.CTF_STATUSES, "todo"),
    points: optNum(0, 1e7),
    startedAt: optDate(),
    completedAt: optDate(),
    timeSpentMinutes: int(0, 0, 1e7),
    tools: stringList(),
    hints: optText(),
    solutionNotes: optText(),
    writeup: z.string().nullable().optional().default(null),
    writeupText: z.string().optional().default(""),
    flag: optText(500),
    tags: tags(),
  }),

  lab: z.object({
    name: text(200),
    objective: optText(),
    environment: optText(),
    tools: stringList(),
    steps: optText(200000),
    findings: optText(),
    errors: optText(),
    lessons: optText(),
    referencesText: optText(),
    status: enumOf(E.LAB_STATUSES, "planned"),
    subjectId: optId(),
    startedAt: optDate(),
    completedAt: optDate(),
    tags: tags(),
  }),

  roadmap: z.object({
    title: text(200),
    track: enumOf(E.ROADMAP_TRACKS, "custom"),
    description: optText(),
    color: color(),
  }),

  roadmapItem: z.object({
    roadmapId: z.string().min(1),
    title: text(300),
    description: optText(),
    status: enumOf(E.ROADMAP_ITEM_STATUSES, "todo"),
    resourceUrl: optUrl(),
    notes: optText(),
    sortOrder: num(0),
    completedAt: z.string().nullable().optional().default(null),
  }),

  studySession: z.object({
    subjectId: optId(),
    projectId: optId(),
    taskId: optId(),
    kind: enumOf(E.STUDY_KINDS, "focus"),
    startedAt: z.string().min(1),
    endedAt: z.string().nullable().optional().default(null),
    durationMinutes: int(0, 0, 24 * 60),
    date: dateKey(),
    notes: optText(2000),
  }),
} as const;

export type SchemaName = keyof typeof schemas;

export class ValidationError extends Error {
  code = "validation.failed";
  constructor(public issues: { path: string; message: string }[]) {
    super(issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  }
}

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const res = schema.safeParse(input);
  if (!res.success) {
    throw new ValidationError(
      res.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message.startsWith("validation.") ? i.message : mapIssue(i),
      })),
    );
  }
  return res.data;
}

function mapIssue(i: z.core.$ZodIssue): string {
  switch (i.code) {
    case "too_small":
      return "validation.required";
    case "too_big":
      return "validation.tooLong";
    case "invalid_type":
      return i.expected === "number" ? "validation.number" : "validation.required";
    case "invalid_value":
      return "validation.invalidOption";
    case "invalid_format":
      return "validation.format";
    default:
      return "validation.invalid";
  }
}
