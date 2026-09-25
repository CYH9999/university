# University

An offline-first desktop app for university life — semesters, subjects, timetable, notes, exams
and assignments, tasks, grades and GPA, files, projects, research library, whiteboards, journal,
goals, study timer, expenses and a cybersecurity lab — in Arabic (RTL) and English (LTR).

Everything is stored in a **Workspace folder that you choose**. There are no accounts, no cloud
and no tracking.

## Installing on Windows (x64)

1. Run `University_1.0.0_x64-setup.exe`.
   - It installs for the current user (no administrator rights needed) into
     `%LOCALAPPDATA%\University`.
   - The installer is not code-signed yet, so Windows SmartScreen may show
     "Windows protected your PC" → **More info** → **Run anyway**.
2. Start **University** from the Start Menu (the installer's last page can also create a desktop
   shortcut).
3. On first launch, create or choose your Workspace folder (for example in *Documents* or on an
   external drive). University creates its folder structure inside it.

An MSI package (`University_1.0.0_x64_en-US.msi`, installs for all users, needs administrator
rights) is produced by the Windows CI build as well.

University needs the Microsoft Edge WebView2 runtime, which is part of Windows 10 and 11. If it
is missing, the installer downloads it (this is the only step that needs an internet connection).

### Where your data lives

| What | Where |
|---|---|
| Your data (database, files, backups) | the Workspace folder you chose |
| Which workspace to open, UI language | `%APPDATA%\app.university.desktop\` |
| WebView cache | `%LOCALAPPDATA%\app.university.desktop\` |

If the Workspace folder is moved, renamed or on a disconnected drive, University shows a recovery
screen instead of starting with an empty workspace.

### Uninstalling

**Settings → Apps → Installed apps → University → Uninstall.** The Workspace folder is never
deleted by the uninstaller; the optional "delete app data" checkbox only removes the two folders
listed above.

## Building

Requirements: Node.js 22, Rust (stable) and, on Windows, the Visual Studio C++ build tools.

```sh
npm ci
npx tauri build            # on Windows: NSIS installer + MSI in src-tauri/target/release/bundle/
```

Cross-compiling the NSIS installer on Linux (MSI needs Windows) is also possible:

```sh
sudo apt-get install nsis mingw-w64
rustup target add x86_64-pc-windows-gnu
npx tauri build --target x86_64-pc-windows-gnu --bundles nsis
```

The GitHub Actions workflow `.github/workflows/windows.yml` builds both installers on Windows,
installs the NSIS build silently and launches it, runs the end-to-end tests on Windows,
uninstalls it, installs/launches/uninstalls the MSI, and uploads the installers as artifacts.
WebDriver needs WebView2 remote debugging, which production builds disable, so the end-to-end
tests drive a test binary of the same source built with `--features tauri/devtools`; that binary
is never shipped.

## Testing

```sh
npx tsc -b && npx eslint . && npx vitest run      # type check, lint, unit tests (incl. i18n)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust backend tests
npx tauri build --debug --no-bundle
xvfb-run -a node e2e/smoke.mjs                    # onboarding, all pages in AR/EN, restart, recovery
xvfb-run -a node e2e/data.mjs                     # files, PDFs, persistence, backup and restore
```
