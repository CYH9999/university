// Shared WebDriver helpers for the end-to-end tests of the real desktop app (tauri-driver).
//
// Environment:
//   E2E_APP           path of the application binary (default: the debug build in src-tauri/target)
//   TAURI_DRIVER      path of tauri-driver (default: ~/.cargo/bin/tauri-driver or tauri-driver on PATH)
//   NATIVE_DRIVER     path of msedgedriver.exe (Windows) or WebKitWebDriver (Linux), if not on PATH
//   E2E_RESET_APPDATA "1" to delete the app's own config folder (workspace pointer) before starting —
//                     only for disposable machines such as CI runners.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const root = resolve(import.meta.dirname, "..");
export const isWindows = process.platform === "win32";
const conf = JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8"));
export const identifier = conf.identifier;

function defaultApp() {
  const dir = join(root, "src-tauri/target/debug");
  for (const name of [conf.mainBinaryName, "unios"].filter(Boolean)) {
    const p = join(dir, isWindows ? `${name}.exe` : name);
    if (existsSync(p)) return p;
  }
  return join(dir, isWindows ? "University.exe" : "University");
}
export const app = process.env.E2E_APP || defaultApp();

// Top-level translation namespaces ("nav", "common", …): text like "nav.dashboard" on screen is a raw key.
const localeDir = join(root, "src/i18n/locales/en");
export const namespaces = [...new Set(readdirSync(localeDir).flatMap((f) => [...readFileSync(join(localeDir, f), "utf8").matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])))];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRun(name) {
  const tmp = join(root, "e2e/.tmp", name);
  const home = join(tmp, "home");
  const shots = join(tmp, "shots");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  mkdirSync(shots, { recursive: true });

  if (process.env.E2E_RESET_APPDATA === "1") {
    // Only the app's own pointer/config folder; never a workspace.
    const base = isWindows ? process.env.APPDATA : join(homedir(), ".config");
    if (base) rmSync(join(base, identifier), { recursive: true, force: true });
  }

  // Linux: tauri-driver in front of WebKitWebDriver. Windows: msedgedriver is driven directly
  // (that is all tauri-driver does there), which also gives verbose driver logs.
  const edgeDirect = isWindows && !!process.env.NATIVE_DRIVER;
  const driverLog = join(tmp, "driver.log");
  const logFd = openSync(driverLog, "a");
  let driver;
  if (edgeDirect) {
    driver = spawn(process.env.NATIVE_DRIVER, ["--port=4444", "--verbose", `--log-path=${driverLog}`], { stdio: ["ignore", logFd, logFd] });
  } else {
    const driverPath = process.env.TAURI_DRIVER || (existsSync(join(homedir(), ".cargo/bin/tauri-driver")) ? join(homedir(), ".cargo/bin/tauri-driver") : "tauri-driver");
    const driverArgs = process.env.NATIVE_DRIVER ? ["--native-driver", process.env.NATIVE_DRIVER] : [];
    // On Linux the app's config is isolated in a throwaway HOME; Windows uses %APPDATA% (see E2E_RESET_APPDATA).
    const env = isWindows ? { ...process.env } : { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share") };
    driver = spawn(driverPath, driverArgs, { env, stdio: ["ignore", logFd, logFd] });
  }
  const capabilities = edgeDirect
    ? { alwaysMatch: { browserName: "webview2", "ms:edgeOptions": { binary: app, webviewOptions: {} } } }
    : { alwaysMatch: { "tauri:options": { application: app }, browserName: "wry" } };
  const driverTail = () => {
    try {
      return readFileSync(driverLog, "utf8").split(/\r?\n/).slice(-60).join("\n");
    } catch {
      return "";
    }
  };

  const W = "http://127.0.0.1:4444";
  let sid = null;
  const results = [];

  async function req(method, path, body) {
    // Every WebDriver call is bounded, so a stuck driver fails the run instead of hanging it.
    const r = await fetch(W + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
    const j = await r.json();
    if (j.value && j.value.error) throw new Error(`${path}: ${j.value.error} ${j.value.message}`);
    return j.value;
  }
  const s = (p) => `/session/${sid}${p}`;
  const exec = (script, args = []) => req("POST", s("/execute/sync"), { script, args });
  const execAsync = (script, args = []) => req("POST", s("/execute/async"), { script, args });

  async function find(css, timeout = 15000) {
    const end = Date.now() + timeout;
    for (;;) {
      try {
        const el = await req("POST", s("/element"), { using: "css selector", value: css });
        return Object.values(el)[0];
      } catch {
        if (Date.now() > end) throw new Error(`not found: ${css}`);
        await sleep(300);
      }
    }
  }
  async function click(css, timeout) {
    await req("POST", s(`/element/${await find(css, timeout)}/click`), {});
  }
  /** Clicks the first visible, enabled button whose text contains one of `texts`. */
  async function clickText(texts, timeout = 15000) {
    const list = Array.isArray(texts) ? texts : [texts];
    const end = Date.now() + timeout;
    for (;;) {
      const ok = await exec(
        "const b=[...document.querySelectorAll('button,[role=menuitem]')].find(x=>arguments[0].some(t=>x.textContent.includes(t))&&!x.disabled&&x.offsetParent!==null);if(b){b.click();return true}return false",
        [list],
      );
      if (ok) return;
      if (Date.now() > end) throw new Error(`button not found: ${list.join(" / ")}`);
      await sleep(300);
    }
  }
  async function type(css, value) {
    const id = await find(css);
    await req("POST", s(`/element/${id}/clear`), {});
    await req("POST", s(`/element/${id}/value`), { text: value });
  }
  async function keys(css, value) {
    const id = await find(css);
    await req("POST", s(`/element/${id}/value`), { text: value });
  }
  async function shot(file) {
    const b64 = await req("GET", s("/screenshot"));
    writeFileSync(join(shots, `${file}.png`), Buffer.from(b64, "base64"));
  }
  async function waitFor(fn, what, timeout = 20000, args = []) {
    const end = Date.now() + timeout;
    for (;;) {
      if (await exec(fn, args)) return;
      if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
      await sleep(300);
    }
  }
  const waitText = (text, what = text, timeout = 20000) => waitFor("return document.body.innerText.includes(arguments[0])", what, timeout, [text]);
  const hasText = (text) => exec("return document.body.innerText.includes(arguments[0])", [text]);
  async function go(hash, settle = 900) {
    await exec("location.hash = arguments[0]", [hash]);
    await sleep(settle);
  }

  /** Calls a backend command through the app's own IPC bridge; resolves to { ok } or { err }. */
  const invoke = (cmd, args = {}) =>
    execAsync(
      "const done=arguments[arguments.length-1];window.__TAURI_INTERNALS__.invoke(arguments[0],arguments[1]).then(r=>done({ok:r===undefined?null:r}),e=>done({err:typeof e==='string'?e:JSON.stringify(e)}))",
      [cmd, args],
    );

  /**
   * Answers the next native open/save dialogs with the given paths (see the test seam in
   * src/platform/tauri.ts). Only the dialog is replaced; the app then processes the paths exactly
   * as if the user had picked them.
   */
  async function stubDialogs({ open = [], save = [] } = {}) {
    await exec("window.__UNIVERSITY_E2E_DIALOGS__ = { open: arguments[0], save: arguments[1] }; return true;", [open, save]);
  }

  // Windows fallback ("attach mode"): the test starts the app itself with WebView2 remote debugging
  // enabled and msedgedriver attaches to it (documented WebView2 automation mode).
  let attachMode = edgeDirect && process.env.E2E_ATTACH === "1";
  let appProc = null;
  async function launchForAttach() {
    const port = 9222;
    appProc = spawn(app, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: "ignore" });
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
        if (r.ok) return `127.0.0.1:${port}`;
      } catch {
        /* not up yet */
      }
      if (appProc.exitCode !== null) throw new Error(`the app exited with code ${appProc.exitCode}`);
      await sleep(500);
    }
    throw new Error("the WebView2 remote debugging port did not open");
  }
  async function closeApp() {
    if (!appProc || appProc.exitCode !== null) return;
    // Ask the window to close (lets the app flush), then force it after a grace period.
    spawnSync("taskkill", ["/PID", String(appProc.pid)], { stdio: "ignore" });
    for (let i = 0; i < 20 && appProc.exitCode === null; i++) await sleep(500);
    if (appProc.exitCode === null) spawnSync("taskkill", ["/PID", String(appProc.pid), "/T", "/F"], { stdio: "ignore" });
    appProc = null;
  }

  async function startSession() {
    const end = Date.now() + (attachMode || !edgeDirect ? 180000 : 90000);
    let last = null;
    while (Date.now() < end) {
      try {
        const caps = attachMode ? { alwaysMatch: { browserName: "webview2", "ms:edgeOptions": { debuggerAddress: await launchForAttach() } } } : capabilities;
        const v = await req("POST", "/session", { capabilities: caps });
        sid = v.sessionId;
        log(`session started${attachMode ? " (attach mode)" : ""}`);
        return;
      } catch (e) {
        last = e;
        if (attachMode) await closeApp();
        await sleep(1000);
      }
    }
    console.log(`--- WebDriver log (tail) ---\n${driverTail()}\n---`);
    if (edgeDirect && !attachMode) {
      log(`launch mode failed (${last?.message ?? "timeout"}); switching to attach mode`);
      attachMode = true;
      return startSession();
    }
    throw new Error(`could not start WebDriver session: ${last?.message ?? "timeout"}`);
  }
  async function endSession() {
    if (sid) await req("DELETE", s("")).catch(() => {});
    sid = null;
    if (attachMode) await closeApp();
    // Give the app time to exit and release file handles (Windows locks open files).
    await sleep(isWindows ? 4000 : 1500);
  }
  const started = Date.now();
  const stamp = () => `[${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s]`;
  function log(msg) {
    console.log(`${stamp()} ${msg}`);
  }
  function check(label, ok, detail = "") {
    results.push({ name: label, ok, detail });
    console.log(`${stamp()} ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  }
  function note(label, detail = "") {
    results.push({ name: label, ok: true, info: true, detail });
    console.log(`${stamp()} INFO  ${label}${detail ? ` — ${detail}` : ""}`);
  }

  /** Raw translation keys visible on screen (text, placeholders, tooltips, aria labels) + keys reported missing. */
  const RAW_SCAN = `
    const ns = arguments[0];
    const re = new RegExp("\\\\b(" + ns.join("|") + ")\\\\.[A-Za-z_][A-Za-z0-9_]*(\\\\.[A-Za-z0-9_]+)*", "g");
    const files = /\\.(json|sqlite|zip|excalidraw|md|html|svg|pdf|log|txt)$/;
    const texts = [document.body.innerText];
    for (const el of document.querySelectorAll("[placeholder],[title],[aria-label]")) {
      for (const a of ["placeholder", "title", "aria-label"]) if (el.getAttribute(a)) texts.push(el.getAttribute(a));
    }
    const found = new Set();
    for (const t of texts) for (const m of t.matchAll(re)) if (!files.test(m[0])) found.add(m[0]);
    return { raw: [...found], missing: window.__i18nMissing || [], dir: document.documentElement.dir, lang: document.documentElement.lang };
  `;
  const scan = () => exec(RAW_SCAN, [namespaces]);

  /** Retries a filesystem operation that Windows may briefly block (file locks, antivirus scans). */
  async function retryFs(fn, attempts = 20) {
    for (let i = 0; ; i++) {
      try {
        return fn();
      } catch (e) {
        if (i >= attempts) throw e;
        await sleep(1000);
      }
    }
  }

  async function finish() {
    if (results.some((r) => !r.ok)) console.log(`--- WebDriver log (tail) ---\n${driverTail()}\n---`);
    await closeApp();
    driver.kill();
    const failed = results.filter((r) => !r.ok).length;
    const passed = results.filter((r) => r.ok && !r.info).length;
    console.log(`\n${passed}/${passed + failed} checks passed`);
    writeFileSync(join(tmp, "results.json"), JSON.stringify({ app, platform: process.platform, results }, null, 2));
    process.exit(failed ? 1 : 0);
  }

  return {
    tmp, shots, results, req, exec, execAsync, find, click, clickText, type, keys, shot, waitFor, waitText, hasText, go, invoke, stubDialogs, retryFs,
    startSession, endSession, check, note, log, scan, finish,
    get sid() {
      return sid;
    },
  };
}
