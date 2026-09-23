/**
 * Declarative forms: modules describe their fields once and get consistent layout,
 * labels, validation messages and pickers (translated, RTL-aware).
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Input, Textarea, Field, NativeSelect } from "@/components/ui/input";
import { Switch, ColorPicker } from "@/components/ui/controls";
import { DatePicker, TimeInput } from "./DatePicker";
import { TagInput, ListInput } from "./TagInput";
import { EnumSelect, SubjectSelect, ProjectSelect, SemesterSelect, LectureSelect, MemberSelect, GoalSelect, LabSelect, NoteSelect } from "./pickers";
import { LinksEditor } from "./LinksEditor";
import type { EnumName } from "@/core/model/enums";
import { cn } from "@/lib/cn";

export type FieldDef =
  | { name: string; kind: "text" | "url" | "email"; label?: string; required?: boolean; placeholder?: string; span?: 1 | 2; mono?: boolean; autoFocus?: boolean; hint?: string }
  | { name: string; kind: "textarea" | "code"; label?: string; required?: boolean; placeholder?: string; span?: 1 | 2; rows?: number; hint?: string }
  | { name: string; kind: "number"; label?: string; required?: boolean; placeholder?: string; span?: 1 | 2; min?: number; max?: number; step?: number; hint?: string }
  | { name: string; kind: "date" | "time" | "color" | "tags" | "list" | "links" | "rating"; label?: string; required?: boolean; span?: 1 | 2; hint?: string; placeholder?: string }
  | { name: string; kind: "bool"; label?: string; description?: string; span?: 1 | 2 }
  | { name: string; kind: "enum"; enum: EnumName; label?: string; required?: boolean; span?: 1 | 2; placeholder?: string; hint?: string }
  | { name: string; kind: "select"; options: { value: string; label: string }[]; label?: string; required?: boolean; span?: 1 | 2; placeholder?: string }
  | { name: string; kind: "subject" | "project" | "semester" | "goal" | "lab"; label?: string; required?: boolean; span?: 1 | 2; hint?: string }
  | { name: string; kind: "lecture"; subjectField: string; label?: string; span?: 1 | 2 }
  | { name: string; kind: "note"; subjectField?: string; label?: string; span?: 1 | 2 }
  | { name: string; kind: "member"; projectField: string; label?: string; span?: 1 | 2 }
  | { name: string; kind: "custom"; label?: string; span?: 1 | 2; render: (v: Record<string, unknown>, set: (patch: Record<string, unknown>) => void) => React.ReactNode }
  | { name: string; kind: "section"; label: string; span?: 2 };

export function RecordForm({
  fields,
  value,
  onChange,
  errors = {},
  columns = 2,
}: {
  fields: (FieldDef | false | null | undefined)[];
  value: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  errors?: Record<string, string>;
  columns?: 1 | 2;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("grid gap-x-4 gap-y-3.5", columns === 2 ? "grid-cols-2" : "grid-cols-1")}>
      {fields.filter(Boolean).map((f) => {
        const def = f as FieldDef;
        const span = columns === 2 && (def.span ?? 1) === 2 ? "col-span-2" : "";
        if (def.kind === "section") {
          return (
            <div key={def.name} className={cn("col-span-full mt-2 border-t border-border pt-3 text-xs font-semibold uppercase tracking-wide text-subtle")}>
              {t(def.label)}
            </div>
          );
        }
        const id = `f-${def.name}`;
        const label = def.label ? t(def.label) : t(`fields.${def.name}`);
        const v = value[def.name];
        const set = (nv: unknown) => onChange({ [def.name]: nv });
        const err = errors[def.name];
        if (def.kind === "bool") {
          return (
            <div key={def.name} className={cn("self-end", span)}>
              <Switch checked={!!v} onCheckedChange={set} label={label} description={def.description ? t(def.description) : undefined} />
            </div>
          );
        }
        return (
          <Field key={def.name} label={label} error={err} className={span} required={"required" in def ? def.required : false} htmlFor={id} hint={"hint" in def && def.hint ? t(def.hint) : undefined}>
            {renderControl(def, id, v, set, value, onChange, t)}
          </Field>
        );
      })}
    </div>
  );
}

function renderControl(
  def: Exclude<FieldDef, { kind: "bool" } | { kind: "section" }>,
  id: string,
  v: unknown,
  set: (v: unknown) => void,
  all: Record<string, unknown>,
  onChange: (p: Record<string, unknown>) => void,
  t: (k: string) => string,
) {
  const str = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  const ph = "placeholder" in def && def.placeholder ? t(def.placeholder) : undefined;
  switch (def.kind) {
    case "text":
    case "url":
    case "email":
      return (
        <Input
          id={id}
          type={def.kind === "email" ? "email" : "text"}
          dir={def.kind === "url" || def.kind === "email" ? "ltr" : undefined}
          className={cn((def.kind === "url" || ("mono" in def && def.mono)) && "font-mono text-xs")}
          value={str(v)}
          placeholder={ph ?? (def.kind === "url" ? "https://" : undefined)}
          autoFocus={"autoFocus" in def ? def.autoFocus : undefined}
          onChange={(e) => set(e.target.value)}
        />
      );
    case "textarea":
      return <Textarea id={id} rows={def.rows ?? 3} value={str(v)} placeholder={ph} onChange={(e) => set(e.target.value)} />;
    case "code":
      return <Textarea id={id} rows={def.rows ?? 4} dir="ltr" spellCheck={false} className="font-mono text-xs" value={str(v)} placeholder={ph} onChange={(e) => set(e.target.value)} />;
    case "number":
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          dir="ltr"
          min={def.min}
          max={def.max}
          step={def.step ?? "any"}
          value={str(v)}
          placeholder={ph}
          onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    case "date":
      return <DatePicker id={id} value={(v as string) ?? null} onChange={set} />;
    case "time":
      return <TimeInput id={id} value={(v as string) ?? null} onChange={set} />;
    case "color":
      return <ColorPicker value={(v as string) ?? null} onChange={set} />;
    case "tags":
      return <TagInput value={(v as string[]) ?? []} onChange={set} />;
    case "list":
      return <ListInput value={(v as string[]) ?? []} onChange={set} placeholder={ph} />;
    case "links":
      return <LinksEditor value={(v as { title: string; url: string }[]) ?? []} onChange={set} />;
    case "rating":
      return <Rating value={(v as number) ?? null} onChange={set} />;
    case "enum":
      return <EnumSelect id={id} name={def.enum} value={v as string} onChange={set} placeholder={def.placeholder ? t(def.placeholder) : def.required ? undefined : t("common.none")} />;
    case "select":
      return <NativeSelect id={id} options={def.options} value={str(v)} placeholder={def.placeholder ? t(def.placeholder) : def.required ? undefined : t("common.none")} onChange={(e) => set(e.target.value || null)} />;
    case "subject":
      return <SubjectSelect id={id} value={v as string} onChange={set} />;
    case "project":
      return <ProjectSelect id={id} value={v as string} onChange={set} />;
    case "semester":
      return <SemesterSelect id={id} value={v as string} onChange={set} />;
    case "goal":
      return <GoalSelect id={id} value={v as string} onChange={set} />;
    case "lab":
      return <LabSelect id={id} value={v as string} onChange={set} />;
    case "lecture":
      return <LectureSelect id={id} subjectId={all[def.subjectField] as string} value={v as string} onChange={set} />;
    case "note":
      return <NoteSelect id={id} subjectId={def.subjectField ? (all[def.subjectField] as string) : null} value={v as string} onChange={set} />;
    case "member":
      return <MemberSelect id={id} projectId={all[def.projectField] as string} value={v as string} onChange={set} />;
    case "custom":
      return def.render(all, onChange);
  }
}

export function Rating({ value, onChange, max = 5 }: { value: number | null; onChange: (v: number | null) => void; max?: number }) {
  return (
    <div className="flex h-9 items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={String(n)}
          onClick={() => onChange(value === n ? null : n)}
          className={cn("size-7 rounded-md border text-xs font-medium transition-colors", value !== null && n <= value ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-border-strong")}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
