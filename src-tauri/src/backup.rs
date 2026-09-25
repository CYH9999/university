//! Backup, validation and restore.
//!
//! A backup is a ZIP archive with a `backup-manifest.json` that lists every file with its
//! size and SHA-256. The database is captured with `VACUUM INTO`, which produces a
//! consistent snapshot even while the app is running. Archives are written to a
//! `.partial` file and renamed only after they are complete, so an interrupted backup is
//! never mistaken for a valid one.
use crate::error::{AppError, AppResult};
use crate::paths::{normalize_rel, safe_join};
use crate::workspace::{self, APP_DIR, DATA_DIRS, DB_FILE, MANIFEST_FILE, SETTINGS_FILE};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

pub const BACKUP_FORMAT: &str = "unios-backup";
pub const BACKUP_FORMAT_VERSION: u32 = 1;
pub const MANIFEST_NAME: &str = "backup-manifest.json";
const DB_ENTRY: &str = "AppData/database.sqlite";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BackupKind {
    Full,
    Database,
    Attachments,
}

impl BackupKind {
    pub fn includes_db(self) -> bool {
        matches!(self, BackupKind::Full | BackupKind::Database)
    }
    pub fn includes_files(self) -> bool {
        matches!(self, BackupKind::Full | BackupKind::Attachments)
    }
    fn as_str(self) -> &'static str {
        match self {
            BackupKind::Full => "full",
            BackupKind::Database => "database",
            BackupKind::Attachments => "attachments",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFileEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format: String,
    pub format_version: u32,
    pub kind: BackupKind,
    pub label: String,
    pub created_at: String,
    pub app_version: String,
    pub workspace_id: String,
    pub workspace_name: String,
    pub schema_version: Option<i64>,
    pub total_size: u64,
    pub files: Vec<BackupFileEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub file_name: String,
    pub size: u64,
    pub modified: i64,
    pub manifest: Option<BackupManifest>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub errors: Vec<String>,
    pub manifest: Option<BackupManifest>,
    pub checked_files: usize,
    pub database_ok: Option<bool>,
    pub table_counts: Vec<(String, i64)>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub restored: Vec<String>,
    /// Relative path (inside Trash) where the data that was replaced has been kept.
    pub previous_data_rel: String,
}

fn is_precompressed(path: &str) -> bool {
    let lower = path.to_lowercase();
    [
        ".zip", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mkv", ".mp3", ".docx", ".pptx",
        ".xlsx", ".7z", ".rar", ".gz", ".pcap", ".pcapng",
    ]
    .iter()
    .any(|e| lower.ends_with(e))
}

fn skip_file(name: &str) -> bool {
    name.ends_with(".tmp") || name.ends_with(".partial") || name.starts_with(".unios-")
}

/// Collects (zip entry name, absolute path) pairs for the requested kind.
fn collect_sources(root: &Path, kind: BackupKind, db_snapshot: Option<&Path>) -> AppResult<Vec<(String, PathBuf)>> {
    let mut out = vec![];
    if kind.includes_db() {
        let snap = db_snapshot.ok_or_else(|| AppError::coded("backup.failed", "Database snapshot missing"))?;
        out.push((DB_ENTRY.to_string(), snap.to_path_buf()));
        for f in [SETTINGS_FILE, MANIFEST_FILE] {
            let p = workspace::app_dir(root).join(f);
            if p.is_file() {
                out.push((format!("{APP_DIR}/{f}"), p));
            }
        }
    }
    if kind.includes_files() {
        for d in DATA_DIRS {
            let base = root.join(d);
            if !base.is_dir() {
                continue;
            }
            for e in walkdir::WalkDir::new(&base).follow_links(false).into_iter().flatten() {
                if !e.file_type().is_file() {
                    continue;
                }
                let name = e.file_name().to_string_lossy().to_string();
                if skip_file(&name) {
                    continue;
                }
                let rel = crate::paths::to_rel(root, e.path())?;
                out.push((rel, e.path().to_path_buf()));
            }
        }
    }
    Ok(out)
}

pub fn backup_file_name(kind: BackupKind, label: &str) -> String {
    let ts = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
    let label = crate::paths::sanitize_filename(label).replace(' ', "-");
    if label.is_empty() || label == "manual" || label == "untitled" {
        format!("University-{}-{}.zip", kind.as_str(), ts)
    } else {
        format!("University-{}-{}-{}.zip", kind.as_str(), label, ts)
    }
}

/// Writes the archive. `db_snapshot` must already contain a consistent copy of the database
/// when `kind` includes it.
pub fn write_archive(
    root: &Path,
    kind: BackupKind,
    label: &str,
    db_snapshot: Option<&Path>,
    dest: &Path,
    app_version: &str,
) -> AppResult<BackupInfo> {
    let manifest_ws = workspace::read_manifest(root)?;
    let sources = collect_sources(root, kind, db_snapshot)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let partial = dest.with_file_name(format!(
        "{}.partial",
        dest.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    ));
    let result = (|| -> AppResult<BackupManifest> {
        let file = fs::File::create(&partial)?;
        let mut zip = zip::ZipWriter::new(std::io::BufWriter::new(file));
        let mut entries = vec![];
        let mut total = 0u64;
        let mut buf = vec![0u8; 256 * 1024];
        for (name, path) in &sources {
            let method = if is_precompressed(name) { CompressionMethod::Stored } else { CompressionMethod::Deflated };
            let opts = SimpleFileOptions::default().compression_method(method).large_file(true);
            zip.start_file(name.as_str(), opts)?;
            let mut f = fs::File::open(path)?;
            let mut hasher = Sha256::new();
            let mut size = 0u64;
            loop {
                let n = f.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
                zip.write_all(&buf[..n])?;
                size += n as u64;
            }
            total += size;
            entries.push(BackupFileEntry { path: name.clone(), size, sha256: hex::encode(hasher.finalize()) });
        }
        let schema_version = db_snapshot.and_then(crate::db::schema_version);
        let manifest = BackupManifest {
            format: BACKUP_FORMAT.into(),
            format_version: BACKUP_FORMAT_VERSION,
            kind,
            label: label.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            app_version: app_version.to_string(),
            workspace_id: manifest_ws.id.clone(),
            workspace_name: manifest_ws.name.clone(),
            schema_version,
            total_size: total,
            files: entries,
        };
        zip.start_file(MANIFEST_NAME, SimpleFileOptions::default())?;
        zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;
        let writer = zip.finish()?;
        let file = writer.into_inner().map_err(|e| AppError::coded("backup.failed", e.to_string()))?;
        file.sync_all()?;
        Ok(manifest)
    })();
    let manifest = match result {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_file(&partial);
            return Err(e);
        }
    };
    fs::rename(&partial, dest)?;
    let meta = fs::metadata(dest)?;
    Ok(BackupInfo {
        path: dest.to_string_lossy().to_string(),
        file_name: dest.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        size: meta.len(),
        modified: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        manifest: Some(manifest),
        error: None,
    })
}

