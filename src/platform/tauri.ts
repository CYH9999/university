/**
 * Desktop platform bridge: typed wrappers around the Rust commands and Tauri plugins.
 * The rest of the UI talks to the platform only through this module.
 */
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Database, SqlValue, Statement, Row } from "@/core/db/types";
import type { FileSystemPort, DirEntry, FileStat, ImportedFile } from "@/core/ports";

export class PlatformError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function toError(e: unknown): PlatformError {
  if (e instanceof PlatformError) return e;
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    return new PlatformError(String((e as { code: unknown }).code), String((e as { message: unknown }).message));
  }
  return new PlatformError("unknown", e instanceof Error ? e.message : String(e));
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw toError(e);
  }
}

// ---------------------------------------------------------------- database
export const tauriDb: Database = {
  query: <T = Row>(sql: string, params: SqlValue[] = []) => call<T[]>("db_query", { sql, params }),
  execute: (sql: string, params: SqlValue[] = []) => call<number>("db_execute", { sql, params }),
  batch: async (statements: Statement[]) =>
    (await call<{ changes: number[] }>("db_batch", { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [], script: !!s.script })) }))
      .changes,
};

// ---------------------------------------------------------------- filesystem
export const tauriFs: FileSystemPort = {
  importFiles: (sources, destRel) => call<ImportedFile[]>("fs_import_files", { sources, destRel }),
  ensureDir: (rel) => call<string>("fs_ensure_dir", { rel }),
  createDir: (parentRel, name) => call<string>("fs_create_dir", { parentRel, name }),
  listDir: (rel) => call<DirEntry[]>("fs_list_dir", { rel }),
  rename: (rel, newName) => call<string>("fs_rename", { rel, newName }),
  move: (rel, destDirRel) => call<string>("fs_move", { rel, destDirRel }),
  copy: (rel, destDirRel) => call<string>("fs_copy", { rel, destDirRel }),
  trash: (rel) => call<string>("fs_trash", { rel }),
  restore: (trashRel, originalRel) => call<string>("fs_restore", { trashRel, originalRel }),
  deletePermanent: (trashRel) => call<void>("fs_delete_permanent", { trashRel }),
  emptyTrash: () => call<number>("fs_empty_trash"),
  statMany: (rels) => call<FileStat[]>("fs_stat_many", { rels }),
  writeText: (rel, content) => call<string>("fs_write_text", { rel, content }),
  readText: (rel) => call<string>("fs_read_text", { rel }),
  hash: (rel) => call<string>("fs_hash", { rel }),
  hashExternal: (path) => call<string>("fs_hash_external", { path }),
};

// ---------------------------------------------------------------- workspace
export interface WorkspaceManifest {
  format: string;
  formatVersion: number;
  id: string;
  name: string;
  createdAt: string;
  appVersion: string;
}

export type WorkspaceStatus =
  | "ok"
  | "not_configured"
  | "missing"
  | "not_directory"
  | "not_readable"
  | "not_writable"
  | "not_a_workspace"
  | "manifest_corrupt"
  | "newer_version"
  | "database_missing"
  | "database_corrupt";

export interface WorkspaceCheck {
  status: WorkspaceStatus;
  path: string | null;
  manifest: WorkspaceManifest | null;
  detail: string | null;
  backups: string[];
  repairedFolders: string[];
}

export interface WorkspaceInfo {
  path: string;
  manifest: WorkspaceManifest | null;
  dbSize: number;
  dbOpen: boolean;
}

export interface IntegrityReport {
  structure: WorkspaceCheck;
  databaseProblems: string[];
  repairedFolders: string[];
}

export interface Pointer {
  lastPath: string | null;
  recent: string[];
  ui: Record<string, unknown>;
}

export const workspaceApi = {
  startup: () => call<WorkspaceCheck>("workspace_startup"),
  check: (path: string) => call<WorkspaceCheck>("workspace_check", { path }),
  open: (path: string) => call<WorkspaceCheck>("workspace_open", { path }),
  create: (path: string, name: string, allowNonEmpty: boolean) => call<WorkspaceCheck>("workspace_create", { path, name, allowNonEmpty }),
  initDatabase: (path: string) => call<WorkspaceCheck>("workspace_init_database", { path }),
  close: () => call<void>("workspace_close"),
  info: () => call<WorkspaceInfo>("workspace_info"),
  validate: () => call<IntegrityReport>("workspace_validate"),
  rename: (name: string) => call<WorkspaceManifest>("workspace_rename", { name }),
  reveal: () => call<void>("workspace_reveal"),
  isDirEmpty: (path: string) => call<boolean>("path_is_dir_empty", { path }),
};

