import * as React from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect, type SelectOption } from "@/components/ui/input";
import { useAllSubjects, useAllProjects, useSemesters, useActiveSemester } from "@/lib/hooks";
import { useServices } from "@/app/services";
import { useQ } from "@/app/query";
import { ENUMS, type EnumName } from "@/core/model/enums";

export function useEnumOptions(name: EnumName): SelectOption[] {
  const { t } = useTranslation();
  return (ENUMS[name] as readonly string[]).map((v) => ({ value: v, label: t(`enums.${name}.${v}`) }));
}

export function EnumSelect({ name, value, onChange, placeholder, className, id }: { name: EnumName; value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string; className?: string; id?: string }) {
  const options = useEnumOptions(name);
  return <NativeSelect id={id} className={className} options={options} placeholder={placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function SubjectSelect({ value, onChange, placeholder, className, id, semesterOnly }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string; className?: string; id?: string; semesterOnly?: boolean }) {
  const { t } = useTranslation();
  const { data = [] } = useAllSubjects();
  const { semester, semesters } = useActiveSemester();
  const options = React.useMemo(() => {
    const semName = new Map(semesters.map((s) => [s.id, s.name]));
    const list = semesterOnly && semester ? data.filter((s) => s.semesterId === semester.id || s.id === value) : data;
    const sorted = [...list].sort((a, b) => {
      const ac = a.semesterId === semester?.id ? 0 : 1;
      const bc = b.semesterId === semester?.id ? 0 : 1;
      return ac - bc || a.name.localeCompare(b.name);
    });
    return sorted.map((s) => ({
      value: s.id,
      label: `${s.code ? `${s.code} · ` : ""}${s.name}${s.semesterId && s.semesterId !== semester?.id ? ` (${semName.get(s.semesterId) ?? ""})` : ""}${s.archived ? ` — ${t("common.archived")}` : ""}`,
    }));
  }, [data, semester, semesters, semesterOnly, value, t]);
  return <NativeSelect id={id} className={className} options={options} placeholder={placeholder ?? t("common.noSubject")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function ProjectSelect({ value, onChange, placeholder, className, id }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string; className?: string; id?: string }) {
  const { t } = useTranslation();
  const { data = [] } = useAllProjects();
  return (
    <NativeSelect
      id={id}
      className={className}
      options={data.map((p) => ({ value: p.id, label: p.name }))}
      placeholder={placeholder ?? t("common.noProject")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function SemesterSelect({ value, onChange, placeholder, className, id }: { value: string | null | undefined; onChange: (v: string | null) => void; placeholder?: string; className?: string; id?: string }) {
  const { t } = useTranslation();
  const { data = [] } = useSemesters();
  return (
    <NativeSelect
      id={id}
      className={className}
      options={data.map((s) => ({ value: s.id, label: `${s.name}${s.academicYear ? ` · ${s.academicYear}` : ""}` }))}
      placeholder={placeholder ?? t("common.noSemester")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function LectureSelect({ subjectId, value, onChange, id }: { subjectId: string | null | undefined; value: string | null | undefined; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["lectures", subjectId], () => (subjectId ? s.subjects.lectures(subjectId) : Promise.resolve([])), { enabled: !!subjectId });
  return (
    <NativeSelect
      id={id}
      disabled={!subjectId}
      options={data.map((l) => ({ value: l.id, label: `${l.number ? `#${l.number} · ` : ""}${l.title}` }))}
      placeholder={t("common.noLecture")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function MemberSelect({ projectId, value, onChange, id }: { projectId: string | null | undefined; value: string | null | undefined; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["members", projectId], () => (projectId ? s.projects.members(projectId) : Promise.resolve([])), { enabled: !!projectId });
  return (
    <NativeSelect
      id={id}
      disabled={!projectId}
      options={data.map((m) => ({ value: m.id, label: m.name }))}
      placeholder={t("common.unassigned")}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function GoalSelect({ value, onChange, id }: { value: string | null | undefined; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["goals", "all"], () => s.repos.goals.list());
  return <NativeSelect id={id} options={data.map((g) => ({ value: g.id, label: g.title }))} placeholder={t("common.noGoal")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function LabSelect({ value, onChange, id }: { value: string | null | undefined; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["labs", "all"], () => s.repos.labs.list());
  return <NativeSelect id={id} options={data.map((g) => ({ value: g.id, label: g.name }))} placeholder={t("common.none")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function NoteSelect({ value, onChange, id, subjectId }: { value: string | null | undefined; onChange: (v: string | null) => void; id?: string; subjectId?: string | null }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["notes", "picker", subjectId ?? null], () => s.notes.list({ subjectId: subjectId ?? null, limit: 500 }));
  return <NativeSelect id={id} options={data.map((n) => ({ value: n.id, label: n.title }))} placeholder={t("common.none")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

export function FileSelect({ value, onChange, id, subjectId }: { value: string | null | undefined; onChange: (v: string | null) => void; id?: string; subjectId?: string | null }) {
  const { t } = useTranslation();
  const s = useServices();
  const { data = [] } = useQ(["files", "picker", subjectId ?? null], () => s.files.search({ subjectId: subjectId ?? null, limit: 1000 }));
  return <NativeSelect id={id} options={data.map((f) => ({ value: f.id, label: f.name }))} placeholder={t("common.none")} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}
