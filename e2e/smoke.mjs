// End-to-end smoke test of the real Tauri app (Linux, WebKitWebDriver via tauri-driver).
// Usage: xvfb-run -a node e2e/smoke.mjs   (build first: npx tauri build --debug --no-bundle)
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync, renameSync } from "node:fs";
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
    } catch (e) {
      if (Date.now() > end) throw new Error(`not found: ${css}`);
      await sleep(300);
    }
  }
}
async function click(css) {
  await req("POST", s(`/element/${await find(css)}/click`), {});
}
/** Clicks the first button whose text contains `text` (UI text may be a translation key). */
async function clickText(text, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    const ok = await exec(
      "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(arguments[0])&&!x.disabled);if(b){b.click();return true}return false",
      [text],
    );
    if (ok) return;
    if (Date.now() > end) throw new Error(`button not found: ${text}`);
    await sleep(300);
  }
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

try {
  // 1. First launch: onboarding must require a workspace.
  await startSession();
  await waitFor("return !!document.querySelector('#root') && document.body.innerText.length > 0", "app render");
  await shot("01-welcome");
  check("app window renders", true);
  await clickText("onboarding.start");
  await clickText("common.continue");
  await find("[data-testid=manual-path]");
  await shot("02-choose-workspace");
  check("workspace selection shown before normal use", true);

  await type("[data-testid=manual-path]", ws);
  await click("[data-testid=manual-create]");
  await waitFor("return document.body.innerText.includes('onboarding.languageTitle')", "language step", 30000);
  check("workspace created", existsSync(join(ws, "AppData/database.sqlite")) && existsSync(join(ws, "Subjects")) && existsSync(join(ws, "AppData/workspace.json")));
  await shot("03-language");
  await clickText("common.continue"); // language
  await clickText("common.continue"); // theme
  await clickText("onboarding.skip"); // semester
  await clickText("onboarding.skip"); // subjects
  await click("[data-testid=onboarding-finish]");
  await waitFor("return location.hash === '#/' || location.hash === ''", "dashboard");
  await sleep(1500);
  await shot("04-dashboard");
  check("dashboard opens after onboarding", await exec("return document.body.innerText.includes('dashboard.widgets.today')"));

  // 2. Create a subject through the UI.
  await exec("location.hash = '#/subjects?new=1'");
  await find("#f-name");
  await type("#f-name", "Computer Security");
  await type("#f-code", "CS401");
  await clickText("common.save");
  await waitFor("return document.body.innerText.includes('Computer Security')", "subject in list");
  await shot("05-subjects");
  check("subject created via UI", true);
  check("subject folder created in workspace", existsSync(join(ws, "Subjects/CS401 - Computer Security")));

  // 3. Visit every route to make sure no page crashes.
  const routes = ["/", "/search", "/notifications", "/semesters", "/subjects", "/timetable", "/notes", "/deadlines", "/tasks", "/grades", "/questions", "/projects", "/files", "/research", "/whiteboards", "/journal", "/goals", "/study", "/expenses", "/cyber", "/cyber/commands", "/cyber/ctf", "/cyber/labs", "/cyber/roadmaps", "/analytics", "/backup", "/data", "/settings"];
  const crashed = [];
  for (const r of routes) {
    await exec(`location.hash = '#${r}'`);
    await sleep(900);
    const bad = await exec("return document.body.innerText.includes('errors.pageCrashed')");
    if (bad) {
      crashed.push(r);
      await shot(`crash-${r.replace(/\//g, "_")}`);
    }
  }
  check("all routes render without crashing", crashed.length === 0, crashed.join(", "));
  await exec("location.hash = '#/settings?tab=workspace'");
  await sleep(800);
  const shownPath = await exec("const e=document.querySelector('[data-testid=workspace-path]');return e?e.textContent:''");
  check("settings shows workspace path", shownPath === ws, shownPath);
  await shot("06-settings");
  await endSession();

  // 4. Restart: data must persist and the workspace must reopen automatically.
  await startSession();
  await waitFor("return document.body.innerText.includes('nav.dashboard')", "dashboard after restart", 30000);
  await exec("location.hash = '#/subjects'");
  await waitFor("return document.body.innerText.includes('Computer Security')", "subject after restart");
  check("data persists after restart", true);
  await endSession();

  // 5. Missing workspace: must block usage and show the recovery screen.
  renameSync(ws, `${ws}-moved`);
  await startSession();
  await find("[data-testid=recovery-path]", 30000);
  await shot("07-recovery");
  const rp = await exec("return document.querySelector('[data-testid=recovery-path]').textContent");
  check("missing workspace shows recovery screen with previous path", rp === ws, rp);
  check("no new empty workspace created silently", !existsSync(ws));
  renameSync(`${ws}-moved`, ws);
  await click("[data-testid=recovery-retry]");
  await waitFor("return document.body.innerText.includes('nav.dashboard')", "dashboard after retry", 30000);
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