export const pointerApi = {
  read: () => call<Pointer>("pointer_read"),
  setUi: (ui: Record<string, unknown>) => call<void>("pointer_set_ui", { ui }),
  forget: (path: string) => call<void>("pointer_forget", { path }),
};

export const settingsApi = {
  read: () => call<Record<string, unknown>>("settings_read"),
  write: (settings: Record<string, unknown>) => call<void>("settings_write", { settings }),
};

export const logApi = {
  write: (level: "info" | "warn" | "error", message: string) => call<void>("log_write", { level, message }).catch(() => undefined),
  read: () => call<string>("log_read"),
};

// ---------------------------------------------------------------- open / reveal
export const openApi = {
  /** URL for previewing a workspace file (images, PDFs) through the scoped asset protocol. */
  assetUrl: async (rel: string) => convertFileSrc(await call<string>("fs_absolute_path", { rel })),
  file: (rel: string) => call<void>("fs_open", { rel }),
  reveal: (rel: string) => call<void>("fs_reveal", { rel }),
  url: (url: string) => call<void>("open_url", { url }),
  externalPath: (path: string) => call<void>("open_external_path", { path }),
  absolutePath: (rel: string) => call<string>("fs_absolute_path", { rel }),
  readText: (rel: string) => call<string>("fs_read_text", { rel }),
  readExternalText: (path: string) => call<string>("fs_read_external_text", { path }),
  folderStats: (rel: string) => call<{ files: number; bytes: number }>("fs_folder_stats", { rel }),
};

// ---------------------------------------------------------------- backups
export type BackupKind = "full" | "database" | "attachments";

export interface BackupManifest {
  format: string;
  formatVersion: number;
  kind: BackupKind;
  label: string;
  createdAt: string;
  appVersion: string;
  workspaceId: string;
  workspaceName: string;
  schemaVersion: number | null;
  totalSize: number;
  files: { path: string; size: number; sha256: string }[];
}

export interface BackupInfo {
  path: string;
  fileName: string;
  size: number;
  modified: number;
  manifest: BackupManifest | null;
  error: string | null;
}

export interface ValidationReport {
  valid: boolean;
  errors: string[];
  manifest: BackupManifest | null;
  checkedFiles: number;
  databaseOk: boolean | null;
  tableCounts: [string, number][];
}

export interface RestoreReport {
  restored: string[];
  previousDataRel: string;
}

export const backupApi = {
  create: (kind: BackupKind, label: string, destPath?: string | null) => call<BackupInfo>("backup_create", { kind, label, destPath: destPath ?? null }),
  list: () => call<BackupInfo[]>("backup_list"),
  listAt: (path: string) => call<BackupInfo[]>("backup_list_at", { path }),
  inspect: (path: string) => call<ValidationReport>("backup_inspect", { path }),
  restoreCurrent: (path: string) => call<RestoreReport>("backup_restore_current", { path }),
  restoreNew: (path: string, target: string) => call<WorkspaceCheck>("backup_restore_new", { path, target }),
  restoreAt: (workspacePath: string, path: string) => call<WorkspaceCheck>("backup_restore_at", { workspacePath, path }),
  remove: (fileName: string) => call<void>("backup_delete", { fileName }),
  prune: (label: string, keep: number) => call<number>("backup_prune", { label, keep }),
};

// ---------------------------------------------------------------- dialogs
export const dialogs = {
  async pickFolder(title?: string): Promise<string | null> {
    const r = await openDialog({ directory: true, multiple: false, title });
    return typeof r === "string" ? r : null;
  },
  async pickFiles(title?: string, extensions?: string[]): Promise<string[]> {
    const r = await openDialog({
      multiple: true,
      directory: false,
      title,
      filters: extensions?.length ? [{ name: extensions.join(", "), extensions }] : undefined,
    });
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  },
  async pickFile(title: string, extensions: string[]): Promise<string | null> {
    const r = await openDialog({ multiple: false, directory: false, title, filters: [{ name: extensions.join(", "), extensions }] });
    return typeof r === "string" ? r : null;
  },
  async saveFile(title: string, defaultPath: string, extensions: string[]): Promise<string | null> {
    return (await saveDialog({ title, defaultPath, filters: [{ name: extensions.join(", "), extensions }] })) ?? null;
  },
};

// ---------------------------------------------------------------- notifications
export const desktopNotify = {
  async permission(): Promise<boolean> {
    try {
      if (await isPermissionGranted()) return true;
      return (await requestPermission()) === "granted";
    } catch {
      return false;
    }
  },
  /**
   * Sends a desktop notification. Returns true only when the OS accepted the request
   * (permission granted and the plugin call did not fail).
   */
  async send(title: string, body: string): Promise<boolean> {
    try {
      if (!(await isPermissionGranted())) return false;
      sendNotification({ title, body });
      return true;
    } catch {
      return false;
    }
  },
};
