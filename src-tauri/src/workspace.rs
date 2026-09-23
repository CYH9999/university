//! Workspace management: the user-selected folder that holds *all* data.
//!
//! Layout:
//! ```text
//! Workspace/
//! ├── AppData/ (database.sqlite, settings.json, workspace.json, logs/, tmp/)
//! ├── Subjects/  Projects/  Research Library/  Cybersecurity Lab/
//! ├── Attachments/  Whiteboards/  Backups/  Exports/  Trash/
//! └── README.txt
//! ```
use crate::error::{AppError, AppResult};
use crate::paths::atomic_write;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const APP_DIR: &str = "AppData";
pub const DB_FILE: &str = "database.sqlite";
pub const MANIFEST_FILE: &str = "workspace.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const LOGS_DIR: &str = "logs";
pub const TMP_DIR: &str = "tmp";
pub const MANIFEST_FORMAT: &str = "unios-workspace";
pub const MANIFEST_VERSION: u32 = 1;

/// Top-level user-visible folders created in every workspace.
pub const USER_DIRS: &[&str] = &[
    "Subjects",
    "Projects",
    "Research Library",
    "Cybersecurity Lab",
    "Attachments",
    "Whiteboards",
    "Backups",
    "Exports",
    "Trash",
];

/// Folders whose content is user data (included in full / attachment backups).
pub const DATA_DIRS: &[&str] = &[
    "Subjects",
    "Projects",
    "Research Library",
    "Cybersecurity Lab",
    "Attachments",
    "Whiteboards",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceManifest {
    pub format: String,
    pub format_version: u32,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCheck {
    /// "ok" or a problem code (see `Problem`).
    pub status: String,
    pub path: Option<String>,
    pub manifest: Option<WorkspaceManifest>,
    pub detail: Option<String>,
    pub backups: Vec<String>,
    pub repaired_folders: Vec<String>,
}

impl WorkspaceCheck {
    fn problem(path: &Path, status: &str, detail: impl Into<String>) -> Self {
        WorkspaceCheck {
            status: status.into(),
            path: Some(path.to_string_lossy().to_string()),
            manifest: None,
            detail: Some(detail.into()),
            backups: vec![],
            repaired_folders: vec![],
        }
    }
    pub fn not_configured() -> Self {
        WorkspaceCheck {
            status: "not_configured".into(),
            path: None,
            manifest: None,
            detail: None,
            backups: vec![],
            repaired_folders: vec![],
        }
    }
    pub fn is_ok(&self) -> bool {
        self.status == "ok"
    }
}

pub fn app_dir(root: &Path) -> PathBuf {
    root.join(APP_DIR)
}
pub fn db_path(root: &Path) -> PathBuf {
    root.join(APP_DIR).join(DB_FILE)
}
pub fn tmp_dir(root: &Path) -> PathBuf {
    root.join(APP_DIR).join(TMP_DIR)
}

fn probe_writable(dir: &Path) -> std::io::Result<()> {
    let probe = dir.join(format!(".unios-write-probe-{}", uuid::Uuid::new_v4().simple()));
    fs::write(&probe, b"probe")?;
    fs::remove_file(&probe)
}

pub fn read_manifest(root: &Path) -> AppResult<WorkspaceManifest> {
    let raw = fs::read_to_string(app_dir(root).join(MANIFEST_FILE))?;
    let m: WorkspaceManifest = serde_json::from_str(&raw)?;
    if m.format != MANIFEST_FORMAT {
        return Err(AppError::coded("workspace.manifest_corrupt", "Unknown workspace format"));
    }
    Ok(m)
}

/// Lists backup archives available inside a workspace (used by the recovery screen).
pub fn list_backup_files(root: &Path) -> Vec<String> {
    let mut out = vec![];
    if let Ok(rd) = fs::read_dir(root.join("Backups")) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".zip") {
                out.push(e.path().to_string_lossy().to_string());
            }
        }
    }
    out.sort();
    out.reverse();
    out
}

