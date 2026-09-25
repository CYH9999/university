//! Safe path handling. Every path coming from the frontend is treated as a
//! path *relative to the Workspace root* and is validated so it can never
//! escape the Workspace (no `..`, no absolute paths, no drive prefixes,
//! no symlink escapes).
use crate::error::{AppError, AppResult};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

const MAX_NAME_CHARS: usize = 150;

/// Normalizes a relative path string to forward slashes without leading/trailing slashes.
pub fn normalize_rel(rel: &str) -> String {
    rel.replace('\\', "/").trim_matches('/').to_string()
}

/// Joins `rel` onto `root`, rejecting anything that could escape `root`.
pub fn safe_join(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let rel = normalize_rel(rel);
    if rel.contains('\0') {
        return Err(AppError::coded("path.invalid", "Path contains a NUL byte"));
    }
    // Reject Windows drive-relative forms such as "C:foo" as well as UNC-ish input.
    if rel.contains(':') {
        return Err(AppError::coded("path.invalid", format!("Invalid path: {rel}")));
    }
    let mut out = root.to_path_buf();
    for comp in Path::new(&rel).components() {
        match comp {
            Component::Normal(c) => {
                if cfg!(windows) && !is_portable_component(&c.to_string_lossy()) {
                    return Err(AppError::coded("path.invalid", format!("Invalid file or folder name: {rel}")));
                }
                out.push(c)
            }
            Component::CurDir => {}
            _ => {
                return Err(AppError::coded(
                    "path.traversal",
                    format!("Path is outside the workspace: {rel}"),
                ))
            }
        }
    }
    ensure_within(root, &out)?;
    Ok(out)
}

/// On Windows, device names (CON, NUL, COM1…) and names ending in a dot or space do not refer
/// to ordinary files (the OS maps or silently rewrites them), so they are rejected there.
fn is_portable_component(name: &str) -> bool {
    if name.ends_with('.') || name.ends_with(' ') {
        return false;
    }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_uppercase();
    !WINDOWS_RESERVED.contains(&stem.as_str())
}

/// Ensures that the deepest existing ancestor of `target` resolves inside `root`
/// (defends against symlinks/junctions that point outside the workspace).
pub fn ensure_within(root: &Path, target: &Path) -> AppResult<()> {
    let canon_root = fs::canonicalize(root)?;
    let mut probe = target.to_path_buf();
    loop {
        if probe.exists() {
            let canon = fs::canonicalize(&probe)?;
            if !canon.starts_with(&canon_root) {
                return Err(AppError::coded(
                    "path.traversal",
                    "Path resolves outside the workspace",
                ));
            }
            return Ok(());
        }
        if !probe.pop() {
            return Err(AppError::coded("path.invalid", "Path has no existing ancestor"));
        }
    }
}

/// Converts an absolute path inside `root` back into a normalized relative path.
pub fn to_rel(root: &Path, abs: &Path) -> AppResult<String> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| AppError::coded("path.traversal", "Path is outside the workspace"))?;
    Ok(rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

/// Produces a filename that is safe on Windows (and every other platform),
/// keeping Unicode letters such as Arabic intact.
pub fn sanitize_filename(name: &str) -> String {
    let mut s: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 32 => '_',
            c => c,
        })
        .collect();
    s = s.trim().trim_end_matches(['.', ' ']).to_string();
    while s.starts_with('.') {
        s.remove(0);
    }
    if s.is_empty() {
        s = "untitled".into();
    }
    let stem_upper = s.split('.').next().unwrap_or("").to_uppercase();
    if WINDOWS_RESERVED.contains(&stem_upper.as_str()) {
        s = format!("_{s}");
    }
    if s.chars().count() > MAX_NAME_CHARS {
        let (stem, ext) = split_ext(&s);
        let keep = MAX_NAME_CHARS.saturating_sub(ext.chars().count() + 1).max(1);
        let stem: String = stem.chars().take(keep).collect();
        s = if ext.is_empty() { stem } else { format!("{stem}.{ext}") };
    }
    s
}

/// Splits a filename into (stem, extension-without-dot).
pub fn split_ext(name: &str) -> (String, String) {
    match name.rfind('.') {
        Some(i) if i > 0 && i < name.len() - 1 => (name[..i].to_string(), name[i + 1..].to_string()),
        _ => (name.to_string(), String::new()),
    }
}