fn read_manifest_from_zip<R: Read + std::io::Seek>(zip: &mut zip::ZipArchive<R>) -> AppResult<BackupManifest> {
    let mut f = zip
        .by_name(MANIFEST_NAME)
        .map_err(|_| AppError::coded("backup.manifest_missing", "The archive is not a University backup (manifest missing)"))?;
    let mut s = String::new();
    f.read_to_string(&mut s)?;
    let m: BackupManifest = serde_json::from_str(&s)
        .map_err(|e| AppError::coded("backup.manifest_invalid", format!("Backup manifest is invalid: {e}")))?;
    if m.format != BACKUP_FORMAT {
        return Err(AppError::coded("backup.manifest_invalid", "Unknown backup format"));
    }
    if m.format_version > BACKUP_FORMAT_VERSION {
        return Err(AppError::coded("backup.newer_version", "This backup was created by a newer version of University"));
    }
    Ok(m)
}

pub fn read_info(path: &Path) -> BackupInfo {
    let meta = fs::metadata(path).ok();
    let mut info = BackupInfo {
        path: path.to_string_lossy().to_string(),
        file_name: path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
        size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
        modified: meta
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0),
        manifest: None,
        error: None,
    };
    match fs::File::open(path)
        .map_err(AppError::from)
        .and_then(|f| zip::ZipArchive::new(std::io::BufReader::new(f)).map_err(AppError::from))
        .and_then(|mut z| read_manifest_from_zip(&mut z))
    {
        Ok(m) => info.manifest = Some(m),
        Err(e) => info.error = Some(e.to_string()),
    }
    info
}