/// Full validation of a workspace folder without modifying user data.
pub fn check(root: &Path) -> WorkspaceCheck {
    if !root.exists() {
        return WorkspaceCheck::problem(root, "missing", "The folder does not exist or the drive is disconnected.");
    }
    if !root.is_dir() {
        return WorkspaceCheck::problem(root, "not_directory", "The path is not a folder.");
    }
    if let Err(e) = fs::read_dir(root) {
        return WorkspaceCheck::problem(root, "not_readable", e.to_string());
    }
    let app = app_dir(root);
    let probe_dir = if app.is_dir() { app.clone() } else { root.to_path_buf() };
    if let Err(e) = probe_writable(&probe_dir) {
        return WorkspaceCheck::problem(root, "not_writable", e.to_string());
    }
    if !app.join(MANIFEST_FILE).exists() {
        return WorkspaceCheck::problem(root, "not_a_workspace", "workspace.json was not found in AppData.");
    }
    let manifest = match read_manifest(root) {
        Ok(m) => m,
        Err(e) => {
            let mut c = WorkspaceCheck::problem(root, "manifest_corrupt", e.to_string());
            c.backups = list_backup_files(root);
            return c;
        }
    };
    if manifest.format_version > MANIFEST_VERSION {
        let mut c = WorkspaceCheck::problem(
            root,
            "newer_version",
            format!("Workspace format v{} is newer than supported v{}.", manifest.format_version, MANIFEST_VERSION),
        );
        c.manifest = Some(manifest);
        return c;
    }
    let db = db_path(root);
    if !db.exists() {
        let mut c = WorkspaceCheck::problem(root, "database_missing", "database.sqlite was not found.");
        c.manifest = Some(manifest);
        c.backups = list_backup_files(root);
        return c;
    }
    match crate::db::quick_check(&db) {
        Ok(true) => {}
        Ok(false) => {
            let mut c = WorkspaceCheck::problem(root, "database_corrupt", "SQLite integrity check failed.");
            c.manifest = Some(manifest);
            c.backups = list_backup_files(root);
            return c;
        }
        Err(e) => {
            let mut c = WorkspaceCheck::problem(root, "database_corrupt", e.to_string());
            c.manifest = Some(manifest);
            c.backups = list_backup_files(root);
            return c;
        }
    }
    WorkspaceCheck {
        status: "ok".into(),
        path: Some(root.to_string_lossy().to_string()),
        manifest: Some(manifest),
        detail: None,
        backups: vec![],
        repaired_folders: vec![],
    }
}

/// Recreates any missing top-level folders (never deletes anything).
pub fn ensure_structure(root: &Path) -> AppResult<Vec<String>> {
    let mut repaired = vec![];
    for d in [APP_DIR].iter().chain(USER_DIRS.iter()) {
        let p = root.join(d);
        if !p.exists() {
            fs::create_dir_all(&p)?;
            repaired.push(d.to_string());
        }
    }
    fs::create_dir_all(app_dir(root).join(LOGS_DIR))?;
    fs::create_dir_all(tmp_dir(root))?;
    let readme = root.join("README.txt");
    if !readme.exists() {
        let _ = fs::write(&readme, README_TEXT);
    }
    Ok(repaired)
}