/// Returns a path in `dir` for `name` that does not exist yet: "a.pdf", "a (1).pdf", ...
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = split_ext(name);
    for i in 1..10_000 {
        let n = if ext.is_empty() { format!("{stem} ({i})") } else { format!("{stem} ({i}).{ext}") };
        let c = dir.join(n);
        if !c.exists() {
            return c;
        }
    }
    dir.join(format!("{}-{}", uuid::Uuid::new_v4(), name))
}

/// Writes `data` atomically: write to a temporary sibling, fsync, then rename over the target.
/// A crash mid-write leaves the previous file intact.
pub fn atomic_write(path: &Path, data: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::coded("path.invalid", "Target has no parent directory"))?;
    fs::create_dir_all(dir)?;
    let file_name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = dir.join(format!(".{}.{}.tmp", file_name, uuid::Uuid::new_v4().simple()));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()?;
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

/// File extensions that must never be launched directly from inside the app.
pub const BLOCKED_OPEN_EXTENSIONS: &[&str] = &[
    "exe", "bat", "cmd", "com", "scr", "pif", "msi", "msp", "ps1", "psm1", "vbs", "vbe", "js",
    "jse", "wsf", "wsh", "hta", "jar", "lnk", "reg", "cpl", "sh", "application", "gadget", "inf",
    "dll", "sys", "appx", "msix", "appref-ms",
];

pub fn is_blocked_for_open(path: &Path) -> bool {
    path.extension()
        .map(|e| BLOCKED_OPEN_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(safe_join(root, "../x").is_err());
        assert!(safe_join(root, "a/../../x").is_err());
        assert!(safe_join(root, "/etc/passwd").is_ok_and(|p| p.starts_with(root)));
        assert!(safe_join(root, "C:/Windows").is_err());
        assert!(safe_join(root, "C:foo").is_err());
        assert!(safe_join(root, "..\\..\\x").is_err());
        assert!(safe_join(root, "Subjects/Net/a.pdf").is_ok());
        assert!(safe_join(root, "a\0b").is_err());
    }

    #[test]
    fn portable_component_names() {
        assert!(is_portable_component("Subjects"));
        assert!(is_portable_component("محاضرة 1.pdf"));
        assert!(is_portable_component("console.log"));
        assert!(!is_portable_component("CON"));
        assert!(!is_portable_component("nul.txt"));
        assert!(!is_portable_component("COM1.pdf"));
        assert!(!is_portable_component("notes."));
        assert!(!is_portable_component("notes "));
    }

    #[cfg(windows)]
    #[test]
    fn windows_paths_stay_inside_the_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        assert!(safe_join(root, "Subjects\\Networks\\lecture.pdf").is_ok_and(|p| p.starts_with(root)));
        assert!(safe_join(root, "..\\..\\Windows\\System32").is_err());
        assert!(safe_join(root, "C:\\Windows").is_err());
        assert!(safe_join(root, "\\\\server\\share\\x").is_ok_and(|p| p.starts_with(root)));
        assert!(safe_join(root, "Subjects/CON").is_err());
        assert!(safe_join(root, "Subjects/aux.txt").is_err());
        assert!(safe_join(root, "Subjects/name.").is_err());
        assert!(safe_join(root, "file.txt:stream").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dir = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        assert!(safe_join(dir.path(), "link/secret.txt").is_err());
    }

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_filename("a/b\\c:d*?.pdf"), "a_b_c_d__.pdf");
        assert_eq!(sanitize_filename("  CON.txt "), "_CON.txt");
        assert_eq!(sanitize_filename("..."), "untitled");
        assert_eq!(sanitize_filename("محاضرة أمن الحاسوب.pdf"), "محاضرة أمن الحاسوب.pdf");
        assert_eq!(sanitize_filename(".hidden"), "hidden");
        let long = format!("{}.pdf", "x".repeat(400));
        let s = sanitize_filename(&long);
        assert!(s.ends_with(".pdf") && s.chars().count() <= MAX_NAME_CHARS);
    }

    #[test]
    fn unique_paths_do_not_collide() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.pdf"), b"1").unwrap();
        assert_eq!(unique_path(dir.path(), "a.pdf"), dir.path().join("a (1).pdf"));
    }

    #[test]
    fn atomic_write_replaces_content() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("s.json");
        atomic_write(&p, b"one").unwrap();
        atomic_write(&p, b"two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn blocks_executables() {
        assert!(is_blocked_for_open(Path::new("x/run.EXE")));
        assert!(is_blocked_for_open(Path::new("a.ps1")));
        assert!(!is_blocked_for_open(Path::new("a.pdf")));
    }
}
