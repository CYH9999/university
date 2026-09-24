import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { BookOpen, Plus, User, MapPin, NotebookPen, FolderOpen, ListTodo, AlarmClock, Copy } from "lucide-react";
import { PageHeader, Toolbar, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Checkbox } from "@/components/ui/controls";
import { Modal } from "@/components/ui/overlay";
import { SemesterSelect } from "@/components/common/pickers";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { ScaleSelect } from "@/features/semesters/SemestersPage";
import { useServices } from "@/app/services";
import { useQ, useMut } from "@/app/query";
import { useNewParam, useActiveSemester, useDebounced } from "@/lib/hooks";
import { fmtNumber } from "@/lib/format";
import type { Subject } from "@/core/model/types";
import { PALETTE } from "@/components/ui/controls";

export function SubjectEditor({ editor }: { editor: ReturnType<typeof useEditor<Subject>> }) {
  const s = useServices();
  const { t } = useTranslation();
  return (
    <EntityDrawer<Subject>
      editor={editor}
      width="w-[640px]"
      title={{ create: "subjects.new", edit: "subjects.edit" }}
      initial={(e, d) => (e ? { ...e } : { credits: 3, attendanceThreshold: 25, countsInGpa: true, status: "active", color: PALETTE[Math.floor(Math.random() * PALETTE.length)], ...d })}
      fields={[
        { name: "name", kind: "text", required: true, span: 2, autoFocus: true },
        { name: "code", kind: "text", mono: true },
        { name: "semesterId", kind: "semester" },
        { name: "professor", kind: "text" },
        { name: "department", kind: "text" },
        { name: "credits", kind: "number", min: 0, max: 60, step: 0.5 },
        { name: "classroom", kind: "text" },
        { name: "color", kind: "color", span: 2 },
        { name: "description", kind: "textarea", span: 2 },
        { name: "contact", kind: "section", label: "subjects.contactSection" },
        { name: "contactEmail", kind: "email" },
        { name: "contactPhone", kind: "text" },
        { name: "officeHours", kind: "text", span: 2 },
        { name: "contactNotes", kind: "textarea", span: 2, rows: 2 },
        { name: "links", kind: "links", span: 2, label: "fields.usefulLinks" },
        { name: "grading", kind: "section", label: "subjects.gradingSection" },
        { name: "gradingScaleId", kind: "custom", render: (v, set) => <ScaleSelect value={(v.gradingScaleId as string) ?? null} onChange={(x) => set({ gradingScaleId: x })} /> },
        { name: "targetGrade", kind: "number", min: 0, max: 100, hint: "subjects.targetHint" },
        { name: "finalGradeOverride", kind: "number", min: 0, max: 100, hint: "subjects.overrideHint" },
        { name: "attendanceThreshold", kind: "number", min: 0, max: 100, hint: "subjects.thresholdHint" },
        { name: "status", kind: "enum", enum: "subjectStatus", required: true },
        { name: "countsInGpa", kind: "bool" },
        { name: "tags", kind: "tags", span: 2 },
        { name: "archived", kind: "bool", description: "subjects.archivedHint" },
      ]}
      onSave={async (d, e) => {
        if (e) return s.repos.subjects.update(e.id, d as Partial<Subject>);
        const created = await s.repos.subjects.create(d as never);
        await s.files.ensureSubjectFolder(created).catch(() => undefined);
        return created;
      }}
      onDelete={(e) => s.subjects.remove(e.id)}
      deleteConfirm={(e) => ({ title: t("subjects.deleteTitle"), description: t("subjects.deleteBody"), typeToConfirm: e.name })}
    />
  );
}