/// Removes leftovers from interrupted operations (temp extraction folders, partial files).
pub fn cleanup_tmp(root: &Path) {
    let tmp = tmp_dir(root);
    if let Ok(rd) = fs::read_dir(&tmp) {
        for e in rd.flatten() {
            let p = e.path();
            let _ = if p.is_dir() { fs::remove_dir_all(&p) } else { fs::remove_file(&p) };
        }
    }
    if let Ok(rd) = fs::read_dir(root.join("Backups")) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().ends_with(".partial") {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

pub fn is_dir_empty(path: &Path) -> AppResult<bool> {
    Ok(fs::read_dir(path)?.next().is_none())
}

/// Creates a new workspace in `root`. Refuses to touch an existing workspace, and refuses a
/// non-empty folder unless `allow_non_empty` is set (the user explicitly confirmed).
pub fn create(root: &Path, name: &str, allow_non_empty: bool, app_version: &str) -> AppResult<WorkspaceManifest> {
    if root.exists() {
        if !root.is_dir() {
            return Err(AppError::coded("workspace.not_directory", "The path is not a folder."));
        }
        if app_dir(root).join(MANIFEST_FILE).exists() {
            return Err(AppError::coded("workspace.already_exists", "This folder already contains a workspace."));
        }
        if !allow_non_empty && !is_dir_empty(root)? {
            return Err(AppError::coded("workspace.folder_not_empty", "The folder is not empty."));
        }
    } else {
        fs::create_dir_all(root)?;
    }
    probe_writable(root).map_err(|e| AppError::coded("workspace.not_writable", e.to_string()))?;
    ensure_structure(root)?;
    let manifest = WorkspaceManifest {
        format: MANIFEST_FORMAT.into(),
        format_version: MANIFEST_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        name: if name.trim().is_empty() { "UniOS Workspace".into() } else { name.trim().to_string() },
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: app_version.into(),
    };
    write_manifest(root, &manifest)?;
    let settings = app_dir(root).join(SETTINGS_FILE);
    if !settings.exists() {
        atomic_write(&settings, b"{}")?;
    }
    // Creating the connection creates the (empty) database file; schema migrations are
    // applied by the application layer right after opening.
    let conn = crate::db::open_connection(&db_path(root))?;
    drop(conn);
    Ok(manifest)
}

pub fn write_manifest(root: &Path, m: &WorkspaceManifest) -> AppResult<()> {
    atomic_write(&app_dir(root).join(MANIFEST_FILE), serde_json::to_string_pretty(m)?.as_bytes())
}

/// Appends a line to AppData/logs/app.log (rotated at ~2 MB). Never fails loudly.
pub fn log_line(root: &Path, level: &str, message: &str) {
    use std::io::Write;
    let dir = app_dir(root).join(LOGS_DIR);
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let file = dir.join("app.log");
    if let Ok(meta) = fs::metadata(&file) {
        if meta.len() > 2 * 1024 * 1024 {
            let _ = fs::rename(&file, dir.join("app.1.log"));
        }
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&file) {
        let msg = message.replace('\n', " ⏎ ");
        let _ = writeln!(f, "{} [{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), level, msg);
    }
}

const README_TEXT: &str = "UniOS Workspace\r
===============\r
\r
This folder is your UniOS Workspace. Everything the app stores lives here and belongs to you.\r
\r
AppData/            Database (database.sqlite), settings, workspace info and logs. Do not edit by hand.\r
Subjects/           Files uploaded to your subjects (lectures, PDFs, slides...).\r
Projects/           Files that belong to university projects.\r
Research Library/   Research papers, books and other resources.\r
Cybersecurity Lab/  Lab files, CTF attachments and screenshots.\r
Attachments/        Files attached to notes, tasks, deadlines, expenses and other items.\r
Whiteboards/        Whiteboard drawings (.excalidraw files).\r
Backups/            Backup archives (.zip) created by UniOS.\r
Exports/            Data you exported (JSON, CSV, Markdown, HTML, ZIP).\r
Trash/              Deleted files. They can be restored from the Files screen.\r
\r
مساحة العمل الخاصة بـ UniOS: جميع بياناتك وملفاتك محفوظة داخل هذا المجلد.\r
";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_and_check_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ws");
        assert_eq!(check(&root).status, "missing");
        let m = create(&root, "Test", false, "1.0.0").unwrap();
        assert_eq!(m.name, "Test");
        let c = check(&root);
        assert!(c.is_ok(), "{:?}", c);
        for d in USER_DIRS {
            assert!(root.join(d).is_dir());
        }
        // Creating again must not overwrite the existing workspace.
        assert_eq!(create(&root, "Again", true, "1.0.0").unwrap_err().code(), "workspace.already_exists");
    }

    #[test]
    fn refuses_non_empty_folder_without_consent() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("x.txt"), b"x").unwrap();
        assert_eq!(create(dir.path(), "T", false, "1").unwrap_err().code(), "workspace.folder_not_empty");
        assert!(create(dir.path(), "T", true, "1").is_ok());
        assert!(dir.path().join("x.txt").exists());
    }

    #[test]
    fn detects_problems() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(check(dir.path()).status, "not_a_workspace");
        let f = dir.path().join("file");
        fs::write(&f, b"x").unwrap();
        assert_eq!(check(&f).status, "not_directory");

        let root = dir.path().join("ws");
        create(&root, "T", false, "1").unwrap();
        fs::write(app_dir(&root).join(MANIFEST_FILE), b"{broken").unwrap();
        assert_eq!(check(&root).status, "manifest_corrupt");

        let root2 = dir.path().join("ws2");
        create(&root2, "T", false, "1").unwrap();
        fs::remove_file(db_path(&root2)).unwrap();
        assert_eq!(check(&root2).status, "database_missing");

        let root3 = dir.path().join("ws3");
        create(&root3, "T", false, "1").unwrap();
        fs::write(db_path(&root3), b"this is definitely not a sqlite database file at all.......").unwrap();
        assert_eq!(check(&root3).status, "database_corrupt");
    }

    #[test]
    fn repairs_missing_folders() {
        let dir = tempfile::tempdir().unwrap();
        create(dir.path(), "T", false, "1").unwrap();
        fs::remove_dir(dir.path().join("Exports")).unwrap();
        let repaired = ensure_structure(dir.path()).unwrap();
        assert_eq!(repaired, vec!["Exports".to_string()]);
    }
}
