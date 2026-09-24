/**
 * Enumerations shared by the schema, validation, UI and translations.
 * Every value has a translation key `enums.<name>.<value>`.
 */
export const SEMESTER_TYPES = ["first", "second", "summer", "fall", "spring", "winter", "annual", "other"] as const;
export const SEMESTER_STATUSES = ["upcoming", "active", "completed", "archived"] as const;
export const SUBJECT_STATUSES = ["active", "completed", "dropped"] as const;
export const SESSION_KINDS = ["lecture", "lab", "tutorial", "seminar", "exam", "other"] as const;
export const RECURRENCES = ["weekly", "biweekly_a", "biweekly_b", "once"] as const;
export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;

export const NOTE_TYPES = [
  "lecture",
  "summary",
  "revision",
  "research",
  "cyber_concept",
  "lab",
  "ctf_writeup",
  "personal",
  "exam_prep",
] as const;
export const NOTE_STATUSES = ["draft", "in_progress", "complete", "needs_review"] as const;

export const CYBER_TOPICS = [
  "security_concepts",
  "networking",
  "linux",
  "cryptography",
  "web_security",
  "digital_forensics",
  "malware_analysis",
  "reverse_engineering",
  "blue_team",
  "soc",
  "penetration_testing",
  "incident_response",
] as const;

export const DEADLINE_TYPES = ["exam", "quiz", "assignment", "project", "presentation", "report", "other"] as const;
export const DEADLINE_STATUSES = ["pending", "in_progress", "submitted", "completed", "missed", "cancelled"] as const;
export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const TASK_STATUSES = ["inbox", "planned", "in_progress", "waiting", "completed", "cancelled"] as const;
export const RECURRENCE_FREQS = ["daily", "weekly", "monthly"] as const;

export const NOTIFICATION_CATEGORIES = [
  "lecture",
  "exam",
  "assignment",
  "project",
  "task",
  "goal",
  "attendance",
  "backup",
  "file",
  "workspace",
  "system",
] as const;
export const NOTIFICATION_STATUSES = ["unread", "read", "archived"] as const;

export const PROJECT_STATUSES = ["idea", "planning", "in_progress", "review", "submitted", "completed", "archived"] as const;
export const PROGRESS_MODES = ["manual", "tasks", "milestones"] as const;
export const MEMBER_STATUSES = ["active", "done", "inactive"] as const;

export const GRADE_CATEGORIES = ["assignment", "quiz", "midterm", "final", "participation", "lab", "project", "other"] as const;
export const GRADE_STATUSES = ["actual", "estimated", "missing"] as const;
export const SCALE_KINDS = ["percentage", "gpa4", "gpa5", "custom"] as const;

export const QUESTION_STATUSES = ["unresolved", "researching", "answered", "reviewed"] as const;

export const RESOURCE_TYPES = [
  "pdf",
  "book",
  "article",
  "website",
  "video",
  "documentation",
  "repository",
  "course",
  "paper",
  "lecture_material",
] as const;
export const READ_STATUSES = ["unread", "reading", "read", "reference"] as const;

export const GOAL_STATUSES = ["not_started", "active", "paused", "completed", "abandoned"] as const;

export const EXPENSE_CATEGORIES = [
  "transportation",
  "printing",
  "books",
  "courses",
  "equipment",
  "food",
  "project_materials",
  "university_fees",
  "software",
  "other",
] as const;
export const PAYMENT_METHODS = ["cash", "card", "transfer", "mobile_wallet", "other"] as const;
export const CURRENCIES = ["IQD", "USD", "EUR", "GBP", "TRY", "SAR", "AED", "JOD"] as const;

export const COMMAND_PLATFORMS = ["linux", "windows", "macos", "cross_platform", "network_device"] as const;
export const COMMAND_CATEGORIES = [
  "recon",
  "scanning",
  "enumeration",
  "web",
  "exploitation",
  "privilege_escalation",
  "post_exploitation",
  "forensics",
  "networking",
  "crypto",
  "system_admin",
  "defense",
  "scripting",
  "other",
] as const;

export const CTF_CATEGORIES = [
  "web",
  "crypto",
  "forensics",
  "reversing",
  "pwn",
  "osint",
  "networking",
  "stego",
  "misc",
] as const;
export const CTF_DIFFICULTIES = ["easy", "medium", "hard", "insane"] as const;
export const CTF_STATUSES = ["todo", "in_progress", "solved", "revisit", "gave_up"] as const;

export const LAB_STATUSES = ["planned", "in_progress", "completed", "blocked"] as const;

