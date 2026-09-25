// End-to-end data scenario for the real desktop app (written for Windows verification, runs on
// Linux too): Unicode workspace path, subject/project folders, PDF import, notes, tasks, exams,
// grades, research files, file operations, opening files, notifications, persistence across a
// full restart, backup creation and restore (in place and as a new workspace).
// Usage: see e2e/lib.mjs for the environment variables.
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRun, app, isWindows, sleep } from "./lib.mjs";

const t = createRun("data");
const { exec, find, click, clickText, type, keys, shot, waitFor, waitText, hasText, go, invoke, stubDialogs, startSession, endSession, check, note, scan } = t;
const ENTER = "\uE007";

// A workspace path with Arabic characters and spaces exercises Unicode path handling.
const ws = join(t.tmp, "بيانات الجامعة");
const restored = join(t.tmp, "Restored Workspace");
const fixtures = join(t.tmp, "fixtures");
mkdirSync(fixtures, { recursive: true });

/** A small but valid one-page PDF. */
function pdf(text) {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const lecturePdf = join(fixtures, "Lecture 1 - Introduction.pdf");
const researchPdf = join(fixtures, "RFC 2328 OSPF.pdf");
writeFileSync(lecturePdf, pdf("Computer Networks - Lecture 1"));
writeFileSync(researchPdf, pdf("OSPF Version 2"));

const dq = async (sql, params = []) => {
  const r = await invoke("db_query", { sql, params });
  if (r.err) throw new Error(`db_query failed: ${r.err}`);
  return r.ok;
};
const count = async (sql, params = []) => Number((await dq(sql, params))[0]?.n ?? 0);
const dueDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const subjectDir = join(ws, "Subjects", "NET301 - Computer Networks");

/** Switches the UI language with the top-bar toggle; returns how many clicks it took. */
async function switchLanguage(lang) {
  const dir = lang === "ar" ? "rtl" : "ltr";
  for (let i = 1; i <= 3; i++) {
    await click("[data-testid=lang-toggle]");
    try {
      await waitFor("return document.documentElement.dir === arguments[0] && document.documentElement.lang === arguments[1]", `${lang} UI`, 4000, [dir, lang]);
      return i;
    } catch {
      /* try again */
    }
  }
  throw new Error(`language toggle did not switch to ${lang}`);
}

async function assertAllData(stage) {
  const checks = {
    subject: await count("SELECT COUNT(*) AS n FROM subjects WHERE name = ?", ["Computer Networks"]),
    note: await count("SELECT COUNT(*) AS n FROM notes WHERE title = ? AND content_text LIKE ?", ["Routing Protocols", "%Dijkstra%"]),
    task: await count("SELECT COUNT(*) AS n FROM tasks WHERE title = ?", ["Finish routing lab report"]),
    exam: await count("SELECT COUNT(*) AS n FROM deadlines WHERE title = ? AND type = 'exam' AND due_date = ?", ["Networks midterm exam", dueDate]),
    project: await count("SELECT COUNT(*) AS n FROM projects WHERE name = ?", ["Campus Network Design"]),
    grade: await count("SELECT COUNT(*) AS n FROM grade_items WHERE score = 18"),
    pdf: await count("SELECT COUNT(*) AS n FROM files WHERE rel_path = ?", ["Subjects/NET301 - Computer Networks/Lectures/Lecture 1 - Introduction.pdf"]),
    research: await count("SELECT COUNT(*) AS n FROM research_resources"),
  };
  const missing = Object.entries(checks).filter(([, n]) => n < 1).map(([k]) => k);
  check(`${stage}: subject, note, task, exam, project, grade, PDF and research record present`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
  check(`${stage}: PDF files present on disk`, existsSync(join(subjectDir, "Lectures", "Lecture 1 - Introduction.pdf")) && readdirSync(join(ws, "Research Library"), { recursive: true }).some((f) => String(f).endsWith("RFC 2328 OSPF.pdf")));
}

try {
  // --- First launch and onboarding (switching to English on the language step) ------------------
  await startSession();
  await waitFor("return !!document.querySelector('[data-testid=onboarding-next]')", "welcome", 60000);
  await click("[data-testid=onboarding-next]");
  await click("[data-testid=onboarding-next]");
  await type("[data-testid=manual-path]", ws);
  await click("[data-testid=manual-create]");
  await waitFor("return !!document.querySelector('[data-testid=onboarding-next]') && document.body.innerText.includes('English')", "language step", 30000);
  check("workspace created in a Unicode path", existsSync(join(ws, "AppData", "database.sqlite")) && existsSync(join(ws, "README.txt")), ws);
  await clickText("English");
  await waitFor("return document.documentElement.dir === 'ltr' && document.documentElement.lang === 'en'", "English onboarding");
  check("onboarding switches to English and LTR", true);
  await click("[data-testid=onboarding-next]"); // language
  await click("[data-testid=onboarding-next]"); // theme
  await click("[data-testid=onboarding-skip]"); // semester
  await click("[data-testid=onboarding-skip]"); // subjects
  await click("[data-testid=onboarding-finish]");
  await waitText("Dashboard");

  // --- Subject + folder --------------------------------------------------------------------------
  await go("#/subjects?new=1");
  await type("#f-name", "Computer Networks");
  await type("#f-code", "NET301");
  await click("[data-testid=drawer-save]");
  await waitText("Computer Networks");
  await sleep(800);
  check("subject folder created", existsSync(subjectDir), subjectDir);
  const subjectHref = (await exec("const a=[...document.querySelectorAll('a[href*=\"#/subjects/\"]')][0];return a?a.getAttribute('href'):''")).replace(/^#/, "");

  // --- Lecture PDF upload into the subject (native dialog answered by the test) -----------------
  await go(`#${subjectHref}/files`);
  await stubDialogs({ open: [[lecturePdf]] });
  await click("[data-testid=subject-upload]");
  await waitText("Lecture 1 - Introduction.pdf", "uploaded PDF in list");
  const copied = join(subjectDir, "Lectures", "Lecture 1 - Introduction.pdf");
  check("PDF copied into the subject's Lectures folder", existsSync(copied) && statSync(copied).size === statSync(lecturePdf).size, copied);
  await shot("subject-files");

  // --- Grade ---------------------------------------------------------------------------------------
  await go(`#${subjectHref}/grades`);
  await click("[data-testid=grade-add]");
  await sleep(800);
  await keys("input[placeholder='—']", `18${ENTER}`);
  await sleep(1200);
  check("grade item created with a score", (await count("SELECT COUNT(*) AS n FROM grade_items WHERE score = 18")) === 1);

  // --- Note (rich editor, autosave) ------------------------------------------------------------
  await go("#/notes?new=1", 1500);
  await type("[data-testid=note-title]", "Routing Protocols");
  await click(".ProseMirror");
  await keys(".ProseMirror", "OSPF uses Dijkstra; BGP is a path-vector protocol.");
  await sleep(3000);
  check("note saved with its content", (await count("SELECT COUNT(*) AS n FROM notes WHERE title = ? AND content_text LIKE ?", ["Routing Protocols", "%Dijkstra%"])) === 1);

  // --- Task, exam, project ---------------------------------------------------------------------
  await go("#/tasks?new=1");
  await type("#f-title", "Finish routing lab report");
  await click("[data-testid=drawer-save]");
  await sleep(1000);
  check("task created", (await count("SELECT COUNT(*) AS n FROM tasks WHERE title = ?", ["Finish routing lab report"])) === 1);

  await go(`#/deadlines?new=1&type=exam&date=${dueDate}`);
  await type("#f-title", "Networks midterm exam");
  await click("[data-testid=drawer-save]");
  await waitText("Networks midterm exam");
  check("exam created", true);

  await go("#/projects?new=1");
  await type("#f-name", "Campus Network Design");
  await click("[data-testid=drawer-save]");
  await waitText("Campus Network Design");
  await sleep(800);
  check("project created with its folder", existsSync(join(ws, "Projects", "Campus Network Design")));

  // --- Research library file ------------------------------------------------------------------
  await go("#/research");
  await stubDialogs({ open: [[researchPdf]] });
  await click("[data-testid=research-import]");
  await waitText("RFC 2328 OSPF", "research resource");
  check("research PDF imported into the Research Library", readdirSync(join(ws, "Research Library"), { recursive: true }).some((f) => String(f).endsWith("RFC 2328 OSPF.pdf")));

  // --- File operations (the commands behind the Files page) -------------------------------------
  const r1 = await invoke("fs_create_dir", { parentRel: "Attachments", name: "E2E Folder" });
  const r2 = await invoke("fs_write_text", { rel: "Attachments/E2E Folder/draft.txt", content: "مسودة draft" });
  const r3 = await invoke("fs_rename", { rel: "Attachments/E2E Folder/draft.txt", newName: "final.txt" });
  const r4 = await invoke("fs_copy", { rel: "Attachments/E2E Folder/final.txt", destDirRel: "Exports" });
  const r5 = await invoke("fs_move", { rel: "Exports/final.txt", destDirRel: "Attachments" });
  const fileOpsOk = [r1, r2, r3, r4, r5].every((r) => !r.err) && existsSync(join(ws, "Attachments", "E2E Folder", "final.txt")) && existsSync(join(ws, "Attachments", "final.txt")) && !existsSync(join(ws, "Attachments", "E2E Folder", "draft.txt"));
  check("create folder, write, rename, copy and move files", fileOpsOk, JSON.stringify([r1, r2, r3, r4, r5].filter((r) => r.err)));
  const trashed = await invoke("fs_trash", { rel: "Attachments/final.txt" });
  const inTrash = !trashed.err && existsSync(join(ws, ...String(trashed.ok).split("/"))) && !existsSync(join(ws, "Attachments", "final.txt"));
  const restoredFile = await invoke("fs_restore", { trashRel: trashed.ok, originalRel: "Attachments/final.txt" });
  const back = !restoredFile.err && existsSync(join(ws, "Attachments", "final.txt"));
  const trashed2 = await invoke("fs_trash", { rel: "Attachments/final.txt" });
  const deleted = await invoke("fs_delete_permanent", { trashRel: trashed2.ok });
  check("delete to trash, restore and delete permanently", inTrash && back && !deleted.err && !existsSync(join(ws, ...String(trashed2.ok).split("/"))), JSON.stringify({ trashed, restoredFile, deleted }));

  // --- Security boundaries on the real file system ----------------------------------------------
  const outsideAbs = isWindows ? "C:/Windows/Temp/university-e2e.txt" : "/tmp/university-e2e.txt";
  const escapes = [
    await invoke("fs_read_text", { rel: "../../outside.txt" }),
    await invoke("fs_write_text", { rel: "..\\..\\outside.txt", content: "x" }),
    await invoke("db_query", { sql: `ATTACH DATABASE '${join(t.tmp, "evil.sqlite").replace(/'/g, "''")}' AS evil`, params: [] }),
  ];
  // An absolute path is either rejected (drive letters) or confined inside the workspace.
  const absWrite = await invoke("fs_write_text", { rel: outsideAbs, content: "x" });
  const absConfined = !!absWrite.err || (!String(absWrite.ok).includes("..") && existsSync(join(ws, ...String(absWrite.ok).split("/"))));
  const blockedAll = escapes.every((r) => r.err) && absConfined && !existsSync(outsideAbs) && !existsSync(join(t.tmp, "evil.sqlite")) && !existsSync(join(t.tmp, "..", "outside.txt"));
  check("paths outside the workspace and ATTACH are rejected", blockedAll, JSON.stringify([...escapes, absWrite]));

  // --- Opening files ----------------------------------------------------------------------------
  await invoke("fs_write_text", { rel: "Attachments/E2E Folder/run.bat", content: "@echo off" });
  const blockedOpen = await invoke("fs_open", { rel: "Attachments/E2E Folder/run.bat" });
  check("executables are never launched from the app", !!blockedOpen.err && blockedOpen.err.includes("open.blocked"), blockedOpen.err);
  const opened = await invoke("fs_open", { rel: "Subjects/NET301 - Computer Networks/Lectures/Lecture 1 - Introduction.pdf" });
  if (isWindows) check("PDF opens with the default Windows application", !opened.err, opened.err ?? "");
  else note("PDF open with the default application (Linux)", opened.err ? `not available here: ${opened.err}` : "ok");

  // --- Desktop notifications in both languages -------------------------------------------------
  await go("#/settings?tab=notifications");
  await click("[data-testid=notify-test]");
  await waitFor("return document.body.innerText.includes('Test notification sent') || document.body.innerText.includes('The notification could not be shown')", "notification result (English)");
  note("desktop notification (English)", (await hasText("Test notification sent")) ? "delivered" : "not shown by the OS in this session");
  const clicks = await switchLanguage("ar");
  check("language toggle switches to Arabic after a notification", clicks === 1, clicks === 1 ? "" : `needed ${clicks} clicks`);
  await click("[data-testid=notify-test]");
  await waitFor("return document.body.innerText.includes('أُرسل الإشعار التجريبي') || document.body.innerText.includes('تعذّر عرض الإشعار')", "notification result (Arabic)");
  note("desktop notification (Arabic)", (await hasText("أُرسل الإشعار التجريبي")) ? "delivered" : "not shown by the OS in this session");
  const afterSwitch = await scan();
  check("language switch with notifications causes no errors or raw keys", !(await exec("return !!document.querySelector('[data-testid=page-crashed]')")) && afterSwitch.raw.length === 0 && afterSwitch.missing.length === 0, JSON.stringify(afterSwitch.raw));
  await shot("ar-notifications");

  // --- Backup ------------------------------------------------------------------------------------
  await go("#/backup");
  await click("[data-testid=backup-create-full]");
  await waitFor("return document.querySelectorAll('table tbody tr').length > 0", "backup in list", 60000);
  const list = await invoke("backup_list");
  const bk = list.ok?.[0];
  check("backup ZIP created in the workspace Backups folder", !!bk && existsSync(bk.path) && bk.path.startsWith(join(ws, "Backups")), bk?.path);
  const inspect = await invoke("backup_inspect", { path: bk.path });
  const mfiles = inspect.ok?.manifest?.files?.map((f) => f.path) ?? [];
  check(
    "backup is valid and contains the database, settings and PDFs",
    inspect.ok?.valid === true && mfiles.includes("AppData/database.sqlite") && mfiles.some((p) => p.endsWith("Lecture 1 - Introduction.pdf")) && mfiles.some((p) => p.endsWith("RFC 2328 OSPF.pdf")),
    `${mfiles.length} files`,
  );
  await shot("ar-backup");
  await sleep(800);
  await endSession();

  // --- Full restart: everything must still be there ---------------------------------------------
  await startSession();
  await waitFor("return document.body.innerText.includes('لوحة التحكم')", "dashboard after restart", 60000);
  await assertAllData("after restart");
  await go(`#${subjectHref}/files`);
  check("uploaded PDF listed after restart", await hasText("Lecture 1 - Introduction.pdf"));
  await go("#/tasks?view=all");
  check("task listed after restart", await hasText("Finish routing lab report"));
  await go("#/deadlines");
  check("exam listed after restart", await hasText("Networks midterm exam"));
  await go("#/notes");
  check("note listed after restart", await hasText("Routing Protocols"));
  await go("#/projects");
  check("project listed after restart", await hasText("Campus Network Design"));
  const persisted = await scan();
  check("Arabic UI restored after restart", persisted.lang === "ar" && persisted.dir === "rtl", `${persisted.lang}/${persisted.dir}`);

  // --- Restore into the current workspace --------------------------------------------------------
  await invoke("db_execute", { sql: "DELETE FROM tasks WHERE title = ?", params: ["Finish routing lab report"] });
  check("task removed before restore", (await count("SELECT COUNT(*) AS n FROM tasks WHERE title = ?", ["Finish routing lab report"])) === 0);
  const rest = await invoke("backup_restore_current", { path: bk.path });
  check("restore into the current workspace succeeds", !rest.err && String(rest.ok?.previousDataRel ?? "").startsWith("Trash/pre-restore-"), rest.err ?? rest.ok?.previousDataRel);
  await exec("location.reload()");
  await waitFor("return document.body.innerText.includes('لوحة التحكم')", "dashboard after restore", 60000);
  await assertAllData("after in-place restore");
  check("replaced data kept in the workspace Trash", readdirSync(join(ws, "Trash")).some((d) => d.startsWith("pre-restore-")));

  // --- Restore as a new workspace (e.g. on another computer) ------------------------------------
  const asNew = await invoke("backup_restore_new", { path: bk.path, target: restored });
  check("restore as a new workspace succeeds", !asNew.err && asNew.ok?.status === "ok", asNew.err ?? asNew.ok?.status);
  await exec("location.reload()");
  await waitFor("return document.body.innerText.includes('لوحة التحكم')", "restored workspace opens", 60000);
  await go("#/settings?tab=workspace");
  const shownPath = await exec("const e=document.querySelector('[data-testid=workspace-path]');return e?e.textContent:''");
  check("restored workspace is open", shownPath === restored, shownPath);
  await assertAllData("restored workspace").catch((e) => check("restored workspace data", false, e.message));
  check("restored workspace contains the PDF files", existsSync(join(restored, "Subjects", "NET301 - Computer Networks", "Lectures", "Lecture 1 - Introduction.pdf")));
  check("original workspace left untouched", existsSync(join(ws, "AppData", "database.sqlite")) && existsSync(copied));
  await shot("restored-workspace");
  await endSession();
} catch (e) {
  check("data scenario", false, e.message);
  if (t.sid) await shot("zz-failure").catch(() => {});
  await endSession();
} finally {
  await t.finish();
}
