//! Tauri command surface. Every command that touches the Workspace goes through
//! `AppState::root()` so nothing can run while no valid Workspace is open.
use crate::backup::{self, BackupInfo, BackupKind, RestoreReport, ValidationReport};
use crate::db::{self, BatchResult, Statement};
use crate::error::{AppError, AppResult};
use crate::fsops::{self, DirEntry, FileStat, FolderStats, ImportedFile};
use crate::paths::{is_blocked_for_open, safe_join};
use crate::workspace::{self, WorkspaceCheck, WorkspaceManifest};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

#[derive(Default)]
pub struct Inner {
    pub root: Option<PathBuf>,
    pub manifest: Option<WorkspaceManifest>,
    pub conn: Option<Connection>,
}

#[derive(Default)]
pub struct AppState(pub Mutex<Inner>);

impl AppState {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        // A panic while holding the lock must not brick the app: recover the guard.
        self.0.lock().unwrap_or_else(|p| p.into_inner())
    }
    fn root(&self) -> AppResult<PathBuf> {
        self.lock().root.clone().ok_or_else(|| AppError::coded("workspace.not_open", "No workspace is open"))
    }
}

fn app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

// ---------------------------------------------------------------------------
// Pointer file: the only thing stored outside the Workspace. It remembers *where* the
// workspace is (and UI language/theme for the onboarding screens), never user data.
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pointer {
    pub last_path: Option<String>,
    #[serde(default)]
    pub recent: Vec<String>,
    #[serde(default)]
    pub ui: Map<String, Value>,
}

fn pointer_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::coded("io.error", e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("workspace-pointer.json"))
}

