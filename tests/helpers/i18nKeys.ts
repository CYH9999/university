/** Collects the translation keys the UI needs (static, literal, form fields and dynamic expansions). */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error — plain JS build script (no type declarations)
import { collect } from "../../scripts/i18n-keys.mjs";
import { en } from "@/i18n/en";
import { ar } from "@/i18n/ar";
import { ENUMS, ENTITY_TYPES } from "@/core/model/enums";
import { EXPORT_MODULES, EXPORT_TABLES } from "@/core/services/dataio";
import { WORKSPACE_ROOTS, SUBJECT_SUBFOLDERS } from "@/core/services/files";
import { GRADE_TEMPLATES } from "@/core/templates";
import { schemas } from "@/core/validation/schemas";

export type Dict = Record<string, unknown>;
const root = join(import.meta.dirname, "..", "..");
export const PLURAL = /_(zero|one|two|few|many|other)$/;
export const EN_FORMS = ["one", "other"];
export const AR_FORMS = ["zero", "one", "two", "few", "many", "other"];

export function flatten(d: Dict, prefix = "", out = new Map<string, string>()) {
  for (const [k, v] of Object.entries(d)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v as Dict, key, out);
    else out.set(key, String(v));
  }
  return out;
}
export const EN = flatten(en);
export const AR = flatten(ar);
export const base = (k: string) => k.replace(PLURAL, "");
export const baseKeys = (m: Map<string, string>) => new Set([...m.keys()].map(base));
export const placeholders = (s: string) => new Set([...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]));

