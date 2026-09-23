import type * as E from "./enums";

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkRef {
  title: string;
  url: string;
}

export interface GradingScale extends BaseEntity {
  name: string;
  kind: E.ScaleKind;
  maxPoints: number;
  passMark: number;
  bands: { min: number; label: string; points: number }[];
  isDefault: boolean;
}

export interface Semester extends BaseEntity {
  name: string;
  academicYear: string | null;
  type: E.SemesterType;
  startDate: string | null;
  endDate: string | null;
  status: E.SemesterStatus;
  isCurrent: boolean;
  gradingScaleId: string | null;
  notes: string | null;
}

export interface Subject extends BaseEntity {
  semesterId: string | null;
  name: string;
  code: string | null;
  professor: string | null;
  department: string | null;
  credits: number;
  classroom: string | null;
  color: string | null;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  officeHours: string | null;
  contactNotes: string | null;
  links: LinkRef[];
  gradingScaleId: string | null;
  targetGrade: number | null;
  finalGradeOverride: number | null;
  countsInGpa: boolean;
  attendanceThreshold: number;
  folderRel: string | null;
  status: E.SubjectStatus;
  archived: boolean;
  tags: string[];
}

export interface TimetableEntry extends BaseEntity {
  semesterId: string | null;
  subjectId: string;
  day: number;
  startTime: string;
  endTime: string;
  kind: E.SessionKind;
  room: string | null;
  building: string | null;
  professor: string | null;
  color: string | null;
  notes: string | null;
  recurrence: E.Recurrence;
  specificDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export interface Lecture extends BaseEntity {
  subjectId: string;
  number: number | null;
  title: string;
  date: string | null;
  topic: string | null;
  summary: string | null;
  timetableEntryId: string | null;
}

export interface AttendanceRecord extends BaseEntity {
  subjectId: string;
  lectureId: string | null;
  timetableEntryId: string | null;
  date: string;
  status: E.AttendanceStatus;
  notes: string | null;
}

export interface Note extends BaseEntity {
  title: string;
  content: string | null;
  contentText: string;
  subjectId: string | null;
  lectureId: string | null;
  projectId: string | null;
  noteType: E.NoteType;
  cyberTopic: E.CyberTopic | null;
  lectureDate: string | null;
  status: E.NoteStatus;
  links: LinkRef[];
  pinned: boolean;
  favorite: boolean;
  archived: boolean;
  wordCount: number;
  lastOpenedAt: string | null;
  tags: string[];
}

export interface ContentVersion {
  id: string;
  entityType: string;
  entityId: string;
  title: string | null;
  content: string | null;
  contentText: string | null;
  kind: "auto" | "manual" | "restore";
  label: string | null;
  createdAt: string;
}

export interface FileRecord extends BaseEntity {
  relPath: string;
  name: string;
  ext: string;
  size: number;
  sha256: string | null;
  description: string | null;
  subjectId: string | null;
  projectId: string | null;
  trashedAt: string | null;
  trashRel: string | null;
  lastOpenedAt: string | null;
  tags: string[];
}

export interface TrashItem {
  id: string;
  originalRel: string;
  trashRel: string;
  name: string;
  isDir: boolean;
  size: number;
  fileId: string | null;
  deletedAt: string;
}

export interface Deadline extends BaseEntity {
  title: string;
  type: E.DeadlineType;
  subjectId: string | null;
  projectId: string | null;
  dueDate: string;
  dueTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  priority: E.Priority;
  status: E.DeadlineStatus;
  weight: number | null;
  completedAt: string | null;
  tags: string[];
}

export interface TaskRecurrence {
  freq: E.RecurrenceFreq;
  interval: number;
  /** For weekly: weekday indexes (0 = Saturday … 6 = Friday). */
  weekdays?: number[];
  until?: string | null;
}

export interface Task extends BaseEntity {
  title: string;
  description: string | null;
  subjectId: string | null;
  projectId: string | null;
  deadlineId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: E.Priority;
  status: E.TaskStatus;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  notes: string | null;
  recurrence: TaskRecurrence | null;
  recurrenceParentId: string | null;
  rollover: boolean;
  completedAt: string | null;
  sortOrder: number;
  tags: string[];
}

export interface Subtask extends BaseEntity {
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface AppNotification extends BaseEntity {
  category: E.NotificationCategory;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  dedupeKey: string;
  status: E.NotificationStatus;
  snoozedUntil: string | null;
  osDelivered: boolean;
  triggerAt: string;
}

export interface Project extends BaseEntity {
  name: string;
  description: string | null;
  subjectId: string | null;
  semesterId: string | null;
  professor: string | null;
  startDate: string | null;
  deadline: string | null;
  priority: E.Priority;
  status: E.ProjectStatus;
  progress: number;
  progressMode: E.ProgressMode;
  links: LinkRef[];
  color: string | null;
  folderRel: string | null;
  tags: string[];
}

export interface Milestone extends BaseEntity {
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  done: boolean;
  completedAt: string | null;
  sortOrder: number;
}

export interface ProjectMember extends BaseEntity {
  projectId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
  responsibilities: string | null;
  notes: string | null;
  status: E.MemberStatus;
  isMe: boolean;
}

export interface ActionItem {
  id: string;
  text: string;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
  taskId?: string | null;
}

export interface Meeting extends BaseEntity {
  projectId: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  attendees: string[];
  agenda: string | null;
  notes: string | null;
  decisions: string | null;
  actionItems: ActionItem[];
}

export interface GradeItem extends BaseEntity {
  subjectId: string;
  name: string;
  category: E.GradeCategory;
  weight: number;
  score: number | null;
  maxScore: number;
  status: E.GradeStatus;
  date: string | null;
  notes: string | null;
  deadlineId: string | null;
  sortOrder: number;
}

export interface Question extends BaseEntity {
  text: string;
  subjectId: string | null;
  lectureId: string | null;
  topic: string | null;
  priority: E.Priority;
  status: E.QuestionStatus;
  answer: string | null;
  noteId: string | null;
  fileId: string | null;
  answeredAt: string | null;
  tags: string[];
}

export interface JournalEntry extends BaseEntity {
  date: string;
  mood: number | null;
  energy: number | null;
  studied: string | null;
  completed: string | null;
  learned: string | null;
  notUnderstood: string | null;
  problems: string | null;
  tomorrow: string | null;
  freeText: string | null;
  subjectIds: string[];
  projectIds: string[];
}

export interface ResearchResource extends BaseEntity {
  title: string;
  type: E.ResourceType;
  authors: string | null;
  subjectId: string | null;
  projectId: string | null;
  description: string | null;
  fileId: string | null;
  url: string | null;
  readStatus: E.ReadStatus;
  favorite: boolean;
  notes: string | null;
  citation: string | null;
  year: number | null;
  publisher: string | null;
  tags: string[];
}

export interface Goal extends BaseEntity {
  title: string;
  description: string | null;
  semesterId: string | null;
  deadline: string | null;
  priority: E.Priority;
  progress: number;
  progressMode: E.ProgressMode;
  status: E.GoalStatus;
  category: string | null;
  completedAt: string | null;
  tags: string[];
}

export interface GoalMilestone extends BaseEntity {
  goalId: string;
  title: string;
  done: boolean;
  dueDate: string | null;
  sortOrder: number;
}

export interface Expense extends BaseEntity {
  amount: number;
  currency: string;
  category: E.ExpenseCategory;
  date: string;
  description: string | null;
  subjectId: string | null;
  projectId: string | null;
  semesterId: string | null;
  paymentMethod: E.PaymentMethod;
  receiptFileId: string | null;
}

export interface Whiteboard extends BaseEntity {
  title: string;
  fileRel: string;
  subjectId: string | null;
  projectId: string | null;
  thumbnail: string | null;
  tags: string[];
}

export interface CommandEntry extends BaseEntity {
  title: string | null;
  command: string;
  tool: string | null;
  category: E.CommandCategory;
  platform: E.CommandPlatform;
  language: string;
  explanation: string | null;
  example: string | null;
  expectedOutput: string | null;
  warnings: string | null;
  subjectId: string | null;
  labId: string | null;
  favorite: boolean;
  tags: string[];
}

export interface CtfChallenge extends BaseEntity {
  name: string;
  platform: string | null;
  event: string | null;
  category: E.CtfCategory;
  difficulty: E.CtfDifficulty;
  url: string | null;
  status: E.CtfStatus;
  points: number | null;
  startedAt: string | null;
  completedAt: string | null;
  timeSpentMinutes: number;
  tools: string[];
  hints: string | null;
  solutionNotes: string | null;
  writeup: string | null;
  writeupText: string;
  flag: string | null;
  tags: string[];
}

export interface CyberLab extends BaseEntity {
  name: string;
  objective: string | null;
  environment: string | null;
  tools: string[];
  steps: string | null;
  findings: string | null;
  errors: string | null;
  lessons: string | null;
  referencesText: string | null;
  status: E.LabStatus;
  subjectId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  tags: string[];
}

export interface Roadmap extends BaseEntity {
  title: string;
  track: E.RoadmapTrack;
  description: string | null;
  color: string | null;
}

export interface RoadmapItem extends BaseEntity {
  roadmapId: string;
  title: string;
  description: string | null;
  status: E.RoadmapItemStatus;
  resourceUrl: string | null;
  notes: string | null;
  sortOrder: number;
  completedAt: string | null;
}

export interface StudySession extends BaseEntity {
  subjectId: string | null;
  projectId: string | null;
  taskId: string | null;
  kind: E.StudyKind;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  date: string;
  notes: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface EntityLink {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relation: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  entityType: string;
  entityId: string;
  offsetMinutes: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: "create" | "update" | "delete" | "restore";
  summary: string | null;
  createdAt: string;
}