fn read_pointer(app: &AppHandle) -> Pointer {
    pointer_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_pointer(app: &AppHandle, p: &Pointer) -> AppResult<()> {
    crate::paths::atomic_write(&pointer_path(app)?, serde_json::to_string_pretty(p)?.as_bytes())
}

fn remember(app: &AppHandle, path: &Path) -> AppResult<()> {
    let mut p = read_pointer(app);
    let s = path.to_string_lossy().to_string();
    p.last_path = Some(s.clone());
    p.recent.retain(|r| r != &s);
    p.recent.insert(0, s);
    p.recent.truncate(8);
    write_pointer(app, &p)
}

#[tauri::command]
pub async fn pointer_read(app: AppHandle) -> AppResult<Pointer> {
    Ok(read_pointer(&app))
}

#[tauri::command]
pub async fn pointer_set_ui(app: AppHandle, ui: Map<String, Value>) -> AppResult<()> {
    let mut p = read_pointer(&app);
    for (k, v) in ui {
        p.ui.insert(k, v);
    }
    write_pointer(&app, &p)
}

#[tauri::command]
pub async fn pointer_forget(app: AppHandle, path: String) -> AppResult<()> {
    let mut p = read_pointer(&app);
    p.recent.retain(|r| r != &path);
    if p.last_path.as_deref() == Some(path.as_str()) {
        p.last_path = None;
    }
    write_pointer(&app, &p)
}

// ---------------------------------------------------------------------------
// Workspace lifecycle
// ---------------------------------------------------------------------------

fn open_workspace_inner(app: &AppHandle, state: &AppState, root: &Path) -> AppResult<WorkspaceCheck> {
    let mut check = workspace::check(root);
    if !check.is_ok() {
        return Ok(check);
    }
    check.repaired_folders = workspace::ensure_structure(root)?;
    workspace::cleanup_tmp(root);
    let conn = db::open_connection(&workspace::db_path(root))?;
    let _ = app.asset_protocol_scope().allow_directory(root, true);
    {
        let mut inner = state.lock();
        inner.conn = Some(conn);
        inner.root = Some(root.to_path_buf());
        inner.manifest = check.manifest.clone();
    }
    remember(app, root)?;
    workspace::log_line(root, "INFO", &format!("Workspace opened (app {})", app_version(app)));
    if !check.repaired_folders.is_empty() {
        workspace::log_line(root, "WARN", &format!("Recreated missing folders: {:?}", check.repaired_folders));
    }
    Ok(check)
}

/// Called on every launch: validates the remembered workspace and opens it if healthy.
/// Never creates anything when the remembered workspace is unavailable.
#[tauri::command]
pub async fn workspace_startup(app: AppHandle, state: State<'_, AppState>) -> AppResult<WorkspaceCheck> {
    if let Some(root) = state.lock().root.clone() {
        let c = workspace::check(&root);
        if c.is_ok() {
            return Ok(c);
        }
    }
    let pointer = read_pointer(&app);
    match pointer.last_path {
        None => Ok(WorkspaceCheck::not_configured()),
        Some(p) => open_workspace_inner(&app, &state, Path::new(&p)),
    }
}

#[tauri::command]
pub async fn workspace_check(path: String) -> AppResult<WorkspaceCheck> {
    Ok(workspace::check(Path::new(&path)))
}

#[tauri::command]
pub async fn workspace_open(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<WorkspaceCheck> {
    close_inner(&state);
    open_workspace_inner(&app, &state, Path::new(&path))
}

#[tauri::command]
pub async fn workspace_create(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    name: String,
    allow_non_empty: bool,
) -> AppResult<WorkspaceCheck> {
    let root = PathBuf::from(&path);
    if !root.is_absolute() {
        return Err(AppError::coded("path.not_absolute", "Please choose a full folder path"));
    }
    workspace::create(&root, &name, allow_non_empty, &app_version(&app))?;
    close_inner(&state);
    open_workspace_inner(&app, &state, &root)
}

/// Creates a fresh empty database in a workspace whose database is missing (explicit user action).
#[tauri::command]
pub async fn workspace_init_database(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<WorkspaceCheck> {
    let root = PathBuf::from(&path);
    let c = workspace::check(&root);
    if c.status != "database_missing" {
        return Err(AppError::coded("workspace.invalid_state", "The database is not missing"));
    }
    drop(db::open_connection(&workspace::db_path(&root))?);
    workspace::log_line(&root, "WARN", "A new empty database was created on user request");
    open_workspace_inner(&app, &state, &root)
}

fn close_inner(state: &AppState) {
    let mut inner = state.lock();
    if let (Some(conn), Some(root)) = (inner.conn.take(), inner.root.as_ref()) {
        let _ = conn.execute_batch("PRAGMA optimize;");
        drop(conn);
        workspace::log_line(root, "INFO", "Workspace closed");
    }
    inner.root = None;
    inner.manifest = None;
}

#[tauri::command]
pub async fn workspace_close(state: State<'_, AppState>) -> AppResult<()> {
    close_inner(&state);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub path: String,
    pub manifest: Option<WorkspaceManifest>,
    pub db_size: u64,
    pub db_open: bool,
}

#[tauri::command]
pub async fn workspace_info(state: State<'_, AppState>) -> AppResult<WorkspaceInfo> {
    let inner = state.lock();
    let root = inner.root.clone().ok_or_else(|| AppError::coded("workspace.not_open", "No workspace is open"))?;
    Ok(WorkspaceInfo {
        path: root.to_string_lossy().to_string(),
        manifest: inner.manifest.clone(),
        db_size: std::fs::metadata(workspace::db_path(&root)).map(|m| m.len()).unwrap_or(0),
        db_open: inner.conn.is_some(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    pub structure: WorkspaceCheck,
    pub database_problems: Vec<String>,
    pub repaired_folders: Vec<String>,
}

#[tauri::command]
pub async fn workspace_validate(state: State<'_, AppState>) -> AppResult<IntegrityReport> {
    let root = state.root()?;
    let repaired = workspace::ensure_structure(&root)?;
    let problems = {
        let inner = state.lock();
        let conn = inner.conn.as_ref().ok_or_else(|| AppError::coded("db.closed", "Database is not open"))?;
        db::integrity_check(conn)?
    };
    let structure = workspace::check(&root);
    workspace::log_line(&root, "INFO", &format!("Integrity check: {} problem(s)", problems.len()));
    Ok(IntegrityReport { structure, database_problems: problems, repaired_folders: repaired })
}

#[tauri::command]
pub async fn workspace_rename(state: State<'_, AppState>, name: String) -> AppResult<WorkspaceManifest> {
    let root = state.root()?;
    let mut m = workspace::read_manifest(&root)?;
    m.name = name.trim().chars().take(80).collect();
    workspace::write_manifest(&root, &m)?;
    state.lock().manifest = Some(m.clone());
    Ok(m)
}

#[tauri::command]
pub async fn workspace_reveal(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let root = state.root()?;
    app.opener()
        .open_path(root.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::coded("open.failed", e.to_string()))
}

#[tauri::command]
pub async fn path_is_dir_empty(path: String) -> AppResult<bool> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(true);
    }
    workspace::is_dir_empty(p)
}

// ---------------------------------------------------------------------------
// Settings (AppData/settings.json) and logging
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn settings_read(state: State<'_, AppState>) -> AppResult<Value> {
    let root = state.root()?;
    let path = workspace::app_dir(&root).join(workspace::SETTINGS_FILE);
    match std::fs::read_to_string(&path) {
        Ok(s) => match serde_json::from_str::<Value>(&s) {
            Ok(v) if v.is_object() => Ok(v),
            _ => {
                // Keep the damaged file for inspection and continue with defaults.
                let aside = path.with_file_name(format!(
                    "settings.corrupt-{}.json",
                    chrono::Local::now().format("%Y%m%d-%H%M%S")
                ));
                let _ = std::fs::rename(&path, aside);
                workspace::log_line(&root, "ERROR", "settings.json was corrupt; defaults restored");
                Ok(Value::Object(Map::new()))
            }
        },
        Err(_) => Ok(Value::Object(Map::new())),
    }
}

#[tauri::command]
pub async fn settings_write(state: State<'_, AppState>, settings: Value) -> AppResult<()> {
    let root = state.root()?;
    if !settings.is_object() {
        return Err(AppError::coded("json.invalid", "Settings must be an object"));
    }
    crate::paths::atomic_write(
        &workspace::app_dir(&root).join(workspace::SETTINGS_FILE),
        serde_json::to_string_pretty(&settings)?.as_bytes(),
    )
}

#[tauri::command]
pub async fn log_write(state: State<'_, AppState>, level: String, message: String) -> AppResult<()> {
    if let Ok(root) = state.root() {
        let level = match level.as_str() {
            "error" => "ERROR",
            "warn" => "WARN",
            _ => "INFO",
        };
        workspace::log_line(&root, level, &message.chars().take(4000).collect::<String>());
    }
    Ok(())
}

#[tauri::command]
pub async fn log_read(state: State<'_, AppState>) -> AppResult<String> {
    let root = state.root()?;
    let p = workspace::app_dir(&root).join(workspace::LOGS_DIR).join("app.log");
    let s = std::fs::read_to_string(p).unwrap_or_default();
    let lines: Vec<&str> = s.lines().collect();
    Ok(lines[lines.len().saturating_sub(300)..].join("\n"))
}

// ---------------------------------------------------------------------------
// Database bridge
// ---------------------------------------------------------------------------

macro_rules! with_conn {
    ($state:expr, $conn:ident, $body:expr) => {{
        let mut inner = $state.lock();
        let $conn = inner.conn.as_mut().ok_or_else(|| AppError::coded("db.closed", "Database is not open"))?;
        $body
    }};
}

#[tauri::command]
pub async fn db_query(state: State<'_, AppState>, sql: String, params: Vec<Value>) -> AppResult<Vec<Map<String, Value>>> {
    with_conn!(state, conn, db::query(conn, &sql, &params))
}

#[tauri::command]
pub async fn db_execute(state: State<'_, AppState>, sql: String, params: Vec<Value>) -> AppResult<usize> {
    with_conn!(state, conn, db::execute(conn, &sql, &params))
}

#[tauri::command]
pub async fn db_batch(state: State<'_, AppState>, statements: Vec<Statement>) -> AppResult<BatchResult> {
    with_conn!(state, conn, db::batch(conn, &statements))
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn fs_list_dir(state: State<'_, AppState>, rel: String) -> AppResult<Vec<DirEntry>> {
    fsops::list_dir(&state.root()?, &rel)
}

#[tauri::command]
pub async fn fs_import_files(state: State<'_, AppState>, sources: Vec<String>, dest_rel: String) -> AppResult<Vec<ImportedFile>> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || fsops::import_files(&root, &sources, &dest_rel))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn fs_create_dir(state: State<'_, AppState>, parent_rel: String, name: String) -> AppResult<String> {
    fsops::create_dir(&state.root()?, &parent_rel, &name)
}

#[tauri::command]
pub async fn fs_ensure_dir(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    fsops::ensure_dir(&state.root()?, &rel)
}

#[tauri::command]
pub async fn fs_rename(state: State<'_, AppState>, rel: String, new_name: String) -> AppResult<String> {
    fsops::rename(&state.root()?, &rel, &new_name)
}

#[tauri::command]
pub async fn fs_move(state: State<'_, AppState>, rel: String, dest_dir_rel: String) -> AppResult<String> {
    fsops::move_to(&state.root()?, &rel, &dest_dir_rel)
}

#[tauri::command]
pub async fn fs_copy(state: State<'_, AppState>, rel: String, dest_dir_rel: String) -> AppResult<String> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || fsops::copy_to(&root, &rel, &dest_dir_rel))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn fs_trash(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    fsops::trash(&state.root()?, &rel)
}

#[tauri::command]
pub async fn fs_restore(state: State<'_, AppState>, trash_rel: String, original_rel: String) -> AppResult<String> {
    fsops::restore(&state.root()?, &trash_rel, &original_rel)
}

#[tauri::command]
pub async fn fs_delete_permanent(state: State<'_, AppState>, trash_rel: String) -> AppResult<()> {
    fsops::delete_permanent(&state.root()?, &trash_rel)
}

#[tauri::command]
pub async fn fs_empty_trash(state: State<'_, AppState>) -> AppResult<usize> {
    fsops::empty_trash(&state.root()?)
}

#[tauri::command]
pub async fn fs_stat_many(state: State<'_, AppState>, rels: Vec<String>) -> AppResult<Vec<FileStat>> {
    Ok(fsops::stat_many(&state.root()?, &rels))
}

#[tauri::command]
pub async fn fs_hash(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    let p = safe_join(&state.root()?, &rel)?;
    tauri::async_runtime::spawn_blocking(move || fsops::hash_path(&p))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn fs_hash_external(path: String) -> AppResult<String> {
    tauri::async_runtime::spawn_blocking(move || fsops::hash_path(Path::new(&path)))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn fs_write_text(state: State<'_, AppState>, rel: String, content: String) -> AppResult<String> {
    fsops::write_text(&state.root()?, &rel, &content)
}

#[tauri::command]
pub async fn fs_read_text(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    fsops::read_text(&state.root()?, &rel)
}

#[tauri::command]
pub async fn fs_read_external_text(path: String) -> AppResult<String> {
    let meta = std::fs::metadata(&path)?;
    if meta.len() > 64 * 1024 * 1024 {
        return Err(AppError::coded("fs.too_large", "File is too large"));
    }
    String::from_utf8(std::fs::read(&path)?).map_err(|_| AppError::coded("fs.not_text", "File is not valid UTF-8 text"))
}

#[tauri::command]
pub async fn fs_folder_stats(state: State<'_, AppState>, rel: String) -> AppResult<FolderStats> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || fsops::folder_stats(&root, &rel))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn fs_absolute_path(state: State<'_, AppState>, rel: String) -> AppResult<String> {
    Ok(safe_join(&state.root()?, &rel)?.to_string_lossy().to_string())
}

/// Opens a workspace file with its default application. Executables and scripts are
/// never launched from inside the app; the user can reveal them in Explorer instead.
#[tauri::command]
pub async fn fs_open(app: AppHandle, state: State<'_, AppState>, rel: String) -> AppResult<()> {
    let p = safe_join(&state.root()?, &rel)?;
    if !p.exists() {
        return Err(AppError::coded("io.not_found", "The file no longer exists"));
    }
    if is_blocked_for_open(&p) {
        return Err(AppError::coded("open.blocked", "Executable files are never opened from UniOS"));
    }
    app.opener()
        .open_path(p.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| AppError::coded("open.failed", e.to_string()))
}

#[tauri::command]
pub async fn fs_reveal(app: AppHandle, state: State<'_, AppState>, rel: String) -> AppResult<()> {
    let root = state.root()?;
    let p = safe_join(&root, &rel)?;
    let target = if p.exists() { p } else { root };
    app.opener().reveal_item_in_dir(target).map_err(|e| AppError::coded("open.failed", e.to_string()))
}

#[tauri::command]
pub async fn open_external_path(app: AppHandle, path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::coded("io.not_found", "The path no longer exists"));
    }
    if p.is_file() && is_blocked_for_open(&p) {
        return Err(AppError::coded("open.blocked", "Executable files are never opened from UniOS"));
    }
    if p.is_file() {
        app.opener().reveal_item_in_dir(p).map_err(|e| AppError::coded("open.failed", e.to_string()))
    } else {
        app.opener().open_path(path, None::<&str>).map_err(|e| AppError::coded("open.failed", e.to_string()))
    }
}

/// Opens a web link in the default browser. Only explicit http(s)/mailto links are allowed.
#[tauri::command]
pub async fn open_url(app: AppHandle, url: String) -> AppResult<()> {
    let lower = url.trim().to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err(AppError::coded("open.invalid_url", "Only web and e-mail links can be opened"));
    }
    app.opener().open_url(url.trim(), None::<&str>).map_err(|e| AppError::coded("open.failed", e.to_string()))
}

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

fn parse_kind(kind: &str) -> AppResult<BackupKind> {
    match kind {
        "full" => Ok(BackupKind::Full),
        "database" => Ok(BackupKind::Database),
        "attachments" => Ok(BackupKind::Attachments),
        _ => Err(AppError::coded("backup.invalid_kind", "Unknown backup type")),
    }
}

/// Creates a backup. When `dest_path` is given (ZIP export), the archive is written there;
/// otherwise into Workspace/Backups.
#[tauri::command]
pub async fn backup_create(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: String,
    label: String,
    dest_path: Option<String>,
) -> AppResult<BackupInfo> {
    let kind = parse_kind(&kind)?;
    let root = state.root()?;
    let snap = workspace::tmp_dir(&root).join(format!("snapshot-{}.sqlite", uuid::Uuid::new_v4().simple()));
    if kind.includes_db() {
        std::fs::create_dir_all(workspace::tmp_dir(&root))?;
        with_conn!(state, conn, db::snapshot(conn, &snap))?;
    }
    let dest = match dest_path {
        Some(p) => PathBuf::from(p),
        None => root.join("Backups").join(backup::backup_file_name(kind, &label)),
    };
    let version = app_version(&app);
    let root2 = root.clone();
    let snap2 = snap.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        backup::write_archive(&root2, kind, &label, if kind.includes_db() { Some(&snap2) } else { None }, &dest, &version)
    })
    .await
    .map_err(|e| AppError::coded("backup.failed", e.to_string()))?;
    let _ = std::fs::remove_file(&snap);
    match &res {
        Ok(info) => workspace::log_line(&root, "INFO", &format!("Backup created: {} ({} bytes)", info.file_name, info.size)),
        Err(e) => workspace::log_line(&root, "ERROR", &format!("Backup failed: {e}")),
    }
    res
}

#[tauri::command]
pub async fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<BackupInfo>> {
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || Ok(backup::list(&root)))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

/// Lists backups of a workspace that is *not* open (recovery screen).
#[tauri::command]
pub async fn backup_list_at(path: String) -> AppResult<Vec<BackupInfo>> {
    tauri::async_runtime::spawn_blocking(move || Ok(backup::list(Path::new(&path))))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?
}

#[tauri::command]
pub async fn backup_inspect(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<ValidationReport> {
    let tmp = match state.root() {
        Ok(root) => workspace::tmp_dir(&root),
        Err(_) => app
            .path()
            .app_cache_dir()
            .map_err(|e| AppError::coded("io.error", e.to_string()))?
            .join("inspect"),
    };
    let res = tauri::async_runtime::spawn_blocking(move || backup::validate(Path::new(&path), &tmp))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))?;
    Ok(res)
}

#[tauri::command]
pub async fn backup_restore_current(state: State<'_, AppState>, path: String) -> AppResult<RestoreReport> {
    let root = state.root()?;
    // Hold the lock for the whole restore so no query can run against a half-restored database.
    let mut inner = state.lock();
    if let Some(conn) = inner.conn.take() {
        drop(conn);
    }
    let result = backup::restore_into(&root, Path::new(&path));
    // Reopen whatever database is now in place (restored, or original after rollback).
    let reopened = db::open_connection(&workspace::db_path(&root));
    match reopened {
        Ok(c) => inner.conn = Some(c),
        Err(e) => workspace::log_line(&root, "ERROR", &format!("Could not reopen database after restore: {e}")),
    }
    match &result {
        Ok(r) => workspace::log_line(&root, "INFO", &format!("Backup restored; previous data kept in {}", r.previous_data_rel)),
        Err(e) => workspace::log_line(&root, "ERROR", &format!("Restore failed: {e}")),
    }
    result
}

#[tauri::command]
pub async fn backup_restore_new(app: AppHandle, state: State<'_, AppState>, path: String, target: String) -> AppResult<WorkspaceCheck> {
    let version = app_version(&app);
    let target_path = PathBuf::from(&target);
    if !target_path.is_absolute() {
        return Err(AppError::coded("path.not_absolute", "Please choose a full folder path"));
    }
    let tp = target_path.clone();
    tauri::async_runtime::spawn_blocking(move || backup::restore_to_new(Path::new(&path), &tp, &version))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))??;
    close_inner(&state);
    open_workspace_inner(&app, &state, &target_path)
}

/// Restores a backup into a workspace that could not be opened (e.g. corrupt database),
/// then opens it.
#[tauri::command]
pub async fn backup_restore_at(app: AppHandle, state: State<'_, AppState>, workspace_path: String, path: String) -> AppResult<WorkspaceCheck> {
    let root = PathBuf::from(&workspace_path);
    close_inner(&state);
    let r2 = root.clone();
    tauri::async_runtime::spawn_blocking(move || backup::restore_into(&r2, Path::new(&path)))
        .await
        .map_err(|e| AppError::coded("io.error", e.to_string()))??;
    open_workspace_inner(&app, &state, &root)
}

#[tauri::command]
pub async fn backup_delete(state: State<'_, AppState>, file_name: String) -> AppResult<()> {
    backup::delete(&state.root()?, &file_name)
}

#[tauri::command]
pub async fn backup_prune(state: State<'_, AppState>, label: String, keep: usize) -> AppResult<usize> {
    backup::prune(&state.root()?, &label, keep.max(1))
}
