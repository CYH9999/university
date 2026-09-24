// End-to-end smoke test of the real Tauri app (Linux, WebKitWebDriver via tauri-driver).
// Usage: xvfb-run -a node e2e/smoke.mjs   (build first: npx tauri build --debug --no-bundle)
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, renameSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = join(root, "src-tauri/target/debug/unios");
const tmp = join(root, "e2e/.tmp");
const home = join(tmp, "home");
const ws = join(tmp, "Workspace");
const shots = join(tmp, "shots");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(home, { recursive: true });
mkdirSync(shots, { recursive: true });

// Top-level translation namespaces ("nav", "common", …): text like "nav.dashboard" on screen is a raw key.
const localeDir = join(root, "src/i18n/locales/en");
const namespaces = [...new Set(readdirSync(localeDir).flatMap((f) => [...readFileSync(join(localeDir, f), "utf8").matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])))];

const driver = spawn(join(process.env.HOME, ".cargo/bin/tauri-driver"), [], {
  env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share") },
  stdio: "ignore",
});
const W = "http://127.0.0.1:4444";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let sid = null;
const results = [];

async function req(method, path, body) {
  const r = await fetch(W + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (j.value && j.value.error) throw new Error(`${path}: ${j.value.error} ${j.value.message}`);
  return j.value;
}
const s = (p) => `/session/${sid}${p}`;
const exec = (script, args = []) => req("POST", s("/execute/sync"), { script, args });
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
async function type(css, value) {
  const id = await find(css);
  await req("POST", s(`/element/${id}/clear`), {});
  await req("POST", s(`/element/${id}/value`), { text: value });
}
async function shot(name) {
  const b64 = await req("GET", s("/screenshot"));
  writeFileSync(join(shots, `${name}.png`), Buffer.from(b64, "base64"));
}
async function waitFor(fn, what, timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await exec(fn)) return;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(300);
  }
}
async function startSession() {
  for (let i = 0; i < 40; i++) {
    try {
      const v = await req("POST", "/session", { capabilities: { alwaysMatch: { "tauri:options": { application: app }, browserName: "wry" } } });
      sid = v.sessionId;
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error("could not start WebDriver session");
}
async function endSession() {
  if (sid) await req("DELETE", s("")).catch(() => {});
  sid = null;
  await sleep(1500);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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

const ROUTES = ["/", "/search", "/notifications", "/semesters", "/subjects", "/timetable", "/notes", "/deadlines", "/tasks", "/grades", "/questions", "/projects", "/files", "/research", "/whiteboards", "/journal", "/goals", "/study", "/expenses", "/cyber", "/cyber/commands", "/cyber/ctf", "/cyber/labs", "/cyber/roadmaps", "/analytics", "/backup", "/data", "/settings", "/settings?tab=workspace", "/settings?tab=notifications", "/settings?tab=grading", "/settings?tab=tags", "/settings?tab=maintenance", "/settings?tab=privacy"];
const SHOT_ROUTES = { "/": "dashboard", "/subjects": "subjects", "/notes": "notes", "/files": "files", "/projects": "projects", "/cyber": "cyber", "/settings": "settings", "/backup": "backup" };

/** Visits every route; returns crashed routes and raw keys per route. */
async function sweep(lang) {
  const crashed = [];
  const raw = {};
  let missing = [];
  for (const r of ROUTES) {
    await exec(`location.hash = '#${r}'`);
    await sleep(900);
    if (await exec("return !!document.querySelector('[data-testid=page-crashed]') || document.body.innerText.includes('errors.pageCrashed')")) crashed.push(r);
    const res = await scan();
    if (res.raw.length) raw[r] = res.raw;
    missing = res.missing;
    if (SHOT_ROUTES[r]) await shot(`${lang}-${SHOT_ROUTES[r]}`);
  }
  // Dialog surfaces: command palette and a create drawer.
  await exec("location.hash = '#/'");
  await sleep(600);
  await exec("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))");
  await sleep(700);
  const pal = await scan();
  if (pal.raw.length) raw.palette = pal.raw;
  await shot(`${lang}-palette`);
  await exec("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await exec("location.hash = '#/tasks?new=1'");
  await sleep(900);
  const drawer = await scan();
  if (drawer.raw.length) raw.drawer = drawer.raw;
  await shot(`${lang}-drawer`);
  return { crashed, raw, missing };
}

try {
  // 1. First launch (Arabic by default): onboarding must require a workspace.
  await startSession();
  await waitFor("return !!document.querySelector('#root') && document.body.innerText.length > 0", "app render");
  await shot("ar-01-welcome");
  check("app window renders", true);
  let first = await scan();
  check("first launch is Arabic and right-to-left", first.lang === "ar" && first.dir === "rtl", `${first.lang}/${first.dir}`);
  check("welcome screen has no raw keys", first.raw.length === 0, first.raw.join(", "));
  await click("[data-testid=onboarding-next]");
  await sleep(400);
  await shot("ar-02-storage");
  await click("[data-testid=onboarding-next]");
  await find("[data-testid=manual-path]");
  await shot("ar-03-choose-workspace");
  first = await scan();
  check("workspace selection shown before normal use", true);
  check("workspace selection has no raw keys", first.raw.length === 0, first.raw.join(", "));

  await type("[data-testid=manual-path]", ws);
  await click("[data-testid=manual-create]");
  await waitFor("return !!document.querySelector('[data-testid=onboarding-next]') && document.body.innerText.includes('English')", "language step", 30000);
  check("workspace created", existsSync(join(ws, "AppData/database.sqlite")) && existsSync(join(ws, "Subjects")) && existsSync(join(ws, "AppData/workspace.json")));
  await shot("ar-04-language");
  const steps = [];
  for (const step of ["language", "theme"]) {
    steps.push(await scan());
    await click("[data-testid=onboarding-next]");
    await sleep(500);
    if (step === "theme") await shot("ar-05-semester");
  }
  steps.push(await scan());
  await click("[data-testid=onboarding-skip]"); // semester
  await sleep(500);
  steps.push(await scan());
  await click("[data-testid=onboarding-skip]"); // subjects
  await find("[data-testid=onboarding-finish]");
  steps.push(await scan());
  await shot("ar-06-tour");
  const onboardingRaw = [...new Set(steps.flatMap((x) => x.raw))];
  check("onboarding steps have no raw keys", onboardingRaw.length === 0, onboardingRaw.join(", "));
  await click("[data-testid=onboarding-finish]");
  await waitFor("return location.hash === '#/' || location.hash === ''", "dashboard");
  await sleep(1500);
  await shot("ar-dashboard-first");
  check("dashboard opens after onboarding (Arabic)", await exec("return document.body.innerText.includes('لوحة التحكم') && document.documentElement.dir === 'rtl'"));

  // 2. Create a subject through the UI.
  await exec("location.hash = '#/subjects?new=1'");
  await find("#f-name");
  await type("#f-name", "Computer Security");
  await type("#f-code", "CS401");
  await click("[data-testid=drawer-save]");
  await waitFor("return document.body.innerText.includes('Computer Security')", "subject in list");
  check("subject created via UI", true);
  check("subject folder created in workspace", existsSync(join(ws, "Subjects/CS401 - Computer Security")));
  const subjectHref = await exec("const a=[...document.querySelectorAll('a[href*=\"#/subjects/\"]')][0];return a?a.getAttribute('href'):''");
  if (subjectHref) ROUTES.push(subjectHref.replace(/^#/, ""), `${subjectHref.replace(/^#/, "")}/attendance`, `${subjectHref.replace(/^#/, "")}/grades`);

  // 3. Every page in Arabic: no crashes, no raw keys, no missing translations.
  const ar = await sweep("ar");
  check("all routes render without crashing (Arabic)", ar.crashed.length === 0, ar.crashed.join(", "));
  check("no raw translation keys on any page (Arabic)", Object.keys(ar.raw).length === 0, JSON.stringify(ar.raw));
  check("no missing translations reported (Arabic)", ar.missing.length === 0, ar.missing.join(", "));

  // 4. Switch to English with the top-bar toggle: immediate, left-to-right.
  await exec("location.hash = '#/'");
  await sleep(600);
  await click("[data-testid=lang-toggle]");
  await waitFor("return document.documentElement.dir === 'ltr' && document.body.innerText.includes('Dashboard')", "English UI");
  check("language toggle switches to English and LTR immediately", true);
  const en = await sweep("en");
  check("all routes render without crashing (English)", en.crashed.length === 0, en.crashed.join(", "));
  check("no raw translation keys on any page (English)", Object.keys(en.raw).length === 0, JSON.stringify(en.raw));
  check("no missing translations reported (English)", en.missing.length === 0, en.missing.join(", "));
  await exec("location.hash = '#/settings?tab=workspace'");
  await sleep(800);
  const shownPath = await exec("const e=document.querySelector('[data-testid=workspace-path]');return e?e.textContent:''");
  check("settings shows workspace path", shownPath === ws, shownPath);
  await sleep(600); // let the settings write land
  await endSession();

  // 5. Restart: data and language persist, the workspace reopens automatically.
  await startSession();
  await waitFor("return document.body.innerText.includes('Dashboard')", "dashboard after restart", 30000);
  const afterRestart = await scan();
  check("language persists after restart (English, LTR)", afterRestart.lang === "en" && afterRestart.dir === "ltr", `${afterRestart.lang}/${afterRestart.dir}`);
  await exec("location.hash = '#/subjects'");
  await waitFor("return document.body.innerText.includes('Computer Security')", "subject after restart");
  check("data persists after restart", true);
  // Back to Arabic for the recovery screen check.
  await click("[data-testid=lang-toggle]");
  await waitFor("return document.documentElement.dir === 'rtl' && document.body.innerText.includes('المواد')", "Arabic UI");
  check("language toggle switches back to Arabic and RTL", true);
  await sleep(800);
  await endSession();

  // 6. Missing workspace: must block usage and show the recovery screen (in the saved language).
  renameSync(ws, `${ws}-moved`);
  await startSession();
  await find("[data-testid=recovery-path]", 30000);
  await sleep(500);
  await shot("ar-recovery");
  const rp = await exec("return document.querySelector('[data-testid=recovery-path]').textContent");
  check("missing workspace shows recovery screen with previous path", rp === ws, rp);
  check("no new empty workspace created silently", !existsSync(ws));
  const rec = await scan();
  check("recovery screen is Arabic, RTL and fully translated", rec.lang === "ar" && rec.dir === "rtl" && rec.raw.length === 0 && rec.missing.length === 0, `${rec.lang}/${rec.dir} ${rec.raw.join(", ")}`);
  renameSync(`${ws}-moved`, ws);
  await click("[data-testid=recovery-retry]");
  await waitFor("return document.body.innerText.includes('لوحة التحكم')", "dashboard after retry", 30000);
  check("retry reconnects when the folder is back", true);
  await endSession();
} catch (e) {
  check("e2e run", false, e.message);
  if (sid) await shot("zz-failure").catch(() => {});
  await endSession();
} finally {
  driver.kill();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