export const ROADMAP_TRACKS = [
  "linux",
  "networking",
  "web_security",
  "cryptography",
  "digital_forensics",
  "soc",
  "penetration_testing",
  "malware_analysis",
  "reverse_engineering",
  "custom",
] as const;
export const ROADMAP_ITEM_STATUSES = ["todo", "in_progress", "done", "skipped"] as const;

export const STUDY_KINDS = ["focus", "review", "reading", "lab", "ctf", "project"] as const;

/** Every entity that can be searched, tagged, linked or attached to. */
export const ENTITY_TYPES = [
  "semester",
  "subject",
  "timetable",
  "lecture",
  "note",
  "file",
  "deadline",
  "task",
  "project",
  "milestone",
  "member",
  "meeting",
  "grade",
  "question",
  "journal",
  "resource",
  "goal",
  "expense",
  "whiteboard",
  "command",
  "ctf",
  "lab",
  "roadmap",
  "roadmap_item",
  "study_session",
  "attendance",
] as const;

export type SemesterType = (typeof SEMESTER_TYPES)[number];
export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];
export type SubjectStatus = (typeof SUBJECT_STATUSES)[number];
export type SessionKind = (typeof SESSION_KINDS)[number];
export type Recurrence = (typeof RECURRENCES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type NoteType = (typeof NOTE_TYPES)[number];
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export type CyberTopic = (typeof CYBER_TOPICS)[number];
export type DeadlineType = (typeof DEADLINE_TYPES)[number];
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type ProgressMode = (typeof PROGRESS_MODES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
export type GradeCategory = (typeof GRADE_CATEGORIES)[number];
export type GradeStatus = (typeof GRADE_STATUSES)[number];
export type ScaleKind = (typeof SCALE_KINDS)[number];
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type ReadStatus = (typeof READ_STATUSES)[number];
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type CommandPlatform = (typeof COMMAND_PLATFORMS)[number];
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];
export type CtfCategory = (typeof CTF_CATEGORIES)[number];
export type CtfDifficulty = (typeof CTF_DIFFICULTIES)[number];
export type CtfStatus = (typeof CTF_STATUSES)[number];
export type LabStatus = (typeof LAB_STATUSES)[number];
export type RoadmapTrack = (typeof ROADMAP_TRACKS)[number];
export type RoadmapItemStatus = (typeof ROADMAP_ITEM_STATUSES)[number];
export type StudyKind = (typeof STUDY_KINDS)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];

/** All enums by name, used by the UI to build select options and by i18n completeness tests. */
export const ENUMS = {
  semesterType: SEMESTER_TYPES,
  semesterStatus: SEMESTER_STATUSES,
  subjectStatus: SUBJECT_STATUSES,
  sessionKind: SESSION_KINDS,
  recurrence: RECURRENCES,
  attendanceStatus: ATTENDANCE_STATUSES,
  noteType: NOTE_TYPES,
  noteStatus: NOTE_STATUSES,
  cyberTopic: CYBER_TOPICS,
  deadlineType: DEADLINE_TYPES,
  deadlineStatus: DEADLINE_STATUSES,
  priority: PRIORITIES,
  taskStatus: TASK_STATUSES,
  recurrenceFreq: RECURRENCE_FREQS,
  notificationCategory: NOTIFICATION_CATEGORIES,
  projectStatus: PROJECT_STATUSES,
  progressMode: PROGRESS_MODES,
  memberStatus: MEMBER_STATUSES,
  gradeCategory: GRADE_CATEGORIES,
  gradeStatus: GRADE_STATUSES,
  scaleKind: SCALE_KINDS,
  questionStatus: QUESTION_STATUSES,
  resourceType: RESOURCE_TYPES,
  readStatus: READ_STATUSES,
  goalStatus: GOAL_STATUSES,
  expenseCategory: EXPENSE_CATEGORIES,
  paymentMethod: PAYMENT_METHODS,
  commandPlatform: COMMAND_PLATFORMS,
  commandCategory: COMMAND_CATEGORIES,
  ctfCategory: CTF_CATEGORIES,
  ctfDifficulty: CTF_DIFFICULTIES,
  ctfStatus: CTF_STATUSES,
  labStatus: LAB_STATUSES,
  roadmapTrack: ROADMAP_TRACKS,
  roadmapItemStatus: ROADMAP_ITEM_STATUSES,
  studyKind: STUDY_KINDS,
  entityType: ENTITY_TYPES,
} as const;

export type EnumName = keyof typeof ENUMS;