export function SubjectsPage() {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Subject>();
  const { semester } = useActiveSemester();
  const [scope, setScope] = React.useState<"semester" | "all" | "archived">("semester");
  const [text, setText] = React.useState("");
  const [copyOpen, setCopyOpen] = React.useState(false);
  const dText = useDebounced(text);
  useNewParam(() => editor.create({ semesterId: semester?.id ?? null }));

  const { data: subjects = [], isLoading } = useQ(["subjects", "page", scope, semester?.id], async () => {
    if (scope === "archived") return (await s.subjects.list({ all: true, includeArchived: true })).filter((x) => x.archived);
    if (scope === "all" || !semester) return s.subjects.list({ all: true });
    return s.subjects.list({ semesterId: semester.id });
  });
  const list = subjects.filter((x) => !dText || `${x.name} ${x.code ?? ""} ${x.professor ?? ""}`.toLowerCase().includes(dText.toLowerCase()));
  const { data: stats } = useQ(["subjects", "cardstats", list.map((x) => x.id).join()], () => s.subjects.cardStats(list.map((x) => x.id)), { enabled: list.length > 0 });
  const totalCredits = list.reduce((a, x) => a + x.credits, 0);

  return (
    <div>
      <PageHeader
        icon={<BookOpen />}
        title={t("nav.subjects")}
        description={t("subjects.summary", { count: list.length, credits: fmtNumber(totalCredits, 1) })}
        actions={
          <>
            <Button onClick={() => setCopyOpen(true)} disabled={!subjects.length}>
              <Copy /> {t("subjects.copyToSemester")}
            </Button>
            <Button variant="primary" onClick={() => editor.create({ semesterId: semester?.id ?? null })}>
              <Plus /> {t("subjects.new")}
            </Button>
          </>
        }
      >
        <Toolbar>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "semester", label: semester ? semester.name : t("subjects.scopes.semester") },
              { value: "all", label: t("subjects.scopes.all") },
              { value: "archived", label: t("subjects.scopes.archived") },
            ]}
          />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("common.filter")} className="w-60" />
        </Toolbar>
      </PageHeader>
      <div className="p-6">
        {!isLoading && list.length === 0 ? (
          <EmptyState icon={<BookOpen />} title={t("subjects.empty")} description={t("subjects.emptyHint")} action={<Button variant="primary" onClick={() => editor.create({ semesterId: semester?.id ?? null })}><Plus /> {t("subjects.new")}</Button>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((sub) => {
              const st = stats?.get(sub.id);
              return (
                <Link key={sub.id} to={`/subjects/${sub.id}`} className="card group relative flex flex-col overflow-hidden transition-colors hover:border-accent/40">
                  <span className="absolute inset-y-0 start-0 w-1" style={{ background: sub.color ?? "rgb(var(--accent))" }} />
                  <div className="p-4 ps-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold group-hover:text-accent">{sub.name}</h3>
                        <p className="mt-0.5 font-mono text-xs text-muted ltr">{sub.code ?? "—"}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">{t("subjects.creditsShort", { n: fmtNumber(sub.credits, 1) })}</span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-muted">
                      {sub.professor && (
                        <div className="flex items-center gap-1.5">
                          <User className="size-3.5" /> {sub.professor}
                        </div>
                      )}
                      {sub.classroom && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3.5" /> {sub.classroom}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-auto grid grid-cols-4 border-t border-border text-center text-xs">
                    {[
                      { icon: NotebookPen, n: st?.notes, l: t("nav.notes") },
                      { icon: FolderOpen, n: st?.files, l: t("nav.files") },
                      { icon: ListTodo, n: st?.tasks, l: t("nav.tasks") },
                      { icon: AlarmClock, n: st?.deadlines, l: t("nav.deadlines") },
                    ].map((x, i) => (
                      <div key={i} className="flex items-center justify-center gap-1.5 py-2 text-muted" title={x.l}>
                        <x.icon className="size-3.5" /> <span className="tabular-nums">{x.n ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <SubjectEditor editor={editor} />
      <CopySubjectsModal open={copyOpen} onClose={() => setCopyOpen(false)} subjects={subjects} />
    </div>
  );
}

function CopySubjectsModal({ open, onClose, subjects }: { open: boolean; onClose: () => void; subjects: Subject[] }) {
  const { t } = useTranslation();
  const s = useServices();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [target, setTarget] = React.useState<string | null>(null);
  const [tt, setTt] = React.useState(true);
  const [gr, setGr] = React.useState(true);
  const run = useMut(() => s.semesters.copySubjects(selected, target!, tt, gr), { success: (n: number) => t("subjects.copied", { count: n }), onSuccess: onClose });
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("subjects.copyToSemester")}
      description={t("subjects.copyHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!selected.length || !target} loading={run.isPending} onClick={() => run.mutate(undefined)}>
            <Copy /> {t("common.copy")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SemesterSelect value={target} onChange={setTarget} placeholder={t("subjects.targetSemester")} />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {subjects.map((x) => (
            <div key={x.id} className="px-1 py-0.5">
              <Checkbox checked={selected.includes(x.id)} onCheckedChange={(v) => setSelected((cur) => (v ? [...cur, x.id] : cur.filter((y) => y !== x.id)))} label={`${x.code ? `${x.code} · ` : ""}${x.name}`} />
            </div>
          ))}
        </div>
        <Checkbox checked={tt} onCheckedChange={setTt} label={t("semesters.copyTimetable")} />
        <Checkbox checked={gr} onCheckedChange={setGr} label={t("semesters.copyGrades")} />
      </div>
    </Modal>
  );
}
