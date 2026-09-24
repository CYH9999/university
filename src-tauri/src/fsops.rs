//! Filesystem operations inside the Workspace. All functions take the Workspace root and
//! relative paths, and validate them with `paths::safe_join`.
use crate::error::{AppError, AppResult};
use crate::paths::{atomic_write, normalize_rel, safe_join, sanitize_filename, split_ext, to_rel, unique_path};
use crate::workspace::{APP_DIR, USER_DIRS};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub rel_path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub ext: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFile {
    pub source: String,
    pub name: String,
    pub rel_path: Option<String>,
    pub size: u64,
    pub sha256: Option<String>,
    pub ext: String,
    pub error: Option<String>,
    pub error_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub rel_path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn ext_of(name: &str) -> String {
    split_ext(name).1.to_lowercase()
}

fn is_internal_name(name: &str) -> bool {
    name.ends_with(".tmp") || name.ends_with(".partial") || name.starts_with(".unios-")
}

/// Paths the file manager may modify: inside a top-level user folder, never AppData,
/// and never the top-level folders themselves.
pub fn guard_mutable(rel: &str) -> AppResult<()> {
    let rel = normalize_rel(rel);
    let mut parts = rel.split('/').filter(|p| !p.is_empty());
    let first = parts.next().unwrap_or("");
    if first.eq_ignore_ascii_case(APP_DIR) {
        return Err(AppError::coded("fs.protected", "AppData is managed by the application"));
    }
    if !USER_DIRS.iter().any(|d| d.eq_ignore_ascii_case(first)) {
        return Err(AppError::coded("fs.protected", "Only files inside workspace folders can be changed"));
    }
    if parts.next().is_none() {
        return Err(AppError::coded("fs.protected", "Workspace folders cannot be renamed, moved or deleted"));
    }
    Ok(())
}

fn guard_readable(rel: &str) -> AppResult<()> {
    let rel = normalize_rel(rel);
    if rel.split('/').next().unwrap_or("").eq_ignore_ascii_case(APP_DIR) {
        return Err(AppError::coded("fs.protected", "AppData is managed by the application"));
    }
    Ok(())
}

pub fn list_dir(root: &Path, rel: &str) -> AppResult<Vec<DirEntry>> {
    guard_readable(rel)?;
    let dir = safe_join(root, rel)?;
    let mut out = vec![];
    for e in fs::read_dir(&dir)? {
        let e = e?;
        let name = e.file_name().to_string_lossy().to_string();
        if is_internal_name(&name) || (normalize_rel(rel).is_empty() && name == APP_DIR) {
            continue;
        }
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        out.push(DirEntry {
            rel_path: to_rel(root, &e.path())?,
            is_dir: meta.is_dir(),
            size: if meta.is_dir() { 0 } else { meta.len() },
            modified: mtime_ms(&meta),
            ext: if meta.is_dir() { String::new() } else { ext_of(&name) },
            name,
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// Streams `src` into `dest` while computing SHA-256. Writes to a `.partial` file first.
pub fn copy_with_hash(src: &Path, dest: &Path) -> AppResult<(u64, String)> {
    let partial = dest.with_file_name(format!(
        "{}.partial",
        dest.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    ));
    let res = (|| -> AppResult<(u64, String)> {
        let mut input = fs::File::open(src)?;
        let mut output = fs::File::create(&partial)?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 256 * 1024];
        let mut total = 0u64;
        loop {
            let n = input.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            output.write_all(&buf[..n])?;
            total += n as u64;
        }
        output.sync_all()?;
        drop(output);
        fs::rename(&partial, dest)?;
        Ok((total, hex::encode(hasher.finalize())))
    })();
    if res.is_err() {
        let _ = fs::remove_file(&partial);
    }
    res
}

pub fn hash_path(path: &Path) -> AppResult<String> {
    let mut f = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Copies external files (chosen by the user) into the Workspace. Each file is reported
/// individually so a single failure never hides the successful imports.
pub fn import_files(root: &Path, sources: &[String], dest_rel: &str) -> AppResult<Vec<ImportedFile>> {
    guard_readable(dest_rel)?;
    let dest_dir = safe_join(root, dest_rel)?;
    fs::create_dir_all(&dest_dir)?;
    crate::paths::ensure_within(root, &dest_dir)?;
    let mut out = vec![];
    for s in sources {
        let src = PathBuf::from(s);
        let raw_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let name = sanitize_filename(&raw_name);
        let mut item = ImportedFile {
            source: s.clone(),
            name: name.clone(),
            rel_path: None,
            size: 0,
            sha256: None,
            ext: ext_of(&name),
            error: None,
            error_code: None,
        };
        if !src.is_file() {
            item.error = Some("Source is not a file".into());
            item.error_code = Some("io.not_found".into());
            out.push(item);
            continue;
        }
        let target = unique_path(&dest_dir, &name);
        match copy_with_hash(&src, &target) {
            Ok((size, sha)) => {
                item.size = size;
                item.sha256 = Some(sha);
                item.name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(name);
                item.rel_path = Some(to_rel(root, &target)?);
            }
            Err(e) => {
                item.error_code = Some(e.code().to_string());
                item.error = Some(e.to_string());
            }
        }
        out.push(item);
    }
    Ok(out)
}

pub fn create_dir(root: &Path, parent_rel: &str, name: &str) -> AppResult<String> {
    guard_readable(parent_rel)?;
    let parent = safe_join(root, parent_rel)?;
    let target = parent.join(sanitize_filename(name));
    if target.exists() {
        return Err(AppError::coded("io.already_exists", "A file or folder with this name already exists"));
    }
    fs::create_dir_all(&target)?;
    to_rel(root, &target)
}

/// Creates a folder path (all segments sanitized) if needed; used for subject/project folders.
pub fn ensure_dir(root: &Path, rel: &str) -> AppResult<String> {
    guard_readable(rel)?;
    let clean: Vec<String> = normalize_rel(rel).split('/').filter(|p| !p.is_empty()).map(sanitize_filename).collect();
    let target = safe_join(root, &clean.join("/"))?;
    fs::create_dir_all(&target)?;
    to_rel(root, &target)
}

pub fn rename(root: &Path, rel: &str, new_name: &str) -> AppResult<String> {
    guard_mutable(rel)?;
    let src = safe_join(root, rel)?;
    if !src.exists() {
        return Err(AppError::coded("io.not_found", "The item no longer exists"));
    }
    let name = sanitize_filename(new_name);
    let target = src.parent().unwrap_or(root).join(&name);
    if target == src {
        return to_rel(root, &src);
    }
    // Allow case-only renames on case-insensitive filesystems.
    let case_only = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if target.exists() && !case_only {
        return Err(AppError::coded("io.already_exists", "A file or folder with this name already exists"));
    }
    fs::rename(&src, &target)?;
    to_rel(root, &target)
}

pub fn move_to(root: &Path, rel: &str, dest_dir_rel: &str) -> AppResult<String> {
    guard_mutable(rel)?;
    guard_readable(dest_dir_rel)?;
    let src = safe_join(root, rel)?;
    let dest_dir = safe_join(root, dest_dir_rel)?;
    if !dest_dir.is_dir() {
        return Err(AppError::coded("io.not_found", "Destination folder does not exist"));
    }
    if src.is_dir() && dest_dir.starts_with(&src) {
        return Err(AppError::coded("fs.move_into_self", "A folder cannot be moved into itself"));
    }
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if src.parent() == Some(dest_dir.as_path()) {
        return to_rel(root, &src);
    }
    let target = unique_path(&dest_dir, &name);
    fs::rename(&src, &target).or_else(|_| {
        // Cross-device move fallback: copy then delete.
        copy_recursive(&src, &target)?;
        remove_any(&src)
    })?;
    to_rel(root, &target)
}

fn copy_recursive(src: &Path, dest: &Path) -> AppResult<()> {
    if src.is_dir() {
        fs::create_dir_all(dest)?;
        for entry in walkdir::WalkDir::new(src).min_depth(1) {
            let entry = entry.map_err(|e| AppError::coded("io.error", e.to_string()))?;
            let rel = entry.path().strip_prefix(src).map_err(|_| AppError::coded("io.error", "walk error"))?;
            let target = dest.join(rel);
            if entry.file_type().is_dir() {
                fs::create_dir_all(&target)?;
            } else if entry.file_type().is_file() {
                fs::copy(entry.path(), &target)?;
            }
        }
        Ok(())
    } else {
        copy_with_hash(src, dest).map(|_| ())
    }
}

fn remove_any(p: &Path) -> AppResult<()> {
    if p.is_dir() {
        fs::remove_dir_all(p)?;
    } else {
        fs::remove_file(p)?;
    }
    Ok(())
}

pub fn copy_to(root: &Path, rel: &str, dest_dir_rel: &str) -> AppResult<String> {
    guard_mutable(rel)?;
    guard_readable(dest_dir_rel)?;
    let src = safe_join(root, rel)?;
    let dest_dir = safe_join(root, dest_dir_rel)?;
    if src.is_dir() && dest_dir.starts_with(&src) {
        return Err(AppError::coded("fs.move_into_self", "A folder cannot be copied into itself"));
    }
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let target = unique_path(&dest_dir, &name);
    copy_recursive(&src, &target)?;
    to_rel(root, &target)
}

/// Moves an item to Workspace/Trash and returns its new relative path.
pub fn trash(root: &Path, rel: &str) -> AppResult<String> {
    guard_mutable(rel)?;
    let src = safe_join(root, rel)?;
    if !src.exists() {
        return Err(AppError::coded("io.not_found", "The item no longer exists"));
    }
    let trash_dir = root.join("Trash");
    fs::create_dir_all(&trash_dir)?;
    if src.starts_with(&trash_dir) {
        return Err(AppError::coded("fs.already_in_trash", "The item is already in the trash"));
    }
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stamped = format!("{}__{}", chrono::Local::now().format("%Y%m%d-%H%M%S"), name);
    let target = unique_path(&trash_dir, &stamped);
    fs::rename(&src, &target)?;
    to_rel(root, &target)
}

/// Moves an item out of the Trash back to `original_rel` (or a non-colliding sibling name).
pub fn restore(root: &Path, trash_rel: &str, original_rel: &str) -> AppResult<String> {
    let src = safe_join(root, trash_rel)?;
    if !normalize_rel(trash_rel).starts_with("Trash/") || !src.exists() {
        return Err(AppError::coded("io.not_found", "The item is not in the trash"));
    }
    guard_mutable(original_rel)?;
    let orig = safe_join(root, original_rel)?;
    let parent = orig.parent().unwrap_or(root).to_path_buf();
    fs::create_dir_all(&parent)?;
    let name = orig.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let target = unique_path(&parent, &name);
    fs::rename(&src, &target)?;
    to_rel(root, &target)
}

pub fn delete_permanent(root: &Path, trash_rel: &str) -> AppResult<()> {
    let rel = normalize_rel(trash_rel);
    if !rel.starts_with("Trash/") {
        return Err(AppError::coded("fs.protected", "Only items in the trash can be deleted permanently"));
    }
    let p = safe_join(root, &rel)?;
    if p.exists() {
        remove_any(&p)?;
    }
    Ok(())
}

pub fn empty_trash(root: &Path) -> AppResult<usize> {
    let dir = root.join("Trash");
    let mut n = 0;
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            remove_any(&e.path())?;
            n += 1;
        }
    }
    Ok(n)
}

pub fn stat_many(root: &Path, rels: &[String]) -> Vec<FileStat> {
    rels.iter()
        .map(|r| {
            let meta = safe_join(root, r).ok().and_then(|p| fs::metadata(p).ok());
            FileStat {
                rel_path: r.clone(),
                exists: meta.is_some(),
                is_dir: meta.as_ref().map(|m| m.is_dir()).unwrap_or(false),
                size: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                modified: meta.as_ref().map(mtime_ms).unwrap_or(0),
            }
        })
        .collect()
}

pub fn write_text(root: &Path, rel: &str, content: &str) -> AppResult<String> {
    guard_readable(rel)?;
    let p = safe_join(root, rel)?;
    atomic_write(&p, content.as_bytes())?;
    to_rel(root, &p)
}

const MAX_TEXT_READ: u64 = 64 * 1024 * 1024;

pub fn read_text(root: &Path, rel: &str) -> AppResult<String> {
    guard_readable(rel)?;
    let p = safe_join(root, rel)?;
    let meta = fs::metadata(&p)?;
    if meta.len() > MAX_TEXT_READ {
        return Err(AppError::coded("fs.too_large", "File is too large to open in the app"));
    }
    let bytes = fs::read(&p)?;
    String::from_utf8(bytes).map_err(|_| AppError::coded("fs.not_text", "File is not valid UTF-8 text"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub files: u64,
    pub bytes: u64,
}

pub fn folder_stats(root: &Path, rel: &str) -> AppResult<FolderStats> {
    let p = safe_join(root, rel)?;
    let mut s = FolderStats { files: 0, bytes: 0 };
    for e in walkdir::WalkDir::new(p).into_iter().flatten() {
        if e.file_type().is_file() {
            s.files += 1;
            s.bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace;

    fn ws() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        workspace::create(d.path(), "T", false, "1").unwrap();
        d
    }

    #[test]
    fn import_rename_move_trash_restore() {
        let d = ws();
        let root = d.path();
        let ext = tempfile::tempdir().unwrap();
        let src = ext.path().join("Lecture 1.pdf");
        fs::write(&src, b"%PDF-1.4 test").unwrap();
        let res = import_files(root, &[src.to_string_lossy().to_string(), "/no/such/file".into()], "Subjects/Security").unwrap();
        assert_eq!(res[0].rel_path.as_deref(), Some("Subjects/Security/Lecture 1.pdf"));
        assert_eq!(res[0].size, 13);
        assert!(res[1].error.is_some());
        // second import of same name does not overwrite
        let res2 = import_files(root, &[src.to_string_lossy().to_string()], "Subjects/Security").unwrap();
        assert_eq!(res2[0].rel_path.as_deref(), Some("Subjects/Security/Lecture 1 (1).pdf"));
        assert_eq!(res[0].sha256, res2[0].sha256);

        let renamed = rename(root, "Subjects/Security/Lecture 1.pdf", "L1.pdf").unwrap();
        assert_eq!(renamed, "Subjects/Security/L1.pdf");
        create_dir(root, "Subjects/Security", "Week 1").unwrap();
        let moved = move_to(root, &renamed, "Subjects/Security/Week 1").unwrap();
        assert_eq!(moved, "Subjects/Security/Week 1/L1.pdf");
        let copied = copy_to(root, &moved, "Attachments").unwrap();
        assert_eq!(copied, "Attachments/L1.pdf");
        let t = trash(root, &moved).unwrap();
        assert!(t.starts_with("Trash/"));
        assert!(!safe_join(root, &moved).unwrap().exists());
        let back = restore(root, &t, &moved).unwrap();
        assert_eq!(back, moved);
        let stats = stat_many(root, &[moved.clone(), "Attachments/missing.pdf".into()]);
        assert!(stats[0].exists && !stats[1].exists);
    }

    #[test]
    fn protects_appdata_and_top_level_folders() {
        let d = ws();
        let root = d.path();
        assert!(trash(root, "AppData/database.sqlite").is_err());
        assert!(rename(root, "Subjects", "X").is_err());
        assert!(trash(root, "../outside").is_err());
        assert!(list_dir(root, "AppData").is_err());
        assert!(write_text(root, "AppData/evil.txt", "x").is_err());
        assert!(delete_permanent(root, "Subjects/a").is_err());
        assert!(move_to(root, "Subjects/a", "../").is_err());
    }

    #[test]
    fn cannot_move_folder_into_itself() {
        let d = ws();
        let root = d.path();
        create_dir(root, "Projects", "A").unwrap();
        create_dir(root, "Projects/A", "B").unwrap();
        assert_eq!(move_to(root, "Projects/A", "Projects/A/B").unwrap_err().code(), "fs.move_into_self");
    }

    #[test]
    fn text_roundtrip() {
        let d = ws();
        let r = write_text(d.path(), "Whiteboards/board.excalidraw", "{\"a\":1}").unwrap();
        assert_eq!(read_text(d.path(), &r).unwrap(), "{\"a\":1}");
    }
}