/** Values behind dynamic keys such as t(`enums.priority.${p}`), per pattern. */
function expansions(literals: Set<string>): Record<string, string[]> {
  const rust = readdirSync(join(root, "src-tauri/src"))
    .filter((f) => f.endsWith(".rs"))
    .map((f) => readFileSync(join(root, "src-tauri/src", f), "utf8"))
    .join("\n");
  const coreTs = ["src/core/db/migrations.ts", "src/core/repo/repository.ts", "src/features/data/DataPage.tsx"].map((f) => readFileSync(join(root, f), "utf8")).join("\n");
  const codes = new Set<string>([
    ...[...rust.matchAll(/coded\("([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]),
    ...[...rust.matchAll(/=> "((?:io|db|json|backup)\.[a-z_]+)"/g)].map((m) => m[1]),
    ...[...rust.matchAll(/^\s+"((?:io|db|json|backup)\.[a-z_]+)"$/gm)].map((m) => m[1]),
    ...[...coreTs.matchAll(/code: "([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]),
  ]);
  const entities = readFileSync(join(root, "src/core/repo/entities.ts"), "utf8");
  const entityTypes = new Set<string>([...ENTITY_TYPES, ...[...entities.matchAll(/^\s+type: "([a-z_]+)",\n\s+table:/gm)].map((m) => m[1])]);
  const schemaFields = new Set<string>();
  for (const s of Object.values(schemas)) {
    const shape = (s as unknown as { shape?: Record<string, unknown> }).shape;
    if (shape) Object.keys(shape).forEach((k) => schemaFields.add(k));
  }
  const notif = [...literals].filter((k) => /^notif\.\w+$/.test(k) && !["notif.atTime", "notif.inRoom"].includes(k)).map((k) => k.slice(6));
  const workspaceStatuses = ["ok", "not_configured", "missing", "not_directory", "not_readable", "not_writable", "not_a_workspace", "manifest_corrupt", "newer_version", "database_missing", "database_corrupt"];
  const enumKeys = Object.entries(ENUMS).flatMap(([n, vals]) => (vals as readonly string[]).map((v) => `${n}.${v}`));
  const one = (name: string) => Object.fromEntries((ENUMS as Record<string, readonly string[]>)[name].map((v) => [v, v]));
  return {
    "*.title": notif.map((n) => `notif.${n}`),
    "*.body": notif.map((n) => `notif.${n}`),
    "attendance.level.*": ["warning", "exceeded"],
    "backup.kind.*": ["full", "database", "attachments"],
    "boot.step.*": ["database", "safety", "migrate", "settings"],
    "dashboard.widgets.*": ["today", "nextLecture", "quickActions", "todayLectures", "deadlines", "tasksToday", "overdue", "questions", "recentNotes", "recentFiles", "projects", "goals", "attendance", "gpa", "study", "notifications"],
    "data.*Hint": ["merge", "replace"],
    "data.errors.*": ["notObject", "wrongFormat", "newerSchema", "noTables", "unknownTable", "badRows"],
    "data.modules.*": Object.keys(EXPORT_MODULES),
    "data.tables.*": [...EXPORT_TABLES],
    "deadlines.emptyViews.*": ["upcoming", "overdue", "completed", "all"],
    "deadlines.views.*": ["upcoming", "overdue", "completed", "all"],
    "entity.*": [...entityTypes],
    "enums.*.*": enumKeys,
    "errors.*": [...codes].map((c) => c.replace(/\./g, "_")),
    "fields.*": [...schemaFields, "steps", "findings", "errors", "lessons", "referencesText"],
    "files.groups.*": ["all", "pdf", "document", "presentation", "spreadsheet", "image", "archive", "code", "media", "capture", "other"],
    "files.roots.*": [...WORKSPACE_ROOTS, "Trash"].map((r) => r.replace(/ /g, "")),
    "files.subjectFolders.*": [...SUBJECT_SUBFOLDERS],
    "grades.states.*": ["final", "in_progress", "none"],
    "grades.templates.*": Object.keys(GRADE_TEMPLATES),
    "grades.builtinScales.*": ["percentage", "gpa4", "gpa5"],
    "journal.fields.*": ["studied", "completed", "learned", "notUnderstood", "problems", "tomorrow"],
    "journal.placeholders.*": ["studied", "completed", "learned", "notUnderstood", "problems", "tomorrow"],
    "labs.placeholders.*": ["steps", "findings", "errors", "lessons", "referencesText"],
    "onboarding.*": ["storage1", "storage2", "storage3", "storage4"],
    "onboarding.tour.*.title": ["dashboard", "subjects", "notes", "files", "cyber", "search", "backup"],
    "onboarding.tour.*.body": ["dashboard", "subjects", "notes", "files", "cyber", "search", "backup"],
    "projects.tabs.*": ["overview", "board", "timeline", "tasks", "milestones", "deadlines", "files", "team", "meetings", "notes", "research"],
    "projects.timeline.kinds.*": ["start", "deadline", "milestone", "meeting", "task"],
    "quick.*": ["note", "task", "exam", "assignment", "subject", "upload", "project", "expense", "cyberNote", "study"],
    "recovery.reason.*": workspaceStatuses,
    "workspace.status.*": workspaceStatuses,
    "recurrence.unit.*": Object.keys(one("recurrenceFreq")),
    "settings.*": ["privacy1", "privacy2", "privacy3", "privacy4", "privacy5"],
    "settings.actions.*": ["create", "update", "delete", "restore"],
    "settings.tabs.*": ["general", "workspace", "notifications", "grading", "tags", "maintenance", "privacy"],
    "settings.themes.*": ["dark", "light", "system"],
    "subjects.tabs.*": ["overview", "lectures", "notes", "files", "assignments", "exams", "tasks", "questions", "grades", "attendance", "resources", "projects"],
    "tasks.emptyViews.*": ["today", "week", "upcoming", "overdue", "inbox", "all", "completed"],
    "tasks.views.*": ["today", "week", "upcoming", "overdue", "inbox", "all", "completed"],
    "versions.kinds.*": ["auto", "manual", "restore"],
    "units.*": ["bytes", "kb", "mb", "gb", "tb"],
  };
}

export interface Required {
  keys: Set<string>;
  plural: Set<string>;
  unexpandedPatterns: string[];
}

export function requiredKeys(): Required {
  const { keys, patterns, literals, fields } = collect();
  const litSet = new Set<string>(literals.keys());
  const out = new Set<string>();
  const plural = new Set<string>();
  for (const [k, v] of keys as Map<string, { params: Set<string> }>) {
    out.add(k);
    if (v.params.has("count")) plural.add(k);
  }
  // Key-shaped literals whose namespace is a translation namespace (skips SQL aliases, file names…).
  const namespaces = new Set([...EN.keys(), ...(keys as Map<string, unknown>).keys()].map((k) => k.split(".")[0]));
  for (const k of litSet) if (namespaces.has(k.split(".")[0]) && !/^(db|import|json)\./.test(k)) out.add(k);
  for (const k of fields.keys()) out.add(k);
  const exp = expansions(litSet);
  const unexpanded: string[] = [];
  for (const p of patterns.keys() as Iterable<string>) {
    const enumName = /^enums\.(\w+)\.\*$/.exec(p)?.[1];
    const vals = exp[p] ?? (enumName && enumName in ENUMS ? [...(ENUMS as Record<string, readonly string[]>)[enumName]] : undefined);
    if (!vals) {
      unexpanded.push(p);
      continue;
    }
    for (const v of vals) {
      // "enums.*.*" takes "name.value" pairs; single-star patterns take the value as is.
      if ((p.match(/\*/g) ?? []).length === 2) {
        const i = v.indexOf(".");
        out.add(p.replace("*", v.slice(0, i)).replace("*", v.slice(i + 1)));
      } else out.add(p.replace("*", v));
    }
  }
  // Literals that are compared against error codes, not translated.
  out.delete("workspace.already_exists");
  // A literal used as a key prefix (notification "notif.x" → "notif.x.title") is not a key itself.
  for (const k of [...out]) if ([...out].some((o) => o.startsWith(`${k}.`))) out.delete(k);
  // Notification bodies/titles that pluralize.
  for (const k of ["notif.tasksOverdue", "notif.tasksToday", "notif.filesMissing", "notif.deadlineReminder", "notif.projectDeadline", "notif.projectOverdue", "notif.goalDeadline", "notif.backupOld"]) plural.add(`${k}.body`);
  // Keys that only exist with a context suffix ("…_today") are checked separately.
  return { keys: out, plural, unexpandedPatterns: unexpanded };
}

