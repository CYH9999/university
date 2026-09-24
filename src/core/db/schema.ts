/**
 * Schema migration v1. Conventions:
 *  - `id` TEXT UUID primary keys (portable, sync-friendly)
 *  - `created_at` / `updated_at` ISO-8601 UTC timestamps
 *  - calendar dates as local "YYYY-MM-DD", times as "HH:mm"
 *  - booleans as INTEGER 0/1, lists/objects as JSON TEXT
 *  - polymorphic relations (tags, file links, reminders, versions, links) use
 *    (entity_type, entity_id) and are cleaned up by the repository layer.
 */
export const SCHEMA_V1 = /* sql */ `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE grading_scales (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percentage','gpa4','gpa5','custom')),
  max_points REAL NOT NULL DEFAULT 4,
  pass_mark REAL NOT NULL DEFAULT 50,
  bands TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE semesters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT,
  type TEXT NOT NULL DEFAULT 'first',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed','archived')),
  is_current INTEGER NOT NULL DEFAULT 0,
  grading_scale_id TEXT REFERENCES grading_scales(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_semesters_status ON semesters(status);

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  professor TEXT,
  department TEXT,
  credits REAL NOT NULL DEFAULT 0,
  classroom TEXT,
  color TEXT,
  description TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  office_hours TEXT,
  contact_notes TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  grading_scale_id TEXT REFERENCES grading_scales(id) ON DELETE SET NULL,
  target_grade REAL,
  final_grade_override REAL,
  counts_in_gpa INTEGER NOT NULL DEFAULT 1,
  attendance_threshold REAL NOT NULL DEFAULT 25,
  folder_rel TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_subjects_semester ON subjects(semester_id);

CREATE TABLE timetable_entries (
  id TEXT PRIMARY KEY,
  semester_id TEXT REFERENCES semesters(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'lecture',
  room TEXT,
  building TEXT,
  professor TEXT,
  color TEXT,
  notes TEXT,
  recurrence TEXT NOT NULL DEFAULT 'weekly',
  specific_date TEXT,
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_timetable_semester_day ON timetable_entries(semester_id, day);
CREATE INDEX idx_timetable_subject ON timetable_entries(subject_id);

CREATE TABLE lectures (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  number INTEGER,
  title TEXT NOT NULL,
  date TEXT,
  topic TEXT,
  summary TEXT,
  timetable_entry_id TEXT REFERENCES timetable_entries(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_lectures_subject ON lectures(subject_id, date);

CREATE TABLE attendance_records (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL,
  timetable_entry_id TEXT REFERENCES timetable_entries(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_attendance_subject ON attendance_records(subject_id, date);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  professor TEXT,
  start_date TEXT,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'planning',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_mode TEXT NOT NULL DEFAULT 'tasks',
  links TEXT NOT NULL DEFAULT '[]',
  color TEXT,
  folder_rel TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_subject ON projects(subject_id);

CREATE TABLE project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_milestones_project ON project_milestones(project_id);

CREATE TABLE project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  contact TEXT,
  responsibilities TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_me INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_members_project ON project_members(project_id);

CREATE TABLE project_meetings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  location TEXT,
  attendees TEXT NOT NULL DEFAULT '[]',
  agenda TEXT,
  notes TEXT,
  decisions TEXT,
  action_items TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_meetings_project ON project_meetings(project_id, date);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  content_text TEXT NOT NULL DEFAULT '',
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  note_type TEXT NOT NULL DEFAULT 'lecture',
  cyber_topic TEXT,
  lecture_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  links TEXT NOT NULL DEFAULT '[]',
  pinned INTEGER NOT NULL DEFAULT 0,
  favorite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  word_count INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notes_subject ON notes(subject_id, updated_at);
CREATE INDEX idx_notes_updated ON notes(archived, pinned, updated_at);
CREATE INDEX idx_notes_cyber ON notes(cyber_topic);

CREATE TABLE content_versions (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  content_text TEXT,
  kind TEXT NOT NULL DEFAULT 'auto' CHECK (kind IN ('auto','manual','restore')),
  label TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_versions_entity ON content_versions(entity_type, entity_id, created_at);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  ext TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT,
  description TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  trashed_at TEXT,
  trash_rel TEXT,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_files_path ON files(rel_path);
CREATE INDEX idx_files_subject ON files(subject_id);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_sha ON files(sha256);

CREATE TABLE file_links (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (file_id, entity_type, entity_id)
);
CREATE INDEX idx_file_links_entity ON file_links(entity_type, entity_id);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL UNIQUE,
  color TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE trash_items (
  id TEXT PRIMARY KEY,
  original_rel TEXT NOT NULL,
  trash_rel TEXT NOT NULL,
  name TEXT NOT NULL,
  is_dir INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  file_id TEXT,
  deleted_at TEXT NOT NULL
);

CREATE TABLE deadlines (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'assignment',
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  due_date TEXT NOT NULL,
  due_time TEXT,
  end_time TEXT,
  location TEXT,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  weight REAL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_deadlines_due ON deadlines(due_date, status);
CREATE INDEX idx_deadlines_subject ON deadlines(subject_id);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  offset_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, offset_minutes)
);

CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  deadline TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_mode TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'active',
  category TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE goal_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  deadline_id TEXT REFERENCES deadlines(id) ON DELETE SET NULL,
  goal_id TEXT REFERENCES goals(id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES project_milestones(id) ON DELETE SET NULL,
  assignee_id TEXT REFERENCES project_members(id) ON DELETE SET NULL,
  due_date TEXT,
  due_time TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'inbox',
  estimate_minutes INTEGER,
  actual_minutes INTEGER,
  notes TEXT,
  recurrence TEXT,
  recurrence_parent_id TEXT,
  rollover INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_tasks_due ON tasks(status, due_date);
CREATE INDEX idx_tasks_subject ON tasks(subject_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_goal ON tasks(goal_id);

CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_subtasks_task ON subtasks(task_id);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  route TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unread',
  snoozed_until TEXT,
  os_delivered INTEGER NOT NULL DEFAULT 0,
  trigger_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_status ON notifications(status, trigger_at);

CREATE TABLE grade_items (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'assignment',
  weight REAL NOT NULL DEFAULT 0,
  score REAL,
  max_score REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('actual','estimated','missing')),
  date TEXT,
  notes TEXT,
  deadline_id TEXT REFERENCES deadlines(id) ON DELETE SET NULL,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_grades_subject ON grade_items(subject_id);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  lecture_id TEXT REFERENCES lectures(id) ON DELETE SET NULL,
  topic TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'unresolved',
  answer TEXT,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  answered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_questions_status ON questions(status);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  mood INTEGER,
  energy INTEGER,
  studied TEXT,
  completed TEXT,
  learned TEXT,
  not_understood TEXT,
  problems TEXT,
  tomorrow TEXT,
  free_text TEXT,
  subject_ids TEXT NOT NULL DEFAULT '[]',
  project_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE research_resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'pdf',
  authors TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  description TEXT,
  file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  url TEXT,
  read_status TEXT NOT NULL DEFAULT 'unread',
  favorite INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  citation TEXT,
  year INTEGER,
  publisher TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_resources_subject ON research_resources(subject_id);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'IQD',
  category TEXT NOT NULL DEFAULT 'other',
  date TEXT NOT NULL,
  description TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  semester_id TEXT REFERENCES semesters(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  receipt_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_expenses_date ON expenses(date);

CREATE TABLE whiteboards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  file_rel TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  thumbnail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cyber_labs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  objective TEXT,
  environment TEXT,
  tools TEXT NOT NULL DEFAULT '[]',
  steps TEXT,
  findings TEXT,
  errors TEXT,
  lessons TEXT,
  references_text TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE commands (
  id TEXT PRIMARY KEY,
  title TEXT,
  command TEXT NOT NULL,
  tool TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  platform TEXT NOT NULL DEFAULT 'linux',
  language TEXT NOT NULL DEFAULT 'bash',
  explanation TEXT,
  example TEXT,
  expected_output TEXT,
  warnings TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  lab_id TEXT REFERENCES cyber_labs(id) ON DELETE SET NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_commands_tool ON commands(tool);

CREATE TABLE ctf_challenges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT,
  event TEXT,
  category TEXT NOT NULL DEFAULT 'misc',
  difficulty TEXT NOT NULL DEFAULT 'easy',
  url TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  points INTEGER,
  started_at TEXT,
  completed_at TEXT,
  time_spent_minutes INTEGER NOT NULL DEFAULT 0,
  tools TEXT NOT NULL DEFAULT '[]',
  hints TEXT,
  solution_notes TEXT,
  writeup TEXT,
  writeup_text TEXT NOT NULL DEFAULT '',
  flag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_ctf_status ON ctf_challenges(status);

CREATE TABLE roadmaps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  track TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE roadmap_items (
  id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  resource_url TEXT,
  notes TEXT,
  sort_order REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_roadmap_items ON roadmap_items(roadmap_id, sort_order);

CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'focus',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_study_date ON study_sessions(date);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE entity_tags (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_type, entity_id, tag_id)
);
CREATE INDEX idx_entity_tags_tag ON entity_tags(tag_id);

CREATE TABLE entity_links (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (source_type, source_id, target_type, target_id)
);
CREATE INDEX idx_links_target ON entity_links(target_type, target_id);

CREATE TABLE recent_items (
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- Full-text search over every searchable entity. The trigram tokenizer gives
-- substring matching that works for Arabic and English alike; text is normalized
-- (diacritics, alef/yaa variants, case) by the application before indexing.
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  subject_id UNINDEXED,
  date UNINDEXED,
  display_title UNINDEXED,
  raw_body UNINDEXED,
  title,
  body,
  tags,
  tokenize = 'trigram'
);
`;
