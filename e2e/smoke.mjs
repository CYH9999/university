// End-to-end smoke test of the real desktop app: onboarding, every page in Arabic and English,
// language switching and persistence, and the missing-workspace recovery screen.
// Usage (Linux): xvfb-run -a node e2e/smoke.mjs   (build first: npx tauri build --debug --no-bundle)
// Usage (Windows): set E2E_APP / NATIVE_DRIVER, then node e2e/smoke.mjs  (see e2e/lib.mjs)
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createRun, app, sleep } from "./lib.mjs";

const t = createRun("smoke");
const { exec, find, click, type, shot, waitFor, startSession, endSession, check, scan, retryFs, log } = t;
const ws = join(t.tmp, "Workspace");
console.log(`app: ${app}`);

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
    if (await exec("return !!document.querySelector('[data-testid=page-crashed]')")) crashed.push(r);
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
  log("1. First launch (Arabic by default): onboarding must require a workspace.");
  await startSession();
  await waitFor("return !!document.querySelector('#root') && document.body.innerText.length > 0", "app render", 60000);
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
  check("workspace created with its folder structure", ["AppData/database.sqlite", "AppData/workspace.json", "Subjects", "Projects", "Research Library", "Cybersecurity Lab", "Attachments", "Backups", "Exports", "Trash"].every((p) => existsSync(join(ws, p))));
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
  log("2. Create a subject through the UI.");
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
  log("3. Every page in Arabic: no crashes, no raw keys, no missing translations.");
  const ar = await sweep("ar");
  check("all routes render without crashing (Arabic)", ar.crashed.length === 0, ar.crashed.join(", "));
  check("no raw translation keys on any page (Arabic)", Object.keys(ar.raw).length === 0, JSON.stringify(ar.raw));
  check("no missing translations reported (Arabic)", ar.missing.length === 0, ar.missing.join(", "));

  // 4. Switch to English with the top-bar toggle: immediate, left-to-right.
  log("4. Switch to English with the top-bar toggle: immediate, left-to-right.");
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
  log("5. Restart: data and language persist, the workspace reopens automatically.");
  await startSession();
  await waitFor("return document.body.innerText.includes('Dashboard')", "dashboard after restart", 60000);
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
  log("6. Missing workspace: must block usage and show the recovery screen (in the saved language).");
  await retryFs(() => renameSync(ws, `${ws}-moved`));
  await startSession();
  await find("[data-testid=recovery-path]", 60000);
  await sleep(500);
  await shot("ar-recovery");
  const rp = await exec("return document.querySelector('[data-testid=recovery-path]').textContent");
  check("missing workspace shows recovery screen with previous path", rp === ws, rp);
  check("no new empty workspace created silently", !existsSync(ws));
  const rec = await scan();
  check("recovery screen is Arabic, RTL and fully translated", rec.lang === "ar" && rec.dir === "rtl" && rec.raw.length === 0 && rec.missing.length === 0, `${rec.lang}/${rec.dir} ${rec.raw.join(", ")}`);
  await retryFs(() => renameSync(`${ws}-moved`, ws));
  await click("[data-testid=recovery-retry]");
  await waitFor("return document.body.innerText.includes('لوحة التحكم')", "dashboard after retry", 30000);
  await exec("location.hash = '#/subjects'");
  await waitFor("return document.body.innerText.includes('Computer Security')", "subject after reconnect");
  check("retry reconnects the original workspace with its data", true);
  await endSession();
} catch (e) {
  check("e2e run", false, e.message);
  if (t.sid) await shot("zz-failure").catch(() => {});
  await endSession();
} finally {
  await t.finish();
}