pub fn list(root: &Path) -> Vec<BackupInfo> {
    let mut out: Vec<BackupInfo> =
        workspace::list_backup_files(root).iter().map(|p| read_info(Path::new(p))).collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// Verifies every file listed in the manifest (presence, size, SHA-256), rejects unsafe entry
/// names, and runs an integrity check on the embedded database.
pub fn validate(zip_path: &Path, tmp_dir: &Path) -> ValidationReport {
    let mut report = ValidationReport {
        valid: false,
        errors: vec![],
        manifest: None,
        checked_files: 0,
        database_ok: None,
        table_counts: vec![],
    };
    let file = match fs::File::open(zip_path) {
        Ok(f) => f,
        Err(e) => {
            report.errors.push(format!("Cannot open archive: {e}"));
            return report;
        }
    };
    let mut zip = match zip::ZipArchive::new(std::io::BufReader::new(file)) {
        Ok(z) => z,
        Err(e) => {
            report.errors.push(format!("Not a valid ZIP archive: {e}"));
            return report;
        }
    };
    let manifest = match read_manifest_from_zip(&mut zip) {
        Ok(m) => m,
        Err(e) => {
            report.errors.push(e.to_string());
            return report;
        }
    };
    for i in 0..zip.len() {
        if let Ok(f) = zip.by_index_raw(i) {
            if f.enclosed_name().is_none() || !is_safe_entry(f.name()) {
                report.errors.push(format!("Unsafe path in archive: {}", f.name()));
            }
        }
    }
    let mut buf = vec![0u8; 256 * 1024];
    for entry in &manifest.files {
        if !is_safe_entry(&entry.path) {
            report.errors.push(format!("Unsafe path in manifest: {}", entry.path));
            continue;
        }
        let mut f = match zip.by_name(&entry.path) {
            Ok(f) => f,
            Err(_) => {
                report.errors.push(format!("Missing file: {}", entry.path));
                continue;
            }
        };
        let mut hasher = Sha256::new();
        let mut size = 0u64;
        let mut read_ok = true;
        loop {
            match f.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    hasher.update(&buf[..n]);
                    size += n as u64;
                }
                Err(e) => {
                    report.errors.push(format!("Corrupted file {}: {e}", entry.path));
                    read_ok = false;
                    break;
                }
            }
        }
        if read_ok {
            if size != entry.size || hex::encode(hasher.finalize()) != entry.sha256 {
                report.errors.push(format!("Checksum mismatch: {}", entry.path));
            }
            report.checked_files += 1;
        }
    }
    if manifest.kind.includes_db() {
        if !manifest.files.iter().any(|f| f.path == DB_ENTRY) {
            report.errors.push("Database is missing from the backup".into());
            report.database_ok = Some(false);
        } else if let Err(e) = fs::create_dir_all(tmp_dir) {
            report.errors.push(format!("Cannot create temporary folder: {e}"));
        } else {
            let tmp = tmp_dir.join(format!("validate-{}.sqlite", uuid::Uuid::new_v4().simple()));
            let res = (|| -> AppResult<(bool, Vec<(String, i64)>)> {
                let mut f = zip.by_name(DB_ENTRY)?;
                let mut out = fs::File::create(&tmp)?;
                std::io::copy(&mut f, &mut out)?;
                drop(out);
                let ok = crate::db::quick_check(&tmp)?;
                let counts = if ok { crate::db::table_counts(&tmp)? } else { vec![] };
                Ok((ok, counts))
            })();
            let _ = fs::remove_file(&tmp);
            match res {
                Ok((ok, counts)) => {
                    report.database_ok = Some(ok);
                    report.table_counts = counts;
                    if !ok {
                        report.errors.push("The database inside the backup failed the integrity check".into());
                    }
                }
                Err(e) => {
                    report.database_ok = Some(false);
                    report.errors.push(format!("The database inside the backup is unreadable: {e}"));
                }
            }
        }
    }
    report.manifest = Some(manifest);
    report.valid = report.errors.is_empty();
    report
}

fn is_safe_entry(name: &str) -> bool {
    let n = name.replace('\\', "/");
    if n.starts_with('/') || n.contains(':') || n.contains('\0') {
        return false;
    }
    !n.split('/').any(|p| p == "..")
}

