/**
 * Core entry point: builds every service on top of a Database and FileSystem port.
 * This module has no dependency on React or Tauri and can be reused by a mobile client.
 */
import type { Database } from "./db/types";
import type { FileSystemPort } from "./ports";
import { createRepos } from "./repo";
import { newId } from "./utils/id";
import { systemClock, type Clock } from "./utils/clock";
import type { ServiceContext } from "./services/context";
import { createSemesterService } from "./services/semesters";
import { createSubjectService } from "./services/subjects";
import { createTimetableService } from "./services/timetable";
import { createNoteService, createVersionService } from "./services/notes";
import { createTaskService } from "./services/tasks";
import { createDeadlineService } from "./services/deadlines";
import { createFileService } from "./services/files";
import { createGradeService } from "./services/grades";
import { createProjectService, createGoalService, createLinkService } from "./services/projects";
import { createNotificationService } from "./services/notifications";
import { createAnalyticsService } from "./services/analytics";
import { createJournalService, createStudyService, createTagService, createRecentService, createAuditService, createExpenseService } from "./services/misc";
import { createDataIoService } from "./services/dataio";
import { createKvService } from "./services/kv";
import { searchAll, rebuildSearchIndex, type SearchFilters } from "./search/search";
import { runMigrations, pendingMigrations } from "./db/migrations";

export function createServices(opts: { db: Database; fs: FileSystemPort; clock?: Clock; idFactory?: () => string }) {
  const base = { db: opts.db, clock: opts.clock ?? systemClock, newId: opts.idFactory ?? newId };
  const repos = createRepos(base);
  const ctx: ServiceContext = { ...base, repos, fs: opts.fs };
  return {
    ctx,
    db: opts.db,
    repos,
    kv: createKvService(ctx),
    semesters: createSemesterService(ctx),
    subjects: createSubjectService(ctx),
    timetable: createTimetableService(ctx),
    notes: createNoteService(ctx),
    versions: createVersionService(ctx),
    tasks: createTaskService(ctx),
    deadlines: createDeadlineService(ctx),
    files: createFileService(ctx),
    grades: createGradeService(ctx),
    projects: createProjectService(ctx),
    goals: createGoalService(ctx),
    links: createLinkService(ctx),
    notifications: createNotificationService(ctx),
    analytics: createAnalyticsService(ctx),
    journal: createJournalService(ctx),
    study: createStudyService(ctx),
    tags: createTagService(ctx),
    recent: createRecentService(ctx),
    audit: createAuditService(ctx),
    expenses: createExpenseService(ctx),
    dataio: createDataIoService(ctx),
    search: (q: string, f?: SearchFilters) => searchAll(opts.db, q, f),
    rebuildSearchIndex: () => rebuildSearchIndex(opts.db, repos),
    migrate: () => runMigrations(opts.db),
    pendingMigrations: () => pendingMigrations(opts.db),
  };
}

export type Services = ReturnType<typeof createServices>;
