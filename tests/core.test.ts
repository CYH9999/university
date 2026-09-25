import { describe, it, expect } from "vitest";
import { setup } from "./helpers/setup";
import { createNodeDb } from "./helpers/nodeDb";
import { runMigrations, LATEST_SCHEMA_VERSION, currentSchemaVersion } from "../src/core/db/migrations";
import { ValidationError } from "../src/core/validation/schemas";
import { nextOccurrence } from "../src/core/services/tasks";
import { findConflicts, occursOn } from "../src/core/services/timetable";
import { countdown } from "../src/core/services/deadlines";
import { AUTO_SNAPSHOT_INTERVAL_MS } from "../src/core/services/notes";
import type { TimetableEntry } from "../src/core/model/types";

describe("migrations", () => {
  it("creates the schema once and is idempotent", async () => {
    const db = createNodeDb();
    const first = await runMigrations(db);
    expect(first.from).toBe(0);
    expect(first.to).toBe(LATEST_SCHEMA_VERSION);
    const second = await runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(await currentSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const scales = await db.query<{ n: number }>("SELECT COUNT(*) AS n FROM grading_scales");
    expect(scales[0].n).toBe(3);
  });

  it("refuses databases from a newer schema", async () => {
    const db = createNodeDb();
    await runMigrations(db);
    await db.execute("INSERT INTO schema_migrations VALUES (999, 'future', 'x')");
    await expect(runMigrations(db)).rejects.toThrow(/newer/);
  });

  it("starts empty: no fake data after setup", async () => {
    const { s } = await setup();
    expect(await s.repos.subjects.count()).toBe(0);
    expect(await s.repos.notes.count()).toBe(0);
    expect(await s.repos.tasks.count()).toBe(0);
    expect(await s.repos.semesters.count()).toBe(0);
  });
});

describe("repository & validation", () => {
  it("validates input with i18n error keys", async () => {
    const { s } = await setup();
    await expect(s.repos.subjects.create({ name: "" })).rejects.toBeInstanceOf(ValidationError);
    try {
      await s.repos.subjects.create({ name: "Net", contactEmail: "not-an-email", color: "red" });
    } catch (e) {
      const issues = (e as ValidationError).issues.map((i) => `${i.path}:${i.message}`);
      expect(issues).toContain("contactEmail:validation.email");
      expect(issues).toContain("color:validation.color");
    }
    await expect(s.repos.timetable.create({ subjectId: "x", day: 0, startTime: "10:00", endTime: "09:00" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates, updates, tags, deletes and restores (undo)", async () => {
    const { s, db } = await setup();
    const subj = await s.repos.subjects.create({ name: "Computer Security", code: "CS401", tags: ["security", "Core"] });
    expect(subj.tags).toEqual(["security", "Core"]);
    const loaded = await s.repos.subjects.require(subj.id);
    expect(loaded.tags.sort()).toEqual(["Core", "security"]);
    expect(loaded.links).toEqual([]);
    expect(loaded.countsInGpa).toBe(true);
    const upd = await s.repos.subjects.update(subj.id, { credits: 4, tags: ["security"] });
    expect(upd.credits).toBe(4);
    expect((await s.repos.subjects.require(subj.id)).tags).toEqual(["security"]);
    const snap = await s.repos.subjects.remove(subj.id);
    expect(await s.repos.subjects.get(subj.id)).toBeNull();
    expect((await db.query("SELECT * FROM entity_tags WHERE entity_id = ?", [subj.id])).length).toBe(0);
    await s.repos.subjects.restore(snap);
    expect((await s.repos.subjects.require(subj.id)).tags).toEqual(["security"]);
    const audit = await s.audit.list();
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["create", "update", "delete", "restore"]));
  });

  it("keeps notes when their subject is deleted (SET NULL)", async () => {
    const { s } = await setup();
    const subj = await s.repos.subjects.create({ name: "Networks" });
    const note = await s.notes.create({ title: "OSI", subjectId: subj.id });
    await s.repos.subjects.remove(subj.id);
    expect((await s.repos.notes.require(note.id)).subjectId).toBeNull();
  });
});

describe("semesters", () => {
  it("keeps exactly one current semester and duplicates structure", async () => {
    const { s } = await setup();
    const a = await s.semesters.create({ name: "Fall 2026", startDate: "2026-09-20", endDate: "2027-01-20" });
    expect(a.isCurrent).toBe(true);
    const b = await s.semesters.create({ name: "Spring 2027" });
    expect(b.isCurrent).toBe(false);
    await s.semesters.setCurrent(b.id);
    const current = await s.repos.semesters.list({ where: ["t.is_current = 1"] });
    expect(current.map((x) => x.id)).toEqual([b.id]);

    const subj = await s.repos.subjects.create({ name: "Crypto", semesterId: a.id, credits: 3 });
    await s.repos.timetable.create({ subjectId: subj.id, semesterId: a.id, day: 0, startTime: "08:30", endTime: "10:00" });
    await s.repos.grades.create({ subjectId: subj.id, name: "Final", weight: 60, score: 50, status: "actual" });
    const dup = await s.semesters.duplicate(a.id, { name: "Fall 2027", copySubjects: true, copyTimetable: true, copyGradeStructure: true });
    const subs = await s.repos.subjects.list({ where: ["t.semester_id = ?"], params: [dup.id] });
    expect(subs.map((x) => x.name)).toEqual(["Crypto"]);
    const tt = await s.repos.timetable.list({ where: ["t.semester_id = ?"], params: [dup.id] });
    expect(tt).toHaveLength(1);
    const grades = await s.grades.items(subs[0].id);
    expect(grades[0].score).toBeNull();
    expect(grades[0].status).toBe("missing");
    expect(grades[0].weight).toBe(60);
  });
});

describe("timetable", () => {
  const entry = (p: Partial<TimetableEntry>): TimetableEntry =>
    ({ id: Math.random().toString(), subjectId: "s", semesterId: null, day: 0, startTime: "08:00", endTime: "09:00", kind: "lecture", recurrence: "weekly", specificDate: null, validFrom: null, validUntil: null, room: null, building: null, professor: null, color: null, notes: null, createdAt: "", updatedAt: "", ...p }) as TimetableEntry;

  it("uses Saturday as day 0 and detects overlaps", () => {
    // 2026-09-26 is a Saturday
    expect(occursOn(entry({ day: 0 }), "2026-09-26")).toBe(true);
    expect(occursOn(entry({ day: 6 }), "2026-09-25")).toBe(true); // Friday
    const c = findConflicts([
      entry({ day: 1, startTime: "08:00", endTime: "10:00" }),
      entry({ day: 1, startTime: "09:30", endTime: "11:00" }),
      entry({ day: 1, startTime: "10:00", endTime: "11:00", recurrence: "biweekly_a" }),
      entry({ day: 1, startTime: "10:30", endTime: "11:30", recurrence: "biweekly_b" }),
    ]);
    expect(c.map((x) => x.overlapMinutes)).toEqual([30, 60, 30]);
  });

  it("computes today's lectures and the next lecture", async () => {
    const { s } = await setup({ now: new Date(2026, 8, 23, 9, 0) }); // Wednesday = day 4
    const sem = await s.semesters.create({ name: "S", startDate: "2026-09-01", endDate: "2027-01-31" });
    const subj = await s.repos.subjects.create({ name: "OS", semesterId: sem.id });
    await s.repos.timetable.create({ subjectId: subj.id, semesterId: sem.id, day: 4, startTime: "08:00", endTime: "09:30" });
    await s.repos.timetable.create({ subjectId: subj.id, semesterId: sem.id, day: 4, startTime: "11:00", endTime: "12:00" });
    const today = await s.timetable.forDay(sem.id, "2026-09-23");
    expect(today).toHaveLength(2);
    const next = await s.timetable.next(sem.id);
    expect(next?.entry.startTime).toBe("08:00"); // still running at 09:00
  });
});

describe("tasks", () => {
  it("computes recurrence occurrences", () => {
    expect(nextOccurrence("2026-09-23", { freq: "daily", interval: 2 })).toBe("2026-09-25");
    expect(nextOccurrence("2026-01-31", { freq: "monthly", interval: 1 })).toBe("2026-02-28");
    // Wednesday (4) with weekdays Sat(0) & Mon(2) -> next Saturday 2026-09-26
    expect(nextOccurrence("2026-09-23", { freq: "weekly", interval: 1, weekdays: [0, 2] })).toBe("2026-09-26");
    expect(nextOccurrence("2026-09-23", { freq: "weekly", interval: 1, weekdays: [5] })).toBe("2026-09-24");
    expect(nextOccurrence("2026-09-23", { freq: "daily", interval: 1, until: "2026-09-23" })).toBeNull();
  });

  it("creates the next occurrence exactly once when a recurring task is completed", async () => {
    const { s } = await setup();
    const t = await s.tasks.create({ title: "Review notes", dueDate: "2026-09-23", recurrence: { freq: "daily", interval: 1 } });
    await s.tasks.addSubtask(t.id, "Chapter 1");
    await s.tasks.setStatus(t.id, "completed");
    await s.tasks.setStatus(t.id, "planned");
    await s.tasks.setStatus(t.id, "completed");
    const all = await s.repos.tasks.list();
    expect(all.filter((x) => x.dueDate === "2026-09-24")).toHaveLength(1);
    const next = all.find((x) => x.dueDate === "2026-09-24")!;
    expect(next.recurrenceParentId).toBe(t.id);
    expect(await s.tasks.subtasks(next.id)).toHaveLength(1);
  });

  it("rolls unfinished tasks over to today and lists views", async () => {
    const { s } = await setup();
    await s.tasks.create({ title: "old", dueDate: "2026-09-20" });
    await s.tasks.create({ title: "keep", dueDate: "2026-09-20", rollover: false });
    expect(await s.tasks.list({ view: "overdue" })).toHaveLength(2);
    expect(await s.tasks.rollover()).toBe(1);
    // "today" includes today's tasks plus overdue ones that were not rolled over
    expect((await s.tasks.list({ view: "today" })).map((x) => x.title).sort()).toEqual(["keep", "old"]);
    expect((await s.repos.tasks.list({ where: ["t.title = 'old'"] }))[0].dueDate).toBe("2026-09-23");
    expect((await s.tasks.list({ view: "overdue" })).map((x) => x.title)).toEqual(["keep"]);
    const counts = await s.tasks.counts();
    expect(counts.overdue).toBe(1);
  });
});

describe("deadlines & countdown", () => {
  it("formats countdowns", () => {
    const now = new Date(2026, 8, 23, 9, 0);
    expect(countdown({ dueDate: "2026-09-30", dueTime: null, status: "pending" }, now)).toMatchObject({ days: 7, state: "soon" });
    expect(countdown({ dueDate: "2026-09-24", dueTime: null, status: "pending" }, now).state).toBe("tomorrow");
    expect(countdown({ dueDate: "2026-09-23", dueTime: "08:00", status: "pending" }, now).state).toBe("overdue");
    expect(countdown({ dueDate: "2026-09-23", dueTime: "12:00", status: "pending" }, now)).toMatchObject({ state: "today", minutes: 180 });
    expect(countdown({ dueDate: "2026-09-20", dueTime: null, status: "completed" }, now).state).toBe("done");
  });

  it("stores default reminders by type", async () => {
    const { s } = await setup();
    const d = await s.deadlines.create({ title: "Midterm", type: "exam", dueDate: "2026-10-10", dueTime: "09:00" });
    expect((await s.deadlines.reminders(d.id)).map((r) => r.offsetMinutes)).toEqual([10080, 1440, 180]);
    await s.deadlines.update(d.id, { title: "Midterm exam" }, [60]);
    expect((await s.deadlines.reminders(d.id)).map((r) => r.offsetMinutes)).toEqual([60]);
  });
});

describe("notifications", () => {
  it("never duplicates notifications across repeated scans", async () => {
    const { s, clock } = await setup({ now: new Date(2026, 8, 23, 10, 30) });
    await s.deadlines.create({ title: "Report", type: "assignment", dueDate: "2026-09-24", dueTime: "10:00" }, [1440, 60]);
    const first = await s.notifications.scan();
    expect(first.map((n) => n.title)).toEqual(["notif.deadlineReminder"]);
    expect(await s.notifications.scan()).toEqual([]);
    expect(await s.notifications.scan()).toEqual([]);
    clock.set(new Date(2026, 8, 24, 9, 30));
    const second = await s.notifications.scan();
    expect(second.map((n) => n.dedupeKey)).toEqual([expect.stringContaining(":60:")]);
    clock.set(new Date(2026, 8, 24, 11, 0));
    const third = await s.notifications.scan();
    expect(third.map((n) => n.title)).toEqual(["notif.deadlineOverdue"]);
    expect(await s.notifications.scan()).toEqual([]);
    expect(await s.notifications.unreadCount()).toBe(3);
  });

  it("supports read/unread/snooze/archive/delete without regenerating", async () => {
    const { s, clock } = await setup();
    await s.tasks.create({ title: "late", dueDate: "2026-09-20", rollover: false });
    const created = await s.notifications.scan();
    expect(created.map((x) => x.title).sort()).toEqual(["notif.backupNever", "notif.tasksOverdue"]);
    const n = created.find((x) => x.title === "notif.tasksOverdue")!;
    await s.notifications.remove(created.find((x) => x.title === "notif.backupNever")!.id);
    await s.notifications.setStatus(n.id, "read");
    expect(await s.notifications.unreadCount()).toBe(0);
    await s.notifications.setStatus(n.id, "unread");
    await s.notifications.snooze(n.id, 60);
    expect(await s.notifications.list()).toHaveLength(0);
    clock.advanceMinutes(61);
    expect(await s.notifications.list()).toHaveLength(1);
    await s.notifications.remove(n.id);
    expect(await s.notifications.list({ status: "all" })).toHaveLength(0);
    expect(await s.notifications.scan()).toEqual([]);
  });

  it("respects disabled categories", async () => {
    const { s } = await setup();
    await s.tasks.create({ title: "late", dueDate: "2026-09-20", rollover: false });
    const created = await s.notifications.scan({ categories: { task: false }, desktop: false, lectureLeadMinutes: 15, backupReminderDays: 0, lastBackupAt: null, goalWarningDays: 3 });
    expect(created).toEqual([]);
  });
});

describe("notes & versions", () => {
  it("autosnapshots at most every interval and restores versions", async () => {
    const { s, clock } = await setup();
    const n = await s.notes.create({ title: "TLS", content: "v1", contentText: "v1" });
    await s.notes.saveContent(n.id, { content: "v2", contentText: "v2" });
    await s.notes.saveContent(n.id, { content: "v3", contentText: "v3" });
    let versions = await s.versions.list("note", n.id);
    expect(versions.map((v) => v.content)).toEqual(["v1"]);
    clock.set(new Date(clock.now().getTime() + AUTO_SNAPSHOT_INTERVAL_MS + 1000));
    await s.notes.saveContent(n.id, { content: "v4 hello world", contentText: "v4 hello world" });
    versions = await s.versions.list("note", n.id);
    expect(versions.map((v) => v.content)).toEqual(["v3", "v1"]);
    expect((await s.repos.notes.require(n.id)).wordCount).toBe(3);
    await s.notes.snapshot(n.id, "before exam");
    const restored = await s.notes.restoreVersion(n.id, versions[1].id);
    expect(restored.content).toBe("v1");
    const after = await s.versions.list("note", n.id);
    expect(after.some((v) => v.kind === "restore" && v.content === "v4 hello world")).toBe(true);
  });
});

describe("search", () => {
  it("finds Arabic and English content with partial words, filters and tags", async () => {
    const { s } = await setup();
    const sec = await s.repos.subjects.create({ name: "أمن الحاسوب", code: "CS401" });
    await s.notes.create({ title: "مقدمة في التشفير", contentText: "التشفير المتماثل يستخدم مفتاحاً واحداً. AES is a block cipher.", subjectId: sec.id, tags: ["crypto"] });
    await s.notes.create({ title: "Networking basics", contentText: "The TCP three-way handshake", tags: ["network"] });
    await s.repos.commands.create({ command: "nmap -sV 10.0.0.1", tool: "nmap", explanation: "Service version detection" });

    expect((await s.search("التشفير")).map((h) => h.entityType)).toContain("note");
    // Normalization: hamza/alef variants and taa marbuta
    expect((await s.search("امن الحاسوب")).some((h) => h.entityType === "subject")).toBe(true);
    // Partial word
    expect((await s.search("handsh"))[0].title).toBe("Networking basics");
    // Short term fallback (< 3 chars)
    expect((await s.search("AE")).length).toBeGreaterThan(0);
    expect((await s.search("nmap", { types: ["command"] }))).toHaveLength(1);
    expect(await s.search("nmap", { types: ["note"] })).toHaveLength(0);
    expect((await s.search("cipher", { subjectId: sec.id }))).toHaveLength(1);
    expect((await s.search("", { tag: "network" })).map((h) => h.title)).toEqual(["Networking basics"]);
    const hit = (await s.search("block cipher"))[0];
    expect(hit.snippet?.match.toLowerCase()).toBe("block");
  });

  it("rebuilds the index", async () => {
    const { s, db } = await setup();
    await s.notes.create({ title: "Firewall rules", contentText: "iptables" });
    await db.execute("DELETE FROM search_index");
    expect(await s.search("iptables")).toHaveLength(0);
    await s.rebuildSearchIndex();
    expect(await s.search("iptables")).toHaveLength(1);
  });
});

describe("files", () => {
  const external = { "/home/u/Lecture1.pdf": "%PDF-lecture-1", "/home/u/copy.pdf": "%PDF-lecture-1", "/home/u/notes.txt": "hello" };

  it("imports into the subject folder, links, dedupes, trashes and restores", async () => {
    const { s, fs } = await setup({ external });
    const subj = await s.repos.subjects.create({ name: "Computer Security", code: "CS401" });
    const r = await s.files.attach("subject", subj.id, ["/home/u/Lecture1.pdf", "/home/u/missing.pdf"]);
    expect(r.imported).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
    const f = r.imported[0];
    expect(f.relPath).toBe("Subjects/CS401 - Computer Security/Lectures/Lecture1.pdf");
    expect(fs.files.has(f.relPath)).toBe(true);
    expect((await s.files.forEntity("subject", subj.id)).map((x) => x.id)).toEqual([f.id]);

    // Identical content is linked, not copied again.
    const note = await s.notes.create({ title: "n" });
    const r2 = await s.files.attach("note", note.id, ["/home/u/copy.pdf"]);
    expect(r2.imported).toHaveLength(0);
    expect(r2.linkedExisting.map((x) => x.id)).toEqual([f.id]);
    expect((await s.files.forEntity("note", note.id)).map((x) => x.id)).toEqual([f.id]);

    const renamed = await s.files.rename(f.relPath, "L01.pdf");
    expect((await s.repos.files.require(f.id)).relPath).toBe(renamed);
    const item = await s.files.trash(renamed, false);
    expect((await s.repos.files.require(f.id)).trashedAt).not.toBeNull();
    expect(await s.files.forEntity("subject", subj.id)).toHaveLength(0);
    // original path can be reused while the old file is in the trash
    await s.files.importFiles({ sources: ["/home/u/notes.txt"], destRel: "Subjects/CS401 - Computer Security/Lectures" });
    await s.files.restoreFromTrash(item.id);
    const back = await s.repos.files.require(f.id);
    expect(back.trashedAt).toBeNull();
    expect(back.relPath).toBe(renamed);
    expect((await s.search("L01")).some((h) => h.entityId === f.id)).toBe(true);
  });

  it("detects missing files and registers untracked files", async () => {
    const { s, fs } = await setup({ external });
    const r = await s.files.importFiles({ sources: ["/home/u/notes.txt"], destRel: "Attachments" });
    fs.files.delete(r.imported[0].relPath);
    expect((await s.files.findMissing()).map((x) => x.id)).toEqual([r.imported[0].id]);
    fs.files.set("Attachments/dropped-in.txt", "x");
    const listed = await s.files.listDir("Attachments");
    expect(listed.find((e) => e.name === "dropped-in.txt")?.file).not.toBeNull();
  });
});

describe("export / import", () => {
  it("round-trips data through JSON and sanitizes broken references", async () => {
    const a = await setup();
    const subj = await a.s.repos.subjects.create({ name: "Forensics", tags: ["dfir"] });
    await a.s.notes.create({ title: "Volatility", subjectId: subj.id, contentText: "memory" });
    const bundle = await a.s.dataio.exportJson();
    expect(bundle.tables.notes).toHaveLength(1);

    const b = await setup();
    const check = await b.s.dataio.validateBundle(bundle);
    expect(check.ok).toBe(true);
    const report = await b.s.dataio.importBundle(JSON.parse(JSON.stringify(bundle)), "merge");
    expect(report.ok).toBe(true);
    expect(await b.s.repos.notes.count()).toBe(1);
    expect((await b.s.search("volatility"))).toHaveLength(1);
    expect((await b.s.repos.subjects.require(subj.id)).tags).toEqual(["dfir"]);

    // A note pointing to a subject that does not exist gets its reference cleared.
    const broken = { ...bundle, tables: { notes: [{ ...bundle.tables.notes[0], id: "n2", subject_id: "ghost" }] } };
    const r2 = await b.s.dataio.importBundle(broken, "merge");
    expect(r2.ok).toBe(true);
    expect((await b.s.repos.notes.require("n2")).subjectId).toBeNull();

    // Replace mode updates existing rows without cascading deletes.
    const modified = JSON.parse(JSON.stringify(bundle));
    modified.tables.subjects[0].name = "Digital Forensics";
    await b.s.dataio.importBundle(modified, "replace");
    expect((await b.s.repos.subjects.require(subj.id)).name).toBe("Digital Forensics");
    expect(await b.s.repos.notes.count()).toBe(2);

    expect((await b.s.dataio.validateBundle({ format: "other" })).ok).toBe(false);
    expect((await b.s.dataio.importBundle({ format: "unios-export", tables: { evil: [] } }, "merge")).ok).toBe(false);
  });

  it("exports CSV safely and notes as Markdown", async () => {
    const { s } = await setup();
    await s.repos.expenses.create({ amount: 5000, date: "2026-09-20", description: "=HYPERLINK(\"x\")" });
    const csv = await s.dataio.tableCsv("expenses");
    expect(csv).toContain("'=HYPERLINK");
    await s.notes.create({
      title: "SQLi",
      content: JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Payload" }] }, { type: "codeBlock", attrs: { language: "sql" }, content: [{ type: "text", text: "' OR 1=1 --" }] }] }),
    });
    const [md] = await s.dataio.notesAsFiles("md", "ltr");
    expect(md.name).toBe("SQLi.md");
    expect(md.content).toContain("## Payload");
    expect(md.content).toContain("```sql");
    const [html] = await s.dataio.notesAsFiles("html", "rtl");
    expect(html.content).toContain('dir="rtl"');
    expect(html.content).toContain("<pre><code>' OR 1=1 --</code></pre>");
  });
});

describe("projects & goals", () => {
  it("computes progress from tasks or milestones and turns action items into tasks", async () => {
    const { s } = await setup();
    const p = await s.projects.create({ name: "IDS project", progressMode: "tasks" });
    await s.tasks.create({ title: "a", projectId: p.id, status: "completed" });
    await s.tasks.create({ title: "b", projectId: p.id });
    expect((await s.projects.progress([p.id])).get(p.id)?.percent).toBe(50);
    const member = await s.repos.members.create({ projectId: p.id, name: "Ali" });
    const m = await s.projects.saveMeeting({ projectId: p.id, title: "Kickoff", date: "2026-09-23", actionItems: [{ id: "", text: "Write proposal", assigneeId: member.id, dueDate: null, done: false }] }, true);
    await s.projects.saveMeeting({ ...m }, true);
    const tasks = await s.repos.tasks.list({ where: ["t.project_id = ?"], params: [p.id] });
    expect(tasks.filter((t) => t.title === "Write proposal")).toHaveLength(1);
    expect((await s.projects.memberWorkload(p.id)).get(member.id)?.open).toBe(1);

    const g = await s.repos.goals.create({ title: "Finish CTF path", progressMode: "milestones" });
    await s.repos.goalMilestones.create({ goalId: g.id, title: "Web", done: true });
    await s.repos.goalMilestones.create({ goalId: g.id, title: "Crypto" });
    expect((await s.goals.progress([g])).get(g.id)).toBe(50);
  });
});

describe("attendance", () => {
  it("warns when absences approach the limit", async () => {
    const { s } = await setup();
    const subj = await s.repos.subjects.create({ name: "Math", attendanceThreshold: 20 });
    for (let i = 1; i <= 8; i++) await s.subjects.markAttendance(subj.id, `2026-09-0${i}`, "present");
    await s.subjects.markAttendance(subj.id, "2026-09-09", "absent");
    await s.subjects.markAttendance(subj.id, "2026-09-10", "absent");
    const ov = await s.subjects.overview(subj.id);
    expect(ov.attendance.absencePercent).toBe(20);
    expect(ov.attendance.level).toBe("warning");
    await s.subjects.markAttendance(subj.id, "2026-09-10", "absent"); // update, not duplicate
    expect((await s.subjects.attendance(subj.id))).toHaveLength(10);
    await s.subjects.markAttendance(subj.id, "2026-09-11", "absent");
    expect((await s.subjects.overview(subj.id)).attendance.level).toBe("exceeded");
    const drafts = await s.notifications.scan();
    expect(drafts.some((d) => d.title === "notif.attendanceExceeded")).toBe(true);
  });
});

describe("Windows-safe file names", () => {
  it("never produces names Windows would reject or rewrite", async () => {
    const { safeFileName } = await import("../src/core/utils/text");
    expect(safeFileName("CS401 - Computer Security")).toBe("CS401 - Computer Security");
    expect(safeFileName("a/b\\c:d*?")).toBe("a_b_c_d__");
    expect(safeFileName("CON")).toBe("_CON");
    expect(safeFileName("con .txt")).toBe("_con .txt");
    expect(safeFileName("nul.pdf")).toBe("_nul.pdf");
    expect(safeFileName("Notes. ")).toBe("Notes");
    expect(safeFileName("...")).toBe("untitled");
    expect(safeFileName("شبكات الحاسوب")).toBe("شبكات الحاسوب");
    // Truncation never leaves a trailing dot or space.
    const long = `${"x".repeat(119)} tail`;
    const out = safeFileName(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out).not.toMatch(/[. ]$/);
  });
});