/// Extracts every manifest entry of the archive into `dest` (paths validated with `safe_join`).
fn extract(zip_path: &Path, manifest: &BackupManifest, dest: &Path) -> AppResult<()> {
    fs::create_dir_all(dest)?;
    let file = fs::File::open(zip_path)?;
    let mut zip = zip::ZipArchive::new(std::io::BufReader::new(file))?;
    for entry in &manifest.files {
        let target = safe_join(dest, &entry.path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut f = zip.by_name(&entry.path)?;
        let mut out = fs::File::create(&target)?;
        std::io::copy(&mut f, &mut out)?;
        out.sync_all()?;
    }
    Ok(())
}

fn move_path(from: &Path, to: &Path) -> AppResult<()> {
    if let Some(p) = to.parent() {
        fs::create_dir_all(p)?;
    }
    fs::rename(from, to)?;
    Ok(())
}

/// Restores a validated backup into the *current* workspace. The caller must close the
/// database connection first and reopen it afterwards. Replaced data is moved (not deleted)
/// into `Trash/pre-restore-<timestamp>/`, and every step is rolled back on failure.
pub fn restore_into(root: &Path, zip_path: &Path) -> AppResult<RestoreReport> {
    let tmp = workspace::tmp_dir(root);
    let report = validate(zip_path, &tmp);
    if !report.valid {
        return Err(AppError::coded("backup.invalid", report.errors.join("; ")));
    }
    let manifest = report.manifest.expect("validated manifest");
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let staging = tmp.join(format!("restore-{stamp}"));
    extract(zip_path, &manifest, &staging)?;

    let previous_rel = format!("Trash/pre-restore-{stamp}");
    let previous = root.join(&previous_rel);
    let mut items: Vec<String> = vec![];
    if manifest.kind.includes_db() {
        items.push(format!("{APP_DIR}/{DB_FILE}"));
        items.push(format!("{APP_DIR}/{DB_FILE}-journal"));
        items.push(format!("{APP_DIR}/{SETTINGS_FILE}"));
    }
    if manifest.kind.includes_files() {
        for d in DATA_DIRS {
            items.push(d.to_string());
        }
    }

    // (item, moved_current_away, placed_new)
    let mut done: Vec<(String, bool, bool)> = vec![];
    let result = (|| -> AppResult<()> {
        for item in &items {
            let current = root.join(item);
            let staged = staging.join(item);
            let mut moved = false;
            if current.exists() {
                move_path(&current, &previous.join(item))?;
                moved = true;
            }
            done.push((item.clone(), moved, false));
            if staged.exists() {
                move_path(&staged, &current)?;
                done.last_mut().unwrap().2 = true;
            } else if manifest.kind.includes_files() && DATA_DIRS.contains(&item.as_str()) {
                fs::create_dir_all(&current)?;
                done.last_mut().unwrap().2 = true;
            }
        }
        Ok(())
    })();

    if let Err(e) = result {
        // Roll back in reverse order.
        for (item, moved, placed) in done.iter().rev() {
            let current = root.join(item);
            if *placed && current.exists() {
                let _ = if current.is_dir() { fs::remove_dir_all(&current) } else { fs::remove_file(&current) };
            }
            if *moved {
                let _ = move_path(&previous.join(item), &current);
            }
        }
        let _ = fs::remove_dir_all(&staging);
        return Err(AppError::coded("backup.restore_failed", format!("Restore failed and was rolled back: {e}")));
    }
    let _ = fs::remove_dir_all(&staging);
    workspace::ensure_structure(root)?;
    Ok(RestoreReport {
        restored: items.into_iter().filter(|i| !i.ends_with("-journal")).map(|i| normalize_rel(&i)).collect(),
        previous_data_rel: previous_rel,
    })
}

/// Restores a backup into a brand-new workspace folder (must be empty or not exist).
pub fn restore_to_new(zip_path: &Path, target: &Path, app_version: &str) -> AppResult<workspace::WorkspaceManifest> {
    if target.exists() && !workspace::is_dir_empty(target)? {
        return Err(AppError::coded("workspace.folder_not_empty", "The destination folder must be empty"));
    }
    fs::create_dir_all(target)?;
    let tmp = target.join(APP_DIR).join("tmp");
    let report = validate(zip_path, &tmp);
    if !report.valid {
        let _ = fs::remove_dir_all(target.join(APP_DIR));
        return Err(AppError::coded("backup.invalid", report.errors.join("; ")));
    }
    let manifest = report.manifest.expect("validated manifest");
    if !manifest.kind.includes_db() {
        return Err(AppError::coded(
            "backup.no_database",
            "This backup contains only attachments and cannot create a workspace on its own",
        ));
    }
    extract(zip_path, &manifest, target)?;
    workspace::ensure_structure(target)?;
    let ws = workspace::WorkspaceManifest {
        format: workspace::MANIFEST_FORMAT.into(),
        format_version: workspace::MANIFEST_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("{} (restored)", manifest.workspace_name),
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: app_version.into(),
    };
    workspace::write_manifest(target, &ws)?;
    Ok(ws)
}

/// Deletes the oldest backups with the given label, keeping `keep` of them.
pub fn prune(root: &Path, label: &str, keep: usize) -> AppResult<usize> {
    let mut labelled: Vec<BackupInfo> = list(root)
        .into_iter()
        .filter(|b| b.manifest.as_ref().map(|m| m.label == label).unwrap_or(false))
        .collect();
    labelled.sort_by(|a, b| b.modified.cmp(&a.modified));
    let mut removed = 0;
    for b in labelled.into_iter().skip(keep) {
        fs::remove_file(&b.path)?;
        removed += 1;
    }
    Ok(removed)
}

pub fn delete(root: &Path, file_name: &str) -> AppResult<()> {
    let p = safe_join(root, &format!("Backups/{}", crate::paths::sanitize_filename(file_name)))?;
    if !p.is_file() {
        return Err(AppError::coded("io.not_found", "Backup not found"));
    }
    fs::remove_file(p)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, rusqlite::Connection) {
        let d = tempfile::tempdir().unwrap();
        workspace::create(d.path(), "Test WS", false, "1").unwrap();
        let conn = crate::db::open_connection(&workspace::db_path(d.path())).unwrap();
        conn.execute_batch(
            "CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES (3);
             CREATE TABLE notes(id TEXT, title TEXT); INSERT INTO notes VALUES ('1','first');",
        )
        .unwrap();
        fs::create_dir_all(d.path().join("Subjects/Sec")).unwrap();
        fs::write(d.path().join("Subjects/Sec/lecture.pdf"), b"%PDF lecture").unwrap();
        (d, conn)
    }

    fn make_backup(root: &Path, conn: &rusqlite::Connection, kind: BackupKind) -> BackupInfo {
        let snap = workspace::tmp_dir(root).join("snap.sqlite");
        crate::db::snapshot(conn, &snap).unwrap();
        let dest = root.join("Backups").join(backup_file_name(kind, "manual"));
        let info = write_archive(root, kind, "manual", Some(&snap), &dest, "1").unwrap();
        fs::remove_file(snap).unwrap();
        info
    }

    #[test]
    fn full_backup_validates_and_restores() {
        let (d, conn) = setup();
        let root = d.path();
        let info = make_backup(root, &conn, BackupKind::Full);
        let m = info.manifest.as_ref().unwrap();
        assert_eq!(m.schema_version, Some(3));
        assert!(m.files.iter().any(|f| f.path == "Subjects/Sec/lecture.pdf"));
        let report = validate(Path::new(&info.path), &workspace::tmp_dir(root));
        assert!(report.valid, "{:?}", report.errors);
        assert_eq!(report.database_ok, Some(true));
        assert!(report.table_counts.iter().any(|(t, c)| t == "notes" && *c == 1));
        assert_eq!(list(root).len(), 1);

        // Change data, then restore.
        conn.execute("INSERT INTO notes VALUES ('2','second')", []).unwrap();
        fs::write(root.join("Subjects/Sec/lecture.pdf"), b"changed").unwrap();
        fs::write(root.join("Subjects/Sec/new.txt"), b"new").unwrap();
        drop(conn);
        let r = restore_into(root, Path::new(&info.path)).unwrap();
        assert!(r.previous_data_rel.starts_with("Trash/pre-restore-"));
        assert_eq!(fs::read(root.join("Subjects/Sec/lecture.pdf")).unwrap(), b"%PDF lecture");
        assert!(!root.join("Subjects/Sec/new.txt").exists());
        assert!(root.join(&r.previous_data_rel).join("Subjects/Sec/new.txt").exists());
        let conn = crate::db::open_connection(&workspace::db_path(root)).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        assert!(workspace::check(root).is_ok());
    }

    #[test]
    fn detects_corrupted_and_foreign_archives() {
        let (d, conn) = setup();
        let root = d.path();
        let info = make_backup(root, &conn, BackupKind::Database);
        // Truncate the archive -> invalid
        let bytes = fs::read(&info.path).unwrap();
        let truncated = root.join("Backups/truncated.zip");
        fs::write(&truncated, &bytes[..bytes.len() / 2]).unwrap();
        let r = validate(&truncated, &workspace::tmp_dir(root));
        assert!(!r.valid);
        // Not a zip
        let junk = root.join("Backups/junk.zip");
        fs::write(&junk, b"hello").unwrap();
        assert!(!validate(&junk, &workspace::tmp_dir(root)).valid);
        // Zip without manifest
        let foreign = root.join("Backups/foreign.zip");
        {
            let mut z = zip::ZipWriter::new(fs::File::create(&foreign).unwrap());
            z.start_file("a.txt", SimpleFileOptions::default()).unwrap();
            z.write_all(b"x").unwrap();
            z.finish().unwrap();
        }
        let r = validate(&foreign, &workspace::tmp_dir(root));
        assert!(!r.valid && r.errors[0].contains("manifest"));
        // Tampered content -> checksum mismatch
        let tampered = root.join("Backups/tampered.zip");
        {
            let src = fs::File::open(&info.path).unwrap();
            let mut zin = zip::ZipArchive::new(src).unwrap();
            let mut z = zip::ZipWriter::new(fs::File::create(&tampered).unwrap());
            for i in 0..zin.len() {
                let mut f = zin.by_index(i).unwrap();
                let name = f.name().to_string();
                let mut data = vec![];
                f.read_to_end(&mut data).unwrap();
                if name == "AppData/settings.json" {
                    data = b"{\"tampered\":true}".to_vec();
                }
                z.start_file(name, SimpleFileOptions::default()).unwrap();
                z.write_all(&data).unwrap();
            }
            z.finish().unwrap();
        }
        let r = validate(&tampered, &workspace::tmp_dir(root));
        assert!(!r.valid && r.errors.iter().any(|e| e.contains("Checksum")));
        // Restoring an invalid backup must fail without touching data
        drop(conn);
        assert!(restore_into(root, &tampered).is_err());
        assert!(workspace::check(root).is_ok());
    }

    #[test]
    fn rejects_zip_slip() {
        let (d, _conn) = setup();
        let evil = d.path().join("Backups/evil.zip");
        {
            let mut z = zip::ZipWriter::new(fs::File::create(&evil).unwrap());
            z.start_file("../../evil.txt", SimpleFileOptions::default()).unwrap();
            z.write_all(b"x").unwrap();
            let m = BackupManifest {
                format: BACKUP_FORMAT.into(),
                format_version: 1,
                kind: BackupKind::Attachments,
                label: "x".into(),
                created_at: "now".into(),
                app_version: "1".into(),
                workspace_id: "x".into(),
                workspace_name: "x".into(),
                schema_version: None,
                total_size: 1,
                files: vec![BackupFileEntry { path: "../../evil.txt".into(), size: 1, sha256: "x".into() }],
            };
            z.start_file(MANIFEST_NAME, SimpleFileOptions::default()).unwrap();
            z.write_all(serde_json::to_string(&m).unwrap().as_bytes()).unwrap();
            z.finish().unwrap();
        }
        let r = validate(&evil, &workspace::tmp_dir(d.path()));
        assert!(!r.valid);
        assert!(r.errors.iter().any(|e| e.contains("Unsafe")));
    }

    #[test]
    fn restore_to_new_workspace() {
        let (d, conn) = setup();
        let info = make_backup(d.path(), &conn, BackupKind::Full);
        let other = tempfile::tempdir().unwrap();
        let target = other.path().join("restored");
        let m = restore_to_new(Path::new(&info.path), &target, "1").unwrap();
        assert!(m.name.contains("restored"));
        assert!(workspace::check(&target).is_ok());
        assert!(target.join("Subjects/Sec/lecture.pdf").exists());
        // Non-empty target is refused
        assert!(restore_to_new(Path::new(&info.path), &target, "1").is_err());
    }

    #[test]
    fn prune_keeps_newest() {
        let (d, conn) = setup();
        let root = d.path();
        for i in 0..3 {
            let snap = workspace::tmp_dir(root).join("s.sqlite");
            crate::db::snapshot(&conn, &snap).unwrap();
            let dest = root.join("Backups").join(format!("auto-{i}.zip"));
            write_archive(root, BackupKind::Database, "auto", Some(&snap), &dest, "1").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        assert_eq!(prune(root, "auto", 2).unwrap(), 1);
        assert_eq!(list(root).len(), 2);
    }
}
