import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CalendarRange, Plus, MoreHorizontal, Star, Archive, Copy, Pencil, Trash2, BookOpen, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState, Card } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Segmented } from "@/components/ui/controls";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator, Modal } from "@/components/ui/overlay";
import { Input, Field } from "@/components/ui/input";
import { EntityDrawer, useEditor } from "@/components/common/EntityDrawer";
import { DatePicker } from "@/components/common/DatePicker";
import { useServices } from "@/app/services";
import { useQ, useMut, invalidateAll } from "@/app/query";
import { useSettings } from "@/app/settings";
import { confirm } from "@/app/confirm";
import { useNewParam } from "@/lib/hooks";
import { fmtDate, fmtNumber } from "@/lib/format";
import { errorMessage } from "@/lib/errors";
import type { Semester } from "@/core/model/types";

const STATUS_TONE = { upcoming: "info", active: "success", completed: "neutral", archived: "neutral" } as const;

export function SemestersPage() {
  const { t } = useTranslation();
  const s = useServices();
  const editor = useEditor<Semester>();
  const [filter, setFilter] = React.useState<"current" | "archived">("current");
  const [dup, setDup] = React.useState<Semester | null>(null);
  const update = useSettings((st) => st.update);
  const { data: semesters = [], isLoading } = useQ(["semesters"], () => s.semesters.list());
  const { data: stats } = useQ(["semesters", "stats", semesters.map((x) => x.id).join()], async () => {
    const out = new Map<string, { subjects: number; credits: number; gpa: number | null; kind?: string }>();
    for (const sem of semesters) {
      const r = await s.grades.semesterGpa(sem.id);
      out.set(sem.id, { subjects: r.subjects.length, credits: r.totalCredits, gpa: r.actual ?? r.projected, kind: r.scale?.kind });
    }
    return out;
  }, { enabled: semesters.length > 0 });
  useNewParam(() => editor.create());

  const setCurrent = useMut((id: string) => s.semesters.setCurrent(id), { success: "semesters.madeCurrent", onSuccess: () => update({ selectedSemesterId: null }) });
  const archive = useMut((id: string) => s.semesters.archive(id), { success: "semesters.archived" });
  const unarchive = useMut((id: string) => s.semesters.update(id, { status: "completed" }), { success: "toast.saved" });

  const remove = async (sem: Semester) => {
    const ok = await confirm({ title: t("semesters.deleteTitle"), description: t("semesters.deleteBody"), confirmLabel: t("common.delete"), danger: true, typeToConfirm: sem.name });
    if (!ok) return;
    try {
      await s.repos.semesters.remove(sem.id);
      await invalidateAll();
      toast.success(t("toast.deleted"));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const list = semesters.filter((x) => (filter === "archived" ? x.status === "archived" : x.status !== "archived"));

  return (
    <div>
      <PageHeader
        icon={<CalendarRange />}
        title={t("nav.semesters")}
        description={t("semesters.lead")}
        actions={
          <Button variant="primary" onClick={() => editor.create()}>
            <Plus /> {t("semesters.new")}
          </Button>
        }
      >
        <Segmented value={filter} onChange={setFilter} options={[{ value: "current", label: t("semesters.active") }, { value: "archived", label: t("semesters.archivedList") }]} />
      </PageHeader>
      <div className="p-6">
        {!isLoading && list.length === 0 ? (
          <EmptyState icon={<CalendarRange />} title={filter === "archived" ? t("semesters.noArchived") : t("semesters.empty")} description={t("semesters.emptyHint")} action={filter === "current" && <Button variant="primary" onClick={() => editor.create()}><Plus /> {t("semesters.new")}</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {list.map((sem) => {
              const st = stats?.get(sem.id);
              return (
                <Card key={sem.id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold">{sem.name}</h3>
                        {sem.isCurrent && (
                          <Badge tone="accent">
                            <Star className="size-3" /> {t("semesters.current")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {[sem.academicYear, t(`enums.semesterType.${sem.type}`)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <Menu>
                      <MenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={t("common.actions")}>
                          <MoreHorizontal />
                        </Button>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<Pencil />} onSelect={() => editor.edit(sem)}>{t("common.edit")}</MenuItem>
                        {!sem.isCurrent && <MenuItem icon={<Star />} onSelect={() => setCurrent.mutate(sem.id)}>{t("semesters.makeCurrent")}</MenuItem>}
                        <MenuItem icon={<Copy />} onSelect={() => setDup(sem)}>{t("semesters.duplicate")}</MenuItem>
                        {sem.status === "archived" ? (
                          <MenuItem icon={<ArchiveRestore />} onSelect={() => unarchive.mutate(sem.id)}>{t("common.unarchive")}</MenuItem>
                        ) : (
                          <MenuItem icon={<Archive />} onSelect={() => archive.mutate(sem.id)}>{t("common.archive")}</MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem icon={<Trash2 />} danger onSelect={() => void remove(sem)}>{t("common.delete")}</MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone={STATUS_TONE[sem.status]}>{t(`enums.semesterStatus.${sem.status}`)}</Badge>
                    {(sem.startDate || sem.endDate) && (
                      <span className="text-xs text-muted">
                        {fmtDate(sem.startDate)} — {fmtDate(sem.endDate)}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{st?.subjects ?? 0}</div>
                      <div className="text-[11px] text-subtle">{t("nav.subjects")}</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{fmtNumber(st?.credits ?? 0, 1)}</div>
                      <div className="text-[11px] text-subtle">{t("fields.credits")}</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold tabular-nums">{st?.gpa === null || st?.gpa === undefined ? "—" : st.kind === "percentage" ? `${fmtNumber(st.gpa, 1)}%` : fmtNumber(st.gpa, 2)}</div>
                      <div className="text-[11px] text-subtle">{t("grades.gpa")}</div>
                    </div>
                  </div>
                  {sem.notes && <p className="mt-3 line-clamp-2 text-xs text-muted">{sem.notes}</p>}
                  <div className="mt-auto flex gap-2 pt-4">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/subjects" onClick={() => update({ selectedSemesterId: sem.id })}>
                        <BookOpen /> {t("semesters.viewSubjects")}
                      </Link>
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <EntityDrawer
        editor={editor}
        title={{ create: "semesters.new", edit: "semesters.edit" }}
        initial={(e) => (e ? { ...e } : { type: "first", status: "upcoming", academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` })}
        fields={[
          { name: "name", kind: "text", required: true, span: 2, autoFocus: true, placeholder: "onboarding.semesterPlaceholder" },
          { name: "academicYear", kind: "text" },
          { name: "type", kind: "enum", enum: "semesterType", required: true },
          { name: "startDate", kind: "date" },
          { name: "endDate", kind: "date" },
          { name: "status", kind: "enum", enum: "semesterStatus", required: true },
          { name: "gradingScaleId", kind: "custom", render: (v, set) => <ScaleSelect value={(v.gradingScaleId as string) ?? null} onChange={(x) => set({ gradingScaleId: x })} /> },
          { name: "isCurrent", kind: "bool", description: "semesters.currentHint", span: 2 },
          { name: "notes", kind: "textarea", span: 2 },
        ]}
        onSave={async (d, e) => (e ? s.semesters.update(e.id, d as Partial<Semester>) : s.semesters.create(d as Partial<Semester>))}
      />
      <DuplicateModal semester={dup} onClose={() => setDup(null)} />
    </div>
  );
}

export function ScaleSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["scales"], () => s.grades.scales());
  return (
    <select className="input-base" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t("grades.defaultScale")}</option>
      {data.map((sc) => (
        <option key={sc.id} value={sc.id}>
          {sc.name}
        </option>
      ))}
    </select>
  );
}

function DuplicateModal({ semester, onClose }: { semester: Semester | null; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useServices();
  const [name, setName] = React.useState("");
  const [start, setStart] = React.useState<string | null>(null);
  const [end, setEnd] = React.useState<string | null>(null);
  const [opts, setOpts] = React.useState({ copySubjects: true, copyTimetable: true, copyGradeStructure: true });
  React.useEffect(() => {
    if (semester) setName(`${semester.name} (${t("common.copy")})`);
  }, [semester, t]);
  const run = useMut(() => s.semesters.duplicate(semester!.id, { name, startDate: start, endDate: end, ...opts }), { success: "semesters.duplicated", onSuccess: onClose });
  return (
    <Modal
      open={!!semester}
      onOpenChange={(o) => !o && onClose()}
      title={t("semesters.duplicate")}
      description={t("semesters.duplicateHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!name.trim()} loading={run.isPending} onClick={() => run.mutate(undefined)}>
            <Copy /> {t("semesters.duplicate")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={t("fields.name")} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fields.startDate")}><DatePicker value={start} onChange={setStart} /></Field>
          <Field label={t("fields.endDate")}><DatePicker value={end} onChange={setEnd} /></Field>
        </div>
        <div className="space-y-2 rounded-md border border-border p-3">
          <Checkbox checked={opts.copySubjects} onCheckedChange={(v) => setOpts((o) => ({ ...o, copySubjects: v }))} label={t("semesters.copySubjects")} />
          <Checkbox checked={opts.copyTimetable} disabled={!opts.copySubjects} onCheckedChange={(v) => setOpts((o) => ({ ...o, copyTimetable: v }))} label={t("semesters.copyTimetable")} />
          <Checkbox checked={opts.copyGradeStructure} disabled={!opts.copySubjects} onCheckedChange={(v) => setOpts((o) => ({ ...o, copyGradeStructure: v }))} label={t("semesters.copyGrades")} />
        </div>
      </div>
    </Modal>
  );
}
